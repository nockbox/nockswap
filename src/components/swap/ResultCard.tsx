"use client";

import { useState } from "react";
import {
  ASSETS,
  PROTOCOL_FEE_DISPLAY,
  PROTOCOL_FEE_BPS,
} from "@/lib/constants";
import { getCardTheme } from "@/lib/theme";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { TransactionPreview, BridgeStatus } from "@/hooks/useBridge";
import { NOCK_TO_NICKS } from "@/hooks/useWallet";
import { beltsToEvmAddress } from "@/lib/bridge";
import { formatNOCK } from "@/lib/utils";

type ResultStatus = "success" | "failed" | "confirming";

interface ResultCardProps {
  isDarkMode?: boolean;
  status?: ResultStatus;
  errorMessage?: string;
  networkFeePercent?: string;
  networkFeeAmount?: string;
  totalUsd?: string;
  totalNock?: string;
  receivingAddress?: string;
  fullReceivingAddress?: string;
  transactionId?: string;
  fullTransactionId?: string;
  onHomeClick?: () => void;
  onInspectMetadata?: () => Promise<void>;
  onConfirm?: () => Promise<void>;
  preview?: TransactionPreview;
  bridgeStatus?: BridgeStatus;
}

export default function ResultCard({
  isDarkMode = false,
  status = "success",
  errorMessage,
  networkFeePercent = PROTOCOL_FEE_DISPLAY,
  networkFeeAmount = "0 NOCK",
  totalUsd = "",
  totalNock = "0 NOCK",
  receivingAddress = "",
  fullReceivingAddress,
  transactionId = "",
  fullTransactionId,
  onHomeClick,
  onInspectMetadata,
  onConfirm,
  preview,
  bridgeStatus,
}: ResultCardProps) {
  const [copied, setCopied] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const isMobile = useIsMobile();

  const isSuccess = status === "success";
  const isConfirming = status === "confirming";
  const theme = getCardTheme(isDarkMode);

  // Calculate bridge fee for confirming state
  const calculateBridgeFee = (): string => {
    if (!preview) return "0 NOCK";
    const bridgeFeeNicks =
      (preview.amountInNicks * BigInt(PROTOCOL_FEE_BPS)) / 10000n;
    const bridgeFeeNock = Number(bridgeFeeNicks) / NOCK_TO_NICKS;
    return `${formatNOCK(bridgeFeeNock)} NOCK`;
  };

  // Calculate amount after bridge fee deduction
  const calculateAmountAfterBridgeFee = (): string => {
    if (!preview) return totalNock;
    const bridgeFeeNicks =
      (preview.amountInNicks * BigInt(PROTOCOL_FEE_BPS)) / 10000n;
    const amountAfterFee = preview.amountInNicks - bridgeFeeNicks;
    const amountNock = Number(amountAfterFee) / NOCK_TO_NICKS;
    return `${formatNOCK(amountNock)} NOCK`;
  };

  // Get reconstructed address from belts for verification
  const getReconstructedAddress = (): string => {
    if (!preview?.belts) return "";
    try {
      return beltsToEvmAddress(
        preview.belts[0],
        preview.belts[1],
        preview.belts[2]
      );
    } catch {
      return "Error reconstructing";
    }
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
    if (txId) {
      window.open(`https://nockscan.net/tx/${txId}`, "_blank");
    }
  };

  const handleInspectMetadata = async () => {
    if (!onInspectMetadata) return;
    setInspecting(true);
    try {
      await onInspectMetadata();
    } finally {
      setInspecting(false);
    }
  };

  const handleDownloadTransaction = () => {
    if (!preview?.jammedNoteData) return;

    // Download raw jammed bytes (copy to new ArrayBuffer for Blob compatibility)
    const buffer = new ArrayBuffer(preview.jammedNoteData.length);
    new Uint8Array(buffer).set(preview.jammedNoteData);
    const blob = new Blob([buffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bridge-note-${Date.now()}.jam`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
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
        {!isConfirming && (
          <img
            src={isSuccess ? ASSETS.txnSuccess : ASSETS.txnFail}
            alt={isSuccess ? "Success" : "Failed"}
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
            {isConfirming
              ? "Confirm Transaction"
              : isSuccess
              ? "Success"
              : "Failed"}
          </span>
          {!isSuccess && !isConfirming && errorMessage && (
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
                textAlign: isMobile ? "left" : "center",
              }}
            >
              {errorMessage}
            </span>
          )}
        </div>
      </div>

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
              <img
                src={ASSETS.nockToken}
                alt="NOCK"
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
                  background: "#1a1a1a",
                }}
              >
                <img
                  src={ASSETS.nockchainIcon}
                  alt="Nockchain"
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
                Nockchain
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
            <img
              src="/assets/chevron.svg"
              alt="Arrow"
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
                Base
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
              <img
                src={ASSETS.nockToken}
                alt="NOCK"
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
                  background: "#fff",
                }}
              >
                <img
                  src={ASSETS.baseLogo}
                  alt="Base"
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
              {isConfirming ? calculateBridgeFee() : calculateBridgeFee()}
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
              You will receive
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
              <img
                src={ASSETS.baseLogo}
                alt="Base"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            </div>
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
              <img
                src="/assets/copy-icon.svg"
                alt="Copy"
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
                <img
                  src="/assets/external-link-icon.svg"
                  alt="External link"
                  style={{
                    width: 16,
                    height: 16,
                  }}
                />
              </button>
            </div>
          </div>
        )}

        {/* Note Data section - only show for confirming */}
        {isConfirming && preview && (
          <div
            style={{
              display: "flex",
              padding: isMobile ? 12 : 16,
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 8,
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
                fontWeight: 600,
                lineHeight: "22px",
              }}
            >
              Note Data
            </span>
            {[
              { label: "Key", value: "%bridge" },
              { label: "Version", value: "0" },
              { label: "Chain", value: "%base (0x65736162)" },
              { label: "Belt 1", value: `0x${preview.belts[0].toString(16)}` },
              { label: "Belt 2", value: `0x${preview.belts[1].toString(16)}` },
              { label: "Belt 3", value: `0x${preview.belts[2].toString(16)}` },
              { label: "Reconstructed", value: getReconstructedAddress() },
              { label: "Notes used", value: preview.notesUsed.toString() },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  width: "100%",
                }}
              >
                <span
                  style={{
                    color: theme.textPrimary,
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 13,
                    opacity: 0.7,
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    color: theme.textPrimary,
                    fontFamily: "monospace",
                    fontSize: 12,
                    opacity: 0.9,
                    maxWidth: "60%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {value}
                </span>
              </div>
            ))}
            {/* Download button */}
            <button
              onClick={handleDownloadTransaction}
              style={{
                display: "flex",
                width: "100%",
                height: 36,
                padding: "8px 12px",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
                borderRadius: 6,
                background: "transparent",
                border: `1px solid ${theme.cardBorder}`,
                cursor: "pointer",
                boxSizing: "border-box",
                marginTop: 4,
              }}
            >
              <span
                style={{
                  color: theme.textPrimary,
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 13,
                  fontWeight: 500,
                  opacity: 0.7,
                }}
              >
                Download Transaction
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Debug: Inspect Metadata button - commented out for production
      {isSuccess && onInspectMetadata && (
        <button
          onClick={handleInspectMetadata}
          disabled={inspecting}
          style={{
            display: "flex",
            width: "100%",
            height: 44,
            padding: "12px 20px",
            justifyContent: "center",
            alignItems: "center",
            gap: 10,
            borderRadius: 8,
            background: "transparent",
            border: `1px solid ${theme.cardBorder}`,
            cursor: inspecting ? "wait" : "pointer",
            boxSizing: "border-box",
            opacity: inspecting ? 0.6 : 1,
          }}
        >
          <span
            style={{
              color: theme.textPrimary,
              textAlign: "center",
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 14,
              fontStyle: "normal",
              fontWeight: 500,
              lineHeight: "20px",
              letterSpacing: 0.14,
              opacity: 0.7,
            }}
          >
            {inspecting ? "Inspecting..." : "Inspect Bridge Metadata (Debug)"}
          </span>
        </button>
      )}
      */}

      {/* Buttons section */}
      {isConfirming ? (
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
            disabled={
              bridgeStatus === "awaiting_signature" ||
              bridgeStatus === "pending"
            }
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
                bridgeStatus === "awaiting_signature" ||
                bridgeStatus === "pending"
                  ? "#f6f5f1"
                  : "#ffc413",
              border: "none",
              cursor:
                bridgeStatus === "awaiting_signature" ||
                bridgeStatus === "pending"
                  ? "wait"
                  : "pointer",
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
                opacity:
                  bridgeStatus === "awaiting_signature" ||
                  bridgeStatus === "pending"
                    ? 0.4
                    : 1,
              }}
            >
              {bridgeStatus === "awaiting_signature"
                ? "Approve in Wallet..."
                : bridgeStatus === "pending"
                ? "Processing..."
                : "Confirm"}
            </span>
          </button>
        </div>
      ) : (
        <button
          onClick={onHomeClick}
          style={{
            display: "flex",
            width: "100%",
            height: 56,
            padding: "17px 20px",
            justifyContent: "center",
            alignItems: "center",
            gap: 10,
            borderRadius: 8,
            background: "#ffc413",
            border: "none",
            cursor: "pointer",
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
            Back to home
          </span>
        </button>
      )}
    </div>
  );
}
