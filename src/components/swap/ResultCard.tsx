"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ASSETS,
  bridgeFeeNicksFloor,
  PROTOCOL_FEE_DISPLAY,
} from "@/lib/constants";
import { getCardTheme } from "@/lib/theme";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { TransactionPreview, BridgeStatus, BridgeResult } from "@/hooks/useBridge";
import { formatNicksAsNock } from "@/lib/nockAmount";

type ResultStatus =
  | "success"
  | "failed"
  | "confirming"
  | "awaiting_base"
  | "pending"
  | "delayed"
  | "support"
  | "confirmed";
type FlowDirection = "nock_to_base" | "base_to_nock";

interface ResultCardProps {
  isDarkMode?: boolean;
  status?: ResultStatus;
  flowDirection?: FlowDirection;
  errorMessage?: string;
  networkFeePercent?: string;
  networkFeeAmount?: string;
  nockchainNetworkFeeAmount?: string;
  nockchainNetworkFeeLoading?: boolean;
  totalUsd?: string;
  totalNock?: string;
  receivingAddress?: string;
  fullReceivingAddress?: string;
  transactionId?: string;
  fullTransactionId?: string;
  transactionUrl?: string;
  nockTransactionId?: string;
  nockBlockId?: string;
  lifecycleDetail?: string;
  lifecycleHistory?: Array<{
    status: string;
    detail: string;
    observedAt: number;
  }>;
  browserEvidence?: {
    calldata: string;
    submittedTransactionHash: string;
    transactionHash: string;
    blockNumber: string | null;
    blockHash: string | null;
    logIndex: number | null;
    baseEventId: string | null;
  };
  onHomeClick?: () => void;
  onConfirm?: () => Promise<void>;
  preview?: TransactionPreview;
  bridgeStatus?: BridgeStatus;
  result?: BridgeResult;
  confirmingBridgeFeeNicks?: bigint | null;
  confirmingNetPayoutNicks?: bigint | null;
  confirmSubmitting?: boolean;
  confirmDisabledReason?: string | null;
}

export default function ResultCard({
  isDarkMode = false,
  status = "success",
  flowDirection = "nock_to_base",
  errorMessage,
  networkFeePercent = PROTOCOL_FEE_DISPLAY,
  networkFeeAmount = "0 NOCK",
  nockchainNetworkFeeAmount,
  nockchainNetworkFeeLoading = false,
  totalUsd = "",
  totalNock = "0 NOCK",
  receivingAddress = "",
  fullReceivingAddress,
  transactionId = "",
  fullTransactionId,
  transactionUrl,
  nockTransactionId,
  nockBlockId,
  lifecycleDetail,
  lifecycleHistory,
  browserEvidence,
  onHomeClick,
  onConfirm,
  preview,
  bridgeStatus,
  result,
  confirmingBridgeFeeNicks,
  confirmingNetPayoutNicks,
  confirmSubmitting = false,
  confirmDisabledReason,
}: ResultCardProps) {
  const [copied, setCopied] = useState(false);
  const [downloadHover, setDownloadHover] = useState(false);
  const isMobile = useIsMobile();

  const isSuccess = status === "success" || status === "confirmed";
  const isConfirming = status === "confirming";
  const isFailure = status === "failed" || status === "support";
  const showStatusIcon = isSuccess || status === "failed";
  const lifecycleState =
    status === "awaiting_base"
      ? "submitted"
      : status === "pending"
      ? "pending"
      : status === "delayed"
      ? "delayed"
      : status === "confirmed"
      ? "confirmed"
      : status === "support" || status === "failed"
      ? "support"
      : null;
  const statusTitle =
    status === "confirming"
      ? "Confirm Transaction"
      : status === "awaiting_base"
      ? "Awaiting Base receipt"
      : status === "pending"
      ? "Withdrawal pending"
      : status === "delayed"
      ? "Withdrawal delayed"
      : status === "support"
      ? "Support required"
      : isSuccess
      ? "Confirmed"
      : "Failed";
  const theme = getCardTheme(isDarkMode);
  const fromNetworkName =
    flowDirection === "base_to_nock" ? "Base" : "Nockchain";
  const toNetworkName =
    flowDirection === "base_to_nock" ? "Nockchain" : "Base";
  const fromNetworkIcon =
    flowDirection === "base_to_nock" ? ASSETS.baseLogo : ASSETS.nockchainIcon;
  const toNetworkIcon =
    flowDirection === "base_to_nock" ? ASSETS.nockchainIcon : ASSETS.baseLogo;
  const confirmDisabled = Boolean(
    confirmDisabledReason ||
      confirmSubmitting ||
      bridgeStatus === "awaiting_signature" ||
      bridgeStatus === "pending"
  );
  const payoutLabel =
    flowDirection === "base_to_nock"
      ? status === "confirmed"
        ? "You received"
        : "Estimated payout"
      : isSuccess
      ? "You received"
      : "You will receive";

  const calculateBridgeFee = (): string => {
    if (flowDirection === "base_to_nock") {
      return confirmingBridgeFeeNicks === null ||
        confirmingBridgeFeeNicks === undefined
        ? "Authoritative quote unavailable"
        : `${formatNicksAsNock(confirmingBridgeFeeNicks)} NOCK`;
    }
    const amountInNicks = preview?.amountInNicks ?? result?.amountInNicks;
    if (amountInNicks === undefined) return "0 NOCK";
    return `${formatNicksAsNock(bridgeFeeNicksFloor(amountInNicks))} NOCK`;
  };

  const calculateAmountAfterBridgeFee = (): string => {
    if (flowDirection === "base_to_nock") {
      return confirmingNetPayoutNicks === null ||
        confirmingNetPayoutNicks === undefined
        ? "Authoritative quote unavailable"
        : `${formatNicksAsNock(confirmingNetPayoutNicks)} NOCK`;
    }
    if (!preview) return totalNock;
    const bridgeFeeNicks = bridgeFeeNicksFloor(preview.amountInNicks);
    return `${formatNicksAsNock(preview.amountInNicks - bridgeFeeNicks)} NOCK`;
  };

  const handleCopyAddress = async () => {
    try {
      const addressToCopy = fullReceivingAddress || receivingAddress;
      await navigator.clipboard.writeText(addressToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleOpenTransaction = () => {
    const txId = fullTransactionId || transactionId;
    if (txId || transactionUrl) {
      const url = transactionUrl || `https://nockscan.net/tx/${txId}`;
      window.open(url, "_blank");
    }
  };

  const handleDownloadTransaction = () => {
    // For confirming screen: download unsigned (jammed) transaction
    if (isConfirming && preview?.jammedTransaction) {
      const buffer = new ArrayBuffer(preview.jammedTransaction.length);
      new Uint8Array(buffer).set(preview.jammedTransaction);
      const blob = new Blob([buffer], { type: "application/jam" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bridge-unsigned-${preview.txId}.tx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

    // For success screen: download signed transaction (JAM format)
    if (isSuccess && result?.signedJammedTx) {
      const buffer = new ArrayBuffer(result.signedJammedTx.length);
      new Uint8Array(buffer).set(result.signedJammedTx);
      const blob = new Blob([buffer], { type: "application/jam" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bridge-signed-${result.txId}.tx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div
      data-calldata={browserEvidence?.calldata}
      data-submitted-transaction-hash={
        browserEvidence?.submittedTransactionHash
      }
      data-transaction-hash={browserEvidence?.transactionHash}
      data-block-number={browserEvidence?.blockNumber ?? undefined}
      data-block-hash={browserEvidence?.blockHash ?? undefined}
      data-log-index={browserEvidence?.logIndex ?? undefined}
      data-base-event-id={browserEvidence?.baseEventId ?? undefined}
      data-testid="result-card"
      data-result-status={status}
      data-flow-direction={flowDirection}
      data-bridge-status={bridgeStatus ?? ""}
      style={{
        display: "flex",
        width: "100%",
        maxWidth: isMobile ? 358 : 480,
        padding: isMobile ? 16 : 20,
        flexDirection: "column",
        alignItems: "center",
        gap: isMobile ? 15 : 20,
        borderRadius: 16,
        border: `1px solid ${theme.cardBorder}`,
        background: theme.cardBg,
        boxSizing: "border-box",
        overflow: "clip",
      }}
    >
      {/* Top content - Status icon and title */}
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "row" : "column",
          alignItems: "center",
          justifyContent: isMobile ? "center" : "flex-start",
          gap: 12,
          width: "100%",
          paddingLeft: isMobile ? 0 : 0,
          paddingRight: isMobile ? 20 : 0,
        }}
      >
        {/* Status icon - only show for success/failed, not confirming */}
        {showStatusIcon && (
          <Image
            src={isSuccess ? ASSETS.txnSuccess : ASSETS.txnFail}
            alt={isSuccess ? "Confirmed" : "Failed"}
            width={isMobile ? 52 : 64}
            height={isMobile ? 52 : 64}
            style={{
              width: isMobile ? 52 : 64,
              height: isMobile ? 52 : 64,
            }}
          />
        )}

        {/* Title and subtitle */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: isMobile && !isConfirming ? "flex-start" : "center",
            gap: 4,
            width: isConfirming ? "100%" : "auto",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-lora), serif",
              fontSize: isMobile ? 32 : 36,
              fontWeight: 600,
              lineHeight: isMobile ? "36px" : "40px",
              letterSpacing: isMobile ? -0.64 : -0.72,
              color: theme.textPrimary,
              textAlign: isConfirming ? "left" : isMobile ? "left" : "center",
            }}
          >
            {statusTitle}
          </span>
          {isFailure && errorMessage && (
            <span
              data-testid="result-error"
              role="alert"
              style={{
                color: theme.textPrimary,
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: isMobile ? 14 : 15,
                fontStyle: "normal",
                fontWeight: 500,
                lineHeight: "22px",
                letterSpacing: isMobile ? 0.14 : 0.15,
                opacity: 0.5,
                textAlign: isMobile ? "left" : "center",
              }}
            >
              {errorMessage}
            </span>
          )}
          {lifecycleState ? (
            <output
              data-testid="withdrawal-lifecycle-state"
              data-state={lifecycleState}
              style={{
                color: theme.textPrimary,
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 14,
                lineHeight: "20px",
                opacity: 0.7,
                textAlign: "center",
              }}
            >
              {lifecycleDetail ??
                (lifecycleState === "confirmed"
                  ? "Nockchain settlement is confirmed."
                  : "Do not submit another burn while this withdrawal is active.")}
            </output>
          ) : null}
        </div>
      </div>
      {lifecycleHistory && lifecycleHistory.length > 0 ? (
        <ol
          data-testid="withdrawal-history"
          style={{
            width: "100%",
            margin: 0,
            paddingLeft: 20,
            color: theme.textPrimary,
            fontFamily: "var(--font-inter), sans-serif",
            fontSize: 12,
            lineHeight: "18px",
          }}
        >
          {lifecycleHistory.map((event, index) => (
            <li key={`${event.observedAt}-${event.status}-${index}`}>
              {event.status}: {event.detail}
            </li>
          ))}
        </ol>
      ) : null}

      {/* Content sections */}
      <div
        style={{
          display: "flex",
          padding: 4,
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          width: "100%",
          borderRadius: 12,
          background: theme.sectionBg,
          boxSizing: "border-box",
        }}
      >
        {/* Swap summary row */}
        <div
          style={{
            display: "flex",
            padding: isMobile ? 12 : 16,
            alignItems: "center",
            gap: 12,
            width: "100%",
            borderRadius: 8,
            background: theme.inputBg,
            boxSizing: "border-box",
          }}
        >
          {/* From token */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flex: "1 1 0",
            }}
          >
            <div
              style={{
                position: "relative",
                width: 40,
                height: 40,
                flexShrink: 0,
              }}
            >
              <Image
                src={ASSETS.nockToken}
                alt="NOCK"
                width={40}
                height={40}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  filter: isDarkMode ? "invert(1)" : "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: -2,
                  right: -2,
                  width: 14,
                  height: 14,
                  borderRadius: 24,
                  border: `2px solid ${theme.networkBadgeBorder}`,
                  overflow: "hidden",
                  boxSizing: "border-box",
                  background:
                    flowDirection === "base_to_nock" ? "#fff" : "#1a1a1a",
                }}
              >
                <Image
                  src={fromNetworkIcon}
                  alt={fromNetworkName}
                  width={14}
                  height={14}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  color: theme.textPrimary,
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: isMobile ? 14 : 15,
                  fontStyle: "normal",
                  fontWeight: 500,
                  lineHeight: "22px",
                  letterSpacing: isMobile ? 0.14 : 0.15,
                }}
              >
                NOCK
              </span>
              <span
                style={{
                  color: theme.textPrimary,
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 13,
                  fontStyle: "normal",
                  fontWeight: 500,
                  lineHeight: "15px",
                  letterSpacing: 0.13,
                  opacity: 0.5,
                }}
              >
                {fromNetworkName}
              </span>
            </div>
          </div>

          {/* Arrow */}
          <div
            style={{
              display: "flex",
              padding: isMobile ? "6px 10px" : "8px 16px",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              borderRadius: 24,
              background: theme.sectionBg,
              overflow: "clip",
            }}
          >
            <Image
              src="/assets/chevron.svg"
              alt="Arrow"
              width={16}
              height={16}
              style={{
                width: 16,
                height: 16,
              }}
            />
          </div>

          {/* To token */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flex: "1 1 0",
              justifyContent: "flex-end",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  color: theme.textPrimary,
                  textAlign: "right",
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: isMobile ? 14 : 15,
                  fontStyle: "normal",
                  fontWeight: 500,
                  lineHeight: "22px",
                  letterSpacing: isMobile ? 0.14 : 0.15,
                }}
              >
                NOCK
              </span>
              <span
                style={{
                  color: theme.textPrimary,
                  textAlign: "right",
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 13,
                  fontStyle: "normal",
                  fontWeight: 500,
                  lineHeight: "15px",
                  letterSpacing: 0.13,
                  opacity: 0.5,
                }}
              >
                {toNetworkName}
              </span>
            </div>
            <div
              style={{
                position: "relative",
                width: 40,
                height: 40,
                flexShrink: 0,
              }}
            >
              <Image
                src={ASSETS.nockToken}
                alt="NOCK"
                width={40}
                height={40}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  filter: isDarkMode ? "invert(1)" : "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: -2,
                  right: -2,
                  width: 14,
                  height: 14,
                  borderRadius: 32,
                  border: `2px solid ${theme.networkBadgeBorder}`,
                  overflow: "hidden",
                  boxSizing: "border-box",
                  background:
                    flowDirection === "base_to_nock" ? "#1a1a1a" : "#fff",
                }}
              >
                <Image
                  src={toNetworkIcon}
                  alt={toNetworkName}
                  width={14}
                  height={14}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Fee details section */}
        <div
          style={{
            display: "flex",
            padding: isMobile ? 12 : 16,
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "center",
            gap: isMobile ? 8 : 12,
            width: "100%",
            borderRadius: 8,
            background: theme.inputBg,
            boxSizing: "border-box",
          }}
        >
          {/* Network fee row (transaction fee) */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
            }}
          >
            <span
              style={{
                color: theme.textPrimary,
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: isMobile ? 14 : 15,
                fontStyle: "normal",
                fontWeight: 500,
                lineHeight: "22px",
                letterSpacing: isMobile ? 0.14 : 0.15,
              }}
            >
              Network fee
            </span>
            <span
              style={{
                color: theme.textPrimary,
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: isMobile ? 14 : 15,
                fontStyle: "normal",
                fontWeight: 500,
                lineHeight: "22px",
                letterSpacing: isMobile ? 0.14 : 0.15,
                opacity: 0.5,
              }}
            >
              {networkFeeAmount}
            </span>
          </div>

          {flowDirection === "base_to_nock" && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
              }}
            >
              <span
                style={{
                  color: theme.textPrimary,
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: isMobile ? 14 : 15,
                  fontStyle: "normal",
                  fontWeight: 500,
                  lineHeight: "22px",
                  letterSpacing: isMobile ? 0.14 : 0.15,
                }}
              >
                Nockchain fee (best effort)
              </span>
              <span
                style={{
                  color: theme.textPrimary,
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: isMobile ? 14 : 15,
                  fontStyle: "normal",
                  fontWeight: 500,
                  lineHeight: "22px",
                  letterSpacing: isMobile ? 0.14 : 0.15,
                  opacity: 0.5,
                }}
              >
                {nockchainNetworkFeeLoading
                  ? "Estimating..."
                  : nockchainNetworkFeeAmount ?? "—"}
              </span>
            </div>
          )}

          {/* Bridge fee row (protocol fee) */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
            }}
          >
            <span
              style={{
                color: theme.textPrimary,
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: isMobile ? 14 : 15,
                fontStyle: "normal",
                fontWeight: 500,
                lineHeight: "22px",
                letterSpacing: isMobile ? 0.14 : 0.15,
              }}
            >
              Bridge fee {networkFeePercent}
            </span>
            <span
              style={{
                color: theme.textPrimary,
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: isMobile ? 14 : 15,
                fontStyle: "normal",
                fontWeight: 500,
                lineHeight: "22px",
                letterSpacing: isMobile ? 0.14 : 0.15,
                opacity: 0.5,
              }}
            >
              {calculateBridgeFee()}
            </span>
          </div>

          {/* You will receive row */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              width: "100%",
            }}
          >
            <span
              style={{
                color: theme.textPrimary,
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: isMobile ? 14 : 15,
                fontStyle: "normal",
                fontWeight: 500,
                lineHeight: "22px",
                letterSpacing: isMobile ? 0.14 : 0.15,
              }}
            >
              {payoutLabel}
            </span>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
              }}
            >
              <span
                style={{
                  color: theme.textPrimary,
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: isMobile ? 14 : 15,
                  fontStyle: "normal",
                  fontWeight: 500,
                  lineHeight: "22px",
                  letterSpacing: isMobile ? 0.14 : 0.15,
                }}
              >
                {isConfirming ? calculateAmountAfterBridgeFee() : totalNock}
              </span>
              {totalUsd && (
                <span
                  style={{
                    color: theme.textPrimary,
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 13,
                    fontStyle: "normal",
                    fontWeight: 500,
                    lineHeight: "15px",
                    letterSpacing: 0.13,
                    opacity: 0.5,
                  }}
                >
                  {totalUsd}
                </span>
              )}
            </div>
          </div>

          {/* Wait time row - only show for confirming */}
          {isConfirming && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
              }}
            >
              <span
                style={{
                  color: theme.textPrimary,
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: isMobile ? 14 : 15,
                  fontStyle: "normal",
                  fontWeight: 500,
                  lineHeight: "22px",
                  letterSpacing: isMobile ? 0.14 : 0.15,
                  opacity: 0.7,
                }}
              >
                Wait time
              </span>
              <span
                style={{
                  color: theme.textPrimary,
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: isMobile ? 14 : 15,
                  fontStyle: "normal",
                  fontWeight: 500,
                  lineHeight: "22px",
                  letterSpacing: isMobile ? 0.14 : 0.15,
                }}
              >
                100 blocks
              </span>
            </div>
          )}
        </div>

        {/* Receiving address section */}
        <div
          style={{
            display: "flex",
            padding: isMobile ? 12 : 16,
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
            borderRadius: 8,
            background: theme.inputBg,
            boxSizing: "border-box",
          }}
        >
          <span
            style={{
              color: theme.textPrimary,
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: isMobile ? 14 : 15,
              fontStyle: "normal",
              fontWeight: 500,
              lineHeight: "22px",
              letterSpacing: isMobile ? 0.14 : 0.15,
            }}
          >
            Receiving address
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 32,
                overflow: "hidden",
                border: `2px solid ${theme.networkBadgeBorder}`,
                boxSizing: "border-box",
                background: "#fff",
              }}
            >
              <Image
                src={ASSETS.baseLogo}
                alt="Base"
                width={14}
                height={14}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            </div>
            <span
              data-testid="result-destination"
              title={fullReceivingAddress || receivingAddress}
              style={{
                color: theme.textPrimary,
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: isMobile ? 14 : 15,
                fontStyle: "normal",
                fontWeight: 500,
                lineHeight: "22px",
                letterSpacing: isMobile ? 0.14 : 0.15,
              }}
            >
              {receivingAddress}
            </span>
            <button
              onClick={handleCopyAddress}
              style={{
                display: "flex",
                padding: 3,
                alignItems: "center",
                gap: 10,
                borderRadius: 20,
                background: theme.iconButtonBg,
                border: "none",
                cursor: "pointer",
                flexShrink: 0,
              }}
              title={copied ? "Copied!" : "Copy address"}
            >
              <Image
                src="/assets/copy-icon.svg"
                alt="Copy"
                width={16}
                height={16}
                style={{
                  width: 16,
                  height: 16,
                  flexShrink: 0,
                }}
              />
            </button>
          </div>
        </div>

        {/* Transaction ID section - only show for success/failed */}
        {!isConfirming && transactionId && (
          <div
            style={{
              display: "flex",
              padding: isMobile ? 12 : 16,
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
              borderRadius: 8,
              background: theme.inputBg,
              boxSizing: "border-box",
            }}
          >
            <span
              style={{
                color: theme.textPrimary,
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: isMobile ? 14 : 15,
                fontStyle: "normal",
                fontWeight: 500,
                lineHeight: "22px",
                letterSpacing: isMobile ? 0.14 : 0.15,
              }}
            >
              Transaction ID
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                data-testid="result-transaction"
                title={fullTransactionId || transactionId}
                style={{
                  color: theme.textPrimary,
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: isMobile ? 14 : 15,
                  fontStyle: "normal",
                  fontWeight: 500,
                  lineHeight: "22px",
                  letterSpacing: isMobile ? 0.14 : 0.15,
                }}
              >
                {transactionId}
              </span>
              <button
                onClick={handleOpenTransaction}
                style={{
                  display: "flex",
                  padding: 3,
                  alignItems: "center",
                  gap: 10,
                  borderRadius: 20,
                  background: theme.iconButtonBg,
                  border: "none",
                  cursor: "pointer",
                }}
                title="View on explorer"
              >
                <Image
                  src="/assets/external-link-icon.svg"
                  alt="External link"
                  width={16}
                  height={16}
                  style={{
                    width: 16,
                    height: 16,
                  }}
                />
              </button>
            </div>
          </div>
        )}
        {!isConfirming && nockTransactionId ? (
          <div
            data-testid="nockchain-reference"
            title={nockTransactionId}
            style={{
              width: "100%",
              padding: isMobile ? 12 : 16,
              borderRadius: 8,
              background: theme.inputBg,
              boxSizing: "border-box",
              color: theme.textPrimary,
              fontFamily: "var(--font-inter), sans-serif",
              overflowWrap: "anywhere",
            }}
          >
            Nockchain transaction: {nockTransactionId}
            {nockBlockId ? ` · block ${nockBlockId}` : ""}
          </div>
        ) : null}

        {/* Download Transaction button */}
        {((isConfirming && preview) || (isSuccess && result)) && (
          <button
            onClick={handleDownloadTransaction}
            onMouseEnter={() => setDownloadHover(true)}
            onMouseLeave={() => setDownloadHover(false)}
            style={{
              display: "flex",
              width: "100%",
              height: 44,
              padding: "12px 16px",
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
              borderRadius: 8,
              background: "transparent",
              border: `1px solid ${theme.cardBorder}`,
              cursor: "pointer",
              boxSizing: "border-box",
              opacity: downloadHover ? 0.6 : 1,
              transition: "opacity 0.15s ease",
            }}
          >
            <span
              style={{
                color: theme.textPrimary,
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              {isConfirming ? "Download Unsigned Transaction" : "Download Signed Transaction"}
            </span>
          </button>
        )}
      </div>

      {/* Buttons section */}
      {isConfirming ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          {confirmDisabledReason && (
            <div
              data-testid="result-blocker"
              role="status"
              style={{
                color: theme.textPrimary,
                opacity: 0.5,
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 13,
                lineHeight: "18px",
              }}
            >
              {confirmDisabledReason}
            </div>
          )}
          <div style={{ display: "flex", gap: 12, width: "100%" }}>
          {/* Cancel button */}
          <button
            onClick={onHomeClick}
            style={{
              display: "flex",
              flex: 1,
              height: 56,
              padding: "17px 20px",
              justifyContent: "center",
              alignItems: "center",
              gap: 10,
              borderRadius: 8,
              background: "transparent",
              border: `1px solid ${theme.cardBorder}`,
              cursor: "pointer",
              boxSizing: "border-box",
            }}
          >
            <span
              style={{
                color: theme.textPrimary,
                textAlign: "center",
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 16,
                fontStyle: "normal",
                fontWeight: 500,
                lineHeight: "22px",
                letterSpacing: 0.16,
              }}
            >
              Cancel
            </span>
          </button>

          {/* Confirm button */}
          <button
            onClick={onConfirm}
            disabled={confirmDisabled}
            style={{
              display: "flex",
              flex: 1,
              height: 56,
              padding: "17px 20px",
              justifyContent: "center",
              alignItems: "center",
              gap: 10,
              borderRadius: 8,
              background:
                confirmDisabled ? "#f6f5f1" : "#ffc413",
              border: "none",
              cursor: confirmDisabled ? "not-allowed" : "pointer",
              boxSizing: "border-box",
            }}
          >
            <span
              style={{
                color: "#000",
                textAlign: "center",
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 16,
                fontStyle: "normal",
                fontWeight: 500,
                lineHeight: "22px",
                letterSpacing: 0.16,
                opacity: confirmDisabled ? 0.4 : 1,
              }}
            >
              {bridgeStatus === "awaiting_signature"
                ? "Approve in Wallet..."
                : bridgeStatus === "pending"
                ? "Processing..."
                : confirmSubmitting
                ? "Processing..."
                : confirmDisabledReason
                ? "Unavailable"
                : "Confirm"}
            </span>
          </button>
          </div>
        </div>
      ) : (
        <button
          onClick={onHomeClick}
          disabled={!onHomeClick}
          style={{
            display: "flex",
            width: "100%",
            height: 56,
            padding: "17px 20px",
            justifyContent: "center",
            alignItems: "center",
            gap: 10,
            borderRadius: 8,
            background: onHomeClick ? "#ffc413" : "#f6f5f1",
            border: "none",
            cursor: onHomeClick ? "pointer" : "not-allowed",
            boxSizing: "border-box",
          }}
        >
          <span
            style={{
              color: "#000",
              textAlign: "center",
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 16,
              fontStyle: "normal",
              fontWeight: 500,
              lineHeight: "22px",
              letterSpacing: 0.16,
            }}
          >
            {onHomeClick ? "Back to home" : "Keep tracking this withdrawal"}
          </span>
        </button>
      )}
    </div>
  );
}
