import { base58 } from "@scure/base";
import type {
  Digest,
  Note,
  Nicks,
  NoteData,
  SpendCondition,
  TxEngineSettings,
} from "@nockbox/iris-wasm";
import { currentTxEngineSettings } from "@/lib/bridge";
import {
  NICKS_PER_NOCK,
  PROTOCOL_FEE_NICKS_PER_NOCK,
  toWholeNockNicks,
} from "@/lib/constants";
import { getActiveBridgeConfig } from "@/lib/bridgeConfig";
import { NOCK_TO_NICKS } from "@/hooks/useWallet";

function parseDigestString(value: string, field: string): Digest {
  const trimmed = value.trim();
  const bytes = base58.decode(trimmed);
  if (bytes.length !== 40) {
    throw new Error(`Invalid ${field}: expected a 40-byte base58 digest`);
  }
  return trimmed as Digest;
}

export function withdrawalBridgeFeeNicks(burnedAmountNicks: bigint): bigint {
  const chunks = (burnedAmountNicks + NICKS_PER_NOCK - 1n) / NICKS_PER_NOCK;
  return chunks * PROTOCOL_FEE_NICKS_PER_NOCK;
}

function noteNameKey(note: Note): string {
  const n = note.name as { first?: string; last?: string } | undefined;
  const first = n?.first ?? "";
  const last = n?.last ?? "";
  return `${first}\0${last}`;
}

export interface BridgeInventoryNote {
  note: Note;
  originPage: bigint;
}

function asNonNegativeBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") {
    return value >= 0n ? value : null;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return BigInt(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    return BigInt(trimmed);
  }
  return null;
}

function readObjectValue(value: unknown, key: string): unknown {
  if (value && typeof value === "object" && key in value) {
    return (value as Record<string, unknown>)[key];
  }
  return undefined;
}

function extractOriginPage(...candidates: unknown[]): bigint | null {
  for (const candidate of candidates) {
    const direct =
      asNonNegativeBigInt(readObjectValue(candidate, "origin_page")) ??
      asNonNegativeBigInt(readObjectValue(candidate, "originPage")) ??
      asNonNegativeBigInt(readObjectValue(candidate, "origin"));
    if (direct !== null) return direct;

    const origin = readObjectValue(candidate, "origin");
    const nested =
      asNonNegativeBigInt(readObjectValue(origin, "page")) ??
      asNonNegativeBigInt(readObjectValue(origin, "height")) ??
      asNonNegativeBigInt(readObjectValue(origin, "block_height"));
    if (nested !== null) return nested;
  }
  return null;
}

function extractHeight(value: unknown): bigint | null {
  const direct = asNonNegativeBigInt(value);
  if (direct !== null) return direct;
  return (
    asNonNegativeBigInt(readObjectValue(value, "height")) ??
    asNonNegativeBigInt(readObjectValue(value, "block_height")) ??
    asNonNegativeBigInt(readObjectValue(value, "snapshot_height")) ??
    asNonNegativeBigInt(readObjectValue(value, "snapshotHeight")) ??
    asNonNegativeBigInt(readObjectValue(value, "page")) ??
    asNonNegativeBigInt(readObjectValue(value, "tip"))
  );
}

async function currentSnapshotHeight(
  grpcClient: unknown
): Promise<bigint> {
  const methodNames = [
    "getCurrentSnapshotHeight",
    "getSnapshotHeight",
    "getTipHeight",
    "getTip",
    "getLatestBlockHeight",
    "getBlockHeight",
    "getHeight",
  ];

  for (const methodName of methodNames) {
    const method = readObjectValue(grpcClient, methodName);
    if (typeof method !== "function") continue;
    try {
      const value = await method.call(grpcClient);
      const height = extractHeight(value);
      if (height !== null) {
        return height;
      }
    } catch {
      // Older GrpcClient builds do not expose every candidate method.
    }
  }

  throw new Error(
    "Nockchain snapshot height unavailable; cannot produce a safe-origin estimate."
  );
}

export function filterSafeBridgeNotes(
  notes: BridgeInventoryNote[],
  snapshotHeight: bigint,
  confirmationDepth: number
): BridgeInventoryNote[] {
  const safeTip = snapshotHeight - BigInt(confirmationDepth);
  if (safeTip < 0n) {
    return [];
  }
  return notes.filter((item) => item.originPage <= safeTip);
}

export function sortBridgeNotesForWithdrawal(
  notes: BridgeInventoryNote[]
): BridgeInventoryNote[] {
  return [...notes].sort((a, b) => {
    const assetsA = BigInt(a.note.assets);
    const assetsB = BigInt(b.note.assets);
    if (assetsA !== assetsB) {
      return assetsA < assetsB ? -1 : 1;
    }
    const ka = noteNameKey(a.note);
    const kb = noteNameKey(b.note);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

export function selectNotesCoveringSpendable(
  sortedNotes: BridgeInventoryNote[],
  spendableNicks: bigint
): Note[] {
  const selected: Note[] = [];
  let total = 0n;
  for (const item of sortedNotes) {
    selected.push(item.note);
    total += BigInt(item.note.assets);
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
  txEngineSettings: TxEngineSettings,
  selectedNotes: Note[],
  bridgeSpend: SpendCondition,
  recipientSpend: SpendCondition,
  netToRecipientNicks: bigint
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
  const { recipientNockAddress, grpcEndpoint } = params;
  let { burnedAmountNicks } = params;
  burnedAmountNicks = toWholeNockNicks(burnedAmountNicks);
  if (burnedAmountNicks <= 0n) {
    throw new Error("Burn amount must be at least 1 whole NOCK in nicks.");
  }

  const wasm = await import("@nockbox/iris-wasm");
  if (typeof wasm.default === "function") {
    await wasm.default();
  }

  const bridgeConfig = getActiveBridgeConfig();
  const bridgePkh = wasm.pkhNew(
    BigInt(bridgeConfig.bridgeThreshold),
    bridgeConfig.bridgeSignerPkhs.map((a) =>
      parseDigestString(a, "bridge address")
    )
  );
  const bridgeSpend = wasm.spendConditionNewPkh(bridgePkh);
  const bridgeFirstName = wasm.spendConditionFirstName(bridgeSpend);

  const digest = parseDigestString(recipientNockAddress, "recipient nock address");
  const recipientSpend = wasm.spendConditionNewPkh(wasm.pkhSingle(digest));

  const grpcClient = new wasm.GrpcClient(grpcEndpoint);
  const txEngineSettings = await currentTxEngineSettings(wasm);
  const balance = await grpcClient.getBalanceByFirstName(bridgeFirstName);
  const snapshotHeight =
    (await currentSnapshotHeight(grpcClient).catch(() => null)) ??
    extractHeight(balance);
  if (snapshotHeight === null) {
    throw new Error(
      "Nockchain snapshot height unavailable; cannot produce a safe-origin estimate."
    );
  }

  const rawNotes: BridgeInventoryNote[] = [];
  let missingOriginPage = 0;
  if (balance?.notes) {
    for (const noteEntry of balance.notes) {
      const pbNote = (noteEntry as { note?: unknown }).note ?? noteEntry;
      if (pbNote) {
        const note = wasm.noteFromProtobuf(pbNote as never);
        const originPage = extractOriginPage(noteEntry, pbNote, note);
        if (originPage === null) {
          missingOriginPage++;
          continue;
        }
        rawNotes.push({ note, originPage });
      }
    }
  }

  if (rawNotes.length === 0) {
    const suffix =
      missingOriginPage > 0
        ? " Bridge notes are missing origin_page metadata."
        : "";
    throw new Error(`No bridge notes returned for this endpoint.${suffix}`);
  }

  const safeNotes = filterSafeBridgeNotes(
    rawNotes,
    snapshotHeight,
    bridgeConfig.nockchainConfirmationDepth
  );
  if (safeNotes.length === 0) {
    throw new Error(
      "No bridge notes are old enough for the configured confirmation depth."
    );
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
      txEngineSettings,
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
