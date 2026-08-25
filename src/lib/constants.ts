// Bridge fee: 195 nicks per 65_536 nicks (1 NOCK). Slightly under 0.3%; integer nicks avoids float drift.
export const PROTOCOL_FEE_NICKS_PER_NOCK = 195n;
export const PROTOCOL_FEE_DISPLAY = "0.3%";

/** 1 NOCK = 2^16 nicks. */
export const NICKS_PER_NOCK = 65_536n;

/** Floor nicks to a whole-NOCK boundary so bridge fee math matches on-chain integer semantics. */
export function toWholeNockNicks(nicks: bigint): bigint {
  if (nicks <= 0n) {
    return 0n;
  }
  return (nicks / NICKS_PER_NOCK) * NICKS_PER_NOCK;
}

/** Nockchain -> Base bridge fee: whole-NOCK chunks, rounded down. */
export function bridgeFeeNicksFloor(amountInNicks: bigint): bigint {
  if (amountInNicks <= 0n) {
    return 0n;
  }
  return (amountInNicks / NICKS_PER_NOCK) * PROTOCOL_FEE_NICKS_PER_NOCK;
}

/** Base -> Nock withdrawal bridge fee: whole-NOCK chunks, rounded up. */
export function bridgeFeeNicksCeil(amountInNicks: bigint): bigint {
  if (amountInNicks <= 0n) {
    return 0n;
  }
  return (
    ((amountInNicks + NICKS_PER_NOCK - 1n) / NICKS_PER_NOCK) *
    PROTOCOL_FEE_NICKS_PER_NOCK
  );
}

export const MIN_BRIDGE_AMOUNT_NOCK = 100_000n;
export const MIN_BRIDGE_AMOUNT_NICKS =
  MIN_BRIDGE_AMOUNT_NOCK * NICKS_PER_NOCK;

/**
 * Launch gate for the Base-to-Nockchain withdrawal path.
 *
 * Keep this false until the immutable Iris SDK release, exact calldata path,
 * backend readiness checks, and browser lifecycle certification are complete.
 */
export const BASE_TO_NOCK_WITHDRAWALS_ENABLED = false;
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
