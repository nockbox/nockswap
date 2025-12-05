"use client";

import { useState } from "react";
import { usePrice, formatUSD } from "@/hooks/usePrice";
import { NOCK_COINGECKO_ID } from "@/lib/constants";

const imgNockToken = "/assets/nock-token.png";
const imgBaseLogo = "/assets/base-logo-v2.svg";
const imgNockchainIcon = "/assets/nockchain-icon.svg";

function PriceSkeleton({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 60,
        height: 15,
        borderRadius: 4,
        background: isDarkMode
          ? "linear-gradient(90deg, #333 25%, #444 50%, #333 75%)"
          : "linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite",
      }}
    />
  );
}

interface SwapCardProps {
  isDarkMode?: boolean;
  onSwapSuccess?: () => void;
}

export default function SwapCard({
  isDarkMode = false,
  onSwapSuccess,
}: SwapCardProps) {
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [receivingAddress, setReceivingAddress] = useState("");

  // Fetch NOCK price from CoinGecko
  const { data: priceData, isLoading: isPriceLoading } = usePrice(NOCK_COINGECKO_ID);
  const nockPrice = priceData?.usd ?? 0;

  // Calculate USD values from amounts
  const parseAmount = (value: string): number => {
    const cleaned = value.replace(/,/g, "");
    return parseFloat(cleaned) || 0;
  };

  const fromUSD = formatUSD(parseAmount(fromAmount), nockPrice);
  const toUSD = formatUSD(parseAmount(toAmount), nockPrice);

  // Format number with commas
  const formatWithCommas = (value: string): string => {
    // Remove existing commas and non-numeric chars except decimal
    const cleaned = value.replace(/[^0-9.]/g, "");
    if (!cleaned) return "";

    const parts = cleaned.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
  };

  // Handle input change - allow typing with or without commas
  const handleAmountChange = (
    value: string,
    setter: (val: string) => void
  ) => {
    // Allow numbers, commas, and one decimal point
    const cleaned = value.replace(/[^0-9.,]/g, "");
    setter(cleaned);
  };

  // Format on blur
  const handleAmountBlur = (
    value: string,
    setter: (val: string) => void
  ) => {
    if (value) {
      setter(formatWithCommas(value));
    }
  };

  // Theme colors
  const theme = {
    cardBg: isDarkMode ? "#101010" : "#fff",
    cardBorder: isDarkMode ? "#171717" : "#ededed",
    sectionBg: isDarkMode ? "#171717" : "#f6f5f1",
    inputBg: isDarkMode ? "#000" : "#fff",
    textPrimary: isDarkMode ? "#fff" : "#000",
    maxButtonBorder: isDarkMode ? "#222" : "#e4e3dd",
    swapButtonBg: isDarkMode ? "#fff" : "#000",
    swapButtonIcon: isDarkMode ? "#000" : "#fff",
    networkBadgeBorder: isDarkMode ? "#171717" : "#f6f5f1",
  };

  const handleSwapDirection = () => {
    const temp = fromAmount;
    setFromAmount(toAmount);
    setToAmount(temp);
  };

  const handleMaxClick = () => {
    setFromAmount("50,352.49");
  };

  const handleSwap = () => {
    console.log("Swap initiated");
    if (onSwapSuccess) {
      onSwapSuccess();
    }
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
      }}
    >
      {/* Top content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          width: "100%",
        }}
      >
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
          }}
        >
          Swap
        </div>

        {/* Input sections */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            width: "100%",
          }}
        >
          {/* FROM input wrapper */}
          <div
            style={{
              display: "flex",
              padding: 4,
              alignItems: "center",
              gap: 4,
              width: "100%",
              borderRadius: 12,
              background: theme.sectionBg,
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                display: "flex",
                padding: 16,
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 10,
                width: "100%",
                borderRadius: 8,
                background: theme.inputBg,
                boxSizing: "border-box",
                overflow: "hidden",
              }}
            >
              {/* Amount row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  width: "100%",
                }}
              >
                <input
                  type="text"
                  value={fromAmount}
                  onChange={(e) => handleAmountChange(e.target.value, setFromAmount)}
                  onBlur={() => handleAmountBlur(fromAmount, setFromAmount)}
                  placeholder="0"
                  style={{
                    fontFamily: "var(--font-lora), serif",
                    fontSize: 36,
                    fontWeight: 600,
                    lineHeight: "40px",
                    letterSpacing: -1.44,
                    color: theme.textPrimary,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    flex: "1 1 0",
                    minWidth: 0,
                    width: 0,
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      justifyContent: "center",
                      color: theme.textPrimary,
                      textAlign: "right",
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
                      }}
                    >
                      Nockchain
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
                        width: 18,
                        height: 18,
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
                </div>
              </div>
              {/* Info row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  width: "100%",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
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
                    ≈{isPriceLoading ? <PriceSkeleton isDarkMode={isDarkMode} /> : fromUSD}
                  </span>
                  <img
                    src="/assets/up-down-arrows-2.svg"
                    alt="Price change"
                    style={{
                      width: 14,
                      height: 14,
                      opacity: 0.5,
                    }}
                  />
                </div>
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
                      opacity: 0.5,
                    }}
                  >
                    Balance: 50,352.49
                  </span>
                  <button
                    onClick={handleMaxClick}
                    style={{
                      display: "flex",
                      width: 39,
                      padding: "4px 8px",
                      justifyContent: "center",
                      alignItems: "center",
                      borderRadius: 32,
                      border: `1px solid ${theme.maxButtonBorder}`,
                      background: "transparent",
                      cursor: "pointer",
                      boxSizing: "border-box",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-inter), sans-serif",
                        fontSize: 13,
                        fontStyle: "normal",
                        fontWeight: 500,
                        lineHeight: "15px",
                        letterSpacing: 0.13,
                        color: theme.textPrimary,
                        textAlign: "center",
                      }}
                    >
                      Max
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Swap direction button */}
          <button
            onClick={handleSwapDirection}
            style={{
              display: "flex",
              padding: 8,
              alignItems: "center",
              gap: 4,
              borderRadius: 32,
              background: theme.swapButtonBg,
              border: "none",
              cursor: "pointer",
            }}
          >
            <img
              src="/assets/up-down-arrows.svg"
              alt="Swap"
              style={{
                width: 24,
                height: 24,
                filter: isDarkMode ? "invert(1)" : "none",
              }}
            />
          </button>

          {/* TO input wrapper + Receiving address */}
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
            {/* TO input */}
            <div
              style={{
                display: "flex",
                padding: 16,
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 14,
                width: "100%",
                borderRadius: 8,
                background: theme.inputBg,
                boxSizing: "border-box",
              }}
            >
              {/* Amount row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  width: "100%",
                }}
              >
                <input
                  type="text"
                  value={toAmount}
                  onChange={(e) => handleAmountChange(e.target.value, setToAmount)}
                  onBlur={() => handleAmountBlur(toAmount, setToAmount)}
                  placeholder="0"
                  style={{
                    fontFamily: "var(--font-lora), serif",
                    fontSize: 36,
                    fontWeight: 600,
                    lineHeight: "40px",
                    letterSpacing: -1.44,
                    color: theme.textPrimary,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    flex: "1 1 0",
                    minWidth: 0,
                    width: 0,
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      justifyContent: "center",
                      color: theme.textPrimary,
                      textAlign: "right",
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
                        width: 18,
                        height: 18,
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
              {/* Info row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  width: "100%",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
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
                    ≈{isPriceLoading ? <PriceSkeleton isDarkMode={isDarkMode} /> : toUSD}
                  </span>
                  <img
                    src="/assets/up-down-arrows-2.svg"
                    alt="Price change"
                    style={{
                      width: 14,
                      height: 14,
                      opacity: 0.5,
                    }}
                  />
                </div>
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
                  Net fee: 0.5% included
                </span>
              </div>
            </div>

            {/* Receiving address */}
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
                      border: `2px solid ${theme.networkBadgeBorder}`,
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
              <input
                type="text"
                value={receivingAddress}
                onChange={(e) => setReceivingAddress(e.target.value)}
                placeholder="Enter your Base wallet address"
                className="address-input"
                style={{
                  width: "100%",
                  color: theme.textPrimary,
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: 15,
                  fontStyle: "normal",
                  fontWeight: 500,
                  lineHeight: "22px",
                  letterSpacing: 0.15,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  padding: 0,
                  margin: 0,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* CTA Button */}
      <button
        onClick={handleSwap}
        style={{
          display: "flex",
          width: 440,
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
          Swap with Iris
        </span>
      </button>
    </div>
  );
}
