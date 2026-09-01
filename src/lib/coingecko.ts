const COINGECKO_API_BASE = "https://api.coingecko.com/api/v3";

export interface PriceData {
  usd: string;
  usd_24h_change?: string;
}

export interface PriceResponse {
  [coinId: string]: PriceData;
}

interface RawPriceData {
  usd?: unknown;
  usd_24h_change?: unknown;
}

export async function fetchPrices(
  coinIds: string[],
  vsCurrency = "usd"
): Promise<PriceResponse> {
  const ids = coinIds.join(",");
  const url = `${COINGECKO_API_BASE}/simple/price?ids=${ids}&vs_currencies=${vsCurrency}&include_24hr_change=true`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`CoinGecko API error: ${response.status}`);
  }

  const raw = (await response.json()) as Record<string, RawPriceData>;
  const prices: PriceResponse = {};
  for (const [coinId, value] of Object.entries(raw)) {
    if (
      (typeof value.usd !== "number" && typeof value.usd !== "string") ||
      !/^[0-9]+(?:\.[0-9]+)?$/.test(String(value.usd))
    ) {
      continue;
    }
    prices[coinId] = {
      usd: String(value.usd),
      usd_24h_change:
        typeof value.usd_24h_change === "number" ||
        typeof value.usd_24h_change === "string"
          ? String(value.usd_24h_change)
          : undefined,
    };
  }
  return prices;
}

export async function fetchPrice(
  coinId: string,
  vsCurrency = "usd"
): Promise<PriceData | null> {
  try {
    const data = await fetchPrices([coinId], vsCurrency);
    return data[coinId] || null;
  } catch {
    return null;
  }
}
