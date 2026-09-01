import { WITHDRAWAL_POLICY_V1 } from "@nockbox/iris-sdk";

export const PROTOCOL_FEE_DISPLAY = "0.3%";
export const PROTOCOL_FEE_NICKS_PER_NOCK =
  WITHDRAWAL_POLICY_V1.bridgeFeeNicksPerStartedNock;
export const NICKS_PER_NOCK = WITHDRAWAL_POLICY_V1.nicksPerNock;

export function toWholeNockNicks(nicks: bigint): bigint {
  if (nicks <= 0n) {
    return 0n;
  }
  return (nicks / NICKS_PER_NOCK) * NICKS_PER_NOCK;
}

export function bridgeFeeNicksFloor(amountInNicks: bigint): bigint {
  if (amountInNicks <= 0n) {
    return 0n;
  }
  return (
    (amountInNicks / NICKS_PER_NOCK) *
    WITHDRAWAL_POLICY_V1.bridgeFeeNicksPerStartedNock
  );
}

export function bridgeFeeNicksCeil(amountInNicks: bigint): bigint {
  if (amountInNicks <= 0n) {
    return 0n;
  }
  return (
    ((amountInNicks + NICKS_PER_NOCK - 1n) / NICKS_PER_NOCK) *
    WITHDRAWAL_POLICY_V1.bridgeFeeNicksPerStartedNock
  );
}

export const MIN_BRIDGE_AMOUNT_NOCK =
  WITHDRAWAL_POLICY_V1.minimumGrossNocks;
export const MIN_BRIDGE_AMOUNT_NICKS =
  WITHDRAWAL_POLICY_V1.minimumGrossNicks;

/**
 * Explicit deployment gate for the Base-to-Nockchain withdrawal path. Missing,
 * malformed, and production-default configuration remain disabled.
 */
export const BASE_TO_NOCK_WITHDRAWALS_ENABLED =
  process.env.NEXT_PUBLIC_BASE_TO_NOCK_WITHDRAWALS_ENABLED === "true";
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
