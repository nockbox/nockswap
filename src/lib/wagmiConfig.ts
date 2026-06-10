import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { base, baseSepolia } from "viem/chains";
import { defineChain, type Chain } from "viem";

/** RPC for chain IDs other than Base / Base Sepolia. */
const DEFAULT_LOCAL_CHAIN_RPC = "http://127.0.0.1:8545";

function withRpcOverride(chain: Chain): Chain {
  const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL?.trim();
  if (!rpcUrl) return chain;
  return {
    ...chain,
    rpcUrls: { default: { http: [rpcUrl] } },
  };
}

function chainForId(id: number): Chain {
  if (id === base.id) return withRpcOverride(base);
  if (id === baseSepolia.id) {
    return withRpcOverride(baseSepolia);
  }
  const rpcUrl =
    process.env.NEXT_PUBLIC_BASE_RPC_URL?.trim() ?? DEFAULT_LOCAL_CHAIN_RPC;
  return defineChain({
    id,
    name: `Chain ${id}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

/**
 * RainbowKit + wagmi config. Chain list mirrors
 * `NEXT_PUBLIC_WALLETCONNECT_CHAIN_IDS` (comma-separated).
 *
 * `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is still required for WalletConnect
 * wallets inside RainbowKit.
 */
export const wagmiConfig = (() => {
  const raw =
    process.env.NEXT_PUBLIC_WALLETCONNECT_CHAIN_IDS?.trim() ?? "8453";
  const ids = raw
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  const primary = ids[0] ?? 8453;
  const allIds = [primary, ...ids.slice(1)];
  const chains = allIds.map((id) => chainForId(id)) as [
    Chain,
    ...Chain[],
  ];

  const transports = Object.fromEntries(
    chains.map((c) => {
      const url = c.rpcUrls.default.http[0];
      return [c.id, http(url)] as const;
    })
  ) as Record<(typeof chains)[number]["id"], ReturnType<typeof http>>;

  const projectId =
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ?? "";

  return getDefaultConfig({
    appName: "Nock Swap",
    projectId,
    chains,
    transports,
    ssr: true,
  });
})();
