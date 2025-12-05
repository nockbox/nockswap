"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPrice, fetchPrices, type PriceData } from "@/lib/coingecko";

export function usePrice(coinId: string) {
  return useQuery<PriceData | null>({
    queryKey: ["price", coinId],
    queryFn: () => fetchPrice(coinId),
    enabled: !!coinId,
  });
}

export function usePrices(coinIds: string[]) {
  return useQuery({
    queryKey: ["prices", coinIds.sort().join(",")],
    queryFn: () => fetchPrices(coinIds),
    enabled: coinIds.length > 0,
  });
}
