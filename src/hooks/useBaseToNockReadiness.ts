"use client";

import { useEffect, useMemo, useState } from "react";
import { base58 } from "@scure/base";
import {
  getAddress,
  hexToBytes,
  isAddress,
  type Address,
  type PublicClient,
} from "viem";
import { useAccount, usePublicClient } from "wagmi";
import {
  getActiveBridgeConfig,
  type BridgeConfig,
} from "@/lib/bridgeConfig";

const nockInboxAbi = [
  {
    type: "function",
    name: "inbox",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const messageInboxNockAbi = [
  {
    type: "function",
    name: "nock",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const messageInboxWithdrawalsAbi = [
  {
    type: "function",
    name: "withdrawalsEnabled",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
] as const;

const messageInboxBridgeNodesAbi = [
  {
    type: "function",
    name: "bridgeNodes",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const;

interface ReadinessState {
  ready: boolean;
  loading: boolean;
  reason: string | null;
}

export interface BaseToNockReadiness extends ReadinessState {
  wrongNetwork: boolean;
  expectedChainId: number;
  expectedChainName: string;
  config: BridgeConfig;
}

function sameAddress(a: string, b: string): boolean {
  if (!isAddress(a) || !isAddress(b)) return false;
  return getAddress(a) === getAddress(b);
}

function readArg(
  address: Address,
  abi: unknown,
  functionName: string,
  args: readonly unknown[] = []
): Parameters<PublicClient["readContract"]>[0] {
  return { address, abi, functionName, args } as Parameters<
    PublicClient["readContract"]
  >[0];
}

async function readOptional(
  client: PublicClient,
  address: Address,
  functionName: string,
  outputType: "uint256" | "address" | "string" | "bytes" | "bytes32",
  args: readonly unknown[] = []
): Promise<unknown | undefined> {
  const abi = [
    {
      type: "function",
      name: functionName,
      stateMutability: "view",
      inputs: args.length > 0 ? [{ type: "uint256" }] : [],
      outputs: [{ type: outputType }],
    },
  ];
  try {
    return await client.readContract(
      readArg(address, abi, functionName, args)
    );
  } catch {
    return undefined;
  }
}

async function readOptionalNumber(
  client: PublicClient,
  address: Address,
  functionNames: readonly string[]
): Promise<number | null> {
  for (const functionName of functionNames) {
    const value = await readOptional(client, address, functionName, "uint256");
    if (typeof value !== "bigint") continue;
    const n = Number(value);
    if (Number.isSafeInteger(n) && n >= 0) {
      return n;
    }
  }
  return null;
}

function normalizePkh(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("0x")) {
      return base58.encode(hexToBytes(trimmed as `0x${string}`));
    }
    return trimmed;
  }
  if (value instanceof Uint8Array) {
    return base58.encode(value);
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) {
    return base58.encode(new Uint8Array(value));
  }
  return null;
}

async function readOptionalBridgeNodeAddress(
  client: PublicClient,
  address: Address,
  index: number
): Promise<string | null> {
  try {
    const value = await client.readContract(
      readArg(address, messageInboxBridgeNodesAbi, "bridgeNodes", [
        BigInt(index),
      ])
    );
    return typeof value === "string" && isAddress(value)
      ? getAddress(value)
      : null;
  } catch {
    return null;
  }
}

async function readOptionalBridgeNodeRoster(
  client: PublicClient,
  address: Address,
  count: number
): Promise<string[] | null> {
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    const node = await readOptionalBridgeNodeAddress(client, address, i);
    if (!node) {
      return result.length > 0 ? result : null;
    }
    result.push(node);
  }
  return result;
}

function normalizeAddressRoster(values: readonly string[]): string[] | null {
  const result: string[] = [];
  for (const value of values) {
    if (!isAddress(value)) return null;
    result.push(getAddress(value));
  }
  return result;
}

async function readOptionalSignerPkh(
  client: PublicClient,
  address: Address,
  index: number
): Promise<string | null> {
  const functionNames = [
    "bridgeSignerPkh",
    "bridgeSignerPKH",
    "bridgeSignerPkhs",
    "bridgeSignerPKHs",
    "bridgeSigners",
    "signers",
  ];

  for (const functionName of functionNames) {
    const stringValue = await readOptional(
      client,
      address,
      functionName,
      "string",
      [BigInt(index)]
    );
    const stringPkh = normalizePkh(stringValue);
    if (stringPkh) return stringPkh;

    const bytesValue = await readOptional(
      client,
      address,
      functionName,
      "bytes",
      [BigInt(index)]
    );
    const bytesPkh = normalizePkh(bytesValue);
    if (bytesPkh) return bytesPkh;

    const bytes32Value = await readOptional(
      client,
      address,
      functionName,
      "bytes32",
      [BigInt(index)]
    );
    const bytes32Pkh = normalizePkh(bytes32Value);
    if (bytes32Pkh) return bytes32Pkh;
  }

  return null;
}

async function readOptionalSignerRoster(
  client: PublicClient,
  address: Address,
  count: number
): Promise<string[] | null> {
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    const pkh = await readOptionalSignerPkh(client, address, i);
    if (!pkh) {
      return result.length > 0 ? result : null;
    }
    result.push(pkh);
  }
  return result;
}

async function checkContractReadiness(
  client: PublicClient,
  config: BridgeConfig
): Promise<ReadinessState> {
  const nockAddress = config.nockTokenAddress;
  const inboxAddress = config.messageInboxAddress;
  if (!nockAddress || !isAddress(nockAddress)) {
    return {
      ready: false,
      loading: false,
      reason: "Nock token is not configured for this bridge network.",
    };
  }
  if (!inboxAddress || !isAddress(inboxAddress)) {
    return {
      ready: false,
      loading: false,
      reason: "MessageInbox is not configured for this bridge network.",
    };
  }

  const nock = getAddress(nockAddress);
  const inbox = getAddress(inboxAddress);

  try {
    const configuredInbox = await client.readContract(
      readArg(nock, nockInboxAbi, "inbox")
    );
    if (
      typeof configuredInbox !== "string" ||
      !sameAddress(configuredInbox, inbox)
    ) {
      return {
        ready: false,
        loading: false,
        reason: "Nock contract is wired to a different MessageInbox.",
      };
    }

    const configuredNock = await client.readContract(
      readArg(inbox, messageInboxNockAbi, "nock")
    );
    if (typeof configuredNock !== "string" || !sameAddress(configuredNock, nock)) {
      return {
        ready: false,
        loading: false,
        reason: "MessageInbox is wired to a different Nock contract.",
      };
    }

    if (config.requireWithdrawalsEnabled) {
      const withdrawalsEnabled = await client.readContract(
        readArg(inbox, messageInboxWithdrawalsAbi, "withdrawalsEnabled")
      );
      if (withdrawalsEnabled !== true) {
        return {
          ready: false,
          loading: false,
          reason: "Base to Nock withdrawals are disabled on MessageInbox.",
        };
      }
    }

    const threshold = await readOptionalNumber(client, inbox, [
      "THRESHOLD",
      "bridgeThreshold",
      "withdrawalThreshold",
      "threshold",
    ]);
    if (threshold !== null && threshold !== config.bridgeThreshold) {
      return {
        ready: false,
        loading: false,
        reason: "MessageInbox bridge threshold does not match configuration.",
      };
    }

    const expectedBridgeNodeRoster = normalizeAddressRoster(
      config.bridgeSignerAddresses
    );
    if (expectedBridgeNodeRoster === null) {
      return {
        ready: false,
        loading: false,
        reason: "Configured bridge node address roster is invalid.",
      };
    }

    const expectedSignerCount =
      expectedBridgeNodeRoster.length || config.bridgeSignerPkhs.length;
    const signerCount =
      (await readOptionalNumber(client, inbox, [
        "bridgeSignerCount",
        "signerCount",
        "numBridgeSigners",
      ])) ?? expectedSignerCount;
    if (signerCount !== expectedSignerCount) {
      return {
        ready: false,
        loading: false,
        reason: "MessageInbox bridge signer count does not match configuration.",
      };
    }

    if (expectedBridgeNodeRoster.length > 0) {
      const bridgeNodeRoster = await readOptionalBridgeNodeRoster(
        client,
        inbox,
        expectedBridgeNodeRoster.length
      );
      if (
        bridgeNodeRoster &&
        bridgeNodeRoster.join(",") !== expectedBridgeNodeRoster.join(",")
      ) {
        return {
          ready: false,
          loading: false,
          reason:
            "MessageInbox bridge node roster does not match configuration.",
        };
      }
    } else {
      const signerRoster = await readOptionalSignerRoster(
        client,
        inbox,
        signerCount
      );
      if (
        signerRoster &&
        signerRoster.join(",") !== config.bridgeSignerPkhs.join(",")
      ) {
        return {
          ready: false,
          loading: false,
          reason:
            "MessageInbox bridge signer roster does not match configuration.",
        };
      }
    }

    return { ready: true, loading: false, reason: null };
  } catch (err) {
    return {
      ready: false,
      loading: false,
      reason:
        err instanceof Error
          ? err.message
          : "Failed to verify bridge contracts.",
    };
  }
}

export function useBaseToNockReadiness(): BaseToNockReadiness {
  const config = useMemo(() => getActiveBridgeConfig(), []);
  const publicClient = usePublicClient({ chainId: config.evmChainId });
  const { chainId, isConnected } = useAccount();
  const [state, setState] = useState<ReadinessState>({
    ready: false,
    loading: true,
    reason: "Checking bridge contracts...",
  });

  useEffect(() => {
    if (!publicClient) {
      return;
    }

    let cancelled = false;
    checkContractReadiness(publicClient, config).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [config, publicClient]);

  const readiness = publicClient
    ? state
    : {
        ready: false,
        loading: false,
        reason: "No RPC client is available for the configured Base network.",
      };

  return {
    ...readiness,
    wrongNetwork:
      isConnected && chainId !== undefined && chainId !== config.evmChainId,
    expectedChainId: config.evmChainId,
    expectedChainName: config.displayName,
    config,
  };
}
