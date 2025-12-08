"use client";

import { useState } from "react";
import { usePrice } from "@/hooks/usePrice";
import { NOCK_COINGECKO_ID, ASSETS } from "@/lib/constants";
import { isNockAddress, isEvmAddress } from "@/lib/validators";
import { calcUSD, parseAmount, formatWithCommas } from "@/lib/utils";
import { getSwapCardTheme } from "@/lib/theme";
import { Skeleton } from "@/components/ui/Skeleton";

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
  // true = Nockchain -> Base, false = Base -> Nockchain
  const [isNockchainToBase, setIsNockchainToBase] = useState(true);
  const [showAddressError, setShowAddressError] = useState(false);
  const [rotation, setRotation] = useState(0);

  // Fetch NOCK price from CoinGecko
  const { data: priceData, isLoading: isPriceLoading } =
    usePrice(NOCK_COINGECKO_ID);
  const nockPrice = priceData?.usd ?? 0;

  // Calculate USD values from amounts
  const fromUSD = calcUSD(parseAmount(fromAmount), nockPrice);
  const toUSD = calcUSD(parseAmount(toAmount), nockPrice);

  // Balance check
  // TODO: replace with actual wallet balance)
  const balance = 50000;
  const hasInsufficientFunds =
    fromAmount.trim().length > 0 && parseAmount(fromAmount) > balance;

  // Address validation
  const isAddressValid =
    receivingAddress.trim().length === 0
      ? null // No validation state when empty
      : isNockchainToBase
      ? isEvmAddress(receivingAddress) // Receiving on Base needs EVM address
      : isNockAddress(receivingAddress); // Receiving on Nockchain needs Nock address

  // Handle input change - allow typing with or without commas
  const handleAmountChange = (value: string, setter: (val: string) => void) => {
    // Allow numbers, commas, and one decimal point
    const cleaned = value.replace(/[^0-9.,]/g, "");
    setter(cleaned);
  };

  // Format on blur
  const handleAmountBlur = (value: string, setter: (val: string) => void) => {
    if (value) {
      setter(formatWithCommas(value));
    }
  };

  const theme = getSwapCardTheme(isDarkMode);

  const handleSwapDirection = () => {
    setRotation((prev) => prev + 180);

    const temp = fromAmount;
    setFromAmount(toAmount);
    setToAmount(temp);
    setIsNockchainToBase(!isNockchainToBase);
    setReceivingAddress(""); // Clear address when direction changes
    setShowAddressError(false);
  };

  const handleMaxClick = () => {
    setFromAmount("50,352.49");
  };

  const handleSwap = () => {
    // Validate address before proceeding
    if (isAddressValid === false || receivingAddress.trim().length === 0) {
      setShowAddressError(true);
      return;
    }

    console.log("Swap initiated");
    if (onSwapSuccess) {
      onSwapSuccess();
    }
  };

  const handleAddressChange = (value: string) => {
    setReceivingAddress(value);
    setShowAddressError(false); // Clear error when user starts typing
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
              border: hasInsufficientFunds
                ? `1px solid ${theme.error}`
                : "none",
              boxShadow: hasInsufficientFunds
                ? `0px 0px 0px 3px ${theme.errorGlow}`
                : "none",
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
                  onChange={(e) =>
                    handleAmountChange(e.target.value, setFromAmount)
                  }
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
                    ≈
                    {isPriceLoading ? (
                      <Skeleton isDarkMode={isDarkMode} />
                    ) : (
                      fromUSD
                    )}
                  </span>
                  {/* TODO: replace with <Image/> ?*/}
                  <img
                    src={ASSETS.upDownArrows2}
                    alt="Price change"
                    style={{
                      width: 14,
                      height: 14,
                      opacity: 0.5,
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    minHeight: 23,
                  }}
                >
                  {hasInsufficientFunds ? (
                    <span
                      style={{
                        color: theme.error,
                        textAlign: "right",
                        fontFamily: "var(--font-inter), sans-serif",
                        fontSize: 13,
                        fontStyle: "normal",
                        fontWeight: 500,
                        lineHeight: "15px",
                        letterSpacing: 0.13,
                      }}
                    >
                      Insufficient funds
                    </span>
                  ) : (
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
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
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Swap direction indicator (disabled - one-way only for now) */}
          <div
            // onClick={handleSwapDirection}
            style={{
              display: "flex",
              padding: 8,
              alignItems: "center",
              gap: 4,
              borderRadius: 32,
              background: theme.swapButtonBg,
              border: "none",
            }}
          >
            <img
              src={ASSETS.downArrow}
              alt="To"
              style={{
                width: 24,
                height: 24,
                filter: isDarkMode ? "invert(1)" : "none",
              }}
            />
          </div>

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
                  onChange={(e) =>
                    handleAmountChange(e.target.value, setToAmount)
                  }
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
                    ≈
                    {isPriceLoading ? (
                      <Skeleton isDarkMode={isDarkMode} />
                    ) : (
                      toUSD
                    )}
                  </span>
                  <img
                    src={ASSETS.upDownArrows2}
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
                border: showAddressError ? `1px solid ${theme.error}` : "none",
                boxShadow: showAddressError
                  ? `0px 0px 0px 3px ${theme.errorGlow}`
                  : "none",
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
                {showAddressError ? (
                  <span
                    style={{
                      color: theme.error,
                      textAlign: "right",
                      fontFamily: "var(--font-inter), sans-serif",
                      fontSize: 13,
                      fontStyle: "normal",
                      fontWeight: 500,
                      lineHeight: "15px",
                      letterSpacing: 0.13,
                    }}
                  >
                    {isNockchainToBase
                      ? "Enter a valid Base address"
                      : "Enter a valid Nockchain address"}
                  </span>
                ) : (
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
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
                      {isNockchainToBase ? "Base" : "Nockchain"}
                    </span>
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 32,
                        overflow: "hidden",
                        border: `2px solid ${theme.networkBadgeBorder}`,
                        boxSizing: "border-box",
                        background: isNockchainToBase ? "#fff" : "#1a1a1a",
                      }}
                    >
                      {/* TODO change to <Image /> ? */}
                      <img
                        src={
                          isNockchainToBase
                            ? ASSETS.baseLogo
                            : ASSETS.nockchainIcon
                        }
                        alt={isNockchainToBase ? "Base" : "Nockchain"}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <input
                type="text"
                value={receivingAddress}
                onChange={(e) => handleAddressChange(e.target.value)}
                placeholder={
                  isNockchainToBase
                    ? "Enter your Base wallet address"
                    : "Enter your Nockchain address"
                }
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
      {(() => {
        return (
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
        );
      })()}
    </div>
  );
}
