"use client";

import { useState } from "react";
import PageLayout from "@/components/layout/PageLayout";
import SwapCard from "@/components/swap/SwapCard";
import ResultCard from "@/components/swap/ResultCard";
import { ASSETS, PROTOCOL_FEE_DISPLAY, PROTOCOL_FEE_NICKS_PER_NOCK } from "@/lib/constants";
import { BridgeResult, TransactionPreview, useBridge } from "@/hooks/useBridge";
import { useNockBurn } from "@/hooks/useNockBurn";
import { useNockBurnGasEstimate } from "@/hooks/useNockBurnGasEstimate";
import { NOCK_TO_NICKS } from "@/hooks/useWallet";
import { truncateAddress, formatNOCK } from "@/lib/utils";
import { getSwapCardTheme } from "@/lib/theme";
import { isEvmWalletUserRejection } from "@/lib/evmWalletErrors";
import { transactionExplorerUrl } from "@/lib/blockExplorer";
import { useChainId } from "wagmi";

type ResultState =
  | { type: "idle" }
  | { type: "confirming"; preview: TransactionPreview }
  | {
      type: "confirming_burn";
      amountNock: number;
      destinationNockAddress: string;
    }
  | { type: "success"; result: BridgeResult }
  | { type: "error"; message: string }
  | { type: "burn_submitted"; txHash: string }
  | { type: "burn_cancelled" };

export default function Home() {
  const [resultState, setResultState] = useState<ResultState>({ type: "idle" });
  const chainId = useChainId();
  const { confirmTransaction, cancelTransaction, prepareTransaction, status: bridgeStatus } = useBridge();
  const { burnNock, isBurning: isBurnPending } = useNockBurn();
  const burnGasAmountNock =
    resultState.type === "confirming_burn" ? resultState.amountNock : null;
  const { networkFeeDisplay: burnNetworkFeeDisplay } =
    useNockBurnGasEstimate(burnGasAmountNock);

  const handlePrepareSuccess = (preview: TransactionPreview) => {
    setResultState({ type: "confirming", preview });
  };

  const handleSwapError = (message: string) => {
    setResultState({ type: "error", message });
  };

  const handlePrepareBurnSuccess = (payload: {
    amountNock: number;
    destinationNockAddress: string;
  }) => {
    setResultState({ type: "confirming_burn", ...payload });
  };

  const handleHomeClick = () => {
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
    if (resultState.type !== "confirming_burn") return;
    try {
      const txHash = await burnNock(resultState.amountNock);
      setResultState({ type: "burn_submitted", txHash });
    } catch (err) {
      if (isEvmWalletUserRejection(err)) {
        setResultState({ type: "burn_cancelled" });
        return;
      }
      const errorMessage =
        err instanceof Error ? err.message : "Burn transaction failed";
      setResultState({ type: "error", message: errorMessage });
    }
  };

  // Convert nicks to NOCK
  const nicksToNock = (nicks: bigint) => Number(nicks) / NOCK_TO_NICKS;

  // Calculate amount after bridge fee deduction (~0.3%)
  // Formula: roundDown(amountInNicks / 65536) * PROTOCOL_FEE_NICKS_PER_NOCK
  const calculateAmountAfterBridgeFee = (amountInNicks: bigint): number => {
    const bridgeFeeNicks = (amountInNicks / 65536n) * PROTOCOL_FEE_NICKS_PER_NOCK;
    const amountAfterFee = amountInNicks - bridgeFeeNicks;
    return Number(amountAfterFee) / NOCK_TO_NICKS;
  };

  return (
    <PageLayout>
      {({ isDarkMode, theme }) => {
        const cardTheme = getSwapCardTheme(isDarkMode);
        const burnSubmittedTxUrl =
          resultState.type === "burn_submitted"
            ? transactionExplorerUrl(chainId, resultState.txHash)
            : null;
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
            ) : resultState.type === "burn_submitted" ? (
              <div
                style={{
                  marginTop: 0,
                  width: "100%",
                  maxWidth: 480,
                  padding: 20,
                  boxSizing: "border-box",
                  borderRadius: 16,
                  border: `1px solid ${cardTheme.cardBorder}`,
                  background: cardTheme.cardBg,
                }}
              >
                <p
                  style={{
                    margin: "0 0 12px",
                    fontFamily: "var(--font-lora), serif",
                    fontSize: 24,
                    fontWeight: 600,
                    color: cardTheme.textPrimary,
                  }}
                >
                  Burn submitted
                </p>
                <p
                  style={{
                    margin: "0 0 8px",
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 13,
                    color: cardTheme.textPrimary,
                    opacity: 0.65,
                  }}
                >
                  Transaction hash
                </p>
                <p
                  style={{
                    margin: "0 0 20px",
                    fontFamily: "monospace",
                    fontSize: 12,
                    wordBreak: "break-all",
                    color: cardTheme.textPrimary,
                  }}
                >
                  {burnSubmittedTxUrl ? (
                    <a
                      href={burnSubmittedTxUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "inherit",
                        textDecoration: "underline",
                        cursor: "pointer",
                      }}
                    >
                      {resultState.txHash}
                    </a>
                  ) : (
                    resultState.txHash
                  )}
                </p>
                <button
                  type="button"
                  onClick={handleHomeClick}
                  style={{
                    width: "100%",
                    height: 48,
                    borderRadius: 8,
                    border: "none",
                    background: "#ffc413",
                    cursor: "pointer",
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 16,
                    fontWeight: 500,
                  }}
                >
                  Back to swap
                </button>
              </div>
            ) : resultState.type === "burn_cancelled" ? (
              <div
                style={{
                  marginTop: 0,
                  width: "100%",
                  maxWidth: 480,
                  padding: 20,
                  boxSizing: "border-box",
                  borderRadius: 16,
                  border: `1px solid ${cardTheme.cardBorder}`,
                  background: cardTheme.cardBg,
                }}
              >
                <p
                  style={{
                    margin: "0 0 8px",
                    fontFamily: "var(--font-lora), serif",
                    fontSize: 24,
                    fontWeight: 600,
                    color: cardTheme.textPrimary,
                  }}
                >
                  Transaction cancelled
                </p>
                <p
                  style={{
                    margin: "0 0 20px",
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 14,
                    lineHeight: "22px",
                    color: cardTheme.textPrimary,
                    opacity: 0.65,
                  }}
                >
                  You closed the wallet without signing. Nothing was submitted
                  on-chain.
                </p>
                <button
                  type="button"
                  onClick={handleHomeClick}
                  style={{
                    width: "100%",
                    height: 48,
                    borderRadius: 8,
                    border: "none",
                    background: "#ffc413",
                    cursor: "pointer",
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 16,
                    fontWeight: 500,
                  }}
                >
                  Back to swap
                </button>
              </div>
            ) : resultState.type === "confirming" ? (
              <ResultCard
                isDarkMode={isDarkMode}
                status="confirming"
                networkFeePercent={PROTOCOL_FEE_DISPLAY}
                networkFeeAmount={`${formatNOCK(nicksToNock(resultState.preview.fee))} NOCK`}
                totalNock={`${formatNOCK(nicksToNock(resultState.preview.amountInNicks))} NOCK`}
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
                totalNock={`${formatNOCK(resultState.amountNock)} NOCK`}
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
                confirmingAmountInNicks={BigInt(
                  Math.floor(resultState.amountNock * NOCK_TO_NICKS)
                )}
                nockchainNetworkFeeAmount="0 NOCK"
                confirmSubmitting={isBurnPending}
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
                    ? `${formatNOCK(nicksToNock(resultState.result.fee))} NOCK`
                    : "0 NOCK"
                }
                totalNock={
                  resultState.type === "success"
                    ? `${formatNOCK(calculateAmountAfterBridgeFee(resultState.result.amountInNicks))} NOCK`
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
          </div>
        </>
        );
      }}
    </PageLayout>
  );
}
