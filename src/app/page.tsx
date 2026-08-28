"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageLayout from "@/components/layout/PageLayout";
import SwapCard from "@/components/swap/SwapCard";
import ResultCard from "@/components/swap/ResultCard";
import {
  ASSETS,
  bridgeFeeNicksCeil,
  bridgeFeeNicksFloor,
  PROTOCOL_FEE_DISPLAY,
} from "@/lib/constants";
import { BridgeResult, TransactionPreview, useBridge } from "@/hooks/useBridge";
import { useNockBurn } from "@/hooks/useNockBurn";
import {
  mergeWithdrawalHistory,
  useWithdrawalStatus,
} from "@/hooks/useWithdrawalStatus";
import { useNockBurnGasEstimate } from "@/hooks/useNockBurnGasEstimate";
import { useBaseToNockContractReadiness } from "@/hooks/useBaseToNockContractReadiness";
import { useBaseToNockNockchainFeeEstimate } from "@/hooks/useBaseToNockNockchainFeeEstimate";
import {
  formatNockDecimal,
  formatNicksAsNock,
  type ExactNockAmount,
} from "@/lib/nockAmount";
import { truncateAddress } from "@/lib/utils";
import { isEvmWalletUserRejection } from "@/lib/evmWalletErrors";
import { transactionExplorerUrl } from "@/lib/blockExplorer";
import {
  getBridgeNetworkConfig,
  getPreferredBridgeNetworkConfig,
} from "@/lib/bridgeNetworkConfig";
import {
  assertWithdrawalStorageAvailable,
  loadWithdrawalRecords,
  persistWithdrawalRecord,
  transitionWithdrawalRecord,
  type PersistedWithdrawalV1,
  type WithdrawalLifecycleStatus,
} from "@/lib/withdrawalStore";
import { useAccount, useChainId } from "wagmi";

type ResultState =
  | { type: "idle" }
  | { type: "confirming"; preview: TransactionPreview }
  | {
      type: "confirming_burn";
      amount: ExactNockAmount;
      destinationNockAddress: string;
    }
  | { type: "success"; result: BridgeResult }
  | { type: "error"; message: string }
  | {
      type: "base_to_nock_lifecycle";
      record: PersistedWithdrawalV1;
      transientError: string | null;
    }
  | {
      type: "base_to_nock_failed";
      message: string;
      amount: ExactNockAmount;
      destinationNockAddress: string;
      burnNetworkFeeDisplay: string;
      nockchainNetworkFeeDisplay: string;
      quotedNetPayoutNicks: bigint | null;
    }
  | { type: "storage_support"; message: string };

function resultCardStatus(
  status: WithdrawalLifecycleStatus
): "awaiting_base" | "pending" | "delayed" | "support" | "failed" | "confirmed" {
  switch (status) {
    case "awaiting_wallet":
    case "awaiting_base":
      return "awaiting_base";
    case "withdrawal_pending":
      return "pending";
    case "confirmed":
      return "confirmed";
    case "delayed":
      return "delayed";
    case "failed":
      return "failed";
    case "support":
      return "support";
  }
}

export default function Home() {
  const [resultState, setResultState] = useState<ResultState>({ type: "idle" });
  const chainId = useChainId();
  const { address: baseAccount } = useAccount();
  const { confirmTransaction, cancelTransaction, prepareTransaction, status: bridgeStatus } = useBridge();
  const { burnNock, isBurning: isBurnPending } = useNockBurn();
  const expectedBurnNetwork = useMemo(
    () => getBridgeNetworkConfig(chainId) ?? getPreferredBridgeNetworkConfig(),
    [chainId]
  );
  const expectedBurnChainId = expectedBurnNetwork?.chainId;
  const burnGasAmountNock =
    resultState.type === "confirming_burn" ? resultState.amount : null;
  const burnDestinationNockAddress =
    resultState.type === "confirming_burn"
      ? resultState.destinationNockAddress
      : null;
  const { networkFeeDisplay: burnNetworkFeeDisplay } =
    useNockBurnGasEstimate(
      burnGasAmountNock,
      burnDestinationNockAddress,
      expectedBurnChainId
    );
  const burnContractReadiness =
    useBaseToNockContractReadiness(expectedBurnChainId);
  const {
    display: nockchainNetworkFeeDisplay,
    feeNicks: nockchainFeeNicksEstimate,
    bridgeFeeNicks: withdrawalBridgeFeeNicks,
    netPayoutNicks: quotedNetPayoutNicks,
    quote: withdrawalQuote,
    loading: nockchainNetworkFeeLoading,
  } = useBaseToNockNockchainFeeEstimate(
    resultState.type === "confirming_burn" ? resultState.amount : null,
    resultState.type === "confirming_burn"
      ? resultState.destinationNockAddress
      : null,
    expectedBurnChainId
  );
  const [withdrawalRecords, setWithdrawalRecords] = useState<
    PersistedWithdrawalV1[]
  >([]);
  const [displayedWithdrawalId, setDisplayedWithdrawalId] = useState<
    string | null
  >(null);
  const burnSubmissionInFlight = useRef(false);
  const persistUpdate = useCallback((record: PersistedWithdrawalV1): boolean => {
    try {
      persistWithdrawalRecord(window.localStorage, record);
      setWithdrawalRecords((records) =>
        [record, ...records.filter((candidate) => candidate.recordId !== record.recordId)].sort(
          (left, right) => right.updatedAt - left.updatedAt
        )
      );
      return true;
    } catch (error) {
      setResultState({
        type: "storage_support",
        message:
          error instanceof Error
            ? error.message
            : "Withdrawal history could not be persisted.",
      });
      return false;
    }
  }, []);
  const polling = useWithdrawalStatus(
    withdrawalRecords,
    baseAccount,
    expectedBurnNetwork,
    persistUpdate
  );
  const withdrawalHistoryRows = useMemo(
    () => mergeWithdrawalHistory(withdrawalRecords, polling.publicHistory),
    [polling.publicHistory, withdrawalRecords]
  );

  useEffect(() => {
    if (!displayedWithdrawalId) return;
    const polledRecord = polling.records.find(
      (record) => record.recordId === displayedWithdrawalId
    );
    if (!polledRecord) return;
    setResultState((current) => {
      if (
        current.type === "base_to_nock_lifecycle" &&
        current.record === polledRecord &&
        current.transientError === polling.transientError
      ) {
        return current;
      }
      return {
        type: "base_to_nock_lifecycle",
        record: polledRecord,
        transientError: polling.transientError,
      };
    });
  }, [displayedWithdrawalId, polling.records, polling.transientError]);

  useEffect(() => {
    if (!baseAccount || !expectedBurnNetwork) {
      setWithdrawalRecords([]);
      setDisplayedWithdrawalId(null);
      setResultState({ type: "idle" });
      return;
    }
    const loaded = loadWithdrawalRecords(
      window.localStorage,
      baseAccount,
      expectedBurnNetwork.chainId,
      expectedBurnNetwork.nockTokenAddress
    );
    if (loaded.issue) {
      setResultState({ type: "storage_support", message: loaded.issue });
      return;
    }
    setWithdrawalRecords(loaded.records);
    const selected =
      loaded.records.find(
        (record) => record.status !== "confirmed" && record.status !== "failed"
      ) ?? loaded.records[0];
    setDisplayedWithdrawalId(selected?.recordId ?? null);
    if (selected) {
      setResultState({
        type: "base_to_nock_lifecycle",
        record: selected,
        transientError: null,
      });
    } else {
      setResultState({ type: "idle" });
    }
  }, [baseAccount, expectedBurnNetwork]);

  const handlePrepareSuccess = (preview: TransactionPreview) => {
    setResultState({ type: "confirming", preview });
  };

  const handleSwapError = (message: string) => {
    setResultState({ type: "error", message });
  };

  const handlePrepareBurnSuccess = (payload: {
    amount: ExactNockAmount;
    destinationNockAddress: string;
  }) => {
    setResultState({ type: "confirming_burn", ...payload });
  };

  const handleHomeClick = () => {
    setDisplayedWithdrawalId(null);
    setResultState({ type: "idle" });
  };

  const handleConfirm = async () => {
    try {
      const result = await confirmTransaction();
      // confirmTransaction returns undefined (without throwing) if user cancels wallet signature
      if (result) {
        setResultState({ type: "success", result });
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Bridge transaction failed";
      setResultState({ type: "error", message: errorMessage });
    }
  };

  const handleCancel = () => {
    cancelTransaction();
    setResultState({ type: "idle" });
  };

  const handleConfirmBurn = async () => {
    if (
      resultState.type !== "confirming_burn" ||
      burnSubmissionInFlight.current
    ) {
      return;
    }
    burnSubmissionInFlight.current = true;
    const { amount, destinationNockAddress } = resultState;
    const sharedBurnResultData = {
      amount,
      destinationNockAddress,
      burnNetworkFeeDisplay,
      nockchainNetworkFeeDisplay,
      quotedNetPayoutNicks,
    };
    let provisionalRecord: PersistedWithdrawalV1 | undefined;
    try {
      if (!burnContractReadiness.ready) {
        throw new Error(
          burnContractReadiness.reason ?? "Base-to-Nock contracts are not ready."
        );
      }
      if (!baseAccount || !expectedBurnNetwork) {
        throw new Error("Connected Base account or bridge deployment is unavailable.");
      }
      assertWithdrawalStorageAvailable(window.localStorage);
      const quoteAgeMs = Date.now() - (withdrawalQuote?.observedAt ?? 0);
      if (
        nockchainNetworkFeeLoading ||
        withdrawalQuote?.available !== true ||
        withdrawalQuote.grossAmountNicks !== amount.nicks.toString() ||
        withdrawalBridgeFeeNicks === null ||
        nockchainFeeNicksEstimate === null ||
        quotedNetPayoutNicks === null ||
        quotedNetPayoutNicks <= 0n ||
        quoteAgeMs < -5_000 ||
        quoteAgeMs > 60_000
      ) {
        throw new Error(
          withdrawalQuote?.reason ??
            "A fresh positive authoritative withdrawal quote is required before burning."
        );
      }
      const createdAt = Date.now();
      const estimatedPayout = quotedNetPayoutNicks;
      const submission = await burnNock(
        amount,
        destinationNockAddress,
        expectedBurnChainId,
        (prepared) => {
          provisionalRecord = {
            schemaVersion: 1,
            recordId: prepared.submittedTransactionHash,
            account: baseAccount,
            chainId: expectedBurnNetwork.chainId,
            nockTokenAddress: expectedBurnNetwork.nockTokenAddress,
            messageInboxAddress: expectedBurnNetwork.messageInboxAddress,
            submittedTransactionHash: prepared.submittedTransactionHash,
            transactionHash: prepared.submittedTransactionHash,
            blockNumber: null,
            blockHash: null,
            logIndex: null,
            baseEventId: null,
            destination: prepared.normalizedDestination,
            lockRoot: prepared.lockRoot,
            commitment: prepared.commitment,
            calldata: prepared.calldata,
            amountBaseUnits: prepared.amountBaseUnits,
            amountNicks: prepared.amountNicks,
            estimatedPayoutNicks:
              estimatedPayout > 0n ? estimatedPayout.toString() : null,
            actualPayoutNicks: null,
            nockTransactionId: null,
            nockBlockId: null,
            authoritativeRevision: "0",
            recoveryGeneration: 0,
            publicResolution: null,
            priorAuthoritativeStatus: null,
            invalidatedBlockNumber: null,
            invalidatedBlockHash: null,
            recoveryReason: null,
            status: "awaiting_base",
            createdAt,
            updatedAt: createdAt,
            confirmedAt: null,
            retryAuthorizedAt: null,
            history: [
              {
                status: "awaiting_wallet",
                observedAt: createdAt,
                detail: "Wallet accepted one canonical 116-byte burn.",
              },
              {
                status: "awaiting_base",
                observedAt: createdAt,
                detail:
                  "Base transaction submitted. Do not retry while receipt is unknown.",
              },
            ],
          };
          if (persistUpdate(provisionalRecord)) {
            setDisplayedWithdrawalId(provisionalRecord.recordId);
            setResultState({
              type: "base_to_nock_lifecycle",
              record: provisionalRecord,
              transientError: null,
            });
          }
        },
        (replacementHash) => {
          if (!provisionalRecord) {
            throw new Error("Replacement arrived before submission was persisted.");
          }
          const replaced = transitionWithdrawalRecord(
            provisionalRecord,
            "awaiting_base",
            Date.now(),
            `Base transaction replaced by ${replacementHash}.`,
            { transactionHash: replacementHash }
          );
          provisionalRecord = replaced;
          if (!persistUpdate(replaced)) {
            throw new Error("Replacement transaction identity could not be persisted.");
          }
        }
      );
      if (!provisionalRecord) {
        throw new Error("Base submission callback did not persist the transaction.");
      }
      const record = transitionWithdrawalRecord(
        provisionalRecord,
        "withdrawal_pending",
        Date.now(),
        `Verified Base receipt and log ${submission.logIndex}.`,
        {
          transactionHash: submission.transactionHash,
          blockNumber: submission.blockNumber,
          blockHash: submission.blockHash,
          logIndex: submission.logIndex,
          baseEventId: submission.baseEventId,
        }
      );
      if (!persistUpdate(record)) return;
      setDisplayedWithdrawalId(record.recordId);
      setResultState({
        type: "base_to_nock_lifecycle",
        record,
        transientError: null,
      });
    } catch (err) {
      if (provisionalRecord) {
        const support = transitionWithdrawalRecord(
          provisionalRecord,
          "support",
          Date.now(),
          err instanceof Error
            ? `Base receipt requires support: ${err.message}`
            : "Base receipt outcome is unknown; do not retry."
        );
        if (!persistUpdate(support)) return;
        setDisplayedWithdrawalId(support.recordId);
        setResultState({
          type: "base_to_nock_lifecycle",
          record: support,
          transientError: support.history.at(-1)?.detail ?? null,
        });
        return;
      }
      if (isEvmWalletUserRejection(err)) {
        setResultState({
          type: "base_to_nock_failed",
          message: "Transaction cancelled",
          ...sharedBurnResultData,
        });
        return;
      }
      const errorMessage =
        err instanceof Error ? err.message : "Burn transaction failed";
      setResultState({
        type: "base_to_nock_failed",
        message: errorMessage,
        ...sharedBurnResultData,
      });
    } finally {
      burnSubmissionInFlight.current = false;
    }
  };

  const calculateAmountAfterBridgeFee = (amountInNicks: bigint): string => {
    const bridgeFeeNicks = bridgeFeeNicksFloor(amountInNicks);
    return formatNicksAsNock(amountInNicks - bridgeFeeNicks);
  };


  return (
    <PageLayout>
      {({ isDarkMode, theme }) => {
        return (
        <>
          {/* Title section */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 5,
              width: "100%",
              maxWidth: 560,
              textAlign: "center",
              padding: "0 16px",
              boxSizing: "border-box",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                isDarkMode ? ASSETS.nockswapHeaderDark : ASSETS.nockswapHeader
              }
              alt="Nock Swap"
              style={{
                width: "100%",
                maxWidth: 320,
                height: "auto",
              }}
            />
            <p
              style={{
                fontSize: 18,
                color: theme.textPrimary,
                lineHeight: "26px",
                margin: 0,
              }}
            >
              Your Nockchain to Bridge
            </p>
          </div>

          {/* Swap card or Result card */}
          <div
            style={{
              marginTop: 31,
              width: "100%",
              maxWidth: 480,
              padding: "0 16px",
              boxSizing: "border-box",
            }}
          >
            {resultState.type === "idle" ? (
              <SwapCard
                isDarkMode={isDarkMode}
                onSwapError={handleSwapError}
                onPrepareSuccess={handlePrepareSuccess}
                onPrepareBurnSuccess={handlePrepareBurnSuccess}
                prepareTransaction={prepareTransaction}
                bridgeStatus={bridgeStatus}
              />
            ) : resultState.type === "base_to_nock_lifecycle" ? (
              <ResultCard
                isDarkMode={isDarkMode}
                status={resultCardStatus(resultState.record.status)}
                flowDirection="base_to_nock"
                errorMessage={
                  resultState.record.status === "support" ||
                  resultState.record.status === "failed"
                    ? resultState.record.history.at(-1)?.detail
                    : undefined
                }
                lifecycleDetail={
                  resultState.transientError ??
                  (resultState.record.status === "support" ||
                  resultState.record.status === "failed"
                    ? undefined
                    : resultState.record.history.at(-1)?.detail)
                }
                lifecycleHistory={resultState.record.history}
                networkFeePercent={PROTOCOL_FEE_DISPLAY}
                networkFeeAmount="Verified in Base receipt"
                nockchainNetworkFeeAmount="Estimated until settlement"
                confirmingBridgeFeeNicks={bridgeFeeNicksCeil(
                  BigInt(resultState.record.amountNicks)
                )}
                totalNock={`${
                  resultState.record.actualPayoutNicks
                    ? formatNicksAsNock(
                        BigInt(resultState.record.actualPayoutNicks)
                      )
                    : resultState.record.estimatedPayoutNicks
                    ? `~${formatNicksAsNock(
                        BigInt(resultState.record.estimatedPayoutNicks)
                      )}`
                    : "Unknown"
                } NOCK`}
                totalUsd=""
                receivingAddress={truncateAddress(resultState.record.destination)}
                fullReceivingAddress={resultState.record.destination}
                transactionId={truncateAddress(
                  resultState.record.transactionHash,
                  5
                )}
                fullTransactionId={resultState.record.transactionHash}
                transactionUrl={
                  transactionExplorerUrl(
                    resultState.record.chainId,
                    resultState.record.transactionHash
                  ) ?? undefined
                }
                browserEvidence={{
                  calldata: resultState.record.calldata,
                  submittedTransactionHash:
                    resultState.record.submittedTransactionHash,
                  transactionHash: resultState.record.transactionHash,
                  blockNumber: resultState.record.blockNumber,
                  blockHash: resultState.record.blockHash,
                  logIndex: resultState.record.logIndex,
                  baseEventId: resultState.record.baseEventId,
                }}
                nockTransactionId={
                  resultState.record.nockTransactionId ?? undefined
                }
                nockBlockId={resultState.record.nockBlockId ?? undefined}
                onHomeClick={
                  resultState.record.status === "confirmed" ||
                  resultState.record.status === "failed"
                    ? handleHomeClick
                    : undefined
                }
              />
            ) : resultState.type === "base_to_nock_failed" ? (
              <ResultCard
                isDarkMode={isDarkMode}
                status="failed"
                flowDirection="base_to_nock"
                errorMessage={resultState.message}
                networkFeePercent={PROTOCOL_FEE_DISPLAY}
                networkFeeAmount={resultState.burnNetworkFeeDisplay}
                nockchainNetworkFeeAmount={
                  resultState.nockchainNetworkFeeDisplay !== "—"
                    ? resultState.nockchainNetworkFeeDisplay
                    : undefined
                }
                totalNock={
                  resultState.quotedNetPayoutNicks === null
                    ? "Authoritative quote unavailable"
                    : `${formatNicksAsNock(resultState.quotedNetPayoutNicks)} NOCK`
                }
                totalUsd=""
                receivingAddress={truncateAddress(
                  resultState.destinationNockAddress
                )}
                fullReceivingAddress={resultState.destinationNockAddress}
                transactionId=""
                fullTransactionId=""
                onHomeClick={handleHomeClick}
              />
            ) : resultState.type === "storage_support" ? (
              <ResultCard
                isDarkMode={isDarkMode}
                status="support"
                flowDirection="base_to_nock"
                errorMessage={resultState.message}
                lifecycleDetail="Preserve browser storage and contact support before retrying."
                onHomeClick={undefined}
              />
            ) : resultState.type === "confirming" ? (
              <ResultCard
                isDarkMode={isDarkMode}
                status="confirming"
                networkFeePercent={PROTOCOL_FEE_DISPLAY}
                networkFeeAmount={`${formatNicksAsNock(resultState.preview.fee)} NOCK`}
                totalNock={`${formatNicksAsNock(resultState.preview.amountInNicks)} NOCK`}
                totalUsd=""
                receivingAddress={truncateAddress(resultState.preview.destinationAddress)}
                fullReceivingAddress={resultState.preview.destinationAddress}
                transactionId=""
                fullTransactionId=""
                onHomeClick={handleCancel}
                onConfirm={handleConfirm}
                preview={resultState.preview}
                bridgeStatus={bridgeStatus}
              />
            ) : resultState.type === "confirming_burn" ? (
              <ResultCard
                isDarkMode={isDarkMode}
                status="confirming"
                flowDirection="base_to_nock"
                networkFeePercent={PROTOCOL_FEE_DISPLAY}
                networkFeeAmount={burnNetworkFeeDisplay}
                totalNock={`${formatNockDecimal(resultState.amount.canonical)} NOCK`}
                totalUsd=""
                receivingAddress={truncateAddress(
                  resultState.destinationNockAddress
                )}
                fullReceivingAddress={resultState.destinationNockAddress}
                transactionId=""
                fullTransactionId=""
                onHomeClick={handleCancel}
                onConfirm={handleConfirmBurn}
                bridgeStatus={bridgeStatus}
                nockchainNetworkFeeAmount={nockchainNetworkFeeDisplay}
                nockchainNetworkFeeLoading={nockchainNetworkFeeLoading}
                confirmingBridgeFeeNicks={withdrawalBridgeFeeNicks}
                confirmingNetPayoutNicks={quotedNetPayoutNicks}
                confirmSubmitting={isBurnPending}
                confirmDisabledReason={
                  burnContractReadiness.loading
                    ? "Checking Base bridge contracts..."
                    : burnContractReadiness.reason ??
                      (nockchainNetworkFeeLoading
                        ? "Loading an authoritative withdrawal quote..."
                        : withdrawalQuote?.available !== true
                          ? withdrawalQuote?.reason ??
                            "An authoritative withdrawal quote is required."
                          : Date.now() - withdrawalQuote.observedAt > 60_000
                            ? "The withdrawal quote is stale. Wait for a fresh quote."
                            : null)
                }
              />
            ) : (
              <ResultCard
                isDarkMode={isDarkMode}
                status={resultState.type === "success" ? "success" : "failed"}
                errorMessage={
                  resultState.type === "error" ? resultState.message : undefined
                }
                networkFeePercent={PROTOCOL_FEE_DISPLAY}
                networkFeeAmount={
                  resultState.type === "success"
                    ? `${formatNicksAsNock(resultState.result.fee)} NOCK`
                    : "0 NOCK"
                }
                totalNock={
                  resultState.type === "success"
                    ? `${calculateAmountAfterBridgeFee(resultState.result.amountInNicks)} NOCK`
                    : "0 NOCK"
                }
                totalUsd=""
                receivingAddress={
                  resultState.type === "success"
                    ? truncateAddress(resultState.result.destinationAddress)
                    : ""
                }
                fullReceivingAddress={
                  resultState.type === "success"
                    ? resultState.result.destinationAddress
                    : ""
                }
                transactionId={
                  resultState.type === "success"
                    ? truncateAddress(resultState.result.txId, 5)
                    : ""
                }
                fullTransactionId={
                  resultState.type === "success"
                    ? resultState.result.txId
                    : ""
                }
                onHomeClick={handleHomeClick}
                result={resultState.type === "success" ? resultState.result : undefined}
              />
            )}
            {withdrawalHistoryRows.length > 0 && (
              <section
                aria-labelledby="withdrawal-history-heading"
                style={{
                  marginTop: 16,
                  padding: 20,
                  border: `1px solid ${theme.cardBorder}`,
                  borderRadius: 16,
                  background: theme.cardBg,
                  color: theme.textPrimary,
                }}
              >
                <h2
                  id="withdrawal-history-heading"
                  style={{ margin: 0, fontSize: 16, fontWeight: 650 }}
                >
                  Withdrawal history
                </h2>
                <ul
                  style={{
                    listStyle: "none",
                    margin: "14px 0 0",
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  {withdrawalHistoryRows.map((row) => (
                    <li
                      key={row.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        paddingTop: 12,
                        borderTop: `1px solid ${theme.dividerColor}`,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            textTransform: "capitalize",
                          }}
                        >
                          {row.status.replaceAll("_", " ")}
                        </div>
                        <div
                          style={{
                            marginTop: 3,
                            fontSize: 12,
                            opacity: 0.72,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={row.identity}
                        >
                          {truncateAddress(row.identity, 7)} · revision {row.revision}
                        </div>
                      </div>
                      {row.localRecord && (
                        <button
                          type="button"
                          onClick={() => {
                            const record = row.localRecord;
                            if (!record) return;
                            setDisplayedWithdrawalId(record.recordId);
                            setResultState({
                              type: "base_to_nock_lifecycle",
                              record,
                              transientError: polling.transientError,
                            });
                          }}
                          style={{
                            flexShrink: 0,
                            border: `1px solid ${theme.headerButtonBorder}`,
                            borderRadius: 10,
                            background: theme.headerButtonBg,
                            color: theme.textPrimary,
                            padding: "8px 11px",
                            font: "inherit",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          View withdrawal
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </>
        );
      }}
    </PageLayout>
  );
}
