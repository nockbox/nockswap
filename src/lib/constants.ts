export const PROTOCOL_FEE_BPS = 30; // 0.3% fee
export const PROTOCOL_FEE_DISPLAY = `${PROTOCOL_FEE_BPS / 100}%`; // "0.3%"

export const MIN_BRIDGE_AMOUNT_NOCK = 100_000;

// Zorp Bridge 3-of-5 Multisig Configuration
export const ZORP_BRIDGE_THRESHOLD = 3;
export const ZORP_BRIDGE_ADDRESSES: string[] = [
  "AD6Mw1QUnPUrnVpyj2gW2jT6Jd6WsuZQmPn79XpZoFEocuvV12iDkvh", // Zorp #1
  "6KrZT5hHLY1fva9AUDeGtZu5Jznm4RDLYfjcGjuU49nWoNym5ZeX5X5", // Zorp #2
  "CDLzgKWAKFXYABkuQaMwbttDSTDMh3Wy2Eoq2XiArsyxn7vScNHupBb", // Pero
  "7E47xYNVEyt7jGmLsiChUHnyw88AfBvzJfXfEQkPmMo2ZWsdcPudwmV", // Nockbox
  "3xSyK6RQUaYzE8YDUamkpKRHALxaYo8E7eppawwE4sP35c3PASc6koq", // SWPS
];

export const NOCK_COINGECKO_ID = "nockchain";

// Iris Wallet
export const IRIS_EXTENSION_ID = "opodllkjacnodkojeedmgjbogbmfchlb";
export const IRIS_CHROME_STORE_URL = `https://chromewebstore.google.com/detail/iris-wallet/${IRIS_EXTENSION_ID}`;

// Asset paths
export const ASSETS = {
  nockswapLogo: "/assets/nockswap_logo.svg",
  nockswapLogoDark: "/assets/nockswap_logo_dark.svg",
  nockswapHeader: "/assets/nockswap-header.svg",
  nockswapHeaderDark: "/assets/nockswap-header-dark.svg",
  txnSuccess: "/assets/txn-success.svg",
  txnFail: "/assets/txn-fail.svg",
  nockToken: "/assets/nock-token.png",
  nockchainIcon: "/assets/nockchain-icon.svg",
  baseLogo: "/assets/base-logo-v2.svg",
  upDownArrows: "/assets/up-down-arrows.svg",
  upDownArrows2: "/assets/up-down-arrows-2.svg",
  downArrow: "/assets/down-arrow.svg",
} as const;

export const TOKENS = {
  NOCK_NATIVE: {
    symbol: "NOCK",
    name: "Nock",
    chain: "nockchain",
    logo: ASSETS.nockToken,
    chainIcon: ASSETS.nockchainIcon,
    coingeckoId: NOCK_COINGECKO_ID,
  },
  NOCK_BASE: {
    symbol: "NOCK",
    name: "Nock",
    chain: "base",
    logo: ASSETS.nockToken,
    chainIcon: ASSETS.baseLogo,
    coingeckoId: NOCK_COINGECKO_ID,
  },
} as const;

export type TokenKey = keyof typeof TOKENS;
