export const PROTOCOL_FEE_BPS = 50; // 0.5% fee

export const TOKENS = {
  NOCK_NATIVE: {
    symbol: "NOCK",
    name: "Nockchain",
    chain: "nockchain",
    logo: "/images/nock-native.svg",
  },
  NOCK_BASE: {
    symbol: "NOCK",
    name: "Base",
    chain: "base",
    logo: "/images/nock-base.svg",
  },
} as const;

export type TokenKey = keyof typeof TOKENS;
