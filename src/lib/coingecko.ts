const COINGECKO_API_BASE = "https://api.coingecko.com/api/v3";

export interface PriceData {
  usd: number;
  usd_24h_change?: number;
}

export interface PriceResponse {
  [coinId: string]: PriceData;
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

  return response.json();
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
