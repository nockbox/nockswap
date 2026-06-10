"use client";

import { useMemo, useState } from "react";
import PageLayout from "@/components/layout/PageLayout";
import SwapCard from "@/components/swap/SwapCard";
import ResultCard from "@/components/swap/ResultCard";
import {
  ASSETS,
  bridgeFeeNicksCeil,
  bridgeFeeNicksFloor,
  PROTOCOL_FEE_DISPLAY,
  NICKS_PER_NOCK,
} from "@/lib/constants";
import { BridgeResult, TransactionPreview, useBridge } from "@/hooks/useBridge";
import { useNockBurn } from "@/hooks/useNockBurn";
import { useNockBurnGasEstimate } from "@/hooks/useNockBurnGasEstimate";
import { useBaseToNockContractReadiness } from "@/hooks/useBaseToNockContractReadiness";
import { useBaseToNockNockchainFeeEstimate } from "@/hooks/useBaseToNockNockchainFeeEstimate";
import { NOCK_TO_NICKS } from "@/hooks/useWallet";
import { truncateAddress, formatNOCK } from "@/lib/utils";
import { isEvmWalletUserRejection } from "@/lib/evmWalletErrors";
import { transactionExplorerUrl } from "@/lib/blockExplorer";
import {
  getBridgeNetworkConfig,
  getPreferredBridgeNetworkConfig,
} from "@/lib/bridgeNetworkConfig";
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
  | {
      type: "base_to_nock_success";
      txHash: string;
      amountNock: number;
      destinationNockAddress: string;
      chainId: number;
      burnNetworkFeeDisplay: string;
      nockchainNetworkFeeDisplay: string;
      nockchainFeeNicks: bigint | null;
    }
  | {
      type: "base_to_nock_failed";
      message: string;
      amountNock: number;
      destinationNockAddress: string;
      burnNetworkFeeDisplay: string;
      nockchainNetworkFeeDisplay: string;
      nockchainFeeNicks: bigint | null;
    };

export default function Home() {
  const [resultState, setResultState] = useState<ResultState>({ type: "idle" });
  const chainId = useChainId();
  const { confirmTransaction, cancelTransaction, prepareTransaction, status: bridgeStatus } = useBridge();
  const { burnNock, isBurning: isBurnPending } = useNockBurn();
  const expectedBurnNetwork = useMemo(
    () => getBridgeNetworkConfig(chainId) ?? getPreferredBridgeNetworkConfig(),
    [chainId]
  );
  const expectedBurnChainId = expectedBurnNetwork?.chainId;
  const burnGasAmountNock =
    resultState.type === "confirming_burn" ? resultState.amountNock : null;
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
    loading: nockchainNetworkFeeLoading,
  } = useBaseToNockNockchainFeeEstimate(
    resultState.type === "confirming_burn" ? resultState.amountNock : null,
    resultState.type === "confirming_burn"
      ? resultState.destinationNockAddress
      : null
  );

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
    const { amountNock, destinationNockAddress } = resultState;
    const sharedBurnResultData = {
      amountNock,
      destinationNockAddress,
      burnNetworkFeeDisplay,
      nockchainNetworkFeeDisplay,
      nockchainFeeNicks: nockchainFeeNicksEstimate,
    };
    try {
      if (!burnContractReadiness.ready) {
        throw new Error(
          burnContractReadiness.reason ?? "Base-to-Nock contracts are not ready."
        );
      }
      const txHash = await burnNock(
        amountNock,
        destinationNockAddress,
        expectedBurnChainId
      );
      setResultState({
        type: "base_to_nock_success",
        txHash,
        chainId: expectedBurnChainId ?? chainId,
        ...sharedBurnResultData,
      });
    } catch (err) {
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
    }
  };

  // Convert nicks to NOCK
  const nicksToNock = (nicks: bigint) => Number(nicks) / NOCK_TO_NICKS;

  // Calculate Nockchain -> Base amount after protocol bridge fee.
  const calculateAmountAfterBridgeFee = (amountInNicks: bigint): number => {
    const bridgeFeeNicks = bridgeFeeNicksFloor(amountInNicks);
    const amountAfterFee = amountInNicks - bridgeFeeNicks;
    return Number(amountAfterFee) / NOCK_TO_NICKS;
  };

  const calculateBaseToNockAmountAfterFees = (
    amountNock: number,
    nockchainFeeNicks: bigint | null
  ): number => {
    const amountInNicks = BigInt(Math.floor(amountNock)) * NICKS_PER_NOCK;
    const bridgeFeeNicks = bridgeFeeNicksCeil(amountInNicks);
    const amountAfterBridgeFee = amountInNicks - bridgeFeeNicks;
    const amountAfterAllFees =
      nockchainFeeNicks !== null
        ? amountAfterBridgeFee - nockchainFeeNicks
        : amountAfterBridgeFee;
    return Number(amountAfterAllFees) / NOCK_TO_NICKS;
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
            ) : resultState.type === "base_to_nock_success" ||
              resultState.type === "base_to_nock_failed" ? (
              <ResultCard
                isDarkMode={isDarkMode}
                status={
                  resultState.type === "base_to_nock_success" ? "success" : "failed"
                }
                flowDirection="base_to_nock"
                errorMessage={
                  resultState.type === "base_to_nock_failed"
                    ? resultState.message
                    : undefined
                }
                networkFeePercent={PROTOCOL_FEE_DISPLAY}
                networkFeeAmount={resultState.burnNetworkFeeDisplay}
                nockchainNetworkFeeAmount={
                  resultState.nockchainNetworkFeeDisplay !== "—"
                    ? resultState.nockchainNetworkFeeDisplay
                    : undefined
                }
                confirmingAmountInNicks={
                  BigInt(Math.floor(resultState.amountNock)) * NICKS_PER_NOCK
                }
                confirmingNockchainFeeNicks={resultState.nockchainFeeNicks}
                totalNock={`${formatNOCK(calculateBaseToNockAmountAfterFees(resultState.amountNock, resultState.nockchainFeeNicks))} NOCK`}
                totalUsd=""
                receivingAddress={truncateAddress(resultState.destinationNockAddress)}
                fullReceivingAddress={resultState.destinationNockAddress}
                transactionId={
                  resultState.type === "base_to_nock_success"
                    ? truncateAddress(resultState.txHash, 5)
                    : ""
                }
                fullTransactionId={
                  resultState.type === "base_to_nock_success"
                    ? resultState.txHash
                    : ""
                }
                transactionUrl={
                  resultState.type === "base_to_nock_success"
                    ? (transactionExplorerUrl(resultState.chainId, resultState.txHash) ?? undefined)
                    : undefined
                }
                onHomeClick={handleHomeClick}
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
                confirmingAmountInNicks={
                  BigInt(Math.floor(resultState.amountNock)) * NICKS_PER_NOCK
                }
                nockchainNetworkFeeAmount={nockchainNetworkFeeDisplay}
                nockchainNetworkFeeLoading={nockchainNetworkFeeLoading}
                confirmingNockchainFeeNicks={nockchainFeeNicksEstimate}
                confirmSubmitting={isBurnPending}
                confirmDisabledReason={
                  burnContractReadiness.loading
                    ? "Checking Base bridge contracts..."
                    : burnContractReadiness.reason
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
