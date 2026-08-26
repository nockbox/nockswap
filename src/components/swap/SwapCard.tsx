"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  useAccount,
  useBalance,
  useReadContract,
  useSwitchChain,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { usePrice } from "@/hooks/usePrice";
import { useWallet } from "@/hooks/useWallet";
import { useSwapForm } from "@/hooks/useSwapForm";
import {
  useBridge,
  TransactionPreview,
  BridgeStatus,
} from "@/hooks/useBridge";
import { useBaseToNockContractReadiness } from "@/hooks/useBaseToNockContractReadiness";
import {
  NOCK_COINGECKO_ID,
  ASSETS,
  IRIS_CHROME_STORE_URL,
  PROTOCOL_FEE_DISPLAY,
  MIN_BRIDGE_AMOUNT_NICKS,
  MIN_BRIDGE_AMOUNT_NOCK,
  BASE_TO_NOCK_WITHDRAWALS_ENABLED,
} from "@/lib/constants";
import { isNockAddress, isEvmAddress } from "@/lib/validators";
import { getSwapCardTheme } from "@/lib/theme";
import { Skeleton } from "@/components/ui/Skeleton";
import type { ExactNockAmount } from "@/lib/nockAmount";
import { resolveNockWithdrawalDestination } from "@/lib/nockToken";
import { getPreferredBridgeNetworkConfig } from "@/lib/bridgeNetworkConfig";

type SwapDirection = "nock_to_base" | "base_to_nock";

const erc20BalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

interface SwapCardProps {
  isDarkMode?: boolean;
  onSwapError?: (error: string) => void;
  onPrepareSuccess?: (preview: TransactionPreview) => void;
  onPrepareBurnSuccess?: (payload: {
    amount: ExactNockAmount;
    destinationNockAddress: string;
  }) => void;
  prepareTransaction: (
    destinationAddress: string,
    amountInNicks: bigint
  ) => Promise<TransactionPreview>;
  bridgeStatus: BridgeStatus;
}

export default function SwapCard({
  isDarkMode = false,
  onSwapError,
  onPrepareSuccess,
  onPrepareBurnSuccess,
  prepareTransaction,
  bridgeStatus,
}: SwapCardProps) {
  const [receivingAddress, setReceivingAddress] = useState("");
  const [direction, setDirection] =
    useState<SwapDirection>("nock_to_base");
  const isNockchainToBase = direction === "nock_to_base";
  const [showAddressError, setShowAddressError] = useState(false);
  const [showAmountError, setShowAmountError] = useState(false);

  // Fetch NOCK price from CoinGecko
  const { data: priceData, isLoading: isPriceLoading } =
    usePrice(NOCK_COINGECKO_ID);
  const nockPrice = priceData?.usd ?? "0";

  // Swap form state and handlers
  const {
    fromAmount,
    toAmount,
    exactFromAmount,
    amountError,
    handleFromAmountChange,
    handleAmountBlur,
    reset: resetForm,
    fromSecondary,
    toSecondary,
  } = useSwapForm({
    nockPrice,
    bridgeFeeRounding: isNockchainToBase ? "floor" : "ceil",
  });

  // Direction-specific wallet connection
  const {
    isInstalled: isIrisInstalled,
    isConnected: isIrisConnected,
    isConnecting: isIrisConnecting,
    connect: connectIris,
  } = useWallet();
  const {
    address: baseAddress,
    isConnected: isBaseConnected,
  } = useAccount();
  const { switchChain } = useSwitchChain();
  const expectedBaseNetwork = useMemo(
    () => getPreferredBridgeNetworkConfig(),
    []
  );
  const baseReadiness = useBaseToNockContractReadiness(
    expectedBaseNetwork?.chainId
  );
  const { data: nativeBalance, isLoading: nativeBalanceLoading } = useBalance({
    address: baseAddress,
    chainId: expectedBaseNetwork?.chainId,
    query: { enabled: Boolean(baseAddress && expectedBaseNetwork) },
  });
  const { data: tokenBalance, isLoading: tokenBalanceLoading } = useReadContract({
    address: expectedBaseNetwork?.nockTokenAddress,
    abi: erc20BalanceAbi,
    functionName: "balanceOf",
    args: baseAddress ? [baseAddress] : undefined,
    chainId: expectedBaseNetwork?.chainId,
    query: { enabled: Boolean(baseAddress && expectedBaseNetwork) },
  });
  const { openConnectModal } = useConnectModal();

  // Bridge configuration check
  const { isBridgeConfigured } = useBridge();

  const balancesLoading = nativeBalanceLoading || tokenBalanceLoading;
  const hasInsufficientFunds =
    exactFromAmount !== null &&
    tokenBalance !== undefined &&
    tokenBalance < exactFromAmount.baseUnits;
  const hasInsufficientGas =
    nativeBalance !== undefined && nativeBalance.value === 0n;

  const isBelowMinimum =
    exactFromAmount !== null &&
    exactFromAmount.nicks < MIN_BRIDGE_AMOUNT_NICKS;

  // Address validation
  const isAddressValid =
    receivingAddress.trim().length === 0
      ? null // No validation state when empty
      : isNockchainToBase
      ? isEvmAddress(receivingAddress) // Receiving on Base needs EVM address
      : isNockAddress(receivingAddress); // Receiving on Nockchain needs Nock address

  const theme = getSwapCardTheme(isDarkMode);

  const handleDirectionChange = () => {
    setDirection((current) =>
      current === "nock_to_base" ? "base_to_nock" : "nock_to_base"
    );
    setReceivingAddress("");
    setShowAddressError(false);
    setShowAmountError(false);
    resetForm();
  };

  const handleSwap = async () => {
    if (!isNockchainToBase && !BASE_TO_NOCK_WITHDRAWALS_ENABLED) {
      onSwapError?.(
        "Base-to-Nockchain withdrawals are not enabled for this release."
      );
      return;
    }

    // Validate address before proceeding
    if (isAddressValid === false || receivingAddress.trim().length === 0) {
      setShowAddressError(true);
      return;
    }

    if (!exactFromAmount || amountError) {
      setShowAmountError(true);
      return;
    }

    try {
      if (!isNockchainToBase) {
        const destination = await resolveNockWithdrawalDestination(
          receivingAddress
        );
        setReceivingAddress(destination.normalizedDestination);
        onPrepareBurnSuccess?.({
          amount: exactFromAmount,
          destinationNockAddress: destination.normalizedDestination,
        });
        return;
      }

      // Prepare transaction and show confirmation screen
      const preview = await prepareTransaction(
        receivingAddress,
        exactFromAmount.nicks
      );
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
      data-testid="swap-card"
      data-direction={direction}
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
                <input
                  aria-label="Amount to send"
                  data-testid="swap-amount"
                  type="text"
                  value={fromAmount}
                  onChange={(e) => {
                    handleFromAmountChange(e.target.value);
                    setShowAmountError(false);
                  }}
                  onBlur={() => {
                    handleAmountBlur();
                    if (amountError || isBelowMinimum) {
                      setShowAmountError(true);
                    }
                  }}
                  placeholder="0"
                  className="amount-input"
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
                      {isNockchainToBase ? "Nockchain" : "Base"}
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
                        background: isNockchainToBase ? "#1a1a1a" : "#fff",
                      }}
                    >
                      <Image
                        src={
                          isNockchainToBase
                            ? ASSETS.nockchainIcon
                            : ASSETS.baseLogo
                        }
                        alt={isNockchainToBase ? "Nockchain" : "Base"}
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
                <div style={{ display: "flex", alignItems: "center" }}>
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
                </div>
                {showAmountError && (amountError || isBelowMinimum) && (
                  <span
                    data-testid="swap-amount-error"
                    role="alert"
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
                    {amountError ??
                      `Minimum ${MIN_BRIDGE_AMOUNT_NOCK.toLocaleString()} NOCK`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Direction selector resets every amount and destination field. */}
          <button
            data-testid="swap-direction"
            type="button"
            onClick={handleDirectionChange}
            aria-label={
              isNockchainToBase
                ? "Switch to Base to Nockchain"
                : "Switch to Nockchain to Base"
            }
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
            <Image
              src={ASSETS.downArrow}
              alt=""
              width={24}
              height={24}
              style={{
                filter: isDarkMode ? "invert(1)" : "none",
                transform: isNockchainToBase ? "none" : "rotate(180deg)",
                transition: "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
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
                  readOnly
                  aria-label="Amount received after bridge fee"
                  data-testid="swap-quote"
                  placeholder="0"
                  className="amount-input"
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
                      {isNockchainToBase ? "Base" : "Nockchain"}
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
                <div style={{ display: "flex", alignItems: "center" }}>
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
                aria-label={
                  isNockchainToBase
                    ? "Base receiving address"
                    : "Nockchain receiving address"
                }
                data-testid="swap-destination"
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
        let buttonText = isNockchainToBase
          ? "Review bridge"
          : "Review withdrawal";
        let buttonAction: () => void = handleSwap;
        let isDisabled = false;
        let isLoading = false;

        const gateIncompleteForm = () => {
          const hasAmount = fromAmount.trim().length > 0;
          const hasAddress = receivingAddress.trim().length > 0;
          isDisabled =
            !hasAmount ||
            !hasAddress ||
            exactFromAmount === null ||
            amountError !== null ||
            isBelowMinimum;
        };

        if (!isNockchainToBase) {
          if (!BASE_TO_NOCK_WITHDRAWALS_ENABLED) {
            buttonText = "Base withdrawals unavailable";
            isDisabled = true;
          } else if (!isBaseConnected) {
            buttonText = "Connect Base wallet";
            buttonAction = openConnectModal ?? (() => undefined);
            isDisabled = openConnectModal === undefined;
          } else if (baseReadiness.switchRequired && expectedBaseNetwork) {
            buttonText = `Switch to ${expectedBaseNetwork.label}`;
            buttonAction = () =>
              switchChain({ chainId: expectedBaseNetwork.chainId });
          } else if (baseReadiness.loading) {
            buttonText = baseReadiness.reason ?? "Checking readiness...";
            isDisabled = true;
            isLoading = true;
          } else if (!baseReadiness.ready) {
            buttonText = baseReadiness.reason ?? "Bridge is not ready";
            isDisabled = true;
          } else if (balancesLoading) {
            buttonText = "Checking balances...";
            isDisabled = true;
            isLoading = true;
          } else if (hasInsufficientFunds) {
            buttonText = "Insufficient wrapped NOCK balance";
            isDisabled = true;
          } else if (hasInsufficientGas) {
            buttonText = "Insufficient ETH for Base gas";
            isDisabled = true;
          } else {
            gateIncompleteForm();
          }
        } else if (bridgeStatus === "preparing") {
          buttonText = "Preparing...";
          isDisabled = true;
          isLoading = true;
        } else if (bridgeStatus === "pending") {
          buttonText = "Processing...";
          isDisabled = true;
          isLoading = true;
        } else if (bridgeStatus === "awaiting_signature") {
          buttonText = "Approve in Iris...";
          isDisabled = true;
          isLoading = true;
        } else if (!isIrisInstalled) {
          buttonText = "Install Iris Wallet";
          buttonAction = () => {
            window.open(IRIS_CHROME_STORE_URL, "_blank");
          };
        } else if (!isIrisConnected) {
          buttonText = isIrisConnecting ? "Connecting..." : "Connect Iris";
          buttonAction = connectIris;
          isDisabled = isIrisConnecting;
        } else if (!isBridgeConfigured) {
          buttonText = "Bridge configuration unavailable";
          isDisabled = true;
        } else {
          gateIncompleteForm();
        }

        return (
          <button
            aria-busy={isLoading}
            data-testid="swap-primary-action"
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
            {isNockchainToBase && !isIrisConnected && !isIrisConnecting && (
              <Image
                src="/assets/iris-logo.svg"
                alt="Iris"
                width={20}
                height={20}
                style={{
                  opacity: isDisabled || isLoading ? 0.4 : 1,
                }}
              />
            )}
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
