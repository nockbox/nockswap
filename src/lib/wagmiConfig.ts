import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { base, baseSepolia } from "viem/chains";
import { defineChain, type Chain } from "viem";

/** RPC for chain IDs other than Base / Base Sepolia. */
const DEFAULT_LOCAL_CHAIN_RPC = "http://127.0.0.1:8545";

function chainForId(id: number): Chain {
  if (id === base.id) return base;
  if (id === baseSepolia.id) {
    const rpcUrl = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL?.trim();
    if (!rpcUrl) return baseSepolia;
    return {
      ...baseSepolia,
      rpcUrls: { default: { http: [rpcUrl] } },
    };
  }
  return defineChain({
    id,
    name: `Chain ${id}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [DEFAULT_LOCAL_CHAIN_RPC] } },
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
