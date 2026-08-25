"use client";

import { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, formatUnits } from "viem";
import {
  useAccount,
  useChainId,
  useEstimateFeesPerGas,
  useEstimateGas,
} from "wagmi";
import {
  burnLockRootFromRecipientPkh,
  nockBurnAbi,
  nockAmountToTokenUnits,
} from "@/lib/nockToken";
import { getBridgeNetworkConfig } from "@/lib/bridgeNetworkConfig";
import type { ExactNockAmount } from "@/lib/nockAmount";

function formatEthApprox(wei: bigint): string {
  if (wei <= 0n) return "0 ETH";
  const [whole, fraction = ""] = formatUnits(wei, 18).split(".");
  const visibleFraction = fraction.slice(0, whole === "0" ? 6 : 4).replace(/0+$/, "");
  return `~${visibleFraction ? `${whole}.${visibleFraction}` : whole} ETH`;
}

/**
 * Rough max fee for a `Nock.burn` on the connected chain: `estimateGas` ×
 * `maxFeePerGas` (EIP-1559) or `gasPrice`. Does not add OP Stack L1 data fee,
 * so on Base the true cost can be slightly higher.
 */
export function useNockBurnGasEstimate(
  amount: ExactNockAmount | null,
  destinationNockAddress: string | null,
  expectedChainId?: number
): {
  networkFeeDisplay: string;
} {
  const { address } = useAccount();
  const chainId = useChainId();
  const expectedNetwork = useMemo(
    () =>
      expectedChainId === undefined
        ? getBridgeNetworkConfig(chainId)
        : getBridgeNetworkConfig(expectedChainId),
    [chainId, expectedChainId]
  );
  const tokenAddr =
    expectedNetwork && chainId === expectedNetwork.chainId
      ? expectedNetwork.nockTokenAddress
      : undefined;
  const [lockRoot, setLockRoot] = useState<`0x${string}` | undefined>();

  const amountWei = useMemo(() => {
    if (amount === null) {
      return undefined;
    }
    try {
      return nockAmountToTokenUnits(amount.baseUnits);
    } catch {
      return undefined;
    }
  }, [amount]);

  useEffect(() => {
    const trimmedDestination = destinationNockAddress?.trim() ?? "";
    if (!trimmedDestination) {
      setLockRoot(undefined);
      return;
    }

    let cancelled = false;
    setLockRoot(undefined);
    burnLockRootFromRecipientPkh(trimmedDestination)
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
  }, [destinationNockAddress]);

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
    if (expectedNetwork && chainId !== expectedNetwork.chainId) {
      return `Switch to ${expectedNetwork.label}`;
    }
    if (!estimateEnabled) return "—";
    if (gasLoading || feesLoading) return "Estimating…";
    if (gasLimit === undefined || gasLimit === 0n) return "—";
    const maxFee = fees?.maxFeePerGas ?? fees?.gasPrice;
    if (maxFee === undefined || maxFee === 0n) return "—";
    return formatEthApprox(gasLimit * maxFee);
  }, [
    estimateEnabled,
    expectedNetwork,
    chainId,
    gasLoading,
    feesLoading,
    gasLimit,
    fees?.maxFeePerGas,
    fees?.gasPrice,
  ]);

  return { networkFeeDisplay };
}
