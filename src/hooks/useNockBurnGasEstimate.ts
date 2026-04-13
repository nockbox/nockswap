"use client";

import { useMemo } from "react";
import { encodeFunctionData, formatUnits } from "viem";
import { useAccount, useEstimateFeesPerGas, useEstimateGas } from "wagmi";
import {
  burnLockRootFromEnv,
  getNockTokenAddress,
  nockBurnAbi,
  nockAmountToTokenUnits,
} from "@/lib/nockToken";

function formatEthApprox(wei: bigint): string {
  const s = formatUnits(wei, 18);
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return "0 ETH";
  const abs = Math.abs(n);
  const decimals = abs >= 1 ? 4 : abs >= 0.01 ? 5 : 6;
  return `~${n.toFixed(decimals)} ETH`;
}

/**
 * Rough max fee for a `Nock.burn` on the connected chain: `estimateGas` ×
 * `maxFeePerGas` (EIP-1559) or `gasPrice`. Does not add OP Stack L1 data fee,
 * so on Base the true cost can be slightly higher.
 */
export function useNockBurnGasEstimate(amountNock: number | null): {
  networkFeeDisplay: string;
} {
  const { address } = useAccount();
  const tokenAddr = getNockTokenAddress();

  const amountWei = useMemo(() => {
    if (
      amountNock === null ||
      !Number.isFinite(amountNock) ||
      amountNock <= 0
    ) {
      return undefined;
    }
    try {
      return nockAmountToTokenUnits(amountNock);
    } catch {
      return undefined;
    }
  }, [amountNock]);

  const lockRoot = useMemo(() => burnLockRootFromEnv(), []);

  const calldata = useMemo(() => {
    if (!tokenAddr || amountWei === undefined) return undefined;
    return encodeFunctionData({
      abi: nockBurnAbi,
      functionName: "burn",
      args: [amountWei, lockRoot],
    });
  }, [tokenAddr, amountWei, lockRoot]);

  const estimateEnabled = Boolean(address && tokenAddr && calldata);

  const { data: gasLimit, isFetching: gasLoading } = useEstimateGas({
    to: tokenAddr as `0x${string}` | undefined,
    data: calldata,
    account: address,
    query: { enabled: estimateEnabled },
  });

  const { data: fees, isFetching: feesLoading } = useEstimateFeesPerGas({
    query: { enabled: estimateEnabled },
  });

  const networkFeeDisplay = useMemo(() => {
    if (!estimateEnabled) return "—";
    if (gasLoading || feesLoading) return "Estimating…";
    if (gasLimit === undefined || gasLimit === 0n) return "—";
    const maxFee = fees?.maxFeePerGas ?? fees?.gasPrice;
    if (maxFee === undefined || maxFee === 0n) return "—";
    return formatEthApprox(gasLimit * maxFee);
  }, [
    estimateEnabled,
    gasLoading,
    feesLoading,
    gasLimit,
    fees?.maxFeePerGas,
    fees?.gasPrice,
  ]);

  return { networkFeeDisplay };
}
