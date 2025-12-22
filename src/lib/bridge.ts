/**
 * Bridge utilities for Nockchain <-> Base bridging
 *
 * Encodes EVM addresses for the Zorp bridge using the Goldilocks prime
 * field representation (3 belts).
 */

import type { Note, SpendCondition, NockchainTx } from "@nockbox/iris-wasm";
import { isEvmAddress } from "./validators";
import {
  ZORP_BRIDGE_THRESHOLD,
  ZORP_BRIDGE_ADDRESSES,
  ZORP_BRIDGE_LOCK_ROOT,
  MIN_BRIDGE_AMOUNT_NOCK,
} from "./constants";
import { NOCK_TO_NICKS } from "@/hooks/useWallet";

// Re-export for convenience
export { ZORP_BRIDGE_THRESHOLD, ZORP_BRIDGE_ADDRESSES };

// Goldilocks prime: 2^64 - 2^32 + 1
export const GOLDILOCKS_PRIME = 2n ** 64n - 2n ** 32n + 1n;

// Bridge note data key
export const BRIDGE_NOTE_KEY = "%bridge";

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
 * Creates: [0 [%base [belt1 [belt2 belt3]]]]
 * - 0 = version tag (integer zero)
 * - %base = chain identifier ("base" little-endian = 0x65736162)
 * - belt1, belt2, belt3 = EVM address encoded as 3 Goldilocks field elements
 *
 * @param evmAddress - Destination EVM address on Base
 * @returns JS representation of the noun (for use with Noun.fromJs())
 */
export function buildBridgeNoun(evmAddress: string): unknown {
  const [belt1, belt2, belt3] = evmAddressToBelts(evmAddress);

  // Version 0 - hex string for Noun.fromJs()
  const VERSION_TAG = "0";
  // %base = "base" in little-endian = 0x65736162 - hex string
  const BASE_CHAIN_TAG = "65736162";

  // Build noun structure: [0 [%base [belt1 [belt2 belt3]]]]
  return [
    VERSION_TAG,
    [
      BASE_CHAIN_TAG,
      [bigintToAtom(belt1), [bigintToAtom(belt2), bigintToAtom(belt3)]],
    ],
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

// =============================================================================
// Transaction Validation (Pre and Post Signing)
// =============================================================================

export interface TransactionValidationResult {
  valid: boolean;
  error?: string;
  /** Amount being sent to bridge address in nicks */
  bridgeAmountNicks?: bigint;
  /** Destination EVM address extracted from note data */
  destinationAddress?: string;
  /** Belt encoding extracted from note data */
  belts?: [bigint, bigint, bigint];
}

/**
 * Validate a bridge transaction before or after signing
 *
 * This function validates the transaction object (protobuf format) to ensure:
 * 1. There's an output to the bridge multisig address
 * 2. The amount is >= MIN_BRIDGE_AMOUNT_NOCK
 * 3. The note data contains valid bridge encoding with %bridge key
 * 4. The destination address can be reconstructed from the belts
 *
 * MUST be called before signing (to prevent signing invalid tx)
 * MUST be called after signing (to prevent submitting invalid tx)
 *
 * @param rawTxProto - The raw transaction protobuf object
 * @returns Validation result with extracted data
 */
export async function validateBridgeTransaction(
  rawTxProto: unknown
): Promise<TransactionValidationResult> {
  try {
    // Dynamic import and initialize WASM
    const wasm = await import("@nockbox/iris-wasm");
    if (typeof wasm.default === "function") {
      await wasm.default();
    }

    // Get seeds (outputs) from the raw transaction protobuf
    // Structure: spends[].spend.spend_kind.Witness.seeds[]
    // Each seed has: lock_root (string), note_data.entries[], gift.value (string)
    const rawTxProtoTyped = rawTxProto as {
      spends?: Array<{
        spend?: {
          spend_kind?: {
            Witness?: {
              seeds?: Array<{
                lock_root?: string;
                note_data?: {
                  entries?: Array<{ key: string; blob: number[] }>;
                };
                gift?: { value?: string };
              }>;
            };
          };
        };
      }>;
    };

    // Collect all seeds from all spends
    const allSeeds: Array<{
      assets: bigint;
      lockRoot: string | undefined;
      noteData:
        | { entries?: Array<{ key: string; blob: number[] }> }
        | undefined;
    }> = [];

    if (rawTxProtoTyped.spends) {
      for (const spend of rawTxProtoTyped.spends) {
        const seeds = spend.spend?.spend_kind?.Witness?.seeds;
        if (seeds) {
          for (const seed of seeds) {
            allSeeds.push({
              assets: BigInt(seed.gift?.value || 0),
              lockRoot: seed.lock_root,
              noteData: seed.note_data,
            });
          }
        }
      }
    }

    if (allSeeds.length === 0) {
      return { valid: false, error: "Transaction has no outputs (seeds)" };
    }

    console.log("[validateBridgeTransaction] Found seeds:", allSeeds.length);

    // Find the output to the bridge address by looking for %bridge note data entry
    let bridgeOutput: (typeof allSeeds)[0] | null = null;

    for (const seed of allSeeds) {
      // Check if this seed has %bridge note data (this is our primary identifier)
      if (seed.noteData?.entries?.some((e) => e.key === "%bridge")) {
        bridgeOutput = seed;
        break;
      }
    }

    console.log(
      "[validateBridgeTransaction] Bridge output found:",
      !!bridgeOutput,
      "assets:",
      bridgeOutput?.assets?.toString()
    );

    if (!bridgeOutput) {
      return {
        valid: false,
        error: "No output with %bridge note data found in transaction",
      };
    }

    // Verify the lock root matches the expected bridge multisig address
    if (bridgeOutput.lockRoot !== ZORP_BRIDGE_LOCK_ROOT) {
      console.error(
        "[validateBridgeTransaction] Lock root mismatch:",
        bridgeOutput.lockRoot,
        "expected:",
        ZORP_BRIDGE_LOCK_ROOT
      );
      return {
        valid: false,
        error: `Bridge output goes to wrong address. Expected bridge multisig, got: ${bridgeOutput.lockRoot}`,
      };
    }

    // Validate amount
    const minAmountNicks =
      BigInt(MIN_BRIDGE_AMOUNT_NOCK) * BigInt(NOCK_TO_NICKS);
    if (bridgeOutput.assets < minAmountNicks) {
      const amountNock = Number(bridgeOutput.assets) / NOCK_TO_NICKS;
      return {
        valid: false,
        error: `Bridge amount ${amountNock.toLocaleString()} NOCK is below minimum ${MIN_BRIDGE_AMOUNT_NOCK.toLocaleString()} NOCK`,
      };
    }

    // Validate note data format
    if (
      !bridgeOutput.noteData?.entries ||
      bridgeOutput.noteData.entries.length === 0
    ) {
      return {
        valid: false,
        error: "Bridge output missing note data",
      };
    }

    // Find %bridge entry
    const bridgeEntry = bridgeOutput.noteData.entries.find(
      (e) => e.key === "%bridge"
    );
    if (!bridgeEntry) {
      return {
        valid: false,
        error: "Bridge output missing %bridge note data entry",
      };
    }

    // Decode and validate bridge note data
    let destinationAddress: string | undefined;
    let belts: [bigint, bigint, bigint] | undefined;

    try {
      const noun = wasm.Noun.cue(new Uint8Array(bridgeEntry.blob));
      const decoded = noun.toJs() as unknown;

      // Expected structure: [version, [chain, [belt1, [belt2, belt3]]]]
      if (!Array.isArray(decoded) || decoded.length !== 2) {
        return {
          valid: false,
          error:
            "Invalid bridge note data structure: expected [version, [chain, belts]]",
        };
      }

      const version = decoded[0];
      if (version !== "0" && version !== 0) {
        return {
          valid: false,
          error: `Invalid bridge note data version: expected 0, got ${version}`,
        };
      }

      const chainAndBelts = decoded[1];
      if (!Array.isArray(chainAndBelts) || chainAndBelts.length !== 2) {
        return {
          valid: false,
          error: "Invalid bridge note data: missing chain and belts",
        };
      }

      const chain = chainAndBelts[0];
      // %base = 0x65736162
      if (chain !== "65736162") {
        return {
          valid: false,
          error: `Invalid bridge chain: expected %base (65736162), got ${chain}`,
        };
      }

      const beltData = chainAndBelts[1];
      if (!Array.isArray(beltData) || beltData.length !== 2) {
        return {
          valid: false,
          error: "Invalid bridge note data: invalid belt structure",
        };
      }

      const belt1Hex = beltData[0];
      const belt2And3 = beltData[1];

      if (!Array.isArray(belt2And3) || belt2And3.length !== 2) {
        return {
          valid: false,
          error: "Invalid bridge note data: invalid belt2/belt3 structure",
        };
      }

      const belt2Hex = belt2And3[0];
      const belt3Hex = belt2And3[1];

      // Convert hex strings to bigints
      const belt1 = BigInt("0x" + belt1Hex);
      const belt2 = BigInt("0x" + belt2Hex);
      const belt3 = BigInt("0x" + belt3Hex);

      belts = [belt1, belt2, belt3];

      // Reconstruct and validate EVM address
      destinationAddress = beltsToEvmAddress(belt1, belt2, belt3);

      // Verify address is valid
      if (!isEvmAddress(destinationAddress)) {
        return {
          valid: false,
          error: `Reconstructed address is invalid: ${destinationAddress}`,
        };
      }
    } catch (err) {
      return {
        valid: false,
        error: `Failed to decode bridge note data: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }

    // All validations passed
    return {
      valid: true,
      bridgeAmountNicks: bridgeOutput.assets,
      destinationAddress,
      belts,
    };
  } catch (err) {
    return {
      valid: false,
      error: `Transaction validation failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

/**
 * Validate a bridge transaction and throw if invalid
 *
 * Convenience wrapper that throws on validation failure.
 *
 * @param rawTxProto - The raw transaction protobuf object
 * @param context - Context for error message ("pre-signing" or "post-signing")
 * @throws Error if validation fails
 */
export async function assertValidBridgeTransaction(
  rawTxProto: unknown,
  context: "pre-signing" | "post-signing"
): Promise<TransactionValidationResult> {
  const result = await validateBridgeTransaction(rawTxProto);
  if (!result.valid) {
    throw new Error(`${context} validation failed: ${result.error}`);
  }
  return result;
}
