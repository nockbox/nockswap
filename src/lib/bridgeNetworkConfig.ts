import type { Address } from "viem";

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
  nockchainGrpcEndpoint?: string;
}

interface BridgeNetworkEnv {
  chainId?: string;
  nockTokenAddress?: string;
  messageInboxAddress?: string;
  bridgeSignerPkhs?: string;
  bridgeThreshold?: string;
  bridgeLockRoot?: string;
  nockchainGrpcEndpoint?: string;
}

function nonEmpty(value: string | undefined): string | undefined {
  value = value?.trim();
  return value ? value : undefined;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  const raw = nonEmpty(value);
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
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
  env: BridgeNetworkEnv
): BridgeNetworkConfig | undefined {
  const chainId = parsePositiveInteger(env.chainId);
  const nockTokenAddress = nonEmpty(env.nockTokenAddress);
  const messageInboxAddress = nonEmpty(env.messageInboxAddress);
  const bridgeSignerPkhs = parseList(env.bridgeSignerPkhs);
  const bridgeThreshold = parsePositiveInteger(env.bridgeThreshold);
  const bridgeLockRoot = nonEmpty(env.bridgeLockRoot);

  if (
    !chainId ||
    !nockTokenAddress ||
    !messageInboxAddress ||
    bridgeSignerPkhs.length === 0 ||
    !bridgeThreshold ||
    !bridgeLockRoot
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
    nockchainGrpcEndpoint: nonEmpty(env.nockchainGrpcEndpoint),
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
      nockchainGrpcEndpoint:
        process.env.NEXT_PUBLIC_BRIDGE_MAINNET_NOCKCHAIN_GRPC_URL,
    }),
    buildBridgeNetworkConfig("bridge-dev", "Bridge dev", {
      chainId: process.env.NEXT_PUBLIC_BRIDGE_DEV_CHAIN_ID,
      nockTokenAddress: process.env.NEXT_PUBLIC_BRIDGE_DEV_NOCK_TOKEN_ADDRESS,
      messageInboxAddress:
        process.env.NEXT_PUBLIC_BRIDGE_DEV_MESSAGE_INBOX_ADDRESS,
      bridgeSignerPkhs: process.env.NEXT_PUBLIC_BRIDGE_DEV_SIGNER_PKHS,
      bridgeThreshold: process.env.NEXT_PUBLIC_BRIDGE_DEV_THRESHOLD,
      bridgeLockRoot: process.env.NEXT_PUBLIC_BRIDGE_DEV_LOCK_ROOT,
      nockchainGrpcEndpoint:
        process.env.NEXT_PUBLIC_BRIDGE_DEV_NOCKCHAIN_GRPC_URL,
    }),
  ].filter((config): config is BridgeNetworkConfig => Boolean(config));
}

export function getBridgeNetworkConfig(
  chainId: number | undefined
): BridgeNetworkConfig | undefined {
  return getBridgeNetworkConfigs().find((config) => config.chainId === chainId);
}
