import { getAddress, isAddress } from "viem";
import type { Address } from "viem";

export const E2E_CHAIN_ID = 31338;

type PublicEnvironment = Readonly<Record<string, string | undefined>>;

interface E2eTransactionRequest {
  from?: unknown;
  to?: unknown;
  calls?: unknown;
  chainId?: unknown;
}

export type TestWalletRuntime =
  | { enabled: false }
  | {
      enabled: true;
      origin: string;
      rpcUrl: string;
      chainId: typeof E2E_CHAIN_ID;
      account: Address;
      contractAllowlist: ReadonlySet<Address>;
    };

export function resolveTestWalletRuntime(
  environment: PublicEnvironment
): TestWalletRuntime {
  const mode = environment.NEXT_PUBLIC_NOCKSWAP_E2E?.trim();
  if (mode === undefined || mode === "" || mode === "0") {
    return { enabled: false };
  }
  if (mode !== "1") {
    throw new Error("NEXT_PUBLIC_NOCKSWAP_E2E must be 0 or 1");
  }
  if (environment.NODE_ENV === "production") {
    throw new Error("NockSwap E2E wallet is forbidden in production builds");
  }

  const origin = required(
    environment,
    "NEXT_PUBLIC_NOCKSWAP_E2E_ORIGIN"
  );
  const rpcUrl = required(
    environment,
    "NEXT_PUBLIC_NOCKSWAP_E2E_RPC_URL"
  );
  assertLoopbackHttpUrl(origin, "E2E origin");
  assertLoopbackHttpUrl(rpcUrl, "E2E RPC URL");

  const chainId = Number.parseInt(
    required(environment, "NEXT_PUBLIC_NOCKSWAP_E2E_CHAIN_ID"),
    10
  );
  if (chainId !== E2E_CHAIN_ID) {
    throw new Error(`NockSwap E2E wallet requires chain id ${E2E_CHAIN_ID}`);
  }

  const rawAccount = required(
    environment,
    "NEXT_PUBLIC_NOCKSWAP_E2E_ACCOUNT"
  );
  if (!isAddress(rawAccount)) {
    throw new Error("NEXT_PUBLIC_NOCKSWAP_E2E_ACCOUNT is not an EVM address");
  }

  const contractAllowlist = new Set(
    required(environment, "NEXT_PUBLIC_NOCKSWAP_E2E_CONTRACT_ALLOWLIST")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => {
        if (!isAddress(value)) {
          throw new Error(
            "NEXT_PUBLIC_NOCKSWAP_E2E_CONTRACT_ALLOWLIST contains an invalid address"
          );
        }
        return getAddress(value);
      })
  );
  if (contractAllowlist.size === 0) {
    throw new Error(
      "NEXT_PUBLIC_NOCKSWAP_E2E_CONTRACT_ALLOWLIST must not be empty"
    );
  }

  return {
    enabled: true,
    origin: new URL(origin).origin,
    rpcUrl,
    chainId: E2E_CHAIN_ID,
    account: getAddress(rawAccount),
    contractAllowlist,
  };
}

export function assertAllowedWalletRequest(
  runtime: Extract<TestWalletRuntime, { enabled: true }>,
  request: { method: string; params?: unknown }
): void {
  switch (request.method) {
    case "eth_sendTransaction":
    case "eth_signTransaction": {
      const transaction = firstTransaction(request.params, request.method);
      assertAllowedTransaction(runtime, transaction, request.method);
      return;
    }
    case "wallet_sendCalls": {
      const payload = firstTransaction(request.params, request.method);
      assertExpectedAccount(runtime, payload.from, request.method);
      if (!Array.isArray(payload.calls) || payload.calls.length === 0) {
        throw new Error(`${request.method} requires at least one call`);
      }
      for (const call of payload.calls) {
        if (
          typeof call !== "object" ||
          call === null ||
          Array.isArray(call)
        ) {
          throw new Error(`${request.method} contains an invalid call`);
        }
        assertAllowedTransaction(
          runtime,
          call as E2eTransactionRequest,
          request.method,
          payload.from
        );
      }
      return;
    }
    case "wallet_switchEthereumChain": {
      const payload = firstTransaction(request.params, request.method);
      const requestedChainId =
        typeof payload.chainId === "string"
          ? Number.parseInt(payload.chainId, 16)
          : Number.NaN;
      if (requestedChainId !== runtime.chainId) {
        throw new Error(
          `${request.method} may only select E2E chain ${runtime.chainId}`
        );
      }
      return;
    }
    case "eth_sendRawTransaction":
    case "personal_sign":
    case "eth_sign":
    case "eth_signTypedData":
    case "eth_signTypedData_v3":
    case "eth_signTypedData_v4":
    case "wallet_addEthereumChain":
      throw new Error(`${request.method} is disabled for the E2E wallet`);
    default:
      return;
  }
}

function assertAllowedTransaction(
  runtime: Extract<TestWalletRuntime, { enabled: true }>,
  transaction: E2eTransactionRequest,
  method: string,
  inheritedFrom?: unknown
): void {
  assertExpectedAccount(
    runtime,
    transaction.from === undefined ? inheritedFrom : transaction.from,
    method
  );
  if (
    typeof transaction.to !== "string" ||
    !isAddress(transaction.to) ||
    !runtime.contractAllowlist.has(getAddress(transaction.to))
  ) {
    throw new Error(`${method} target is not in the E2E contract allowlist`);
  }
}

function assertExpectedAccount(
  runtime: Extract<TestWalletRuntime, { enabled: true }>,
  account: unknown,
  method: string
): void {
  if (
    typeof account !== "string" ||
    !isAddress(account) ||
    getAddress(account) !== runtime.account
  ) {
    throw new Error(`${method} may only use the configured E2E account`);
  }
}

function firstTransaction(
  params: unknown,
  method: string
): E2eTransactionRequest {
  if (
    !Array.isArray(params) ||
    typeof params[0] !== "object" ||
    params[0] === null ||
    Array.isArray(params[0])
  ) {
    throw new Error(`${method} requires an object parameter`);
  }
  return params[0] as E2eTransactionRequest;
}

function required(environment: PublicEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when NockSwap E2E is enabled`);
  }
  return value;
}

function assertLoopbackHttpUrl(value: string, label: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URL`);
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname)
  ) {
    throw new Error(`${label} must use HTTP on loopback`);
  }
}
