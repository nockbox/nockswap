import type { Address } from "viem";

export type BridgeNetworkId = "bridge";

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

function parseNonNegativeInteger(value: string | undefined): number | undefined {
  const raw = nonEmpty(value);
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
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
    nockchainConfirmationDepth,
    nockchainGrpcEndpoint: nonEmpty(env.nockchainGrpcEndpoint),
  };
}

export function getBridgeNetworkConfigs(): BridgeNetworkConfig[] {
  return [
    buildBridgeNetworkConfig("bridge", "Bridge", {
      chainId: process.env.NEXT_PUBLIC_BRIDGE_CHAIN_ID,
      nockTokenAddress: process.env.NEXT_PUBLIC_BRIDGE_NOCK_TOKEN_ADDRESS,
      messageInboxAddress:
        process.env.NEXT_PUBLIC_BRIDGE_MESSAGE_INBOX_ADDRESS,
      bridgeSignerPkhs: process.env.NEXT_PUBLIC_BRIDGE_SIGNER_PKHS,
      bridgeThreshold: process.env.NEXT_PUBLIC_BRIDGE_THRESHOLD,
      bridgeLockRoot: process.env.NEXT_PUBLIC_BRIDGE_LOCK_ROOT,
      nockchainConfirmationDepth:
        process.env.NEXT_PUBLIC_BRIDGE_NOCKCHAIN_CONFIRMATION_DEPTH,
      nockchainGrpcEndpoint:
        process.env.NEXT_PUBLIC_BRIDGE_NOCKCHAIN_GRPC_URL,
    }, { nockchainConfirmationDepth: 100 }),
  ].filter((config): config is BridgeNetworkConfig => Boolean(config));
}

export function getBridgeNetworkConfig(
  chainId: number | undefined
): BridgeNetworkConfig | undefined {
  return getBridgeNetworkConfigs().find((config) => config.chainId === chainId);
}

export function getPreferredBridgeNetworkConfig(): BridgeNetworkConfig | undefined {
  const configs = getBridgeNetworkConfigs();
  return configs[0];
}
