"use client";

import { useState } from "react";
import Image from "next/image";
import { usePrice } from "@/hooks/usePrice";
import { useWallet } from "@/hooks/useWallet";
import { useSwapForm } from "@/hooks/useSwapForm";
import {
  useBridge,
  TransactionPreview,
  BridgeStatus,
} from "@/hooks/useBridge";
import {
  NOCK_COINGECKO_ID,
  ASSETS,
  IRIS_CHROME_STORE_URL,
  PROTOCOL_FEE_DISPLAY,
  MIN_BRIDGE_AMOUNT_NOCK,
} from "@/lib/constants";
import { isNockAddress, isEvmAddress } from "@/lib/validators";
import { getSwapCardTheme } from "@/lib/theme";
import { Skeleton } from "@/components/ui/Skeleton";
import { parseAmount } from "@/lib/utils";

interface SwapCardProps {
  isDarkMode?: boolean;
  onSwapError?: (error: string) => void;
  onPrepareSuccess?: (preview: TransactionPreview) => void;
  prepareTransaction: (
    destinationAddress: string,
    amountInNocks: number
  ) => Promise<TransactionPreview>;
  bridgeStatus: BridgeStatus;
}

export default function SwapCard({
  isDarkMode = false,
  onSwapError,
  onPrepareSuccess,
  prepareTransaction,
  bridgeStatus,
}: SwapCardProps) {
  const [receivingAddress, setReceivingAddress] = useState("");
  // Currently only supports Nockchain -> Base direction
  const isNockchainToBase = true;
  const [showAddressError, setShowAddressError] = useState(false);
  const [showAmountError, setShowAmountError] = useState(false);

  // Fetch NOCK price from CoinGecko
  const { data: priceData, isLoading: isPriceLoading } =
    usePrice(NOCK_COINGECKO_ID);
  const nockPrice = priceData?.usd ?? 0;

  // Swap form state and handlers
  const {
    fromAmount,
    toAmount,
    setFromAmount,
    setToAmount,
    isFromUsdMode,
    isToUsdMode,
    handleFromAmountChange,
    handleToAmountChange,
    handleFromToggle,
    handleToToggle,
    handleAmountBlur,
    fromSecondary,
    toSecondary,
  } = useSwapForm({ nockPrice });

  // Wallet connection
  const { isInstalled, isConnected, isConnecting, connect } = useWallet();

  // Bridge configuration check
  const { isBridgeConfigured } = useBridge();

  // Balance check not currently doable
  // const hasInsufficientFunds = fromAmount.trim().length > 0 && parseAmount(fromAmount) > balance;
  const hasInsufficientFunds = false;

  // Check if amount is below minimum bridge amount
  const parsedFromAmount = parseAmount(fromAmount);
  // Convert to NOCK if in USD mode
  const amountInNock =
    isFromUsdMode && nockPrice > 0
      ? parsedFromAmount / nockPrice
      : parsedFromAmount;
  const isBelowMinimum =
    fromAmount.trim().length > 0 &&
    amountInNock > 0 &&
    amountInNock < MIN_BRIDGE_AMOUNT_NOCK;

  // Address validation
  const isAddressValid =
    receivingAddress.trim().length === 0
      ? null // No validation state when empty
      : isNockchainToBase
      ? isEvmAddress(receivingAddress) // Receiving on Base needs EVM address
      : isNockAddress(receivingAddress); // Receiving on Nockchain needs Nock address

  const theme = getSwapCardTheme(isDarkMode);

  const handleSwap = async () => {
    // Validate address before proceeding
    if (isAddressValid === false || receivingAddress.trim().length === 0) {
      setShowAddressError(true);
      return;
    }

    // Get the amount in NOCK (convert from USD if needed)
    const nockAmount = isFromUsdMode
      ? parseAmount(fromAmount) / nockPrice
      : parseAmount(fromAmount);

    if (nockAmount <= 0) {
      return;
    }

    try {
      // Prepare transaction and show confirmation screen
      const preview = await prepareTransaction(receivingAddress, nockAmount);
      if (preview && onPrepareSuccess) {
        onPrepareSuccess(preview);
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to prepare transaction";
      if (onSwapError) {
        onSwapError(errorMessage);
      }
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
        width: "100%",
        maxWidth: 480,
        minHeight: 546,
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
              border:
                hasInsufficientFunds || (showAmountError && isBelowMinimum)
                  ? `1px solid ${theme.error}`
                  : "none",
              boxShadow:
                hasInsufficientFunds || (showAmountError && isBelowMinimum)
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
                {isFromUsdMode && (
                  <span
                    style={{
                      fontFamily: "var(--font-lora), serif",
                      fontSize: 36,
                      fontWeight: 600,
                      lineHeight: "40px",
                      letterSpacing: -1.44,
                      color: theme.textPrimary,
                      opacity: fromAmount ? 1 : 0.4,
                    }}
                  >
                    $
                  </span>
                )}
                <input
                  type="text"
                  value={fromAmount}
                  onChange={(e) => {
                    handleFromAmountChange(e.target.value);
                    setShowAmountError(false);
                  }}
                  onBlur={() => {
                    handleAmountBlur(fromAmount, setFromAmount);
                    if (isBelowMinimum) setShowAmountError(true);
                  }}
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
                    <Image
                      src={ASSETS.nockToken}
                      alt="NOCK"
                      width={40}
                      height={40}
                      style={{
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
                      <Image
                        src={ASSETS.nockchainIcon}
                        alt="Nockchain"
                        width={18}
                        height={18}
                        style={{
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
                <button
                  onClick={handleFromToggle}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
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
                      fromSecondary
                    )}
                  </span>
                  <Image
                    src={ASSETS.upDownArrows2}
                    alt="Toggle USD/NOCK"
                    width={14}
                    height={14}
                    style={{
                      opacity: 0.5,
                    }}
                  />
                </button>
                {showAmountError && isBelowMinimum && (
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
                    Minimum {MIN_BRIDGE_AMOUNT_NOCK.toLocaleString()} NOCK
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Swap direction indicator (disabled - one-way only for now) */}
          <div
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
            <Image
              src={ASSETS.downArrow}
              alt="To"
              width={24}
              height={24}
              style={{
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
                {isToUsdMode && (
                  <span
                    style={{
                      fontFamily: "var(--font-lora), serif",
                      fontSize: 36,
                      fontWeight: 600,
                      lineHeight: "40px",
                      letterSpacing: -1.44,
                      color: theme.textPrimary,
                      opacity: toAmount ? 1 : 0.4,
                    }}
                  >
                    $
                  </span>
                )}
                <input
                  type="text"
                  value={toAmount}
                  onChange={(e) => handleToAmountChange(e.target.value)}
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
                    <Image
                      src={ASSETS.nockToken}
                      alt="NOCK"
                      width={40}
                      height={40}
                      style={{
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
                      <Image
                        src={ASSETS.baseLogo}
                        alt="Base"
                        width={18}
                        height={18}
                        style={{
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
                <button
                  onClick={handleToToggle}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
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
                      toSecondary
                    )}
                  </span>
                  <Image
                    src={ASSETS.upDownArrows2}
                    alt="Toggle USD/NOCK"
                    width={14}
                    height={14}
                    style={{
                      opacity: 0.5,
                    }}
                  />
                </button>
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
                  Bridge fee {PROTOCOL_FEE_DISPLAY}
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
                      <Image
                        src={
                          isNockchainToBase
                            ? ASSETS.baseLogo
                            : ASSETS.nockchainIcon
                        }
                        alt={isNockchainToBase ? "Base" : "Nockchain"}
                        width={14}
                        height={14}
                        style={{
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

      {/* Bottom section: Terms and CTA Button */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          width: "100%",
          paddingTop: 12,
        }}
      >
        {/* Terms and Privacy */}
        <div
          style={{
            width: "100%",
            fontFamily: "var(--font-inter), sans-serif",
            fontSize: 12,
            fontWeight: 400,
            lineHeight: "16px",
            letterSpacing: 0,
            color: theme.textPrimary,
            textAlign: "center",
            opacity: 0.5,
            padding: "0 20px",
          }}
        >
          By using NockSwap.io, you agree to our{" "}
          <a
            href="https://www.iriswallet.io/terms-of-use"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: theme.textPrimary,
              textDecoration: "underline",
            }}
          >
            Terms of Use
          </a>{" "}
          and{" "}
          <a
            href="https://www.iriswallet.io/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: theme.textPrimary,
              textDecoration: "underline",
            }}
          >
            Privacy Policy
          </a>
          .
        </div>

        {/* CTA Button */}
        {(() => {
        // Determine button state and text
        let buttonText = "Swap with Iris";
        let buttonAction: () => void = handleSwap;
        let isDisabled = false;
        let isLoading = false;

        // Bridge status takes priority when active
        if (bridgeStatus === "preparing") {
          buttonText = "Preparing...";
          isDisabled = true;
          isLoading = true;
        } else if (bridgeStatus === "pending") {
          buttonText = "Processing...";
          isDisabled = true;
          isLoading = true;
        } else if (bridgeStatus === "awaiting_signature") {
          buttonText = "Approve in Wallet...";
          isDisabled = true;
          isLoading = true;
        } else if (!isInstalled) {
          buttonText = "Install Iris Wallet";
          buttonAction = () => {
            window.open(IRIS_CHROME_STORE_URL, "_blank");
          };
        } else if (!isConnected) {
          buttonText = isConnecting ? "Connecting..." : "Connect Wallet";
          buttonAction = connect;
          isDisabled = isConnecting;
        } else if (!isBridgeConfigured) {
          buttonText = "Bridge Error";
          isDisabled = true;
        } else {
          // Connected - check if form is complete
          const hasAmount = fromAmount.trim().length > 0;
          const hasAddress = receivingAddress.trim().length > 0;
          isDisabled = !hasAmount || !hasAddress || isBelowMinimum;
        }

        return (
          <button
            onClick={buttonAction}
            disabled={isDisabled || isLoading}
            style={{
              display: "flex",
              width: "100%",
              height: 56,
              padding: "17px 20px",
              justifyContent: "center",
              alignItems: "center",
              gap: 10,
              borderRadius: 8,
              background: isDisabled || isLoading ? "#f6f5f1" : "#ffc413",
              border: "none",
              cursor: isDisabled || isLoading ? "auto" : "pointer",
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
                opacity: isDisabled || isLoading ? 0.4 : 1,
              }}
            >
              {buttonText}
            </span>
          </button>
        );
      })()}
      </div>
    </div>
  );
}
