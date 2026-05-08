/**
 * Bridge utilities for Nockchain <-> Base bridging
 *
 * Encodes EVM addresses for the Zorp bridge using the Goldilocks prime
 * field representation (3 belts).
 */

import type {
  Digest,
  Nicks,
  NockchainTx,
  Noun,
  Note,
  NoteData,
  PbCom2RawTransaction,
  SeedV1,
  SpendCondition,
  TxEngineSettings,
} from "@nockbox/iris-wasm";
import { base58 } from "@scure/base";
import { isEvmAddress } from "./validators";
import { MIN_BRIDGE_AMOUNT_NOCK } from "./constants";
import {
  getActiveBridgeConfig,
  isBridgeConfigComplete,
} from "./bridgeConfig";
import { resolveTxEngineSettings } from "./nockchainConstants";
import { NOCK_TO_NICKS } from "@/hooks/useWallet";

// Goldilocks prime: 2^64 - 2^32 + 1
export const GOLDILOCKS_PRIME = 2n ** 64n - 2n ** 32n + 1n;

// Bridge note data key
export const BRIDGE_NOTE_KEY = "bridge";

// Helper to check if bridge is configured
export const isBridgeConfigured = (): boolean => {
  return isBridgeConfigComplete();
};

export async function currentTxEngineSettings(
  wasm: typeof import("@nockbox/iris-wasm"),
  costPerWord?: bigint
): Promise<TxEngineSettings> {
  return resolveTxEngineSettings(wasm, {
    costPerWordOverride: costPerWord,
  });
}

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
  return wasm.jam(bridgeNounJs as unknown as Noun);
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

function parseDigestString(value: string, field: string): Digest {
  const trimmed = value.trim();
  const bytes = base58.decode(trimmed);
  if (bytes.length !== 40) {
    throw new Error(`Invalid ${field}: expected a 40-byte base58 digest`);
  }
  return trimmed as Digest;
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
  const bridgeConfig = getActiveBridgeConfig();
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
  const noteData = [
    [BRIDGE_NOTE_KEY, bridgeNounJs as unknown as Noun],
  ] as unknown as NoteData;

  // Derive lock root from multisig PKH spend condition
  const bridgePkh = wasm.pkhNew(
    BigInt(bridgeConfig.bridgeThreshold),
    bridgeConfig.bridgeSignerPkhs.map((addr) =>
      parseDigestString(addr, "bridge address")
    )
  );
  const bridgeSpendCondition = wasm.spendConditionNewPkh(bridgePkh);
  const zorpLockRoot = bridgeSpendCondition;
  const refundPkh = wasm.pkhSingle(parseDigestString(params.refundPkh, "refund PKH"));
  const refundLock = wasm.spendConditionNewPkh(refundPkh);

  // Build transaction
  const txEngineSettings = await currentTxEngineSettings(wasm, params.feeOverride);
  const builder = new wasm.TxBuilder(txEngineSettings);
  let remainingGift = params.amountInNicks;

  // Process each input note
  for (let i = 0; i < params.inputNotes.length; i++) {
    const note = params.inputNotes[i];
    const spendCondition = params.spendConditions[i];
    const noteAssets = BigInt((note as { assets?: string }).assets ?? "0");
    const giftPortion = remainingGift < noteAssets ? remainingGift : noteAssets;
    remainingGift -= giftPortion;

    // Create spend builder
    const spendBuilder = new wasm.SpendBuilder(
      note,
      spendCondition,
      null,
      refundLock
    );

    // Create seed (output) to bridge
    if (giftPortion > 0n) {
      const seed = {
        output_source: null,
        lock_root: zorpLockRoot,
        gift: giftPortion.toString() as Nicks,
        note_data: noteData,
        parent_hash: wasm.noteHash(note),
      } as SeedV1;
      spendBuilder.seed(seed);
    }
    spendBuilder.computeRefund(false);
    builder.spend(spendBuilder);
  }

  if (remainingGift > 0n) {
    throw new Error("Insufficient input note balance for bridge amount");
  }

  // Calculate and set fee
  builder.recalcAndSetFee(false);
  const fee = BigInt(builder.curFee());

  // Build (but don't sign - that happens via wallet)
  const transaction = builder.build();

  return {
    transaction,
    txId: transaction.id,
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
  /** Note data key */
  noteDataKey?: string;
  /** Bridge version */
  version?: string;
  /** Chain identifier */
  chain?: string;
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

    // Load transaction into WASM and get outputs
    const rawTx = wasm.rawTxFromProtobuf(
      rawTxProto as PbCom2RawTransaction
    );
    const outputs = wasm.rawTxOutputs(
      rawTx,
      0,
      await currentTxEngineSettings(wasm)
    );

    if (outputs.length === 0) {
      return { valid: false, error: "Transaction has no outputs" };
    }

    // Convert outputs to structured data for validation
    const outputData: Array<{
      assets: bigint;
      noteData: NoteData;
    }> = [];

    for (const output of outputs) {
      outputData.push({
        assets: BigInt((output as { assets?: string }).assets ?? "0"),
        noteData: ("note_data" in output
          ? (output.note_data as NoteData)
          : []) as NoteData,
      });
    }

    // Find the output to the bridge address by looking for "bridge" note data entry
    let bridgeOutput: (typeof outputData)[0] | null = null;

    for (const output of outputData) {
      if (
        output.noteData?.some(
          (entry: [string, Noun]) => entry[0] === BRIDGE_NOTE_KEY
        )
      ) {
        bridgeOutput = output;
        break;
      }
    }

    if (!bridgeOutput) {
      return {
        valid: false,
        error: `No output with '${BRIDGE_NOTE_KEY}' note data found in transaction`,
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
    if (!bridgeOutput.noteData?.length) {
      return {
        valid: false,
        error: "Bridge output missing note data",
      };
    }

    // Find bridge entry
    const bridgeEntry = bridgeOutput.noteData.find(
      (entry: [string, Noun]) => entry[0] === BRIDGE_NOTE_KEY
    );
    if (!bridgeEntry) {
      return {
        valid: false,
        error: `Bridge output missing '${BRIDGE_NOTE_KEY}' note data entry`,
      };
    }

    // Decode and validate bridge note data
    let destinationAddress: string | undefined;
    let belts: [bigint, bigint, bigint] | undefined;
    let validatedVersion: string | undefined;
    let validatedChain: string | undefined;
    const validatedNoteDataKey = bridgeEntry[0];

    try {
      const entryValue = bridgeEntry[1] as unknown;
      const decoded = (Array.isArray(entryValue)
        ? entryValue
        : wasm.cue(
            entryValue instanceof Uint8Array
              ? entryValue
              : new Uint8Array(entryValue as number[])
          )) as unknown;

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
      validatedVersion = String(version);

      const chainAndBelts = decoded[1];
      if (!Array.isArray(chainAndBelts) || chainAndBelts.length !== 2) {
        return {
          valid: false,
          error: "Invalid bridge note data: missing chain and belts",
        };
      }

      const chain = chainAndBelts[0];
      // base = 0x65736162
      if (chain !== "65736162") {
        return {
          valid: false,
          error: `Invalid bridge chain: expected base (65736162), got ${chain}`,
        };
      }
      validatedChain = String(chain);

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
      noteDataKey: validatedNoteDataKey,
      version: validatedVersion,
      chain: validatedChain,
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
