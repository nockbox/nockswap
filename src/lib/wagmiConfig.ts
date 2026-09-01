import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import type { Wallet } from "@rainbow-me/rainbowkit";
import { createConnector, http } from "wagmi";
import { mock } from "wagmi/connectors";
import { defineChain, numberToHex } from "viem";
import type { Chain, Transport } from "viem";
import { base, baseSepolia } from "viem/chains";

import {
  assertAllowedWalletRequest,
  resolveTestWalletRuntime,
} from "@/lib/e2eWallet";
import type { TestWalletRuntime } from "@/lib/e2eWallet";

const DEFAULT_LOCAL_CHAIN_RPC = "http://127.0.0.1:8545";
const E2E_WALLET_ID = "nockswap-e2e-wallet";

function chainForId(id: number, e2e: TestWalletRuntime): Chain {
  if (!e2e.enabled && id === base.id) return base;
  if (!e2e.enabled && id === baseSepolia.id) return baseSepolia;
  const rpcUrl =
    e2e.enabled && id === e2e.chainId
      ? e2e.rpcUrl
      : DEFAULT_LOCAL_CHAIN_RPC;
  return defineChain({
    id,
    name: e2e.enabled ? "NockSwap E2E" : `Chain ${id}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

function createE2eWallet(
  runtime: Extract<TestWalletRuntime, { enabled: true }>
): () => Wallet {
  return () => ({
    id: E2E_WALLET_ID,
    name: "NockSwap E2E Wallet",
    shortName: "E2E Wallet",
    installed: true,
    iconUrl:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='5' fill='%23111827'/%3E%3Cpath d='M6 7h12v3H9v2h8v3H9v2h9v3H6z' fill='%23fff'/%3E%3C/svg%3E",
    iconBackground: "#111827",
    createConnector: (walletDetails) => {
      const createMock = mock({
        accounts: [runtime.account],
        features: { reconnect: true },
      });
      return createConnector((config) => {
        const delegate = createMock(config);
        return {
          ...delegate,
          ...walletDetails,
          id: E2E_WALLET_ID,
          name: "NockSwap E2E Wallet",
          type: E2E_WALLET_ID,
          async setup() {
            assertRuntimeOrigin(runtime);
            await delegate.setup?.();
          },
          async connect(parameters) {
            assertRuntimeOrigin(runtime);
            await assertRpcIdentity(runtime);
            return delegate.connect(parameters);
          },
          async getProvider(parameters) {
            const provider = await delegate.getProvider(parameters);
            const request = provider.request.bind(provider);
            return {
              ...provider,
              async request(args: { method: string; params?: unknown }) {
                assertAllowedWalletRequest(runtime, args);
                return request(args as never);
              },
            };
          },
        };
      });
    },
  });
}

function assertRuntimeOrigin(
  runtime: Extract<TestWalletRuntime, { enabled: true }>
): void {
  if (
    typeof window !== "undefined" &&
    window.location.origin !== runtime.origin
  ) {
    throw new Error(
      `NockSwap E2E wallet origin mismatch: expected ${runtime.origin}`
    );
  }
}

async function assertRpcIdentity(
  runtime: Extract<TestWalletRuntime, { enabled: true }>
): Promise<void> {
  const [chainId, accounts] = await Promise.all([
    rpcRequest(runtime.rpcUrl, "eth_chainId"),
    rpcRequest(runtime.rpcUrl, "eth_accounts"),
  ]);
  if (chainId !== numberToHex(runtime.chainId)) {
    throw new Error(
      `NockSwap E2E RPC chain mismatch: expected ${runtime.chainId}`
    );
  }
  if (
    !Array.isArray(accounts) ||
    !accounts.some(
      (account) =>
        typeof account === "string" &&
        account.toLowerCase() === runtime.account.toLowerCase()
    )
  ) {
    throw new Error("NockSwap E2E account is not unlocked by the RPC");
  }
}

async function rpcRequest(
  rpcUrl: string,
  method: "eth_chainId" | "eth_accounts"
): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: [],
    }),
  });
  if (!response.ok) {
    throw new Error(`NockSwap E2E RPC ${method} returned ${response.status}`);
  }
  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error(`NockSwap E2E RPC ${method} returned an invalid response`);
  }
  const rpcPayload = payload as { result?: unknown; error?: unknown };
  if (rpcPayload.error !== undefined || !("result" in rpcPayload)) {
    throw new Error(`NockSwap E2E RPC ${method} returned an invalid response`);
  }
  return rpcPayload.result;
}

const testWalletRuntime = resolveTestWalletRuntime({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_NOCKSWAP_E2E: process.env.NEXT_PUBLIC_NOCKSWAP_E2E,
  NEXT_PUBLIC_NOCKSWAP_E2E_ORIGIN:
    process.env.NEXT_PUBLIC_NOCKSWAP_E2E_ORIGIN,
  NEXT_PUBLIC_NOCKSWAP_E2E_RPC_URL:
    process.env.NEXT_PUBLIC_NOCKSWAP_E2E_RPC_URL,
  NEXT_PUBLIC_NOCKSWAP_E2E_CHAIN_ID:
    process.env.NEXT_PUBLIC_NOCKSWAP_E2E_CHAIN_ID,
  NEXT_PUBLIC_NOCKSWAP_E2E_ACCOUNT:
    process.env.NEXT_PUBLIC_NOCKSWAP_E2E_ACCOUNT,
  NEXT_PUBLIC_NOCKSWAP_E2E_CONTRACT_ALLOWLIST:
    process.env.NEXT_PUBLIC_NOCKSWAP_E2E_CONTRACT_ALLOWLIST,
});

export const isTestWalletEnabled = testWalletRuntime.enabled;

const rawChainIds = testWalletRuntime.enabled
  ? String(testWalletRuntime.chainId)
  : process.env.NEXT_PUBLIC_WALLETCONNECT_CHAIN_IDS?.trim() ?? "8453";
const ids = rawChainIds
  .split(",")
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value > 0);
const primary = ids[0] ?? 8453;
const chains = [primary, ...ids.slice(1)].map((id) =>
  chainForId(id, testWalletRuntime)
) as [Chain, ...Chain[]];
const transports = Object.fromEntries(
  chains.map((chain) => [chain.id, http(chain.rpcUrls.default.http[0])])
) as Record<number, Transport>;
const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ?? "";

export const wagmiConfig = getDefaultConfig({
  appName: "Nock Swap",
  projectId,
  chains,
  transports,
  ssr: true,
  ...(testWalletRuntime.enabled
    ? {
        wallets: [
          {
            groupName: "E2E",
            wallets: [createE2eWallet(testWalletRuntime)],
          },
        ],
      }
    : {}),
});
