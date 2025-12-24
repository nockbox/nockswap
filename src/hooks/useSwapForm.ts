"use client";

import { useState, useCallback, useMemo } from "react";
import {
  calcUSD,
  calcNOCK,
  formatNOCK,
  parseAmount,
  formatWithCommas,
  applyFee,
  reverseFee,
} from "@/lib/utils";

interface UseSwapFormOptions {
  nockPrice: number;
}

interface UseSwapFormReturn {
  // Amount state
  fromAmount: string;
  toAmount: string;
  setFromAmount: (value: string) => void;
  setToAmount: (value: string) => void;

  // Mode state
  isFromUsdMode: boolean;
  isToUsdMode: boolean;

  // Handlers
  handleFromAmountChange: (value: string) => void;
  handleToAmountChange: (value: string) => void;
  handleFromToggle: () => void;
  handleToToggle: () => void;
  handleAmountBlur: (value: string, setter: (val: string) => void) => void;

  // Computed values
  fromSecondary: string;
  toSecondary: string;
}

export function useSwapForm({
  nockPrice,
}: UseSwapFormOptions): UseSwapFormReturn {
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [isFromUsdMode, setIsFromUsdMode] = useState(false);
  const [isToUsdMode, setIsToUsdMode] = useState(false);

  // Convert amount to NOCK regardless of current mode
  const toNock = useCallback(
    (amount: number, isUsdMode: boolean): number => {
      return isUsdMode && nockPrice > 0 ? calcNOCK(amount, nockPrice) : amount;
    },
    [nockPrice]
  );

  // Convert NOCK amount to display value based on mode
  const fromNock = useCallback(
    (nockAmount: number, isUsdMode: boolean): number => {
      return isUsdMode && nockPrice > 0 ? nockAmount * nockPrice : nockAmount;
    },
    [nockPrice]
  );

  // Handle From amount change - calculate To amount
  const handleFromAmountChange = useCallback(
    (value: string) => {
      const cleaned = value.replace(/[^0-9.,]/g, "");
      setFromAmount(cleaned);

      // Auto-calculate "To" amount
      const numValue = parseAmount(cleaned);
      if (numValue > 0) {
        // Convert to NOCK, apply fee, convert to "To" display mode
        const fromNockValue = toNock(numValue, isFromUsdMode);
        const toNockValue = applyFee(fromNockValue);
        const toDisplayValue = fromNock(toNockValue, isToUsdMode);
        setToAmount(formatWithCommas(toDisplayValue.toFixed(2)));
      } else {
        setToAmount("");
      }
    },
    [isFromUsdMode, isToUsdMode, toNock, fromNock]
  );

  // Handle To amount change - calculate From amount
  const handleToAmountChange = useCallback(
    (value: string) => {
      const cleaned = value.replace(/[^0-9.,]/g, "");
      setToAmount(cleaned);

      // Auto-calculate From amount (reverse calculation)
      const numValue = parseAmount(cleaned);
      if (numValue > 0) {
        // Convert to NOCK, reverse fee, convert to From display mode
        const toNockValue = toNock(numValue, isToUsdMode);
        const fromNockValue = reverseFee(toNockValue);
        const fromDisplayValue = fromNock(fromNockValue, isFromUsdMode);
        setFromAmount(formatWithCommas(fromDisplayValue.toFixed(2)));
      } else {
        setFromAmount("");
      }
    },
    [isFromUsdMode, isToUsdMode, toNock, fromNock]
  );

  // Toggle handlers for USD/NOCK mode
  const handleFromToggle = useCallback(() => {
    const currentValue = parseAmount(fromAmount);
    if (currentValue > 0 && nockPrice > 0) {
      if (isFromUsdMode) {
        // Converting from USD to NOCK
        const nockValue = calcNOCK(currentValue, nockPrice);
        setFromAmount(formatWithCommas(nockValue.toFixed(2)));
        // Recalculate "To" amount with new "From" mode
        const toNockValue = applyFee(nockValue);
        const toDisplayValue = fromNock(toNockValue, isToUsdMode);
        setToAmount(formatWithCommas(toDisplayValue.toFixed(2)));
      } else {
        // Converting from NOCK to USD
        const usdValue = currentValue * nockPrice;
        setFromAmount(formatWithCommas(usdValue.toFixed(2)));
        // Recalculate To amount with new From mode
        const toNockValue = applyFee(currentValue);
        const toDisplayValue = fromNock(toNockValue, isToUsdMode);
        setToAmount(formatWithCommas(toDisplayValue.toFixed(2)));
      }
    }
    setIsFromUsdMode(!isFromUsdMode);
  }, [fromAmount, nockPrice, isFromUsdMode, isToUsdMode, fromNock]);

  const handleToToggle = useCallback(() => {
    const currentValue = parseAmount(toAmount);
    if (currentValue > 0 && nockPrice > 0) {
      if (isToUsdMode) {
        // Converting from USD to NOCK
        const nockValue = calcNOCK(currentValue, nockPrice);
        setToAmount(formatWithCommas(nockValue.toFixed(2)));
        // Recalculate "From" amount with new "To" mode
        const fromNockValue = reverseFee(nockValue);
        const fromDisplayValue = fromNock(fromNockValue, isFromUsdMode);
        setFromAmount(formatWithCommas(fromDisplayValue.toFixed(2)));
      } else {
        // Converting from NOCK to USD
        const usdValue = currentValue * nockPrice;
        setToAmount(formatWithCommas(usdValue.toFixed(2)));
        // Recalculate "From" amount with new "To" mode
        const fromNockValue = reverseFee(currentValue);
        const fromDisplayValue = fromNock(fromNockValue, isFromUsdMode);
        setFromAmount(formatWithCommas(fromDisplayValue.toFixed(2)));
      }
    }
    setIsToUsdMode(!isToUsdMode);
  }, [toAmount, nockPrice, isToUsdMode, isFromUsdMode, fromNock]);

  // Format on blur
  const handleAmountBlur = useCallback(
    (value: string, setter: (val: string) => void) => {
      if (value) {
        setter(formatWithCommas(value));
      }
    },
    []
  );

  // Calculate the secondary display value based on input mode
  const fromSecondary = useMemo(() => {
    return isFromUsdMode
      ? formatNOCK(calcNOCK(parseAmount(fromAmount), nockPrice)) + " NOCK"
      : calcUSD(parseAmount(fromAmount), nockPrice);
  }, [fromAmount, nockPrice, isFromUsdMode]);

  const toSecondary = useMemo(() => {
    return isToUsdMode
      ? formatNOCK(calcNOCK(parseAmount(toAmount), nockPrice)) + " NOCK"
      : calcUSD(parseAmount(toAmount), nockPrice);
  }, [toAmount, nockPrice, isToUsdMode]);

  return {
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
  };
}
