import { base58 } from "@scure/base";
import type {
  Digest,
  Note,
  Nicks,
  NoteData,
  SpendCondition,
  TxEngineSettings,
} from "@nockbox/iris-wasm";
import {
  ZORP_BRIDGE_THRESHOLD,
  ZORP_BRIDGE_ADDRESSES,
  DEFAULT_FEE_PER_WORD,
} from "@/lib/bridge";
import {
  PROTOCOL_FEE_NICKS_PER_NOCK,
  toWholeNockNicks,
} from "@/lib/constants";
import { NOCK_TO_NICKS } from "@/hooks/useWallet";

function parseDigestString(value: string, field: string): Digest {
  const trimmed = value.trim();
  const bytes = base58.decode(trimmed);
  if (bytes.length !== 40) {
    throw new Error(`Invalid ${field}: expected a 40-byte base58 digest`);
  }
  return trimmed as Digest;
}

function withdrawalBridgeFeeNicks(burnedAmountNicks: bigint): bigint {
  const chunks = (burnedAmountNicks + 65535n) / 65536n;
  return chunks * PROTOCOL_FEE_NICKS_PER_NOCK;
}

function noteNameKey(note: Note): string {
  const n = note.name as { first?: string; last?: string } | undefined;
  const first = n?.first ?? "";
  const last = n?.last ?? "";
  return `${first}\0${last}`;
}

function sortBridgeNotesForWithdrawal(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    const assetsA = BigInt(a.assets);
    const assetsB = BigInt(b.assets);
    if (assetsA !== assetsB) {
      return assetsA < assetsB ? -1 : 1;
    }
    const ka = noteNameKey(a);
    const kb = noteNameKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

function selectNotesCoveringSpendable(sortedNotes: Note[], spendableNicks: bigint): Note[] {
  const selected: Note[] = [];
  let total = 0n;
  for (const note of sortedNotes) {
    selected.push(note);
    total += BigInt(note.assets);
    if (total >= spendableNicks) {
      return selected;
    }
  }
  throw new Error(
    "Insufficient bridge inventory for this withdrawal (cannot cover spendable amount)."
  );
}

/**
 * Fee sample for bridge multisig inputs without attaching real signatures.
 *
 * `SpendBuilder` starts with an empty `pkh_signature` witness. `TxBuilder::recalc_and_set_fee`
 * calls `missing_unlocks_fee`, which for each missing PKH quorum adds a **heuristic** charge:
 * `cost_per_word * 35 * num_sigs / witness_word_div` per `iris-nockchain-types` `SpendBuilder::missing_unlocks_fee`
 * (one `MissingUnlocks::Pkh` per PKH primitive with `num_sigs = m - present_signatures`).
 * So a 3-of-5 spend is not “emulated” as three real sigs; missing sigs are billed as that word-cost estimate until witnesses are filled.
 */
function buildWithdrawalFeeSample(
  wasm: typeof import("@nockbox/iris-wasm"),
  selectedNotes: Note[],
  bridgeSpend: SpendCondition,
  recipientSpend: SpendCondition,
  netToRecipientNicks: bigint
): bigint {
  const txEngineSettings: TxEngineSettings = {
    tx_engine_version: 1,
    tx_engine_patch: 1,
    min_fee: "256" as Nicks,
    cost_per_word: String(DEFAULT_FEE_PER_WORD) as Nicks,
    witness_word_div: 4,
  };
  const builder = new wasm.TxBuilder(txEngineSettings);

  const bridgeSpendClone = wasm.spendConditionFromProtobuf(
    wasm.spendConditionToProtobuf(bridgeSpend)
  );
  const recipientSpendClone = wasm.spendConditionFromProtobuf(
    wasm.spendConditionToProtobuf(recipientSpend)
  );

  let remainingNet = netToRecipientNicks;

  for (let i = 0; i < selectedNotes.length; i++) {
    const note = selectedNotes[i]!;
    const noteAssets = BigInt(note.assets);
    const giftPortion =
      remainingNet < noteAssets ? remainingNet : noteAssets;
    remainingNet -= giftPortion;

    const noteClone = wasm.noteFromProtobuf(wasm.noteToProtobuf(note));
    const spendBuilder = new wasm.SpendBuilder(
      noteClone,
      bridgeSpendClone,
      0,
      bridgeSpendClone
    );

    if (giftPortion > 0n) {
      const seed = {
        output_source: null,
        lock_root: recipientSpendClone,
        gift: giftPortion.toString() as Nicks,
        note_data: [] as unknown as NoteData,
        parent_hash: wasm.noteHash(note),
      };
      spendBuilder.seed(seed);
    }
    spendBuilder.computeRefund(false);
    builder.spend(spendBuilder);
  }

  if (remainingNet > 0n) {
    throw new Error("Selected bridge notes cannot fund the net recipient amount.");
  }

  builder.recalcAndSetFee(false);
  return BigInt(builder.curFee());
}

export interface EstimateBaseToNockNockchainFeeParams {
  burnedAmountNicks: bigint;
  recipientNockAddress: string;
  grpcEndpoint: string;
}

/**
 * Estimates the Nockchain transaction fee for a Base→Nock payout by mirroring bridge relayer logic:
 * notes under the bridge multisig first-name, smallest-assets / lexicographic name ordering,
 * greedy coverage of spendable amount (burned − ceil bridge fee), then fee from TxBuilder.
 *
 * Multisig inputs are modeled **unsigned**: fee uses the engine’s missing-PKH-signature heuristic (see
 * `buildWithdrawalFeeSample`), not real 3-of-5 witness nouns.
 */
export async function estimateBaseToNockNockchainFeeNicks(
  params: EstimateBaseToNockNockchainFeeParams
): Promise<bigint> {
  let { burnedAmountNicks, recipientNockAddress, grpcEndpoint } = params;
  burnedAmountNicks = toWholeNockNicks(burnedAmountNicks);
  if (burnedAmountNicks <= 0n) {
    throw new Error("Burn amount must be at least 1 whole NOCK in nicks.");
  }

  const wasm = await import("@nockbox/iris-wasm");
  if (typeof wasm.default === "function") {
    await wasm.default();
  }

  const bridgePkh = wasm.pkhNew(
    BigInt(ZORP_BRIDGE_THRESHOLD),
    ZORP_BRIDGE_ADDRESSES.map((a) => parseDigestString(a, "bridge address"))
  );
  const bridgeSpend = wasm.spendConditionNewPkh(bridgePkh);
  const bridgeFirstName = wasm.spendConditionFirstName(bridgeSpend);

  const digest = parseDigestString(recipientNockAddress, "recipient nock address");
  const recipientSpend = wasm.spendConditionNewPkh(wasm.pkhSingle(digest));

  const grpcClient = new wasm.GrpcClient(grpcEndpoint);
  const balance = await grpcClient.getBalanceByFirstName(bridgeFirstName);

  const rawNotes: Note[] = [];
  if (balance?.notes) {
    for (const noteEntry of balance.notes) {
      const pbNote = (noteEntry as { note?: unknown }).note ?? noteEntry;
      if (pbNote) {
        rawNotes.push(wasm.noteFromProtobuf(pbNote as never));
      }
    }
  }

  if (rawNotes.length === 0) {
    throw new Error("No bridge notes returned for this endpoint.");
  }

  const sorted = sortBridgeNotesForWithdrawal(rawNotes);
  const withdrawalFee = withdrawalBridgeFeeNicks(burnedAmountNicks);
  const spendable = burnedAmountNicks - withdrawalFee;
  if (spendable <= 0n) {
    throw new Error("Burned amount is too small after the withdrawal fee.");
  }

  const selected = selectNotesCoveringSpendable(sorted, spendable);
  const perNoteAssetsNicks = selected.map((n) => String(BigInt(n.assets)));
  console.log("[baseToNockNockchainFee] fee estimate coin selection", {
    count: selected.length,
    perNoteAssetsNicks,
    perNoteAssetsNock: perNoteAssetsNicks.map(
      (n) => Number(BigInt(n)) / NOCK_TO_NICKS
    ),
  });

  let feeNicks = 256n;
  for (let iter = 0; iter < 32; iter++) {
    const net = burnedAmountNicks - withdrawalFee - feeNicks;
    if (net <= 0n) {
      throw new Error("Burned amount is too small for the Nockchain transaction fee.");
    }
    const nextFee = buildWithdrawalFeeSample(
      wasm,
      selected,
      bridgeSpend,
      recipientSpend,
      net
    );
    if (nextFee === feeNicks) {
      return feeNicks;
    }
    feeNicks = nextFee;
  }

  return feeNicks;
}
