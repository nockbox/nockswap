"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, type Address } from "viem";
import {
  useAccount,
  useChainId,
  useEstimateFeesPerGas,
  useEstimateGas,
} from "wagmi";
import {
  deriveFullLockRootLimbBytes,
  encodeWithdrawalBurnCalldata,
  nockAmountToTokenUnits,
} from "@/lib/nockToken";
import { getBridgeNetworkConfig } from "@/lib/bridgeNetworkConfig";

function formatEthApprox(wei: bigint): string {
  const s = formatUnits(wei, 18);
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return "0 ETH";
  const abs = Math.abs(n);
  const decimals = abs >= 1 ? 4 : abs >= 0.01 ? 5 : 6;
  if (abs < 10 ** -decimals) return `<0.${"0".repeat(decimals - 1)}1 ETH`;
  return `~${n.toFixed(decimals)} ETH`;
}

/**
 * Rough max fee for a `Nock.burn` on the connected chain: `estimateGas` ×
 * `maxFeePerGas` (EIP-1559) or `gasPrice`. Does not add OP Stack L1 data fee,
 * so on Base the true cost can be slightly higher.
 */
export function useNockBurnGasEstimate(
  amountNock: number | null,
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
  const [fullLockRootBytes, setFullLockRootBytes] = useState<
    Uint8Array | undefined
  >();

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
      setFullLockRootBytes(undefined);
      return;
    }

    let cancelled = false;
    setFullLockRootBytes(undefined);
    deriveFullLockRootLimbBytes(trimmedDestination)
      .then((derivedLockRoot) => {
        if (!cancelled) {
          setFullLockRootBytes(derivedLockRoot);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFullLockRootBytes(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [destinationNockAddress]);

  const calldata = useMemo(() => {
    if (
      !tokenAddr ||
      !address ||
      amountWei === undefined ||
      fullLockRootBytes === undefined
    ) {
      return undefined;
    }
    try {
      return encodeWithdrawalBurnCalldata({
        nockContractAddress: tokenAddr as Address,
        burner: address,
        amount: amountWei,
        fullLockRootBytes,
      });
    } catch {
      return undefined;
    }
  }, [tokenAddr, address, amountWei, fullLockRootBytes]);

  const estimateEnabled = Boolean(address && tokenAddr && calldata);

  const { data: gasLimit, isFetching: gasLoading } = useEstimateGas({
    to: tokenAddr as Address | undefined,
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
