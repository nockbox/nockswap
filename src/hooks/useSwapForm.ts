"use client";

import { useCallback, useState } from "react";
import { bridgeFeeNicksCeil, bridgeFeeNicksFloor } from "@/lib/constants";
import {
  type ExactNockAmount,
  formatApproximateUsd,
  formatNockDecimal,
  formatNicksAsNock,
  parseExactNockAmount,
} from "@/lib/nockAmount";

interface UseSwapFormOptions {
  nockPrice: string;
  bridgeFeeRounding?: "floor" | "ceil";
}

interface UseSwapFormReturn {
  fromAmount: string;
  toAmount: string;
  exactFromAmount: ExactNockAmount | null;
  amountError: string | null;
  handleFromAmountChange: (value: string) => void;
  handleAmountBlur: () => void;
  reset: () => void;
  fromSecondary: string;
  toSecondary: string;
}

export function useSwapForm({
  nockPrice,
  bridgeFeeRounding = "floor",
}: UseSwapFormOptions): UseSwapFormReturn {
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [exactFromAmount, setExactFromAmount] =
    useState<ExactNockAmount | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [fromSecondary, setFromSecondary] = useState("$0.00");
  const [toSecondary, setToSecondary] = useState("$0.00");

  const handleFromAmountChange = useCallback(
    (value: string) => {
      const cleaned = value.replace(/[^0-9.,]/g, "");
      setFromAmount(cleaned);

      if (cleaned.replace(/,/g, "").length === 0) {
        setExactFromAmount(null);
        setToAmount("");
        setAmountError(null);
        setFromSecondary("$0.00");
        setToSecondary("$0.00");
        return;
      }

      try {
        const exact = parseExactNockAmount(cleaned);
        const fee =
          bridgeFeeRounding === "ceil"
            ? bridgeFeeNicksCeil(exact.nicks)
            : bridgeFeeNicksFloor(exact.nicks);
        const netNicks = exact.nicks - fee;
        if (netNicks <= 0n) {
          throw new Error("The bridge fee must be lower than the amount.");
        }

        setExactFromAmount(exact);
        setToAmount(formatNicksAsNock(netNicks));
        setAmountError(null);
        setFromSecondary(formatApproximateUsd(exact.nicks, nockPrice));
        setToSecondary(formatApproximateUsd(netNicks, nockPrice));
      } catch (error) {
        setExactFromAmount(null);
        setToAmount("");
        setAmountError(
          error instanceof Error ? error.message : "Enter a valid NOCK amount."
        );
        setFromSecondary("$0.00");
        setToSecondary("$0.00");
      }
    },
    [bridgeFeeRounding, nockPrice]
  );

  const reset = useCallback(() => {
    setFromAmount("");
    setToAmount("");
    setExactFromAmount(null);
    setAmountError(null);
    setFromSecondary("$0.00");
    setToSecondary("$0.00");
  }, []);

  const handleAmountBlur = useCallback(() => {
    if (exactFromAmount) {
      setFromAmount(formatNockDecimal(exactFromAmount.canonical));
    }
  }, [exactFromAmount]);

  return {
    fromAmount,
    toAmount,
    exactFromAmount,
    amountError,
    handleFromAmountChange,
    handleAmountBlur,
    reset,
    fromSecondary,
    toSecondary,
  };
}
