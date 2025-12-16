"use client";

import { useState } from "react";
import PageLayout from "@/components/layout/PageLayout";
import SwapCard from "@/components/swap/SwapCard";
import ResultCard from "@/components/swap/ResultCard";
import { ASSETS, PROTOCOL_FEE_DISPLAY } from "@/lib/constants";
import { BridgeResult, useBridge } from "@/hooks/useBridge";
import { NOCK_TO_NICKS } from "@/hooks/useWallet";
import { truncateAddress, formatNOCK } from "@/lib/utils";

type ResultState =
  | { type: "idle" }
  | { type: "success"; result: BridgeResult }
  | { type: "error"; message: string };

export default function Home() {
  const [resultState, setResultState] = useState<ResultState>({ type: "idle" });
  const { inspectBridgeNotes } = useBridge();

  const handleSwapSuccess = (result: BridgeResult) => {
    setResultState({ type: "success", result });
  };

  const handleSwapError = (message: string) => {
    setResultState({ type: "error", message });
  };

  const handleHomeClick = () => {
    setResultState({ type: "idle" });
  };

  const handleInspectMetadata = async () => {
    console.log("[Debug] Inspecting bridge metadata...");
    const result = await inspectBridgeNotes();
    if (result) {
      console.log("[Debug] Bridge notes inspection complete:", result);
    }
  };

  // Convert nicks to NOCK
  const nicksToNock = (nicks: bigint) => Number(nicks) / NOCK_TO_NICKS;

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
              width: 560,
              textAlign: "center",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                isDarkMode ? ASSETS.nockswapHeaderDark : ASSETS.nockswapHeader
              }
              alt="Nock Swap"
              width={320}
              height={72}
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
          <div style={{ marginTop: 31, width: 480 }}>
            {resultState.type !== "idle" ? (
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
                    ? `${formatNOCK(nicksToNock(resultState.result.amountInNicks))} NOCK`
                    : "0 NOCK"
                }
                totalUsd=""
                receivingAddress={
                  resultState.type === "success"
                    ? truncateAddress(resultState.result.destinationAddress)
                    : ""
                }
                transactionId={
                  resultState.type === "success"
                    ? truncateAddress(resultState.result.txId, 5)
                    : ""
                }
                onHomeClick={handleHomeClick}
                onInspectMetadata={handleInspectMetadata}
              />
            ) : (
              <SwapCard
                isDarkMode={isDarkMode}
                onSwapSuccess={handleSwapSuccess}
                onSwapError={handleSwapError}
              />
            )}
          </div>
        </>
      )}
    </PageLayout>
  );
}
