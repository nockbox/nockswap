import type { Address } from "viem";

import { BASE_TO_NOCK_WITHDRAWALS_ENABLED } from "./constants";

export type BridgeNetworkId = "mainnet" | "bridge-dev";

export interface BridgeNetworkConfig {
  id: BridgeNetworkId;
  label: string;
  chainId: number;
  nockTokenAddress: Address;
  messageInboxAddress: Address;
  bridgeSignerPkhs: string[];
  bridgeThreshold: number;
  bridgeLockRoot: string;
  nockchainConfirmationDepth: number;
  nockchainGrpcEndpoint?: string;
  publicStatusUrl?: string;
  withdrawalWireProtocol?: string;
  withdrawalPolicyId?: string;
  irisSdkVersion?: string;
}

interface BridgeNetworkEnv {
  chainId?: string;
  nockTokenAddress?: string;
  messageInboxAddress?: string;
  bridgeSignerPkhs?: string;
  bridgeThreshold?: string;
  bridgeLockRoot?: string;
  nockchainConfirmationDepth?: string;
  nockchainGrpcEndpoint?: string;
  publicStatusUrl?: string;
  withdrawalWireProtocol?: string;
  withdrawalPolicyId?: string;
  irisSdkVersion?: string;
}

function nonEmpty(value: string | undefined): string | undefined {
  value = value?.trim();
  return value ? value : undefined;
}

export function parsePublicStatusUrl(value: string | undefined): string | undefined {
  const raw = nonEmpty(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const loopback =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]";
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return undefined;
    }
    return raw;
  } catch {
    return undefined;
  }
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  const raw = nonEmpty(value);
  if (!raw || !/^[1-9][0-9]*$/.test(raw)) return undefined;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseNonNegativeInteger(value: string | undefined): number | undefined {
  const raw = nonEmpty(value);
  if (!raw || !/^(0|[1-9][0-9]*)$/.test(raw)) return undefined;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseList(value: string | undefined): string[] {
  const raw = nonEmpty(value);
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildBridgeNetworkConfig(
  id: BridgeNetworkId,
  label: string,
  env: BridgeNetworkEnv,
  defaults?: { nockchainConfirmationDepth?: number }
): BridgeNetworkConfig | undefined {
  const chainId = parsePositiveInteger(env.chainId);
  const nockTokenAddress = nonEmpty(env.nockTokenAddress);
  const messageInboxAddress = nonEmpty(env.messageInboxAddress);
  const bridgeSignerPkhs = parseList(env.bridgeSignerPkhs);
  const bridgeThreshold = parsePositiveInteger(env.bridgeThreshold);
  const bridgeLockRoot = nonEmpty(env.bridgeLockRoot);
  const publicStatusUrl = parsePublicStatusUrl(env.publicStatusUrl);
  const withdrawalWireProtocol = nonEmpty(env.withdrawalWireProtocol);
  const withdrawalPolicyId = nonEmpty(env.withdrawalPolicyId);
  const irisSdkVersion = nonEmpty(env.irisSdkVersion);
  const nockchainConfirmationDepth =
    parseNonNegativeInteger(env.nockchainConfirmationDepth) ??
    defaults?.nockchainConfirmationDepth ??
    0;

  if (
    !chainId ||
    !nockTokenAddress ||
    !messageInboxAddress ||
    bridgeSignerPkhs.length === 0 ||
    !bridgeThreshold ||
    bridgeThreshold > bridgeSignerPkhs.length ||
    new Set(bridgeSignerPkhs).size !== bridgeSignerPkhs.length ||
    !bridgeLockRoot
  ) {
    return undefined;
  }

  // The withdrawal-facing facts are mandatory only for builds that enable the
  // Base -> Nockchain route; a forward-only deployment stays valid without them.
  if (
    BASE_TO_NOCK_WITHDRAWALS_ENABLED &&
    (!publicStatusUrl ||
      !withdrawalWireProtocol ||
      !withdrawalPolicyId ||
      !irisSdkVersion)
  ) {
    return undefined;
  }

  return {
    id,
    label,
    chainId,
    nockTokenAddress: nockTokenAddress as Address,
    messageInboxAddress: messageInboxAddress as Address,
    bridgeSignerPkhs,
    bridgeThreshold,
    bridgeLockRoot,
    nockchainConfirmationDepth,
    nockchainGrpcEndpoint: nonEmpty(env.nockchainGrpcEndpoint),
    publicStatusUrl,
    withdrawalWireProtocol,
    withdrawalPolicyId,
    irisSdkVersion,
  };
}

export function getBridgeNetworkConfigs(): BridgeNetworkConfig[] {
  return [
    buildBridgeNetworkConfig("mainnet", "Base mainnet", {
      chainId: process.env.NEXT_PUBLIC_BRIDGE_MAINNET_CHAIN_ID,
      nockTokenAddress:
        process.env.NEXT_PUBLIC_BRIDGE_MAINNET_NOCK_TOKEN_ADDRESS,
      messageInboxAddress:
        process.env.NEXT_PUBLIC_BRIDGE_MAINNET_MESSAGE_INBOX_ADDRESS,
      bridgeSignerPkhs:
        process.env.NEXT_PUBLIC_BRIDGE_MAINNET_SIGNER_PKHS,
      bridgeThreshold:
        process.env.NEXT_PUBLIC_BRIDGE_MAINNET_THRESHOLD,
      bridgeLockRoot:
        process.env.NEXT_PUBLIC_BRIDGE_MAINNET_LOCK_ROOT,
      nockchainConfirmationDepth:
        process.env.NEXT_PUBLIC_BRIDGE_MAINNET_NOCKCHAIN_CONFIRMATION_DEPTH,
      nockchainGrpcEndpoint:
        process.env.NEXT_PUBLIC_BRIDGE_MAINNET_NOCKCHAIN_GRPC_URL,
      publicStatusUrl:
        process.env.NEXT_PUBLIC_BRIDGE_MAINNET_PUBLIC_STATUS_URL,
      withdrawalWireProtocol:
        process.env.NEXT_PUBLIC_BRIDGE_MAINNET_WITHDRAWAL_WIRE_PROTOCOL,
      withdrawalPolicyId:
        process.env.NEXT_PUBLIC_BRIDGE_MAINNET_WITHDRAWAL_POLICY_ID,
      irisSdkVersion:
        process.env.NEXT_PUBLIC_BRIDGE_MAINNET_IRIS_SDK_VERSION,
    }, { nockchainConfirmationDepth: 100 }),
    buildBridgeNetworkConfig("bridge-dev", "Bridge dev", {
      chainId: process.env.NEXT_PUBLIC_BRIDGE_DEV_CHAIN_ID,
      nockTokenAddress: process.env.NEXT_PUBLIC_BRIDGE_DEV_NOCK_TOKEN_ADDRESS,
      messageInboxAddress:
        process.env.NEXT_PUBLIC_BRIDGE_DEV_MESSAGE_INBOX_ADDRESS,
      bridgeSignerPkhs: process.env.NEXT_PUBLIC_BRIDGE_DEV_SIGNER_PKHS,
      bridgeThreshold: process.env.NEXT_PUBLIC_BRIDGE_DEV_THRESHOLD,
      bridgeLockRoot: process.env.NEXT_PUBLIC_BRIDGE_DEV_LOCK_ROOT,
      nockchainConfirmationDepth:
        process.env.NEXT_PUBLIC_BRIDGE_DEV_NOCKCHAIN_CONFIRMATION_DEPTH,
      nockchainGrpcEndpoint:
        process.env.NEXT_PUBLIC_BRIDGE_DEV_NOCKCHAIN_GRPC_URL,
      publicStatusUrl:
        process.env.NEXT_PUBLIC_BRIDGE_DEV_PUBLIC_STATUS_URL,
      withdrawalWireProtocol:
        process.env.NEXT_PUBLIC_BRIDGE_DEV_WITHDRAWAL_WIRE_PROTOCOL,
      withdrawalPolicyId:
        process.env.NEXT_PUBLIC_BRIDGE_DEV_WITHDRAWAL_POLICY_ID,
      irisSdkVersion:
        process.env.NEXT_PUBLIC_BRIDGE_DEV_IRIS_SDK_VERSION,
    }),
  ].filter((config): config is BridgeNetworkConfig => Boolean(config));
}

export function getBridgeNetworkConfig(
  chainId: number | undefined
): BridgeNetworkConfig | undefined {
  return getBridgeNetworkConfigs().find((config) => config.chainId === chainId);
}

export function getPreferredBridgeNetworkConfig(): BridgeNetworkConfig | undefined {
  const configs = getBridgeNetworkConfigs();
  return configs.find((config) => config.id === "mainnet") ?? configs[0];
}
