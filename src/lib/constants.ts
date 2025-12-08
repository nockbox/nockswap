export const PROTOCOL_FEE_BPS = 50; // 0.5% fee

export const NOCK_COINGECKO_ID = "nockchain";

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
