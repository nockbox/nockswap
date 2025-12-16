/**
 * Bridge utilities for Nockchain <-> Base bridging
 *
 * Encodes EVM addresses for the Zorp bridge using the Goldilocks prime
 * field representation (3 belts).
 */

import { isEvmAddress } from "./validators";

// Goldilocks prime: 2^64 - 2^32 + 1
export const GOLDILOCKS_PRIME = 2n ** 64n - 2n ** 32n + 1n;

// Bridge note data key
export const BRIDGE_NOTE_KEY = "%bridge";

// Zorp bridge multisig configuration
export const ZORP_BRIDGE_THRESHOLD: number = parseInt(
  process.env.NEXT_PUBLIC_ZORP_BRIDGE_THRESHOLD || "",
  10
);

export const ZORP_BRIDGE_ADDRESSES: string[] = (
  process.env.NEXT_PUBLIC_ZORP_BRIDGE_ADDRESSES || ""
)
  .split(",")
  .map((addr) => addr.trim())
  .filter((addr) => addr.length > 0);

// Helper to check if bridge is configured
export const isBridgeConfigured = (): boolean => {
  return (
    ZORP_BRIDGE_ADDRESSES.length > 0 &&
    ZORP_BRIDGE_THRESHOLD > 0 &&
    ZORP_BRIDGE_THRESHOLD <= ZORP_BRIDGE_ADDRESSES.length
  );
};

// Default fee rate: 0.5 NOCK per word (in nicks)
export const DEFAULT_FEE_PER_WORD = 32768n;

/**
 * Convert an EVM address to 3 belts (field elements over Goldilocks prime)
 *
 * Uses repeated division (DVR) to encode the 160-bit address as 3 × 64-bit
 * field elements.
 *
 * @param address - EVM address (with or without 0x prefix)
 * @returns Tuple of 3 bigints [belt1, belt2, belt3]
 */
export function evmAddressToBelts(address: string): [bigint, bigint, bigint] {
  // Validate address
  if (!isEvmAddress(address)) {
    throw new Error(`Invalid EVM address: ${address}`);
  }

  // Normalize address
  const normalized = address.startsWith("0x") ? address : `0x${address}`;
  const addr = BigInt(normalized);

  // First DVR: address / p
  const belt1 = addr % GOLDILOCKS_PRIME;
  const q1 = addr / GOLDILOCKS_PRIME;

  // Second DVR: q1 / p
  const belt2 = q1 % GOLDILOCKS_PRIME;
  const belt3 = q1 / GOLDILOCKS_PRIME;

  return [belt1, belt2, belt3];
}

/**
 * Convert 3 belts back to an EVM address
 *
 * Useful for verification/testing.
 *
 * @param belt1 - First belt (least significant)
 * @param belt2 - Second belt
 * @param belt3 - Third belt (most significant)
 * @returns EVM address with 0x prefix
 */
export function beltsToEvmAddress(
  belt1: bigint,
  belt2: bigint,
  belt3: bigint
): string {
  const p = GOLDILOCKS_PRIME;
  const address = belt1 + belt2 * p + belt3 * p * p;
  return "0x" + address.toString(16).padStart(40, "0");
}

/**
 * Convert a string to a Hoon cord (little-endian bytes as hex)
 *
 * Used to encode tags like "%base" as atoms.
 *
 * @param str - String to encode
 * @returns Hex string representation
 */
export function stringToAtom(str: string): string {
  const bytes = new TextEncoder().encode(str);
  // Reverse for little-endian, then convert to hex
  let hex = "";
  for (let i = bytes.length - 1; i >= 0; i--) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex || "0";
}

/**
 * Convert a bigint to hex atom string
 *
 * @param n - BigInt value
 * @returns Hex string (without 0x prefix)
 */
export function bigintToAtom(n: bigint): string {
  if (n === 0n) return "0";
  return n.toString(16);
}

/**
 * Build the bridge noun structure for an EVM address
 *
 * Creates: [%base [belt1 [belt2 belt3]]]
 *
 * @param evmAddress - Destination EVM address on Base
 * @returns JS representation of the noun (for use with Noun.fromJs())
 */
export function buildBridgeNoun(evmAddress: string): unknown {
  const [belt1, belt2, belt3] = evmAddressToBelts(evmAddress);

  // %base tag as little-endian hex
  const baseTag = stringToAtom("base");

  // Build noun structure: [%base [belt1 [belt2 belt3]]]
  return [
    baseTag,
    [bigintToAtom(belt1), [bigintToAtom(belt2), bigintToAtom(belt3)]],
  ];
}

/**
 * Verify belt encoding is reversible (for testing)
 *
 * @param address - Original EVM address
 * @returns true if encoding/decoding produces the same address
 */
export function verifyBeltEncoding(address: string): boolean {
  if (!isEvmAddress(address)) return false;

  const normalized = address.toLowerCase().startsWith("0x")
    ? address.toLowerCase()
    : `0x${address.toLowerCase()}`;

  const [belt1, belt2, belt3] = evmAddressToBelts(normalized);
  const recovered = beltsToEvmAddress(belt1, belt2, belt3);

  return normalized === recovered;
}

// =============================================================================
// Bridge Transaction Building
// =============================================================================

import type { Note, SpendCondition, NockchainTx } from "@nockbox/iris-wasm";

/**
 * Create jammed bridge note data for an EVM address
 *
 * @param evmAddress - Destination address on Base
 * @returns Jammed noun bytes for the bridge note data
 */
export async function createBridgeNoteData(
  evmAddress: string
): Promise<Uint8Array> {
  // Dynamic import and initialize WASM
  const wasm = await import("@nockbox/iris-wasm");
  if (typeof wasm.default === "function") {
    await wasm.default();
  }

  const bridgeNounJs = buildBridgeNoun(evmAddress);
  const bridgeNoun = wasm.Noun.fromJs(bridgeNounJs);
  return bridgeNoun.jam();
}

export interface BridgeTransactionParams {
  /** User's input notes (UTXOs to spend) */
  inputNotes: Note[];
  /** Spend conditions for each input note */
  spendConditions: SpendCondition[];
  /** Amount to bridge in nicks */
  amountInNicks: bigint;
  /** Destination EVM address on Base */
  destinationAddress: string;
  /** User's PKH for refunds/change */
  refundPkh: string;
  /** Optional fee override in nicks */
  feeOverride?: bigint;
}

export interface BridgeTransactionResult {
  /** The built transaction */
  transaction: NockchainTx;
  /** Transaction ID */
  txId: string;
  /** Calculated fee in nicks */
  fee: bigint;
}

/**
 * Build a bridge transaction to send NOCK from Nockchain to Base
 *
 * @param params - Transaction parameters
 * @returns Built transaction ready for signing
 * @throws Error if bridge is not configured or inputs are invalid
 */
export async function buildBridgeTransaction(
  params: BridgeTransactionParams
): Promise<BridgeTransactionResult> {
  // Check bridge is configured
  if (!isBridgeConfigured()) {
    throw new Error("Bridge not configured");
  }

  // Validate destination address
  if (!isEvmAddress(params.destinationAddress)) {
    throw new Error(
      `Invalid destination address: ${params.destinationAddress}`
    );
  }

  // Dynamic import and initialize WASM module
  const wasm = await import("@nockbox/iris-wasm");
  if (typeof wasm.default === "function") {
    await wasm.default();
  }

  // Create bridge note data
  const bridgeNounJs = buildBridgeNoun(params.destinationAddress);
  const bridgeNoun = wasm.Noun.fromJs(bridgeNounJs);
  const jammedBridgeData = bridgeNoun.jam();

  // Create note data with bridge entry
  const bridgeEntry = new wasm.NoteDataEntry(BRIDGE_NOTE_KEY, jammedBridgeData);
  const noteData = new wasm.NoteData([bridgeEntry]);

  // Derive lock root from multisig PKH spend condition
  const bridgePkh = new wasm.Pkh(
    BigInt(ZORP_BRIDGE_THRESHOLD),
    ZORP_BRIDGE_ADDRESSES
  );
  const bridgeSpendCondition = wasm.SpendCondition.newPkh(bridgePkh);
  const zorpLockRoot = wasm.LockRoot.fromSpendCondition(bridgeSpendCondition);

  // Build transaction
  const builder = new wasm.TxBuilder(
    params.feeOverride ?? DEFAULT_FEE_PER_WORD
  );

  // Process each input note
  for (let i = 0; i < params.inputNotes.length; i++) {
    const note = params.inputNotes[i];
    const spendCondition = params.spendConditions[i];

    // Create spend builder
    const spendBuilder = new wasm.SpendBuilder(
      note,
      spendCondition,
      wasm.SpendCondition.newPkh(wasm.Pkh.single(params.refundPkh))
    );

    // Create seed (output) to bridge
    const seed = new wasm.Seed(
      null, // output_source (null for non-coinbase)
      zorpLockRoot,
      params.amountInNicks,
      noteData,
      note.hash()
    );

    spendBuilder.seed(seed);
    spendBuilder.computeRefund(false);
    builder.spend(spendBuilder);
  }

  // Calculate and set fee
  builder.recalcAndSetFee(false);
  const fee = builder.calcFee();

  // Build (but don't sign - that happens via wallet)
  const transaction = builder.build();

  return {
    transaction,
    txId: transaction.id.value,
    fee,
  };
}
