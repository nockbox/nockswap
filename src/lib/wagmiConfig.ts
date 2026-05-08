import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { base, baseSepolia } from "viem/chains";
import { defineChain, type Chain } from "viem";
import { getActiveBridgeConfig } from "@/lib/bridgeConfig";

/** RPC for chain IDs other than Base / Base Sepolia (e.g. local Anvil 31337). */
const DEFAULT_LOCAL_CHAIN_RPC = "http://127.0.0.1:8545";

function cleanEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function withRpcOverride(chain: Chain, rpcUrl: string | undefined): Chain {
  if (!rpcUrl) return chain;
  return {
    ...chain,
    rpcUrls: {
      ...chain.rpcUrls,
      default: { http: [rpcUrl] },
    },
  };
}

function chainForId(id: number, rpcUrl?: string): Chain {
  if (id === base.id) return withRpcOverride(base, rpcUrl);
  if (id === baseSepolia.id) return withRpcOverride(baseSepolia, rpcUrl);
  return defineChain({
    id,
    name: `Chain ${id}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl ?? DEFAULT_LOCAL_CHAIN_RPC] } },
  });
}

/**
 * RainbowKit + wagmi config. Chain list mirrors
 * `NEXT_PUBLIC_WALLETCONNECT_CHAIN_IDS` (comma-separated).
 *
 * `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is required for real WalletConnect
 * sessions; the fallback only keeps env-less builds reproducible.
 */
export const wagmiConfig = (() => {
  const activeBridgeChainId = getActiveBridgeConfig().evmChainId;
  const raw =
    cleanEnv(process.env.NEXT_PUBLIC_WALLETCONNECT_CHAIN_IDS) ??
    String(activeBridgeChainId);
  const ids = raw
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  const primary = ids[0] ?? activeBridgeChainId;
  const allIds = [primary, ...ids.slice(1)];
  const bridgeRpcUrl =
    cleanEnv(process.env.NEXT_PUBLIC_BRIDGE_RPC_URL) ??
    cleanEnv(process.env.NEXT_PUBLIC_BASE_RPC_URL);
  const chains = allIds.map((id) =>
    chainForId(id, id === activeBridgeChainId ? bridgeRpcUrl : undefined)
  ) as [Chain, ...Chain[]];

  const transports = Object.fromEntries(
    chains.map((c) => {
      const url = c.rpcUrls.default.http[0];
      return [c.id, http(url)] as const;
    })
  ) as Record<(typeof chains)[number]["id"], ReturnType<typeof http>>;

  const projectId =
    cleanEnv(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) ??
    "nockswap-build-placeholder";

  return getDefaultConfig({
    appName: "Nock Swap",
    projectId,
    chains,
    transports,
    ssr: true,
  });
})();
