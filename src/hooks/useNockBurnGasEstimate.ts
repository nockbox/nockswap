"use client";

import { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, formatUnits } from "viem";
import { useAccount, useChainId, useEstimateFeesPerGas, useEstimateGas } from "wagmi";
import {
  burnLockRootFromRecipientPkh,
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
export function useNockBurnGasEstimate(
  amountNock: number | null,
  destinationNockAddress: string | null
): {
  networkFeeDisplay: string;
} {
  const { address } = useAccount();
  const chainId = useChainId();
  const tokenAddr = getNockTokenAddress();
  const [lockRoot, setLockRoot] = useState<`0x${string}` | undefined>();

  const amountWei = useMemo(() => {
    if (
      amountNock === null ||
      !Number.isFinite(amountNock) ||
      amountNock <= 0
    ) {
      return undefined;
    }
    try {
      return nockAmountToTokenUnits(Math.floor(amountNock));
    } catch {
      return undefined;
    }
  }, [amountNock]);

  useEffect(() => {
    const trimmedDestination = destinationNockAddress?.trim() ?? "";
    if (!trimmedDestination) {
      setLockRoot(undefined);
      return;
    }

    let cancelled = false;
    setLockRoot(undefined);
    burnLockRootFromRecipientPkh(trimmedDestination, chainId)
      .then((derivedLockRoot) => {
        if (!cancelled) {
          setLockRoot(derivedLockRoot);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLockRoot(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chainId, destinationNockAddress]);

  const calldata = useMemo(() => {
    if (!tokenAddr || amountWei === undefined || lockRoot === undefined) {
      return undefined;
    }
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
