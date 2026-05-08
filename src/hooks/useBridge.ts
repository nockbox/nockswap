"use client";

import { useState, useCallback, useRef } from "react";
import { useWallet, NOCK_TO_NICKS } from "@/hooks/useWallet";
import { base58 } from "@scure/base";
import type {
  BlockHeight,
  Digest,
  Nicks,
  Note,
  NoteData,
  Noun,
  PbCom2Note,
  PbCom2RawTransaction,
  SpendCondition,
} from "@nockbox/iris-wasm";
import {
  isBridgeConfigured as checkBridgeConfigured,
  BRIDGE_NOTE_KEY,
  currentTxEngineSettings,
  evmAddressToBelts,
  verifyBeltEncoding,
  buildBridgeNoun,
  assertValidBridgeTransaction,
} from "@/lib/bridge";
import { isEvmAddress } from "@/lib/validators";
import { MIN_BRIDGE_AMOUNT_NOCK } from "@/lib/constants";
import { getActiveBridgeConfig } from "@/lib/bridgeConfig";

export type BridgeStatus =
  | "idle"
  | "preparing"
  | "confirming"
  | "pending"
  | "awaiting_signature"
  | "success"
  | "error";

export interface BridgeResult {
  txId: string;
  fee: bigint;
  destinationAddress: string;
  amountInNicks: bigint;
  signedJammedTx: Uint8Array;
}

export interface TransactionPreview {
  /** Amount being bridged in nicks */
  amountInNicks: bigint;
  /** Exact fee calculated from built transaction */
  fee: bigint;
  /** Total cost (amount + fee) */
  totalCost: bigint;
  /** Number of input notes being used */
  notesUsed: number;
  /** Destination EVM address */
  destinationAddress: string;
  /** Belt encoding of destination address */
  belts: [bigint, bigint, bigint];
  /** Transaction ID */
  txId: string;
  /** Jammed transaction bytes (for download) */
  jammedTransaction: Uint8Array;
  /** Note data key from validated transaction */
  noteDataKey: string;
  /** Bridge version from validated transaction */
  version: string;
  /** Chain identifier from validated transaction (hex) */
  chain: string;
}

export interface UseBridgeReturn {
  // State
  status: BridgeStatus;
  error: string | null;
  result: BridgeResult | null;
  preview: TransactionPreview | null;

  // Actions
  prepareTransaction: (
    destinationAddress: string,
    amountInNocks: number
  ) => Promise<TransactionPreview>;
  confirmTransaction: () => Promise<BridgeResult | undefined>;
  cancelTransaction: () => void;
  reset: () => void;

  // Helpers
  isBridgeConfigured: boolean;
  validateDestination: (address: string) => {
    valid: boolean;
    error?: string;
  };
  previewBridge: (address: string) => {
    belts: [bigint, bigint, bigint] | null;
    encodingValid: boolean;
  };
}

// Internal type for prepared transaction data (not exported)
interface PreparedTransaction {
  rawTx: unknown;
  txNotes: unknown;
  fee: bigint;
  destinationAddress: string;
  amountInNicks: bigint;
  notesUsed: number;
}

function parseDigestString(value: string, field: string): Digest {
  const trimmed = value.trim();
  const bytes = base58.decode(trimmed);
  if (bytes.length !== 40) {
    throw new Error(`Invalid ${field}: expected a 40-byte base58 digest`);
  }
  return trimmed as Digest;
}

export function useBridge(): UseBridgeReturn {
  const { isConnected, address, grpcEndpoint, signRawTx } = useWallet();
  const [status, setStatus] = useState<BridgeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BridgeResult | null>(null);
  const [preview, setPreview] = useState<TransactionPreview | null>(null);

  // Keep a ref to the grpc client to avoid recreating
  const grpcClientRef = useRef<unknown>(null);

  // Store prepared transaction for confirmation step
  const preparedTxRef = useRef<PreparedTransaction | null>(null);

  const isBridgeConfigured = checkBridgeConfigured();

  const validateDestination = useCallback(
    (destinationAddress: string): { valid: boolean; error?: string } => {
      if (!destinationAddress) {
        return { valid: false, error: "Destination address is required" };
      }

      if (!isEvmAddress(destinationAddress)) {
        return { valid: false, error: "Invalid EVM address format" };
      }

      // Verify belt encoding is reversible (sanity check)
      if (!verifyBeltEncoding(destinationAddress)) {
        return { valid: false, error: "Address encoding verification failed" };
      }

      return { valid: true };
    },
    []
  );

  const previewBridge = useCallback(
    (
      destinationAddress: string
    ): { belts: [bigint, bigint, bigint] | null; encodingValid: boolean } => {
      if (!isEvmAddress(destinationAddress)) {
        return { belts: null, encodingValid: false };
      }

      try {
        const belts = evmAddressToBelts(destinationAddress);
        const encodingValid = verifyBeltEncoding(destinationAddress);
        return { belts, encodingValid };
      } catch {
        return { belts: null, encodingValid: false };
      }
    },
    []
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setResult(null);
    setPreview(null);
    preparedTxRef.current = null;
  }, []);

  const cancelTransaction = useCallback(() => {
    setStatus("idle");
    setPreview(null);
    preparedTxRef.current = null;
  }, []);

  // Prepare transaction: build tx and return preview for confirmation
  const prepareTransaction = useCallback(
    async (
      destinationAddress: string,
      amountInNocks: number
    ): Promise<TransactionPreview> => {
      // Pre-flight checks
      if (!isConnected || !address) {
        throw new Error("Wallet not connected");
      }

      if (!grpcEndpoint) {
        throw new Error("gRPC endpoint not available");
      }

      if (!isBridgeConfigured) {
        throw new Error("Bridge not configured");
      }

      setStatus("preparing");
      setError(null);
      setResult(null);
      setPreview(null);
      preparedTxRef.current = null;

      try {
        // Validate destination
        const validation = validateDestination(destinationAddress);
        if (!validation.valid) {
          throw new Error(validation.error);
        }

        // Validate amount
        if (amountInNocks < MIN_BRIDGE_AMOUNT_NOCK) {
          throw new Error(
            `Minimum bridge amount is ${MIN_BRIDGE_AMOUNT_NOCK.toLocaleString()} NOCK`
          );
        }

        const amountInNicks = BigInt(Math.floor(amountInNocks * NOCK_TO_NICKS));
        // Load and initialize WASM module
        const wasm = await import("@nockbox/iris-wasm");
        if (typeof wasm.default === "function") {
          await wasm.default();
        }

        // Create or reuse gRPC client
        if (!grpcClientRef.current) {
          grpcClientRef.current = new wasm.GrpcClient(grpcEndpoint);
        }
        const grpcClient = grpcClientRef.current as InstanceType<
          typeof wasm.GrpcClient
        >;

        // Derive first-names from PKH (notes are indexed by first-name, not address)
        const digestAddress = parseDigestString(address, "wallet address");
        const simplePkh = wasm.pkhSingle(digestAddress);
        const simpleSpendCondition = wasm.spendConditionNewPkh(simplePkh);
        const simpleFirstName = wasm.spendConditionFirstName(simpleSpendCondition);

        // Coinbase notes use PKH + TIM spend condition
        const coinbaseSpendCondition: SpendCondition = [
          { tag: "pkh", ...simplePkh },
          {
            tag: "tim" as const,
            rel: { min: 100 as BlockHeight, max: null },
            abs: { min: null, max: null },
          },
        ];
        const coinbaseFirstName =
          wasm.spendConditionFirstName(coinbaseSpendCondition);

        // Fetch notes by first-name (both simple and coinbase)
        const [simpleBalance, coinbaseBalance] = await Promise.all([
          grpcClient.getBalanceByFirstName(simpleFirstName),
          grpcClient.getBalanceByFirstName(coinbaseFirstName),
        ]);

        // Parse notes from responses
        const userNotes: Note[] = [];
        const userSpendConditions: SpendCondition[] = [];

        // Process simple notes
        if (simpleBalance?.notes) {
          for (const noteEntry of simpleBalance.notes) {
            const pbNote = (noteEntry.note || noteEntry) as PbCom2Note;
            const note = wasm.noteFromProtobuf(pbNote);
            userNotes.push(note);
            userSpendConditions.push(simpleSpendCondition);
          }
        }

        // Process coinbase notes
        if (coinbaseBalance?.notes) {
          for (const noteEntry of coinbaseBalance.notes) {
            const pbNote = (noteEntry.note || noteEntry) as PbCom2Note;
            const note = wasm.noteFromProtobuf(pbNote);
            userNotes.push(note);
            userSpendConditions.push(coinbaseSpendCondition);
          }
        }

        if (userNotes.length === 0) {
          throw new Error("No spendable notes found in wallet");
        }

        const txEngineSettings = await currentTxEngineSettings(wasm);
        const feePerWord = BigInt(txEngineSettings.cost_per_word);

        // Sort notes by largest first
        const noteIndices = userNotes.map((_, i) => i);
        noteIndices.sort((a, b) =>
          Number(BigInt(userNotes[b].assets) - BigInt(userNotes[a].assets))
        );

        // Estimate fee based on number of inputs
        const estimateFeeForNotes = (numNotes: number): bigint => {
          const baseWords = 20n;
          const wordsPerInput = 30n;
          const wordsPerOutput = 13n;
          const numOutputs = 2n; // bridge + refund (consolidated)
          const totalWords =
            baseWords +
            BigInt(numNotes) * wordsPerInput +
            numOutputs * wordsPerOutput;
          const safeWords = (totalWords * 110n) / 100n;
          return safeWords * feePerWord;
        };

        // Calculate total available balance
        const totalAvailable = userNotes.reduce(
          (sum, note) => sum + BigInt(note.assets),
          0n
        );

        // Select notes iteratively, accounting for fee increase with more notes
        const selectedNotes: typeof userNotes = [];
        const selectedConditions: typeof userSpendConditions = [];
        let selectedTotal = 0n;

        for (const i of noteIndices) {
          selectedNotes.push(userNotes[i]);
          selectedConditions.push(userSpendConditions[i]);
          selectedTotal += BigInt(userNotes[i].assets);

          // Check if we have enough for amount + estimated fee for this many notes
          const estimatedFee = estimateFeeForNotes(selectedNotes.length);
          const targetAmount = amountInNicks + estimatedFee;

          if (selectedTotal >= targetAmount) {
            break;
          }
        }

        // Final check
        const finalEstimatedFee = estimateFeeForNotes(selectedNotes.length);
        const finalTarget = amountInNicks + finalEstimatedFee;

        if (selectedTotal < finalTarget) {
          const totalNock = Number(totalAvailable) / NOCK_TO_NICKS;
          const targetNock = Number(finalTarget) / NOCK_TO_NICKS;
          throw new Error(
            `Insufficient balance. You have ${totalNock.toLocaleString()} NOCK total, ` +
              `but need ${targetNock.toLocaleString()} NOCK (amount + fee).`
          );
        }

        // Build transaction
        const builder = new wasm.TxBuilder(txEngineSettings);

        // Verify bridge lock root configuration once before building seeds
        {
          const bridgeConfig = getActiveBridgeConfig();
          const testBridgePkh = wasm.pkhNew(
            BigInt(bridgeConfig.bridgeThreshold),
            bridgeConfig.bridgeSignerPkhs.map((a) =>
              parseDigestString(a, "bridge address")
            )
          );
          const testSpendCondition = wasm.spendConditionNewPkh(testBridgePkh);
          const testLockRoot = wasm.lockHash(testSpendCondition);
          if (testLockRoot !== bridgeConfig.bridgeLockRoot) {
            throw new Error(
              `Bridge address mismatch. Check bridge configuration.`
            );
          }
        }

        let remainingGift = amountInNicks;

        for (let i = 0; i < selectedNotes.length; i++) {
          const note = selectedNotes[i];
          const spendCondition = selectedConditions[i];
          const noteAssets = BigInt(note.assets);

          const giftPortion =
            remainingGift < noteAssets ? remainingGift : noteAssets;
          remainingGift -= giftPortion;

          const noteClone = wasm.noteFromProtobuf(wasm.noteToProtobuf(note));
          const spendConditionClone = wasm.spendConditionFromProtobuf(
            wasm.spendConditionToProtobuf(spendCondition)
          );

          // Create refund spend condition (back to user)
          const refundSpendCondition = wasm.spendConditionNewPkh(
            wasm.pkhSingle(digestAddress)
          );

          const spendBuilder = new wasm.SpendBuilder(
            noteClone,
            spendConditionClone,
            null,
            refundSpendCondition
          );

          if (giftPortion > 0n) {
            const parentHash = wasm.noteHash(note);

            // Put bridge noteData on all seeds
            const freshBridgeNounJs = buildBridgeNoun(destinationAddress);
            const noteData: NoteData = [
              [BRIDGE_NOTE_KEY, freshBridgeNounJs as unknown as Noun],
            ];

            // Create fresh lock root
            const bridgeConfig = getActiveBridgeConfig();
            const freshBridgePkh = wasm.pkhNew(
              BigInt(bridgeConfig.bridgeThreshold),
              bridgeConfig.bridgeSignerPkhs.map((a) =>
                parseDigestString(a, "bridge address")
              )
            );
            const freshBridgeSpendCondition =
              wasm.spendConditionNewPkh(freshBridgePkh);

            const seed = {
              output_source: null,
              lock_root: freshBridgeSpendCondition,
              gift: giftPortion.toString() as Nicks,
              note_data: noteData,
              parent_hash: parentHash,
            };

            spendBuilder.seed(seed);
          }

          spendBuilder.computeRefund(false);
          builder.spend(spendBuilder);
        }

        // Calculate exact fee
        builder.recalcAndSetFee(false);
        const fee = BigInt(builder.curFee());

        // Build transaction
        const nockchainTx = builder.build();
        const rawTx = wasm.nockchainTxToRawTx(nockchainTx);

        // Store prepared transaction data
        const rawTxProto = wasm.rawTxToProtobuf(rawTx);

        // PRE-SIGNING VALIDATION: Validate the transaction before allowing signature
        // This ensures the transaction has correct bridge output, amount, and note data
        const preValidation = await assertValidBridgeTransaction(
          rawTxProto,
          "pre-signing"
        );

        // Store prepared transaction data for confirmation
        preparedTxRef.current = {
          rawTx: rawTxProto,
          txNotes: {
            notes: selectedNotes.map((n: unknown) =>
              wasm.noteToProtobuf(n as Note)
            ),
            spendConditions: selectedConditions.map((sc: SpendCondition) =>
              wasm.spendConditionToProtobuf(sc)
            ),
          },
          fee,
          destinationAddress,
          amountInNicks,
          notesUsed: selectedNotes.length,
        };

        // Create preview using VALIDATED data from transaction (not UI values)
        // This ensures the confirmation screen shows what's actually in the transaction
        const txId = nockchainTx.id || "unknown";
        const transactionPreview: TransactionPreview = {
          amountInNicks: preValidation.bridgeAmountNicks!,
          fee,
          totalCost: preValidation.bridgeAmountNicks! + fee,
          notesUsed: selectedNotes.length,
          destinationAddress: preValidation.destinationAddress!,
          belts: preValidation.belts!,
          txId,
          jammedTransaction: wasm.jam(wasm.nockchainTxToNoun(nockchainTx)),
          noteDataKey: preValidation.noteDataKey!,
          version: preValidation.version!,
          chain: preValidation.chain!,
        };

        setPreview(transactionPreview);
        setStatus("confirming");
        return transactionPreview;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : String(err) || "Failed to prepare transaction";

        console.error("Prepare error:", message);
        setError(message);
        setStatus("error");
        throw err;
      }
    },
    [
      isConnected,
      address,
      grpcEndpoint,
      isBridgeConfigured,
      validateDestination,
    ]
  );

  // Confirm and submit prepared transaction
  const confirmTransaction = useCallback(async (): Promise<
    BridgeResult | undefined
  > => {
    const prepared = preparedTxRef.current;

    if (!prepared) {
      throw new Error(
        "No transaction prepared. Call prepareTransaction first."
      );
    }

    if (status !== "confirming") {
      throw new Error("Transaction not in confirming state");
    }

    setStatus("awaiting_signature");

    try {
      // Sign via wallet
      const signedTxBytes = await signRawTx({
        rawTx: prepared.rawTx,
        notes: (
          prepared.txNotes as { notes: unknown[]; spendConditions: unknown[] }
        ).notes,
        spendConditions: (
          prepared.txNotes as { notes: unknown[]; spendConditions: unknown[] }
        ).spendConditions,
      });

      setStatus("pending");

      // Load WASM for validation and gRPC
      const wasm = await import("@nockbox/iris-wasm");
      if (typeof wasm.default === "function") {
        await wasm.default();
      }

      // POST-SIGNING VALIDATION: Recreate TxBuilder and validate
      // This ensures the signed transaction is valid (fee sufficient, balanced, etc.)
      let signedTxId: string;
      let signedJammedTx: Uint8Array;
      try {
        // Parse the signed transaction bytes back to RawTx
        const signedRawTx = wasm.rawTxFromProtobuf(
          signedTxBytes as unknown as PbCom2RawTransaction
        );

        // Get the signed TX ID and convert to JAM format for download
        const signedNockchainTx = wasm.rawTxV1ToNockchainTx(
          signedRawTx as Parameters<typeof wasm.rawTxV1ToNockchainTx>[0]
        );
        signedTxId = signedNockchainTx.id || "unknown";
        signedJammedTx = wasm.jam(wasm.nockchainTxToNoun(signedNockchainTx));

        // Reconstruct notes and spend conditions from stored protobuf
        const txEngineSettings = await currentTxEngineSettings(wasm);

        // Recreate TxBuilder from the signed transaction
        const rebuiltBuilder = wasm.TxBuilder.fromRawTx(
          signedRawTx,
          txEngineSettings
        );

        // Validate the signed transaction
        rebuiltBuilder.validate();

        console.log(
          "[Bridge] Transaction validation passed, signed txId:",
          signedTxId
        );
      } catch (validationErr) {
        console.error("[Bridge] Transaction validation failed:", validationErr);
        throw new Error(
          `Transaction validation failed: ${
            validationErr instanceof Error
              ? validationErr.message
              : String(validationErr)
          }`
        );
      }

      // Our custom bridge validation (checks destination, amount, note data)
      await assertValidBridgeTransaction(
        signedTxBytes as unknown as PbCom2RawTransaction,
        "post-signing"
      );

      // Get or create gRPC client
      if (!grpcClientRef.current) {
        grpcClientRef.current = new wasm.GrpcClient(grpcEndpoint!);
      }
      const grpcClient = grpcClientRef.current as InstanceType<
        typeof wasm.GrpcClient
      >;

      // Submit to network
      await grpcClient.sendTransaction(
        signedTxBytes as unknown as PbCom2RawTransaction
      );

      const bridgeResult: BridgeResult = {
        txId: signedTxId,
        fee: prepared.fee,
        destinationAddress: prepared.destinationAddress,
        amountInNicks: prepared.amountInNicks,
        signedJammedTx,
      };

      setResult(bridgeResult);
      setStatus("success");
      setPreview(null);
      preparedTxRef.current = null;

      return bridgeResult;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : String(err) || "Bridge transaction failed";

      // Check if user cancelled
      const isCancellation =
        message.toLowerCase().includes("reject") ||
        message.toLowerCase().includes("cancel") ||
        message.toLowerCase().includes("denied");

      if (isCancellation) {
        setStatus("confirming"); // Go back to confirming state
        return undefined;
      }

      console.error("Bridge error:", message);
      setError(message);
      setStatus("error");
      throw err;
    }
  }, [status, signRawTx, grpcEndpoint]);

  return {
    // State
    status,
    error,
    result,
    preview,

    // Actions
    prepareTransaction,
    confirmTransaction,
    cancelTransaction,
    reset,

    // Helpers
    isBridgeConfigured,
    validateDestination,
    previewBridge,
  };
}
