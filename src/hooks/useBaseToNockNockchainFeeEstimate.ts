"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useChainId } from "wagmi";
import { useWallet } from "@/hooks/useWallet";
import { estimateBaseToNockNockchainFeeNicks } from "@/lib/baseToNockNockchainFee";
import { getBridgeNetworkConfig } from "@/lib/bridgeNetworkConfig";
import { bridgeOptionsFromActivationHeights } from "@/lib/bridge";
import { resolveNockchainGrpcUrl } from "@/lib/nockchainGrpc";
import { formatNicksAsNock, type ExactNockAmount } from "@/lib/nockAmount";
import { isNockAddress } from "@/lib/validators";

/**
 * Live estimate of the Nockchain network fee for Base→Nock when a gRPC URL is available
 * from Iris connect or the active bridge network config.
 * Uses public balance-by-first-name data (same first-name as the bridge multisig).
 */
export function useBaseToNockNockchainFeeEstimate(
  amount: ExactNockAmount | null,
  destinationNockAddress: string | null
): { display: string; feeNicks: bigint | null; loading: boolean } {
  const { grpcEndpoint, txEngineActivationHeights } = useWallet();
  const chainId = useChainId();
  const bridgeNetwork = useMemo(
    () => getBridgeNetworkConfig(chainId),
    [chainId]
  );
  const grpcUrl = resolveNockchainGrpcUrl(
    grpcEndpoint,
    bridgeNetwork?.nockchainGrpcEndpoint
  );
  const [display, setDisplay] = useState("—");
  const [feeNicks, setFeeNicks] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);

  const destTrimmed = destinationNockAddress?.trim() ?? "";
  const canFetch =
    amount !== null &&
    destTrimmed.length > 0 &&
    isNockAddress(destTrimmed) &&
    Boolean(bridgeNetwork) &&
    Boolean(txEngineActivationHeights) &&
    Boolean(grpcUrl);

  useLayoutEffect(() => {
    if (canFetch) {
      setLoading(true);
    } else {
      setLoading(false);
    }
  }, [canFetch]);

  useEffect(() => {
    if (
      amount === null ||
      !destTrimmed ||
      !isNockAddress(destTrimmed) ||
      !bridgeNetwork ||
      !txEngineActivationHeights ||
      !grpcUrl
    ) {
      setDisplay("—");
      setFeeNicks(null);
      return;
    }

    let cancelled = false;

    const burnedAmountNicks = amount.nicks;
    const txEngineSettings = bridgeOptionsFromActivationHeights(
      txEngineActivationHeights
    ).txEngineSettings;

    (async () => {
      try {
        const fee = await estimateBaseToNockNockchainFeeNicks({
          burnedAmountNicks,
          recipientNockAddress: destTrimmed,
          grpcEndpoint: grpcUrl,
          bridgeNetwork,
          txEngineSettings,
        });
        if (!cancelled) {
          setDisplay(`${formatNicksAsNock(fee)} NOCK`);
          setFeeNicks(fee);
        }
      } catch {
        if (!cancelled) {
          setDisplay("—");
          setFeeNicks(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    amount,
    destTrimmed,
    grpcUrl,
    bridgeNetwork,
    txEngineActivationHeights,
  ]);

  return { display, feeNicks, loading };
}
