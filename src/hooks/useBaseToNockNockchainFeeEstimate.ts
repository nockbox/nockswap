"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useChainId } from "wagmi";

import { resolveNockWithdrawalDestination } from "@/lib/nockToken";
import { getBridgeNetworkConfig } from "@/lib/bridgeNetworkConfig";
import { formatNicksAsNock, type ExactNockAmount } from "@/lib/nockAmount";
import { isNockAddress } from "@/lib/validators";
import { BASE_TO_NOCK_WITHDRAWALS_ENABLED } from "@/lib/constants";

export interface PublicWithdrawalQuoteV1 {
  schemaVersion: 1;
  available: boolean;
  grossAmountNicks: string;
  bridgeFeeNicks: string;
  transactionFeeNicks: string;
  netPayoutNicks: string;
  snapshotHeight: number | null;
  snapshotBlockId: string | null;
  observedAt: number;
  revision: string;
  reason: string | null;
}

export interface BaseToNockQuoteState {
  display: string;
  feeNicks: bigint | null;
  bridgeFeeNicks: bigint | null;
  netPayoutNicks: bigint | null;
  quote: PublicWithdrawalQuoteV1 | null;
  loading: boolean;
}

export function useBaseToNockNockchainFeeEstimate(
  amount: ExactNockAmount | null,
  destinationNockAddress: string | null,
  expectedChainId?: number
): BaseToNockQuoteState {
  const chainId = useChainId();
  const bridgeNetwork = useMemo(
    () => getBridgeNetworkConfig(expectedChainId ?? chainId),
    [chainId, expectedChainId]
  );
  const [quote, setQuote] = useState<PublicWithdrawalQuoteV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const destination = destinationNockAddress?.trim() ?? "";
  const canFetch =
    BASE_TO_NOCK_WITHDRAWALS_ENABLED &&
    amount !== null &&
    destination.length > 0 &&
    isNockAddress(destination) &&
    Boolean(bridgeNetwork?.publicStatusUrl);

  useLayoutEffect(() => {
    setLoading(canFetch);
  }, [canFetch]);

  useEffect(() => {
    const publicStatusUrl =
      BASE_TO_NOCK_WITHDRAWALS_ENABLED && bridgeNetwork
        ? bridgeNetwork.publicStatusUrl
        : undefined;
    if (!amount || !isNockAddress(destination) || !publicStatusUrl) {
      setQuote(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      try {
        const resolved = await resolveNockWithdrawalDestination(destination);
        const url = new URL(publicStatusUrl);
        url.searchParams.set("quote", "1");
        url.searchParams.set("gross_amount_nicks", amount.nicks.toString());
        url.searchParams.set("destination_lock_root", resolved.lockRoot);
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`quote HTTP ${response.status}`);
        }
        const parsed = parsePublicWithdrawalQuote(await response.json());
        if (parsed.grossAmountNicks !== amount.nicks.toString()) {
          throw new Error("Authoritative quote amount does not match the request.");
        }
        if (!cancelled) {
          setQuote(parsed);
          setError(parsed.available ? null : parsed.reason ?? "Quote unavailable.");
        }
      } catch (cause) {
        if (!cancelled && !controller.signal.aborted) {
          setQuote(null);
          setError(
            cause instanceof Error ? cause.message : "Authoritative quote unavailable."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = window.setTimeout(load, 30_000);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [amount, bridgeNetwork, destination]);

  const feeNicks =
    quote?.available === true ? BigInt(quote.transactionFeeNicks) : null;
  const bridgeFeeNicks =
    quote?.available === true ? BigInt(quote.bridgeFeeNicks) : null;
  const netPayoutNicks =
    quote?.available === true ? BigInt(quote.netPayoutNicks) : null;
  return {
    display:
      quote?.available === true
        ? `${formatNicksAsNock(BigInt(quote.transactionFeeNicks))} NOCK at snapshot ${quote.snapshotHeight ?? "unknown"}`
        : error ?? "Authoritative quote unavailable",
    feeNicks,
    bridgeFeeNicks,
    netPayoutNicks,
    quote,
    loading,
  };
}

export function parsePublicWithdrawalQuote(value: unknown): PublicWithdrawalQuoteV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid authoritative withdrawal quote.");
  }
  const quote = value as Partial<PublicWithdrawalQuoteV1>;
  if (
    quote.schemaVersion !== 1 ||
    typeof quote.available !== "boolean" ||
    !isDecimal(quote.grossAmountNicks) ||
    !isDecimal(quote.bridgeFeeNicks) ||
    !isDecimal(quote.transactionFeeNicks) ||
    !isDecimal(quote.netPayoutNicks) ||
    (quote.snapshotHeight !== null &&
      (!Number.isSafeInteger(quote.snapshotHeight) || (quote.snapshotHeight ?? -1) < 0)) ||
    (quote.snapshotBlockId !== null && typeof quote.snapshotBlockId !== "string") ||
    !Number.isSafeInteger(quote.observedAt) ||
    (quote.observedAt ?? -1) < 0 ||
    !isDecimal(quote.revision) ||
    (quote.reason !== null && typeof quote.reason !== "string")
  ) {
    throw new Error("Unsupported authoritative withdrawal quote schema.");
  }
  return quote as PublicWithdrawalQuoteV1;
}

function isDecimal(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value);
}
