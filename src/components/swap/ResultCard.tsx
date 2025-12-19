"use client";

import { useState } from "react";
import { ASSETS, PROTOCOL_FEE_DISPLAY } from "@/lib/constants";
import { getCardTheme } from "@/lib/theme";

type ResultStatus = "success" | "failed";

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
  onHomeClick?: () => void;
  onInspectMetadata?: () => Promise<void>;
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
  onHomeClick,
  onInspectMetadata,
}: ResultCardProps) {
  const [copied, setCopied] = useState(false);
  const [inspecting, setInspecting] = useState(false);

  const isSuccess = status === "success";
  const theme = getCardTheme(isDarkMode);

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
    // In real app, this would open the block explorer
    console.log("Opening transaction:", transactionId);
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

  return (
    <div
      style={{
        display: "flex",
        width: 480,
        padding: 20,
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
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
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          width: "100%",
        }}
      >
        {/* Status icon */}
        <img
          src={isSuccess ? ASSETS.txnSuccess : ASSETS.txnFail}
          alt={isSuccess ? "Success" : "Failed"}
          style={{
            width: 64,
            height: 64,
          }}
        />

        {/* Title and subtitle */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-lora), serif",
              fontSize: 36,
              fontWeight: 600,
              lineHeight: "40px",
              letterSpacing: -0.72,
              color: theme.textPrimary,
              textAlign: "center",
            }}
          >
            {isSuccess ? "Success" : "Failed"}
          </span>
          {!isSuccess && (
            <span
              style={{
                color: theme.textPrimary,
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 15,
                fontStyle: "normal",
                fontWeight: 500,
                lineHeight: "22px",
                letterSpacing: 0.15,
                opacity: 0.5,
                textAlign: "center",
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
            padding: 16,
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
                  fontSize: 15,
                  fontStyle: "normal",
                  fontWeight: 500,
                  lineHeight: "22px",
                  letterSpacing: 0.15,
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
              padding: "8px 16px",
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
                  fontSize: 15,
                  fontStyle: "normal",
                  fontWeight: 500,
                  lineHeight: "22px",
                  letterSpacing: 0.15,
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
            padding: 16,
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "center",
            gap: 12,
            width: "100%",
            borderRadius: 8,
            background: theme.inputBg,
            boxSizing: "border-box",
          }}
        >
          {/* Bridge fee row */}
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
                fontSize: 15,
                fontStyle: "normal",
                fontWeight: 500,
                lineHeight: "22px",
                letterSpacing: 0.15,
                opacity: 0.5,
              }}
            >
              Bridge fee {networkFeePercent}
            </span>
            <span
              style={{
                color: theme.textPrimary,
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 15,
                fontStyle: "normal",
                fontWeight: 500,
                lineHeight: "22px",
                letterSpacing: 0.15,
                opacity: 0.5,
              }}
            >
              {networkFeeAmount}
            </span>
          </div>

          {/* You will receive row */}
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
                fontSize: 15,
                fontStyle: "normal",
                fontWeight: 500,
                lineHeight: "22px",
                letterSpacing: 0.15,
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
                  fontSize: 15,
                  fontStyle: "normal",
                  fontWeight: 500,
                  lineHeight: "22px",
                  letterSpacing: 0.15,
                }}
              >
                {totalNock}
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
                {totalUsd}
              </span>
            </div>
          </div>
        </div>

        {/* Receiving address section */}
        <div
          style={{
            display: "flex",
            padding: 16,
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
              fontSize: 15,
              fontStyle: "normal",
              fontWeight: 500,
              lineHeight: "22px",
              letterSpacing: 0.15,
              opacity: 0.5,
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
                fontSize: 15,
                fontStyle: "normal",
                fontWeight: 500,
                lineHeight: "22px",
                letterSpacing: 0.15,
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

        {/* Transaction ID section */}
        <div
          style={{
            display: "flex",
            padding: 16,
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
              fontSize: 15,
              fontStyle: "normal",
              fontWeight: 500,
              lineHeight: "22px",
              letterSpacing: 0.15,
              opacity: 0.5,
            }}
          >
            Transaction ID
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                color: theme.textPrimary,
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 15,
                fontStyle: "normal",
                fontWeight: 500,
                lineHeight: "22px",
                letterSpacing: 0.15,
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
      </div>

      {/* TODO: Remove, only for testing  */}
      {/* Debug: Inspect Metadata button */}
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

      {/* Back to home button */}
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
    </div>
  );
}
