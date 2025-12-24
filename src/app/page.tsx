"use client";

import { useState } from "react";
import PageLayout from "@/components/layout/PageLayout";
import SwapCard from "@/components/swap/SwapCard";
import ResultCard from "@/components/swap/ResultCard";
import { ASSETS, PROTOCOL_FEE_DISPLAY, PROTOCOL_FEE_NICKS_PER_NOCK } from "@/lib/constants";
import { BridgeResult, TransactionPreview, useBridge } from "@/hooks/useBridge";
import { NOCK_TO_NICKS } from "@/hooks/useWallet";
import { truncateAddress, formatNOCK } from "@/lib/utils";

type ResultState =
  | { type: "idle" }
  | { type: "confirming"; preview: TransactionPreview }
  | { type: "success"; result: BridgeResult }
  | { type: "error"; message: string };

export default function Home() {
  const [resultState, setResultState] = useState<ResultState>({ type: "idle" });
  const { confirmTransaction, cancelTransaction, prepareTransaction, status: bridgeStatus } = useBridge();

  const handlePrepareSuccess = (preview: TransactionPreview) => {
    setResultState({ type: "confirming", preview });
  };

  const handleSwapError = (message: string) => {
    setResultState({ type: "error", message });
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
      {({ isDarkMode, theme }) => (
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
              Your Bridge from Nockchain to Base
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
                prepareTransaction={prepareTransaction}
                bridgeStatus={bridgeStatus}
              />
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
              />
            )}
          </div>
        </>
      )}
    </PageLayout>
  );
}
