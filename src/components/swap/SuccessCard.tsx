"use client";

import { useState } from "react";

const imgNockToken = "/assets/nock-token.png";
const imgBaseLogo = "/assets/base-logo-v2.svg";
const imgNockchainIcon = "/assets/nockchain-icon.svg";

interface SuccessCardProps {
  isDarkMode?: boolean;
  fromAmount?: string;
  toAmount?: string;
  networkFeePercent?: string;
  networkFeeAmount?: string;
  totalUsd?: string;
  totalNock?: string;
  receivingAddress?: string;
  transactionId?: string;
  onHomeClick?: () => void;
}

export default function SuccessCard({
  isDarkMode = false,
  fromAmount = "100,000",
  toAmount = "99,500",
  networkFeePercent = "0.5%",
  networkFeeAmount = "500 NOCK",
  totalUsd = "≈$4,996.85",
  totalNock = "99,500 NOCK",
  receivingAddress = "Ma5JW5EKUx1cL6...2Nm9qh018rnncJKQ5xgqDnal5",
  transactionId = "0xaa1...51a7d",
  onHomeClick,
}: SuccessCardProps) {
  const [copied, setCopied] = useState(false);

  // Theme colors
  const theme = {
    cardBg: isDarkMode ? "#101010" : "#fff",
    cardBorder: isDarkMode ? "#171717" : "#ededed",
    sectionBg: isDarkMode ? "#171717" : "#f6f5f1",
    innerBg: isDarkMode ? "#000" : "#fff",
    textPrimary: isDarkMode ? "#fff" : "#000",
    pillBorder: isDarkMode ? "#222" : "#f6f5f1",
    networkBadgeBorder: isDarkMode ? "#171717" : "#f6f5f1",
    buttonBorder: isDarkMode ? "#252525" : "#e4e3dd",
    iconButtonBg: isDarkMode ? "#171717" : "#f6f5f1",
  };

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(receivingAddress);
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

  return (
    <div
      style={{
        display: "flex",
        width: 480,
        height: 546,
        padding: 20,
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "center",
        borderRadius: 16,
        border: `1px solid ${theme.cardBorder}`,
        background: theme.cardBg,
        boxSizing: "border-box",
        overflow: "clip",
        position: "relative",
      }}
    >
      {/* Home button */}
      <button
        onClick={onHomeClick}
        style={{
          position: "absolute",
          top: 19,
          right: 19,
          display: "flex",
          padding: "9px 14px",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          borderRadius: 32,
          border: `1px solid ${theme.buttonBorder}`,
          background: "transparent",
          cursor: "pointer",
          boxSizing: "border-box",
        }}
      >
        <span
          style={{
            color: theme.textPrimary,
            textAlign: "center",
            fontFamily: "var(--font-inter), sans-serif",
            fontSize: 15,
            fontStyle: "normal",
            fontWeight: 500,
            lineHeight: "22px",
            letterSpacing: 0.15,
          }}
        >
          Home
        </span>
      </button>

      {/* Top content - Success icon and title */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          width: "100%",
        }}
      >
        {/* Success checkmark */}
        <img
          src="/assets/success-image.svg"
          alt="Success"
          style={{
            width: 104,
            height: 104,
          }}
        />

        {/* Title */}
        <div
          style={{
            width: "100%",
            fontFamily: "var(--font-lora), serif",
            fontSize: 36,
            fontWeight: 600,
            lineHeight: "40px",
            letterSpacing: -0.72,
            color: theme.textPrimary,
            textAlign: "center",
          }}
        >
          Success
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
            background: theme.innerBg,
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
                src={imgNockToken}
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
                  src={imgNockchainIcon}
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
                src={imgNockToken}
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
                  src={imgBaseLogo}
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
            background: theme.innerBg,
            boxSizing: "border-box",
          }}
        >
          {/* Network fee row */}
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
              Network fee
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  display: "flex",
                  padding: "3px 6px",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 32,
                  border: `1px solid ${theme.pillBorder}`,
                  boxSizing: "border-box",
                }}
              >
                <span
                  style={{
                    color: theme.textPrimary,
                    textAlign: "center",
                    fontFamily: "var(--font-inter), sans-serif",
                    fontSize: 13,
                    fontStyle: "normal",
                    fontWeight: 500,
                    lineHeight: "15px",
                    letterSpacing: 0.13,
                    opacity: 0.5,
                  }}
                >
                  {networkFeePercent}
                </span>
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
                  opacity: 0.5,
                }}
              >
                {networkFeeAmount}
              </span>
            </div>
          </div>

          {/* Total row */}
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
              Total to be deposited
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  display: "flex",
                  padding: "3px 6px",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 32,
                  border: `1px solid ${theme.pillBorder}`,
                  boxSizing: "border-box",
                }}
              >
                <span
                  style={{
                    color: theme.textPrimary,
                    textAlign: "center",
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
            </div>
          </div>
        </div>

        {/* Receiving address section */}
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
            background: theme.innerBg,
            boxSizing: "border-box",
          }}
        >
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
              Receiving address
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                }}
              >
                Base
              </span>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 32,
                  overflow: "hidden",
                }}
              >
                <img
                  src={imgBaseLogo}
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
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              gap: 8,
              width: "100%",
            }}
          >
            <span
              style={{
                flex: "1 1 0",
                minWidth: 0,
                color: theme.textPrimary,
                fontFamily: "var(--font-inter), sans-serif",
                fontSize: 15,
                fontStyle: "normal",
                fontWeight: 500,
                lineHeight: "22px",
                letterSpacing: 0.15,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
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
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "center",
            gap: 12,
            width: "100%",
            borderRadius: 8,
            background: theme.innerBg,
            boxSizing: "border-box",
          }}
        >
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
                flex: "1 1 0",
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
      </div>
    </div>
  );
}
