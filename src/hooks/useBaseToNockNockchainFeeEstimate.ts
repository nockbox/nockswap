"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useWallet, NOCK_TO_NICKS } from "@/hooks/useWallet";
import { estimateBaseToNockNockchainFeeNicks } from "@/lib/baseToNockNockchainFee";
import { NICKS_PER_NOCK } from "@/lib/constants";
import { resolveNockchainGrpcUrl } from "@/lib/nockchainGrpc";
import { formatNOCK } from "@/lib/utils";
import { isNockAddress } from "@/lib/validators";

/**
 * Best-effort estimate of the Nockchain network fee for Base→Nock when a gRPC URL is available
 * (Iris connect or the active bridge config's gRPC endpoint).
 * Uses public balance-by-first-name data and excludes notes newer than the configured
 * Nockchain confirmation depth. Reserved sequencer inputs are still unknowable here.
 */
export function useBaseToNockNockchainFeeEstimate(
  amountNock: number | null,
  destinationNockAddress: string | null
): { display: string; feeNicks: bigint | null; loading: boolean } {
  const { grpcEndpoint } = useWallet();
  const grpcUrl = resolveNockchainGrpcUrl(grpcEndpoint);
  const [display, setDisplay] = useState("—");
  const [feeNicks, setFeeNicks] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);

  const destTrimmed = destinationNockAddress?.trim() ?? "";
  const canFetch =
    amountNock != null &&
    amountNock > 0 &&
    destTrimmed.length > 0 &&
    isNockAddress(destTrimmed) &&
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
      !grpcUrl
    ) {
      setDisplay("—");
      setFeeNicks(null);
      return;
    }

    let cancelled = false;

    const burnedAmountNicks = BigInt(Math.floor(amountNock)) * NICKS_PER_NOCK;

    (async () => {
      try {
        const fee = await estimateBaseToNockNockchainFeeNicks({
          burnedAmountNicks,
          recipientNockAddress: destTrimmed,
          grpcEndpoint: grpcUrl,
        });
        if (!cancelled) {
          const nock = Number(fee) / NOCK_TO_NICKS;
          setDisplay(`${formatNOCK(nock)} NOCK`);
          setFeeNicks(fee);
        }
      } catch {
        if (!cancelled) {
          setDisplay("Unavailable");
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
  }, [amountNock, destTrimmed, grpcUrl]);

  return { display, feeNicks, loading };
}
