"use client";

import { useState, useCallback, useRef } from "react";
import { useWallet, NOCK_TO_NICKS } from "@/hooks/useWallet";
import {
  ZORP_BRIDGE_ADDRESS,
  BRIDGE_NOTE_KEY,
  DEFAULT_FEE_PER_WORD,
  evmAddressToBelts,
  verifyBeltEncoding,
  buildBridgeNoun,
} from "@/lib/bridge";
import { isEvmAddress } from "@/lib/validators";

export type BridgeStatus =
  | "idle"
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

export interface BridgeNoteData {
  key: string;
  blob: Uint8Array;
  decoded?: unknown;
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

  // Actions
  bridgeToBase: (
    destinationAddress: string,
    amountInNocks: number
  ) => Promise<BridgeResult>;
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

export function useBridge(): UseBridgeReturn {
  const { isConnected, address, grpcEndpoint, signRawTx } = useWallet();
  const [status, setStatus] = useState<BridgeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BridgeResult | null>(null);

  // Keep a ref to the grpc client to avoid recreating
  const grpcClientRef = useRef<unknown>(null);

  const isBridgeConfigured = ZORP_BRIDGE_ADDRESS !== null;

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
  }, []);

  const bridgeToBase = useCallback(
    async (
      destinationAddress: string,
      amountInNocks: number
    ): Promise<BridgeResult> => {
      // Pre-flight checks
      if (!isConnected || !address) {
        throw new Error("Wallet not connected");
      }

      if (!grpcEndpoint) {
        throw new Error("gRPC endpoint not available");
      }

      if (!isBridgeConfigured || !ZORP_BRIDGE_ADDRESS) {
        throw new Error(
          "Bridge not configured: Zorp bridge address not available"
        );
      }

      setStatus("pending");
      setError(null);
      setResult(null);

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
        // Simple notes use PKH-only spend condition
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
        const userSpendConditions: InstanceType<typeof wasm.SpendCondition>[] =
          [];

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

        // Estimate fee (will be recalculated during build)

        const estimatedFee = DEFAULT_FEE_PER_WORD * 100n; // Conservative estimate

        if (totalAvailable < amountInNicks + estimatedFee) {
          throw new Error(
            `Insufficient balance. Available: ${totalAvailable} nicks, ` +
              `Required: ${amountInNicks} + ~${estimatedFee} fee`
          );
        }

        // Build bridge noun and jam it
        const bridgeNounJs = buildBridgeNoun(destinationAddress);

        // Sort notes by assets (largest first) to minimize number of inputs and fees
        const noteIndices = userNotes.map((_, i) => i);
        noteIndices.sort((a, b) =>
          Number(BigInt(userNotes[b].assets) - BigInt(userNotes[a].assets))
        );

        // Select only enough notes to cover the amount + estimated fee
        const selectedNotes: typeof userNotes = [];
        const selectedConditions: typeof userSpendConditions = [];
        let selectedTotal = 0n;
        const targetAmount = amountInNicks + estimatedFee;

        for (const i of noteIndices) {
          if (selectedTotal >= targetAmount) break;
          selectedNotes.push(userNotes[i]);
          selectedConditions.push(userSpendConditions[i]);
          selectedTotal += BigInt(userNotes[i].assets);
        }

        if (selectedTotal < targetAmount) {
          throw new Error(
            `Insufficient balance after note selection. Selected: ${selectedTotal} nicks, needed: ${targetAmount} nicks`
          );
        }

        // Build transaction using TxBuilder
        const builder = new wasm.TxBuilder(DEFAULT_FEE_PER_WORD);

        // Create a single spend using the first selected note, with bridge output
        // Additional notes will be added as separate spends but without bridge seeds
        for (let i = 0; i < selectedNotes.length; i++) {
          const note = selectedNotes[i];
          const spendCondition = selectedConditions[i];
          const isFirstNote = i === 0;

          // Get parent hash BEFORE passing note to SpendBuilder
          const parentHash = note.hash();

          // Clone the note for SpendBuilder
          const noteClone = wasm.Note.fromProtobuf(note.toProtobuf());

          // Clone the spend condition for SpendBuilder
          const spendConditionClone = wasm.SpendCondition.fromProtobuf(
            spendCondition.toProtobuf()
          );

          // Create refund spend condition (back to user)
          const refundSpendCondition = wasm.SpendCondition.newPkh(
            wasm.Pkh.single(address)
          );

          const spendBuilder = new wasm.SpendBuilder(
            noteClone,
            spendConditionClone,
            refundSpendCondition
          );

          // Only add bridge seed to the FIRST spend
          if (isFirstNote) {
            // Create fresh noteData and lockRoot (WASM objects are consumed on use)
            const bridgeNoun = wasm.Noun.fromJs(bridgeNounJs);
            const jammedBridgeData = bridgeNoun.jam();
            const bridgeEntry = new wasm.NoteDataEntry(
              BRIDGE_NOTE_KEY,
              jammedBridgeData
            );
            const noteData = new wasm.NoteData([bridgeEntry]);

            // Derive lock root from PKH spend condition
            const bridgePkh = wasm.Pkh.single(ZORP_BRIDGE_ADDRESS);
            const bridgeSpendCondition = wasm.SpendCondition.newPkh(bridgePkh);
            const zorpLockRoot =
              wasm.LockRoot.fromSpendCondition(bridgeSpendCondition);

            // Create seed (output) to bridge
            const seed = new wasm.Seed(
              null, // output_source (null for non-coinbase)
              zorpLockRoot,
              amountInNicks,
              noteData,
              parentHash
            );

            spendBuilder.seed(seed);
          }

          spendBuilder.computeRefund(false);
          builder.spend(spendBuilder);
        }

        // Calculate and set fee
        builder.recalcAndSetFee(false);
        const fee = builder.calcFee();

        // Build the transaction and convert to RawTx for signing
        const nockchainTx = builder.build();
        const rawTx = nockchainTx.toRawTx();

        // Get notes and spend conditions for signing
        const txNotes = builder.allNotes();

        setStatus("awaiting_signature");

        // Sign via wallet
        const signedTxBytes = await signRawTx({
          rawTx: rawTx.toProtobuf(),
          notes: txNotes.notes.map((n: { toProtobuf: () => unknown }) =>
            n.toProtobuf()
          ),
          spendConditions: txNotes.spendConditions.map(
            (sc: { toProtobuf: () => unknown }) => sc.toProtobuf()
          ),
        });

        setStatus("pending");

        // Submit to network
        await grpcClient.sendTransaction(signedTxBytes);

        // Get transaction ID from built transaction

        const txId = nockchainTx.id?.value || "unknown";

        const bridgeResult: BridgeResult = {
          txId,
          fee,
          destinationAddress,
          amountInNicks,
        };

        setResult(bridgeResult);
        setStatus("success");
        return bridgeResult;
      } catch (err) {
        // Extract error message
        const message =
          err instanceof Error ? err.message : String(err) || "Bridge transaction failed";

        // Check if user cancelled/rejected the transaction
        const isCancellation =
          message.toLowerCase().includes("reject") ||
          message.toLowerCase().includes("cancel") ||
          message.toLowerCase().includes("denied");

        if (isCancellation) {
          // Reset to idle state for user-initiated cancellations (don't throw)
          setStatus("idle");
          setError(null);
          return undefined as unknown as BridgeResult;
        }

        // Actual error - set error state and throw
        console.error("Bridge error:", message);
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
      signRawTx,
    ]
  );

  // Debug function to fetch and inspect bridge note metadata
  const inspectBridgeNotes = useCallback(async (): Promise<{
    notes: Array<{
      assets: bigint;
      noteData: Array<{ key: string; blob: Uint8Array; decoded?: unknown }>;
    }>;
  } | null> => {
    if (!grpcEndpoint || !ZORP_BRIDGE_ADDRESS) {
      console.error("[Debug] Missing grpcEndpoint or bridge address");
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

      // Derive first-name for bridge address
      const bridgePkh = wasm.Pkh.single(ZORP_BRIDGE_ADDRESS);
      const bridgeSpendCondition = wasm.SpendCondition.newPkh(bridgePkh);
      const bridgeFirstName = bridgeSpendCondition.firstName();

      console.log(
        "[Debug] Fetching notes for bridge address:",
        ZORP_BRIDGE_ADDRESS
      );
      console.log(
        "[Debug] Bridge first-name:",
        bridgeFirstName.value.substring(0, 20) + "..."
      );

      // Fetch notes
      const balance = await grpcClient.getBalanceByFirstName(
        bridgeFirstName.value
      );

      if (!balance?.notes || balance.notes.length === 0) {
        console.log("[Debug] No notes found at bridge address");
        return { notes: [] };
      }

      console.log(
        "[Debug] Found",
        balance.notes.length,
        "notes at bridge address"
      );

      const notesWithData = [];

      for (const noteEntry of balance.notes) {
        const pbNote = noteEntry.note || noteEntry;

        // Log the raw structure to see what fields are available
        console.log("[Debug] Raw noteEntry keys:", Object.keys(noteEntry));
        console.log("[Debug] Raw pbNote keys:", Object.keys(pbNote));
        console.log(
          "[Debug] Raw pbNote:",
          JSON.stringify(
            pbNote,
            (_, v) =>
              typeof v === "bigint"
                ? v.toString()
                : v instanceof Uint8Array
                ? `Uint8Array(${v.length})`
                : v,
            2
          )
        );

        const note = wasm.Note.fromProtobuf(pbNote);

        // Extract note_data from protobuf
        const noteDataEntries: Array<{
          key: string;
          blob: Uint8Array;
          decoded?: unknown;
        }> = [];

        // Extract note_data from V1 note structure
        const rawNoteData = pbNote.note_version?.V1?.note_data;
        console.log("[Debug] rawNoteData:", rawNoteData);
        if (rawNoteData?.entries) {
          for (const entry of rawNoteData.entries) {
            const entryData: {
              key: string;
              blob: Uint8Array;
              decoded?: unknown;
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
                console.log("[Debug] Decoded %bridge data:", decoded);

                // Try to reconstruct the EVM address from the belts
                if (
                  Array.isArray(decoded) &&
                  decoded.length === 2 &&
                  Array.isArray(decoded[1])
                ) {
                  try {
                    const { beltsToEvmAddress } = await import("@/lib/bridge");
                    // Parse belt values from hex strings
                    const belt1Hex = decoded[1][0];
                    const belt2Hex = decoded[1][1]?.[0];
                    const belt3Hex = decoded[1][1]?.[1];

                    if (belt1Hex && belt2Hex && belt3Hex) {
                      const belt1 = BigInt("0x" + belt1Hex);
                      const belt2 = BigInt("0x" + belt2Hex);
                      const belt3 = BigInt("0x" + belt3Hex);

                      console.log("[Debug] Belt values (bigint):");
                      console.log("[Debug]   belt1:", belt1.toString());
                      console.log("[Debug]   belt2:", belt2.toString());
                      console.log("[Debug]   belt3:", belt3.toString());

                      const reconstructedAddress = beltsToEvmAddress(
                        belt1,
                        belt2,
                        belt3
                      );
                      console.log(
                        "[Debug] Reconstructed EVM address:",
                        reconstructedAddress
                      );
                    }
                  } catch (e) {
                    console.log("[Debug] Could not reconstruct address:", e);
                  }
                }
              } catch (e) {
                console.log("[Debug] Could not decode blob:", e);
              }
            }

            noteDataEntries.push(entryData);
          }
        }

        notesWithData.push({
          assets: note.assets,
          noteData: noteDataEntries,
        });

        console.log(
          "[Debug] Note assets:",
          note.assets,
          "entries:",
          noteDataEntries.length
        );
        for (const entry of noteDataEntries) {
          console.log(
            "[Debug]   Key:",
            entry.key,
            "Blob length:",
            entry.blob?.length
          );
          if (entry.decoded) {
            console.log(
              "[Debug]   Decoded:",
              JSON.stringify(entry.decoded, null, 2)
            );
          }
        }
      }

      return { notes: notesWithData };
    } catch (err) {
      console.error("[Debug] Error inspecting bridge notes:", err);
      return null;
    }
  }, [grpcEndpoint]);

  return {
    status,
    error,
    result,
    bridgeToBase,
    reset,
    isBridgeConfigured,
    validateDestination,
    previewBridge,
    inspectBridgeNotes,
  };
}
