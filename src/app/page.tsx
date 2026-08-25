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
} from "@/lib/constants";
import { BridgeResult, TransactionPreview, useBridge } from "@/hooks/useBridge";
import { useNockBurn } from "@/hooks/useNockBurn";
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
import { useChainId } from "wagmi";

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
      type: "base_to_nock_success";
      txHash: string;
      amount: ExactNockAmount;
      destinationNockAddress: string;
      chainId: number;
      burnNetworkFeeDisplay: string;
      nockchainNetworkFeeDisplay: string;
      nockchainFeeNicks: bigint | null;
    }
  | {
      type: "base_to_nock_failed";
      message: string;
      amount: ExactNockAmount;
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
    loading: nockchainNetworkFeeLoading,
  } = useBaseToNockNockchainFeeEstimate(
    resultState.type === "confirming_burn" ? resultState.amount : null,
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
    amount: ExactNockAmount;
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
    const { amount, destinationNockAddress } = resultState;
    const sharedBurnResultData = {
      amount,
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
        amount,
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

  const calculateAmountAfterBridgeFee = (amountInNicks: bigint): string => {
    const bridgeFeeNicks = bridgeFeeNicksFloor(amountInNicks);
    return formatNicksAsNock(amountInNicks - bridgeFeeNicks);
  };

  const calculateBaseToNockAmountAfterFees = (
    amount: ExactNockAmount,
    nockchainFeeNicks: bigint | null
  ): string => {
    const bridgeFeeNicks = bridgeFeeNicksCeil(amount.nicks);
    const amountAfterBridgeFee = amount.nicks - bridgeFeeNicks;
    const amountAfterAllFees =
      nockchainFeeNicks !== null
        ? amountAfterBridgeFee - nockchainFeeNicks
        : amountAfterBridgeFee;
    return formatNicksAsNock(amountAfterAllFees);
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
                totalNock={`${calculateBaseToNockAmountAfterFees(resultState.amount, resultState.nockchainFeeNicks)} NOCK`}
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
                confirmingAmountInNicks={resultState.amount.nicks}
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
          </div>
        </>
        );
      }}
    </PageLayout>
  );
}
