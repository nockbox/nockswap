"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { useChainId } from "wagmi";
import {
  assertValidBridgeTransaction,
  buildBridgeTransaction,
  initWasm,
  RpcError,
  UserRejectedError,
  wasm,
} from "@nockbox/iris-sdk";
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
import { guard } from "@nockbox/iris-sdk/wasm";
import { useWallet, NOCK_TO_NICKS } from "@/hooks/useWallet";
import { base58 } from "@scure/base";
import {
  bridgeOptionsFromActivationHeights,
  evmAddressToBelts,
  getZorpBridgeConfig,
  isBridgeConfigured as checkBridgeConfigured,
  verifyBeltEncoding,
} from "@/lib/bridge";
import { isEvmAddress } from "@/lib/validators";
import {
  MIN_BRIDGE_AMOUNT_NOCK,
} from "@/lib/constants";
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

const TX_ACCEPTANCE_TIMEOUT_MS = 30_000;
const TX_ACCEPTANCE_POLL_INTERVAL_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTransactionAccepted(
  grpcClient: InstanceType<typeof wasm.GrpcClient>,
  txId: string
): Promise<boolean> {
  const deadline = Date.now() + TX_ACCEPTANCE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (await grpcClient.transactionAccepted(txId)) {
      return true;
    }
    await sleep(TX_ACCEPTANCE_POLL_INTERVAL_MS);
  }

  return false;
}

export function useBridge(): UseBridgeReturn {
  const chainId = useChainId();
  const {
    isConnected,
    address,
    grpcEndpoint,
    txEngineActivationHeights,
    coinbaseTimelockBlocks,
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

      try {

        // Verify belt encoding is reversible (sanity check). This requires initialized WASM.
        if (!verifyBeltEncoding(destinationAddress)) {
          return { valid: false, error: "Address encoding verification failed" };
        }
      } catch {
        return { valid: false, error: "Address encoding verification unavailable" };
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
      console.log("grpc endpoint: ", grpcEndpoint)
      if (!grpcEndpoint) {
        throw new Error("gRPC endpoint not available");
        
      }

      if (!txEngineActivationHeights) {
        throw new Error(
          "Transaction engine settings not available; connect your wallet and try again"
        );
      }

      if (coinbaseTimelockBlocks == null) {
        throw new Error(
          "Coinbase timelock settings not available; connect your wallet and try again"
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
        await initWasm();

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

        // Coinbase notes use PKH + TIM spend condition (timelock from Iris RPC config)
        const coinbaseSpendCondition: SpendCondition = [
          { tag: "pkh", ...simplePkh },
          {
            tag: "tim" as const,
            rel: {
              min: coinbaseTimelockBlocks as BlockHeight,
              max: null,
            },
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
          const totalNock = Number(totalAvailable) / NOCK_TO_NICKS;
          const targetNock = Number(finalTarget) / NOCK_TO_NICKS;
          throw new Error(
            `Insufficient balance. You have ${totalNock.toLocaleString()} NOCK total, ` +
              `but need ${targetNock.toLocaleString()} NOCK (amount + fee).`
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

        const { transaction: nockchainTx, fee: feeStr } =
          await buildBridgeTransaction(
            {
              inputNotes: selectedNotes,
              spendConditions: selectedConditions,
              amountInNicks: amountInNicks.toString() as Nicks,
              destinationAddress,
              refundPkh: address,
            },
            bridgeConfig,
            bridgeOptions
          );

        const fee = BigInt(feeStr);
        const rawTx = wasm.nockchainTxToRawTx(nockchainTx);
        if (!guard.isRawTxV1(rawTx)) {
          throw new Error("Bridge transaction must be version 1");
        }
        const rawTxProto = wasm.rawTxToProtobuf(rawTx);

        const preValidation = await assertValidBridgeTransaction(
          rawTx,
          "pre-signing",
          {
            destinationAddress,
            amountInNicks: amountInNicks.toString() as Nicks,
            refundPkh: address,
          },
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
      coinbaseTimelockBlocks,
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
      let signedRawTx: RawTxV1;
      try {
        // Parse the signed transaction bytes back to RawTx
        const parsedSignedRawTx = wasm.rawTxFromProtobuf(signedTxProto);
        if (!guard.isRawTxV1(parsedSignedRawTx)) {
          throw new Error("Bridge transaction must be version 1");
        }
        signedRawTx = parsedSignedRawTx;

        // Use the signed raw tx id for UI/explorer links. Signing changes witness data,
        // so the pre-signing id must not be surfaced after confirmation.
        const signedNockchainTx = wasm.rawTxV1ToNockchainTx(signedRawTx);
        const signedRawTxId = signedRawTx.id;
        signedTxId = signedRawTxId || "unknown";
        if (signedNockchainTx.id !== signedTxId) {
          console.warn("[Bridge] signed tx id mismatch; using raw tx id", {
            nockchainTxId: signedNockchainTx.id,
            rawTxId: signedTxId,
          });
          signedNockchainTx.id = signedRawTxId;
        }
        signedJammedTx = wasm.jam(wasm.nockchainTxToNoun(signedNockchainTx));

        // Reconstruct notes and spend conditions from stored protobuf

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

      await assertValidBridgeTransaction(
        signedRawTx,
        "post-signing",
        {
          destinationAddress: prepared.destinationAddress,
          amountInNicks: prepared.amountInNicks.toString() as Nicks,
          refundPkh: address!,
        },
        bridgeConfig,
        bridgeOptions
      );

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

      // Submit to network, then confirm the RPC reports the signed tx as accepted.
      const submitAck = await grpcClient.sendTransaction(signedTxProto);
      console.log("[Bridge] Transaction submit RPC acknowledged", {
        txId: signedTxId,
        acknowledgement: submitAck,
      });

      const accepted = await waitForTransactionAccepted(grpcClient, signedTxId);
      if (!accepted) {
        throw new Error(
          `Transaction ${signedTxId} was submitted but not accepted by the RPC within ${Math.round(
            TX_ACCEPTANCE_TIMEOUT_MS / 1000
          )}s`
        );
      }

      console.log("[Bridge] Transaction accepted by RPC", {
        txId: signedTxId,
      });

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
  }, [status, signRawTx, grpcEndpoint, txEngineActivationHeights, chainId, address]);

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
