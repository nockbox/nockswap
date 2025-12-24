"use client";

import { useState, useCallback, useRef } from "react";
import { useWallet, NOCK_TO_NICKS } from "@/hooks/useWallet";
import {
  ZORP_BRIDGE_THRESHOLD,
  ZORP_BRIDGE_ADDRESSES,
  isBridgeConfigured as checkBridgeConfigured,
  BRIDGE_NOTE_KEY,
  DEFAULT_FEE_PER_WORD,
  evmAddressToBelts,
  verifyBeltEncoding,
  buildBridgeNoun,
  assertValidBridgeTransaction,
} from "@/lib/bridge";
import { isEvmAddress } from "@/lib/validators";
import { MIN_BRIDGE_AMOUNT_NOCK } from "@/lib/constants";

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
}

export interface BridgeNoteData {
  key: string;
  blob: Uint8Array;
  decoded?: unknown;
  reconstructedAddress?: string;
}

export interface BridgeNoteInfo {
  assets: bigint;
  noteData: BridgeNoteData[];
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
  confirmTransaction: () => Promise<BridgeResult>;
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

  // Debug
  inspectBridgeNotes: () => Promise<{ notes: BridgeNoteInfo[] } | null>;
}

// Internal type for prepared transaction data (not exported)
interface PreparedTransaction {
  rawTx: unknown;
  txNotes: unknown;
  nockchainTx: unknown;
  fee: bigint;
  destinationAddress: string;
  amountInNicks: bigint;
  belts: [bigint, bigint, bigint];
  notesUsed: number;
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
        if (amountInNocks <= 0) {
          throw new Error("Amount must be greater than 0");
        }
        if (amountInNocks < MIN_BRIDGE_AMOUNT_NOCK) {
          throw new Error(`Minimum bridge amount is ${MIN_BRIDGE_AMOUNT_NOCK.toLocaleString()} NOCK`);
        }

        const amountInNicks = BigInt(Math.floor(amountInNocks * NOCK_TO_NICKS));
        const belts = evmAddressToBelts(destinationAddress);

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
        const simplePkh = wasm.Pkh.single(address);
        const simpleSpendCondition = wasm.SpendCondition.newPkh(simplePkh);
        const simpleFirstName = simpleSpendCondition.firstName();

        // Coinbase notes use PKH + TIM spend condition
        const pkhLeaf = wasm.LockPrimitive.newPkh(wasm.Pkh.single(address));
        const timLeaf = wasm.LockPrimitive.newTim(wasm.LockTim.coinbase());
        const coinbaseSpendCondition = new wasm.SpendCondition([
          pkhLeaf,
          timLeaf,
        ]);
        const coinbaseFirstName = coinbaseSpendCondition.firstName();

        // Fetch notes by first-name (both simple and coinbase)
        const [simpleBalance, coinbaseBalance] = await Promise.all([
          grpcClient.getBalanceByFirstName(simpleFirstName.value),
          grpcClient.getBalanceByFirstName(coinbaseFirstName.value),
        ]);

        // Parse notes from responses
        const userNotes: InstanceType<typeof wasm.Note>[] = [];
        const userSpendConditions: InstanceType<typeof wasm.SpendCondition>[] = [];

        // Process simple notes
        if (simpleBalance?.notes) {
          for (const noteEntry of simpleBalance.notes) {
            const pbNote = noteEntry.note || noteEntry;
            const note = wasm.Note.fromProtobuf(pbNote);
            userNotes.push(note);
            userSpendConditions.push(simpleSpendCondition);
          }
        }

        // Process coinbase notes
        if (coinbaseBalance?.notes) {
          for (const noteEntry of coinbaseBalance.notes) {
            const pbNote = noteEntry.note || noteEntry;
            const note = wasm.Note.fromProtobuf(pbNote);
            userNotes.push(note);
            userSpendConditions.push(coinbaseSpendCondition);
          }
        }

        if (userNotes.length === 0) {
          throw new Error("No spendable notes found in wallet");
        }

        // Verify notes are valid by testing hash on first note
        try {
          userNotes[0].hash();
        } catch {
          throw new Error("Failed to hash note - note object may be invalid");
        }

        // Calculate total available balance
        const totalAvailable = userNotes.reduce(
          (sum, note) => sum + BigInt(note.assets),
          0n
        );

        // Sort notes by assets (largest first) to minimize number of inputs
        const noteIndices = userNotes.map((_, i) => i);
        noteIndices.sort((a, b) =>
          Number(BigInt(userNotes[b].assets) - BigInt(userNotes[a].assets))
        );

        // Estimate fee based on number of inputs
        const estimateFeeForNotes = (numNotes: number): bigint => {
          const baseWords = 20n;
          const wordsPerInput = 30n;
          const wordsPerOutput = 13n;
          const numOutputs = BigInt(1 + numNotes);
          const totalWords = baseWords + (BigInt(numNotes) * wordsPerInput) + (numOutputs * wordsPerOutput);
          const safeWords = (totalWords * 110n) / 100n;
          return safeWords * DEFAULT_FEE_PER_WORD;
        };

        // Select notes iteratively
        const selectedNotes: typeof userNotes = [];
        const selectedConditions: typeof userSpendConditions = [];
        let selectedTotal = 0n;

        for (const i of noteIndices) {
          selectedNotes.push(userNotes[i]);
          selectedConditions.push(userSpendConditions[i]);
          selectedTotal += BigInt(userNotes[i].assets);

          const estimatedFee = estimateFeeForNotes(selectedNotes.length);
          const targetAmount = amountInNicks + estimatedFee;

          if (selectedTotal >= targetAmount) {
            break;
          }
        }

        // Final checks
        const finalEstimatedFee = estimateFeeForNotes(selectedNotes.length);
        const finalTarget = amountInNicks + finalEstimatedFee;

        if (selectedTotal < finalTarget) {
          throw new Error(
            `Insufficient balance. Selected ${selectedNotes.length} notes with ${selectedTotal} nicks, ` +
            `need ${amountInNicks} + ~${finalEstimatedFee} fee = ${finalTarget} nicks`
          );
        }

        if (totalAvailable < finalTarget) {
          throw new Error(
            `Insufficient total balance. Available: ${totalAvailable} nicks, ` +
            `Required: ${amountInNicks} + ~${finalEstimatedFee} fee`
          );
        }

        // Build transaction
        const builder = new wasm.TxBuilder(DEFAULT_FEE_PER_WORD);

        let remainingGift = amountInNicks;
        let isFirstBridgeSeed = true;

        for (let i = 0; i < selectedNotes.length; i++) {
          const note = selectedNotes[i];
          const spendCondition = selectedConditions[i];
          const noteAssets = BigInt(note.assets);

          const giftPortion = remainingGift < noteAssets ? remainingGift : noteAssets;
          remainingGift -= giftPortion;

          const noteClone = wasm.Note.fromProtobuf(note.toProtobuf());
          const spendConditionClone = wasm.SpendCondition.fromProtobuf(
            spendCondition.toProtobuf()
          );

          const refundSpendCondition = wasm.SpendCondition.newPkh(
            wasm.Pkh.single(address)
          );

          const spendBuilder = new wasm.SpendBuilder(
            noteClone,
            spendConditionClone,
            refundSpendCondition
          );

          if (giftPortion > 0n) {
            const parentHash = note.hash();

            let noteData: InstanceType<typeof wasm.NoteData>;
            if (isFirstBridgeSeed) {
              const freshBridgeNounJs = buildBridgeNoun(destinationAddress);
              const bridgeNoun = wasm.Noun.fromJs(freshBridgeNounJs);
              const jammedBridgeData = bridgeNoun.jam();
              const bridgeEntry = new wasm.NoteDataEntry(BRIDGE_NOTE_KEY, jammedBridgeData);
              noteData = new wasm.NoteData([bridgeEntry]);
              isFirstBridgeSeed = false;
            } else {
              noteData = wasm.NoteData.empty();
            }

            const freshBridgePkh = new wasm.Pkh(
              BigInt(ZORP_BRIDGE_THRESHOLD),
              ZORP_BRIDGE_ADDRESSES
            );
            const freshBridgeSpendCondition = wasm.SpendCondition.newPkh(freshBridgePkh);
            const freshZorpLockRoot = wasm.LockRoot.fromSpendCondition(freshBridgeSpendCondition);

            const seed = new wasm.Seed(
              null,
              freshZorpLockRoot,
              giftPortion,
              noteData,
              parentHash
            );

            spendBuilder.seed(seed);
          }

          spendBuilder.computeRefund(false);
          builder.spend(spendBuilder);
        }

        // Calculate exact fee
        builder.recalcAndSetFee(false);
        const fee = builder.calcFee();

        // Build transaction
        const nockchainTx = builder.build();
        const rawTx = nockchainTx.toRawTx();
        const txNotes = builder.allNotes();

        // Store prepared transaction data
        const rawTxProto = rawTx.toProtobuf();

        // PRE-SIGNING VALIDATION: Validate the transaction before allowing signature
        // This ensures the transaction has correct bridge output, amount, and note data
        const preValidation = await assertValidBridgeTransaction(rawTxProto, "pre-signing");

        // Store prepared transaction data for confirmation
        preparedTxRef.current = {
          rawTx: rawTxProto,
          txNotes: {
            notes: txNotes.notes.map((n: { toProtobuf: () => unknown }) => n.toProtobuf()),
            spendConditions: txNotes.spendConditions.map((sc: { toProtobuf: () => unknown }) => sc.toProtobuf()),
          },
          nockchainTx: nockchainTx.id?.value || "unknown",
          fee,
          destinationAddress,
          amountInNicks,
          belts,
          notesUsed: selectedNotes.length,
        };

        // Create preview using VALIDATED data from transaction (not UI values)
        // This ensures the confirmation screen shows what's actually in the transaction
        const txId = nockchainTx.id?.value || "unknown";
        const transactionPreview: TransactionPreview = {
          amountInNicks: preValidation.bridgeAmountNicks!,
          fee,
          totalCost: preValidation.bridgeAmountNicks! + fee,
          notesUsed: selectedNotes.length,
          destinationAddress: preValidation.destinationAddress!,
          belts: preValidation.belts!,
          txId,
          jammedTransaction: nockchainTx.toJam(),
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
  const confirmTransaction = useCallback(async (): Promise<BridgeResult> => {
    const prepared = preparedTxRef.current;

    if (!prepared) {
      throw new Error("No transaction prepared. Call prepareTransaction first.");
    }

    if (status !== "confirming") {
      throw new Error("Transaction not in confirming state");
    }

    setStatus("awaiting_signature");

    try {
      // Sign via wallet
      const signedTxBytes = await signRawTx({
        rawTx: prepared.rawTx,
        notes: (prepared.txNotes as { notes: unknown[]; spendConditions: unknown[] }).notes,
        spendConditions: (prepared.txNotes as { notes: unknown[]; spendConditions: unknown[] }).spendConditions,
      });

      setStatus("pending");

      // POST-SIGNING VALIDATION: Re-validate the transaction before submitting
      // This ensures the transaction we're about to submit is still valid
      // (signing doesn't modify outputs, but this is a safety check)
      await assertValidBridgeTransaction(prepared.rawTx, "post-signing");

      // Load WASM for gRPC client
      const wasm = await import("@nockbox/iris-wasm");
      if (typeof wasm.default === "function") {
        await wasm.default();
      }

      // Get or create gRPC client
      if (!grpcClientRef.current) {
        grpcClientRef.current = new wasm.GrpcClient(grpcEndpoint!);
      }
      const grpcClient = grpcClientRef.current as InstanceType<typeof wasm.GrpcClient>;

      // Submit to network
      await grpcClient.sendTransaction(signedTxBytes);

      const bridgeResult: BridgeResult = {
        txId: prepared.nockchainTx as string,
        fee: prepared.fee,
        destinationAddress: prepared.destinationAddress,
        amountInNicks: prepared.amountInNicks,
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
        return undefined as unknown as BridgeResult;
      }

      console.error("Bridge error:", message);
      setError(message);
      setStatus("error");
      throw err;
    }
  }, [status, signRawTx, grpcEndpoint]);

  // Debug function to fetch and inspect bridge note metadata
  const inspectBridgeNotes = useCallback(async (): Promise<{
    notes: Array<{
      assets: bigint;
      noteData: Array<{ key: string; blob: Uint8Array; decoded?: unknown; reconstructedAddress?: string }>;
    }>;
  } | null> => {
    if (!grpcEndpoint || !isBridgeConfigured) {
      return null;
    }

    try {
      // Load WASM
      const wasm = await import("@nockbox/iris-wasm");
      if (typeof wasm.default === "function") {
        await wasm.default();
      }

      // Create gRPC client
      const grpcClient = new wasm.GrpcClient(grpcEndpoint);

      // Derive first-name for bridge address (multisig)
      const bridgePkh = new wasm.Pkh(
        BigInt(ZORP_BRIDGE_THRESHOLD),
        ZORP_BRIDGE_ADDRESSES
      );
      const bridgeSpendCondition = wasm.SpendCondition.newPkh(bridgePkh);
      const bridgeFirstName = bridgeSpendCondition.firstName();

      // Fetch notes
      const balance = await grpcClient.getBalanceByFirstName(
        bridgeFirstName.value
      );

      if (!balance?.notes || balance.notes.length === 0) {
        return { notes: [] };
      }

      const notesWithData = [];

      for (const noteEntry of balance.notes) {
        const pbNote = noteEntry.note || noteEntry;
        const note = wasm.Note.fromProtobuf(pbNote);

        // Extract note_data from protobuf
        const noteDataEntries: Array<{
          key: string;
          blob: Uint8Array;
          decoded?: unknown;
          reconstructedAddress?: string;
        }> = [];

        // Extract note_data from V1 note structure
        const rawNoteData = pbNote.note_version?.V1?.note_data;
        if (rawNoteData?.entries) {
          for (const entry of rawNoteData.entries) {
            const entryData: {
              key: string;
              blob: Uint8Array;
              decoded?: unknown;
              reconstructedAddress?: string;
            } = {
              key: entry.key,
              blob: entry.blob,
            };

            // Try to decode/cue the blob if it's the bridge key
            if (entry.key === "%bridge" && entry.blob) {
              try {
                const noun = wasm.Noun.cue(new Uint8Array(entry.blob));
                const decoded = noun.toJs();
                entryData.decoded = decoded;

                // Try to reconstruct the EVM address from the belts
                // Structure: [version, [chain, [belt1, [belt2, belt3]]]]
                if (
                  Array.isArray(decoded) &&
                  decoded.length === 2 &&
                  Array.isArray(decoded[1])
                ) {
                  try {
                    const { beltsToEvmAddress } = await import("@/lib/bridge");
                    const beltData = decoded[1][1];

                    if (Array.isArray(beltData) && beltData.length === 2) {
                      const belt1Hex = beltData[0];
                      const belt2And3 = beltData[1];

                      if (Array.isArray(belt2And3) && belt2And3.length === 2) {
                        const belt2Hex = belt2And3[0];
                        const belt3Hex = belt2And3[1];

                        if (belt1Hex && belt2Hex && belt3Hex) {
                          const belt1 = BigInt("0x" + belt1Hex);
                          const belt2 = BigInt("0x" + belt2Hex);
                          const belt3 = BigInt("0x" + belt3Hex);

                          entryData.reconstructedAddress = beltsToEvmAddress(
                            belt1,
                            belt2,
                            belt3
                          );
                        }
                      }
                    }
                  } catch {
                    // Could not reconstruct address
                  }
                }
              } catch {
                // Could not decode blob
              }
            }

            noteDataEntries.push(entryData);
          }
        }

        notesWithData.push({
          assets: note.assets,
          noteData: noteDataEntries,
        });
      }

      return { notes: notesWithData };
    } catch {
      return null;
    }
  }, [grpcEndpoint, isBridgeConfigured]);

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

    // Debug
    inspectBridgeNotes,
  };
}
