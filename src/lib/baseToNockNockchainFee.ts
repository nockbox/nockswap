import { base58 } from "@scure/base";
import type {
  Digest,
  Note,
  Nicks,
  NoteData,
  SpendCondition,
  TxEngineSettings,
} from "@nockbox/iris-wasm";
import { bridgeFeeNicksCeil } from "@/lib/constants";
import type { BridgeNetworkConfig } from "@/lib/bridgeNetworkConfig";

function parseDigestString(value: string, field: string): Digest {
  const trimmed = value.trim();
  const bytes = base58.decode(trimmed);
  if (bytes.length !== 40) {
    throw new Error(`Invalid ${field}: expected a 40-byte base58 digest`);
  }
  return trimmed as Digest;
}

function withdrawalBridgeFeeNicks(burnedAmountNicks: bigint): bigint {
  return bridgeFeeNicksCeil(burnedAmountNicks);
}

function parseNonNegativeBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") {
    return value >= 0n ? value : null;
  }
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  }
  if (typeof value === "string") {
    try {
      const parsed = BigInt(value);
      return parsed >= 0n ? parsed : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && value !== null && "value" in value) {
    return parseNonNegativeBigInt((value as { value?: unknown }).value);
  }
  return null;
}

function balanceSnapshotHeight(balance: unknown): bigint | null {
  return parseNonNegativeBigInt((balance as { height?: unknown })?.height);
}

function noteOriginPage(note: Note): bigint | null {
  if ("origin_page" in note) {
    return parseNonNegativeBigInt(note.origin_page);
  }
  if ("inner" in note) {
    return parseNonNegativeBigInt(note.inner?.origin_page);
  }
  return null;
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
  netToRecipientNicks: bigint,
  txEngineSettings: TxEngineSettings
): bigint {
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
  bridgeNetwork: BridgeNetworkConfig;
  txEngineSettings: TxEngineSettings;
}

/**
 * Estimates the Nockchain transaction fee for a Base→Nock payout by mirroring bridge relayer logic:
 * notes under the bridge multisig first-name, safe-origin filtering using the endpoint's balance
 * snapshot height, smallest-assets / lexicographic name ordering, greedy coverage of spendable
 * amount (burned − ceil bridge fee), then fee from TxBuilder.
 *
 * Multisig inputs are modeled **unsigned**: fee uses the engine’s missing-PKH-signature heuristic (see
 * `buildWithdrawalFeeSample`), not real 3-of-5 witness nouns.
 */
export async function estimateBaseToNockNockchainFeeNicks(
  params: EstimateBaseToNockNockchainFeeParams
): Promise<bigint> {
  const {
    burnedAmountNicks,
    recipientNockAddress,
    grpcEndpoint,
    bridgeNetwork,
    txEngineSettings,
  } = params;

  const wasm = await import("@nockbox/iris-wasm");
  if (typeof wasm.default === "function") {
    await wasm.default();
  }

  const bridgePkh = wasm.pkhNew(
    BigInt(bridgeNetwork.bridgeThreshold),
    bridgeNetwork.bridgeSignerPkhs.map((a) =>
      parseDigestString(a, "bridge address")
    )
  );
  const bridgeSpend = wasm.spendConditionNewPkh(bridgePkh);
  const bridgeFirstName = wasm.spendConditionFirstName(bridgeSpend);

  const digest = parseDigestString(recipientNockAddress, "recipient nock address");
  const recipientSpend = wasm.spendConditionNewPkh(wasm.pkhSingle(digest));

  const grpcClient = new wasm.GrpcClient(grpcEndpoint);
  const balance = await grpcClient.getBalanceByFirstName(bridgeFirstName);
  const snapshotHeight = balanceSnapshotHeight(balance);
  if (snapshotHeight === null) {
    throw new Error(
      "Bridge inventory estimate unavailable: endpoint did not return a balance snapshot height."
    );
  }

  const safeTip =
    snapshotHeight - BigInt(bridgeNetwork.nockchainConfirmationDepth);
  if (safeTip < 0n) {
    throw new Error(
      "Bridge inventory estimate unavailable: confirmation depth exceeds current Nockchain height."
    );
  }

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

  let missingOriginPageCount = 0;
  let unsafeOriginPageCount = 0;
  const safeNotes = rawNotes.filter((note) => {
    const originPage = noteOriginPage(note);
    if (originPage === null) {
      missingOriginPageCount += 1;
      return false;
    }
    if (originPage > safeTip) {
      unsafeOriginPageCount += 1;
      return false;
    }
    return true;
  });

  if (safeNotes.length === 0) {
    const reason =
      missingOriginPageCount === rawNotes.length
        ? "all returned bridge notes are missing origin_page"
        : "all returned bridge notes are newer than the configured confirmation depth";
    throw new Error(`Bridge inventory estimate unavailable: ${reason}.`);
  }

  const sorted = sortBridgeNotesForWithdrawal(safeNotes);
  const withdrawalFee = withdrawalBridgeFeeNicks(burnedAmountNicks);
  const spendable = burnedAmountNicks - withdrawalFee;
  if (spendable <= 0n) {
    throw new Error("Burned amount is too small after the withdrawal fee.");
  }

  const selected = selectNotesCoveringSpendable(sorted, spendable);
  const perNoteAssetsNicks = selected.map((n) => String(BigInt(n.assets)));
  console.log("[baseToNockNockchainFee] fee estimate coin selection", {
    snapshotHeight: snapshotHeight.toString(),
    confirmationDepth: bridgeNetwork.nockchainConfirmationDepth,
    safeTip: safeTip.toString(),
    rawNoteCount: rawNotes.length,
    safeNoteCount: safeNotes.length,
    missingOriginPageCount,
    unsafeOriginPageCount,
    count: selected.length,
    perNoteAssetsNicks,
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
      net,
      txEngineSettings
    );
    if (nextFee === feeNicks) {
      return feeNicks;
    }
    feeNicks = nextFee;
  }

  return feeNicks;
}
