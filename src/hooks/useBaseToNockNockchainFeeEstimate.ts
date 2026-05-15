"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useChainId } from "wagmi";
import { useWallet, NOCK_TO_NICKS } from "@/hooks/useWallet";
import { estimateBaseToNockNockchainFeeNicks } from "@/lib/baseToNockNockchainFee";
import { getBridgeNetworkConfig } from "@/lib/bridgeNetworkConfig";
import { bridgeOptionsFromActivationHeights } from "@/lib/bridge";
import { NICKS_PER_NOCK } from "@/lib/constants";
import { resolveNockchainGrpcUrl } from "@/lib/nockchainGrpc";
import { formatNOCK } from "@/lib/utils";
import { isNockAddress } from "@/lib/validators";

/**
 * Live estimate of the Nockchain network fee for Base→Nock when a gRPC URL is available
 * from Iris connect or the active bridge network config.
 * Uses public balance-by-first-name data (same first-name as the bridge multisig).
 */
export function useBaseToNockNockchainFeeEstimate(
  amountNock: number | null,
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
    amountNock != null &&
    amountNock > 0 &&
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
      amountNock == null ||
      amountNock <= 0 ||
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

    const burnedAmountNicks = BigInt(Math.floor(amountNock)) * NICKS_PER_NOCK;
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
          const nock = Number(fee) / NOCK_TO_NICKS;
          setDisplay(`${formatNOCK(nock)} NOCK`);
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
    amountNock,
    destTrimmed,
    grpcUrl,
    bridgeNetwork,
    txEngineActivationHeights,
  ]);

  return { display, feeNicks, loading };
}
