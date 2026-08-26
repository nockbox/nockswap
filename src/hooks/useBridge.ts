"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { useChainId } from "wagmi";
import {
  assertValidBridgeTransaction,
  buildBridgeTransaction,
  initWasm,
  RpcError,
  UserRejectedError,
} from "@nockbox/iris-sdk";
import { useWallet } from "@/hooks/useWallet";
import { base58 } from "@scure/base";
import type {
  BlockHeight,
  Digest,
  Nicks,
  Note,
  PbCom2Note,
  PbCom2RawTransaction,
  RawTxV1,
  SpendCondition,
} from "@nockbox/iris-sdk/wasm";
import {
  bridgeOptionsFromActivationHeights,
  evmAddressToBelts,
  getZorpBridgeConfig,
  isBridgeConfigured as checkBridgeConfigured,
  verifyBeltEncoding,
} from "@/lib/bridge";
import { isEvmAddress } from "@/lib/validators";
import { MIN_BRIDGE_AMOUNT_NICKS } from "@/lib/constants";
import { formatNicksAsNock } from "@/lib/nockAmount";
import { getBridgeNetworkConfig } from "@/lib/bridgeNetworkConfig";

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
    amountInNicks: bigint
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
  refundPkh: string;
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
  const chainId = useChainId();
  const {
    isConnected,
    address,
    grpcEndpoint,
    txEngineActivationHeights,
    signRawTx,
  } = useWallet();
  const [status, setStatus] = useState<BridgeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BridgeResult | null>(null);
  const [preview, setPreview] = useState<TransactionPreview | null>(null);

  // Keep a ref to the grpc client to avoid recreating
  const grpcClientRef = useRef<unknown>(null);

  const confirmInFlightRef = useRef(false);

  // Store prepared transaction for confirmation step
  const preparedTxRef = useRef<PreparedTransaction | null>(null);

  const activeBridgeNetwork = useMemo(
    () => getBridgeNetworkConfig(chainId),
    [chainId]
  );
  const isBridgeConfigured = checkBridgeConfigured(chainId);

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
      amountInNicks: bigint
    ): Promise<TransactionPreview> => {
      // Pre-flight checks
      if (!isConnected || !address) {
        throw new Error("Wallet not connected");
      }

      if (!grpcEndpoint) {
        throw new Error("gRPC endpoint not available");
      }

      if (!txEngineActivationHeights) {
        throw new Error(
          "Transaction engine settings not available; connect your wallet and try again"
        );
      }

      if (!isBridgeConfigured) {
        throw new Error(`Bridge not configured for connected chain ${chainId}`);
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
        if (amountInNicks < MIN_BRIDGE_AMOUNT_NICKS) {
          throw new Error(
            `Minimum bridge amount is ${formatNicksAsNock(
              MIN_BRIDGE_AMOUNT_NICKS
            )} NOCK`
          );
        }
        await initWasm();
        const wasm = await import("@nockbox/iris-sdk/wasm");

        const bridgeConfig = getZorpBridgeConfig(chainId);
        if (!bridgeConfig || !activeBridgeNetwork) {
          throw new Error(`Bridge not configured for connected chain ${chainId}`);
        }
        const bridgeOptions = bridgeOptionsFromActivationHeights(
          txEngineActivationHeights
        );
        const costPerWord = BigInt(
          String(bridgeOptions.txEngineSettings.cost_per_word)
        );

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

        // Sort notes by largest first
        const noteIndices = userNotes.map((_, i) => i);
        noteIndices.sort((a, b) => {
          const left = BigInt(userNotes[a].assets);
          const right = BigInt(userNotes[b].assets);
          return left === right ? 0 : left > right ? -1 : 1;
        });

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
          return safeWords * costPerWord;
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
          throw new Error(
            `Insufficient balance. You have ${formatNicksAsNock(
              totalAvailable
            )} NOCK total, but need ${formatNicksAsNock(
              finalTarget
            )} NOCK (amount + fee).`
          );
        }

        // Build transaction
        {
          const testBridgePkh = wasm.pkhNew(
            BigInt(activeBridgeNetwork.bridgeThreshold),
            activeBridgeNetwork.bridgeSignerPkhs.map((a) =>
              parseDigestString(a, "bridge address")
            )
          );
          const testSpendCondition = wasm.spendConditionNewPkh(testBridgePkh);
          const testLockRoot = wasm.lockHash(testSpendCondition);
          if (testLockRoot !== activeBridgeNetwork.bridgeLockRoot) {
            throw new Error(
              `Bridge address mismatch. Check bridge configuration.`
            );
          }
        }

        const validationParams = {
          inputNotes: selectedNotes,
          spendConditions: selectedConditions,
          amountInNicks: amountInNicks.toString() as Nicks,
          destinationAddress,
          refundPkh: address,
        };
        const { transaction: nockchainTx, fee: feeStr } =
          await buildBridgeTransaction(
            validationParams,
            bridgeConfig,
            bridgeOptions
          );

        const fee = BigInt(feeStr);
        const rawTx = wasm.nockchainTxToRawTx(nockchainTx);
        const rawTxProto = wasm.rawTxToProtobuf(rawTx);

        const preValidation = await assertValidBridgeTransaction(
          rawTx,
          "pre-signing",
          validationParams,
          bridgeConfig,
          bridgeOptions
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
          refundPkh: address,
          notesUsed: selectedNotes.length,
        };

        // Create preview using VALIDATED data from transaction (not UI values)
        // This ensures the confirmation screen shows what's actually in the transaction
        const txId = nockchainTx.id || "unknown";
        const bridgeAmt = BigInt(preValidation.bridgeAmountNicks!);
        const transactionPreview: TransactionPreview = {
          amountInNicks: bridgeAmt,
          fee,
          totalCost: bridgeAmt + fee,
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
      chainId,
      grpcEndpoint,
      txEngineActivationHeights,
      activeBridgeNetwork,
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

    if (!txEngineActivationHeights) {
      throw new Error(
        "Transaction engine settings not available; connect your wallet and try again"
      );
    }

    if (confirmInFlightRef.current) {
      return undefined;
    }
    confirmInFlightRef.current = true;

    setStatus("awaiting_signature");

    try {
      // Sign via wallet
      const signedTxProto = await signRawTx({
        rawTx: prepared.rawTx,
        notes: (
          prepared.txNotes as { notes: unknown[]; spendConditions: unknown[] }
        ).notes,
        spendConditions: (
          prepared.txNotes as { notes: unknown[]; spendConditions: unknown[] }
        ).spendConditions,
      });

      setStatus("pending");

      await initWasm();
      const wasm = await import("@nockbox/iris-sdk/wasm");

      const bridgeConfig = getZorpBridgeConfig(chainId);
      if (!bridgeConfig) {
        throw new Error(`Bridge not configured for connected chain ${chainId}`);
      }
      const bridgeOptions = bridgeOptionsFromActivationHeights(
        txEngineActivationHeights
      );
      const txEngineSettings = bridgeOptions.txEngineSettings;

      // POST-SIGNING VALIDATION: Recreate TxBuilder and validate
      // This ensures the signed transaction is valid (fee sufficient, balanced, etc.)
      let signedTxId: string;
      let signedJammedTx: Uint8Array;
      try {
        // Parse the signed transaction bytes back to RawTx
        const signedRawTx = wasm.rawTxFromProtobuf(signedTxProto);
        if (!("version" in signedRawTx) || signedRawTx.version !== 1) {
          throw new Error("Signed bridge transaction is not RawTxV1");
        }
        const signedRawTxV1: RawTxV1 = signedRawTx;

        // Get the signed TX ID and convert to JAM format for download
        const signedNockchainTx = wasm.rawTxV1ToNockchainTx(
          signedRawTxV1
        );
        signedTxId = signedNockchainTx.id || "unknown";
        signedJammedTx = wasm.jam(wasm.nockchainTxToNoun(signedNockchainTx));

        // Reconstruct notes and spend conditions from stored protobuf

        // Recreate TxBuilder from the signed transaction
        const rebuiltBuilder = wasm.TxBuilder.fromRawTx(
          signedRawTxV1,
          txEngineSettings
        );

        // Validate the signed transaction
        rebuiltBuilder.validate();
        await assertValidBridgeTransaction(
          signedRawTxV1,
          "post-signing",
          {
            destinationAddress: prepared.destinationAddress,
            amountInNicks: prepared.amountInNicks.toString() as Nicks,
            refundPkh: prepared.refundPkh,
          },
          bridgeConfig,
          bridgeOptions
        );

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


      // Get or create gRPC client
      if (!grpcClientRef.current) {
        grpcClientRef.current = new wasm.GrpcClient(grpcEndpoint!);
      }
      const grpcClient = grpcClientRef.current as InstanceType<
        typeof wasm.GrpcClient
      >;

      const unsignedRawTx = wasm.rawTxFromProtobuf(
        prepared.rawTx as PbCom2RawTransaction
      );
      const signedRawTx = wasm.rawTxFromProtobuf(signedTxProto);

      console.log("[Bridge] Transaction about to submit", {
        txId: signedTxId,
        unsignedRawProtobuf: prepared.rawTx,
        unsignedRawTx,
        signedRawProtobuf: signedTxProto,
        signedRawTx,
        jammedByteLength: signedJammedTx.byteLength,
        destinationAddress: prepared.destinationAddress,
        amountInNicks: prepared.amountInNicks.toString(),
        feeNicks: prepared.fee.toString(),
      });

      // Submit to network
      await grpcClient.sendTransaction(signedTxProto);

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

      const isCancellation =
        err instanceof UserRejectedError ||
        (err instanceof RpcError && err.code === 4001);

      if (isCancellation) {
        setStatus("confirming");
        return undefined;
      }

      console.error("Bridge error:", message);
      setError(message);
      setStatus("error");
      throw err;
    } finally {
      confirmInFlightRef.current = false;
    }
  }, [status, signRawTx, grpcEndpoint, txEngineActivationHeights, chainId]);

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
