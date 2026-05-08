export type BridgeNetworkKey = "mainnet" | "fakenet" | "bridge-dev";

export interface BridgeTxEngineSettingsConfig {
  tx_engine_version: 0 | 1 | 2;
  tx_engine_patch: number;
  min_fee: string;
  cost_per_word: string;
  witness_word_div: number;
}

export interface BridgeNoteDataConstantsConfig {
  max_size?: number;
  min_fee?: string;
}

export interface BridgeBlockchainConstantsConfig {
  first_month_coinbase_min: number;
  coinbase_timelock_min: number;
  v1_phase?: number;
  bythos_phase?: number;
  data?: BridgeNoteDataConstantsConfig;
  base_fee?: string;
  input_fee_divisor?: number;
}

export interface BridgeNockchainConstantsConfig {
  tx_engine_settings: BridgeTxEngineSettingsConfig;
  blockchain_constants: BridgeBlockchainConstantsConfig;
}

export interface BridgeConfig {
  key: BridgeNetworkKey;
  displayName: string;
  evmChainId: number;
  nockTokenAddress?: `0x${string}`;
  messageInboxAddress?: `0x${string}`;
  bridgeSignerPkhs: string[];
  bridgeSignerAddresses: `0x${string}`[];
  bridgeThreshold: number;
  bridgeLockRoot: string;
  nockchainGrpcEndpoint?: string;
  nockchainConfirmationDepth: number;
  nockchainConstants?: BridgeNockchainConstantsConfig;
  allowStaticBurnLockRoot: boolean;
  requireWithdrawalsEnabled: boolean;
}

export const NADA_DEFAULT_FAKENET_NOCKCHAIN_CONSTANTS: BridgeNockchainConstantsConfig =
  {
    tx_engine_settings: {
      tx_engine_version: 1,
      tx_engine_patch: 0,
      min_fee: "256",
      cost_per_word: "128",
      witness_word_div: 4,
    },
    blockchain_constants: {
      first_month_coinbase_min: 0,
      coinbase_timelock_min: 1,
      v1_phase: 1,
      bythos_phase: 1,
      data: {
        max_size: 2048,
        min_fee: "256",
      },
      base_fee: "128",
      input_fee_divisor: 4,
    },
  };

const MAINNET_BRIDGE_SIGNER_PKHS = [
  "AD6Mw1QUnPUrnVpyj2gW2jT6Jd6WsuZQmPn79XpZoFEocuvV12iDkvh",
  "6KrZT5hHLY1fva9AUDeGtZu5Jznm4RDLYfjcGjuU49nWoNym5ZeX5X5",
  "CDLzgKWAKFXYABkuQaMwbttDSTDMh3Wy2Eoq2XiArsyxn7vScNHupBb",
  "7E47xYNVEyt7jGmLsiChUHnyw88AfBvzJfXfEQkPmMo2ZWsdcPudwmV",
  "3xSyK6RQUaYzE8YDUamkpKRHALxaYo8E7eppawwE4sP35c3PASc6koq",
] as const;

const MAINNET_BRIDGE_LOCK_ROOT =
  "AcsPkuhXQoGeEsF91yynpm1kcW17PQ2Z1MEozgx7YnDPkZwrtzLuuqd";

export const NADA_BRIDGE_DEV_CHAIN_ID = 84532;
export const NADA_BRIDGE_DEV_NOCK_TOKEN_ADDRESS =
  "0x264dD62cBa32F8089Bf855fcB4bd5f6C8690fe22";
export const NADA_BRIDGE_DEV_MESSAGE_INBOX_ADDRESS =
  "0xF64BCca17733F76CF837E2FBf108F90120196D39";
export const NADA_BRIDGE_DEV_BRIDGE_SIGNER_ADDRESSES = [
  "0x2c7536E3605D9C16a7a3D7b1898e529396a65c23",
  "0x0EE156f080d9cB3BaA3C0DB53D07f13D69CEf4C9",
  "0x274BD645de480C325D618c60c661F11275eB77F1",
  "0x6dc59eb20f7928935c47A391e35545a2CEC51013",
  "0xcaB10dA05fC0aDBb7e91Eadc30f224bcDF601375",
] as const;
export const NADA_BRIDGE_DEV_BRIDGE_SIGNER_PKHS = [
  "A47ZMEQ2U2x1h3bVMUNdkutKYNiyXFWMVTQZC8BWgXBmS5mc6ysAhLZ",
  "BYp766x6Zhu7DHbewMHu7ajsAenRMm1M7rgmpxUwY83BJy4RGMAG2z8",
  "2f7BtZpaaKVb9mCUFgMuYjcQXhrexfqCJs4h1es5t9jQrqdmhVgYLU6",
  "BLCg8KPPKDJPJ8hhdHSGsurxgKwBorqpF1qrHsCiojsPf96GEzwsFQ",
  "AeZ1jsSHoAg7bjBr2k4kMeRERsx85Bp68tfTMiiYZtjFRCtc4gexNWc",
] as const;
export const NADA_BRIDGE_DEV_BRIDGE_THRESHOLD = 3;
export const NADA_BRIDGE_DEV_BRIDGE_LOCK_ROOT =
  "79FBgCdsSVSJ8RtWtRbndRZ8Qg7WjhKgYPY8K722ntd3crFWnWXFZf4";
export const NADA_BRIDGE_DEV_NOCKCHAIN_GRPC_ENDPOINT =
  "http://127.0.0.1:5002";
export const NADA_BRIDGE_DEV_NOCKCHAIN_CONFIRMATION_DEPTH = 1;

const env = {
  bridgeNetwork: process.env.NEXT_PUBLIC_BRIDGE_NETWORK,
  allowStaticBurnLockRoot: process.env.NEXT_PUBLIC_ALLOW_STATIC_BURN_LOCK_ROOT,
  requireWithdrawalsEnabled:
    process.env.NEXT_PUBLIC_REQUIRE_WITHDRAWALS_ENABLED,

  chainId: process.env.NEXT_PUBLIC_BRIDGE_CHAIN_ID,
  nockTokenAddress: process.env.NEXT_PUBLIC_NOCK_TOKEN_ADDRESS,
  messageInboxAddress: process.env.NEXT_PUBLIC_MESSAGE_INBOX_ADDRESS,
  bridgeSignerPkhs: process.env.NEXT_PUBLIC_BRIDGE_SIGNER_PKHS,
  bridgeSignerAddresses:
    process.env.NEXT_PUBLIC_BRIDGE_SIGNER_ADDRESSES ??
    process.env.NEXT_PUBLIC_BRIDGE_NODE_ADDRESSES,
  bridgeThreshold: process.env.NEXT_PUBLIC_BRIDGE_THRESHOLD,
  bridgeLockRoot: process.env.NEXT_PUBLIC_BRIDGE_LOCK_ROOT,
  nockchainGrpcEndpoint: process.env.NEXT_PUBLIC_NOCKCHAIN_GRPC_URL,
  nockchainConfirmationDepth:
    process.env.NEXT_PUBLIC_NOCKCHAIN_CONFIRMATION_DEPTH,

  mainnetChainId: process.env.NEXT_PUBLIC_MAINNET_CHAIN_ID,
  mainnetNockTokenAddress:
    process.env.NEXT_PUBLIC_MAINNET_NOCK_TOKEN_ADDRESS,
  mainnetMessageInboxAddress:
    process.env.NEXT_PUBLIC_MAINNET_MESSAGE_INBOX_ADDRESS,
  mainnetBridgeSignerPkhs:
    process.env.NEXT_PUBLIC_MAINNET_BRIDGE_SIGNER_PKHS,
  mainnetBridgeSignerAddresses:
    process.env.NEXT_PUBLIC_MAINNET_BRIDGE_SIGNER_ADDRESSES ??
    process.env.NEXT_PUBLIC_MAINNET_BRIDGE_NODE_ADDRESSES,
  mainnetBridgeThreshold:
    process.env.NEXT_PUBLIC_MAINNET_BRIDGE_THRESHOLD,
  mainnetBridgeLockRoot:
    process.env.NEXT_PUBLIC_MAINNET_BRIDGE_LOCK_ROOT,
  mainnetNockchainGrpcEndpoint:
    process.env.NEXT_PUBLIC_MAINNET_NOCKCHAIN_GRPC_URL,
  mainnetNockchainConfirmationDepth:
    process.env.NEXT_PUBLIC_MAINNET_NOCKCHAIN_CONFIRMATION_DEPTH,

  fakenetChainId: process.env.NEXT_PUBLIC_FAKENET_CHAIN_ID,
  fakenetNockTokenAddress:
    process.env.NEXT_PUBLIC_FAKENET_NOCK_TOKEN_ADDRESS,
  fakenetMessageInboxAddress:
    process.env.NEXT_PUBLIC_FAKENET_MESSAGE_INBOX_ADDRESS,
  fakenetBridgeSignerPkhs:
    process.env.NEXT_PUBLIC_FAKENET_BRIDGE_SIGNER_PKHS,
  fakenetBridgeSignerAddresses:
    process.env.NEXT_PUBLIC_FAKENET_BRIDGE_SIGNER_ADDRESSES ??
    process.env.NEXT_PUBLIC_FAKENET_BRIDGE_NODE_ADDRESSES,
  fakenetBridgeThreshold:
    process.env.NEXT_PUBLIC_FAKENET_BRIDGE_THRESHOLD,
  fakenetBridgeLockRoot:
    process.env.NEXT_PUBLIC_FAKENET_BRIDGE_LOCK_ROOT,
  fakenetNockchainGrpcEndpoint:
    process.env.NEXT_PUBLIC_FAKENET_NOCKCHAIN_GRPC_URL,
  fakenetNockchainConfirmationDepth:
    process.env.NEXT_PUBLIC_FAKENET_NOCKCHAIN_CONFIRMATION_DEPTH,

  bridgeDevChainId: process.env.NEXT_PUBLIC_BRIDGE_DEV_CHAIN_ID,
  bridgeDevNockTokenAddress:
    process.env.NEXT_PUBLIC_BRIDGE_DEV_NOCK_TOKEN_ADDRESS,
  bridgeDevMessageInboxAddress:
    process.env.NEXT_PUBLIC_BRIDGE_DEV_MESSAGE_INBOX_ADDRESS,
  bridgeDevBridgeSignerPkhs:
    process.env.NEXT_PUBLIC_BRIDGE_DEV_BRIDGE_SIGNER_PKHS,
  bridgeDevBridgeSignerAddresses:
    process.env.NEXT_PUBLIC_BRIDGE_DEV_BRIDGE_SIGNER_ADDRESSES ??
    process.env.NEXT_PUBLIC_BRIDGE_DEV_BRIDGE_NODE_ADDRESSES,
  bridgeDevBridgeThreshold:
    process.env.NEXT_PUBLIC_BRIDGE_DEV_BRIDGE_THRESHOLD,
  bridgeDevBridgeLockRoot:
    process.env.NEXT_PUBLIC_BRIDGE_DEV_BRIDGE_LOCK_ROOT,
  bridgeDevNockchainGrpcEndpoint:
    process.env.NEXT_PUBLIC_BRIDGE_DEV_NOCKCHAIN_GRPC_URL,
  bridgeDevNockchainConfirmationDepth:
    process.env.NEXT_PUBLIC_BRIDGE_DEV_NOCKCHAIN_CONFIRMATION_DEPTH,
};

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function csv(value: string | undefined): string[] {
  return (
    clean(value)
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

function addressCsv(value: string | undefined): `0x${string}`[] {
  return csv(value).flatMap((item) => {
    const address = evmAddress(item);
    return address ? [address] : [];
  });
}

function intFromEnv(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(clean(value) ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function boolFromEnv(value: string | undefined, fallback: boolean): boolean {
  const normalized = clean(value)?.toLowerCase();
  if (normalized === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(normalized);
}

function evmAddress(value: string | undefined): `0x${string}` | undefined {
  const trimmed = clean(value);
  return trimmed?.startsWith("0x") ? (trimmed as `0x${string}`) : undefined;
}

function activeBridgeNetwork(): BridgeNetworkKey {
  const normalized = clean(env.bridgeNetwork)?.toLowerCase();
  if (normalized === "fakenet") return "fakenet";
  if (normalized === "bridge-dev" || normalized === "bridgedev") {
    return "bridge-dev";
  }
  return "mainnet";
}

function buildMainnetConfig(): BridgeConfig {
  return {
    key: "mainnet",
    displayName: "Base",
    evmChainId: intFromEnv(env.mainnetChainId ?? env.chainId, 8453),
    nockTokenAddress: evmAddress(
      env.mainnetNockTokenAddress ?? env.nockTokenAddress
    ),
    messageInboxAddress: evmAddress(
      env.mainnetMessageInboxAddress ?? env.messageInboxAddress
    ),
    bridgeSignerPkhs:
      csv(env.mainnetBridgeSignerPkhs ?? env.bridgeSignerPkhs).length > 0
        ? csv(env.mainnetBridgeSignerPkhs ?? env.bridgeSignerPkhs)
        : [...MAINNET_BRIDGE_SIGNER_PKHS],
    bridgeSignerAddresses: addressCsv(
      env.mainnetBridgeSignerAddresses ?? env.bridgeSignerAddresses
    ),
    bridgeThreshold: intFromEnv(
      env.mainnetBridgeThreshold ?? env.bridgeThreshold,
      3
    ),
    bridgeLockRoot:
      clean(env.mainnetBridgeLockRoot ?? env.bridgeLockRoot) ??
      MAINNET_BRIDGE_LOCK_ROOT,
    nockchainGrpcEndpoint: clean(
      env.mainnetNockchainGrpcEndpoint ?? env.nockchainGrpcEndpoint
    ),
    nockchainConfirmationDepth: intFromEnv(
      env.mainnetNockchainConfirmationDepth ??
        env.nockchainConfirmationDepth,
      100
    ),
    nockchainConstants: undefined,
    allowStaticBurnLockRoot: false,
    requireWithdrawalsEnabled: boolFromEnv(
      env.requireWithdrawalsEnabled,
      true
    ),
  };
}

function buildFakenetConfig(): BridgeConfig {
  return {
    key: "fakenet",
    displayName: "Fakenet Base",
    evmChainId: intFromEnv(env.fakenetChainId ?? env.chainId, 31337),
    nockTokenAddress: evmAddress(
      env.fakenetNockTokenAddress ?? env.nockTokenAddress
    ),
    messageInboxAddress: evmAddress(
      env.fakenetMessageInboxAddress ?? env.messageInboxAddress
    ),
    bridgeSignerPkhs:
      csv(env.fakenetBridgeSignerPkhs ?? env.bridgeSignerPkhs).length > 0
        ? csv(env.fakenetBridgeSignerPkhs ?? env.bridgeSignerPkhs)
        : [...NADA_BRIDGE_DEV_BRIDGE_SIGNER_PKHS],
    bridgeSignerAddresses: addressCsv(
      env.fakenetBridgeSignerAddresses ?? env.bridgeSignerAddresses
    ),
    bridgeThreshold: intFromEnv(
      env.fakenetBridgeThreshold ?? env.bridgeThreshold,
      NADA_BRIDGE_DEV_BRIDGE_THRESHOLD
    ),
    bridgeLockRoot:
      clean(env.fakenetBridgeLockRoot ?? env.bridgeLockRoot) ??
      NADA_BRIDGE_DEV_BRIDGE_LOCK_ROOT,
    nockchainGrpcEndpoint: clean(
      env.fakenetNockchainGrpcEndpoint ?? env.nockchainGrpcEndpoint
    ),
    nockchainConfirmationDepth: intFromEnv(
      env.fakenetNockchainConfirmationDepth ??
        env.nockchainConfirmationDepth,
      100
    ),
    nockchainConstants: NADA_DEFAULT_FAKENET_NOCKCHAIN_CONSTANTS,
    allowStaticBurnLockRoot: boolFromEnv(
      env.allowStaticBurnLockRoot,
      false
    ),
    requireWithdrawalsEnabled: boolFromEnv(
      env.requireWithdrawalsEnabled,
      false
    ),
  };
}

function buildBridgeDevConfig(): BridgeConfig {
  return {
    key: "bridge-dev",
    displayName: "Bridge Dev",
    evmChainId: intFromEnv(
      env.bridgeDevChainId ?? env.chainId,
      NADA_BRIDGE_DEV_CHAIN_ID
    ),
    nockTokenAddress:
      evmAddress(env.bridgeDevNockTokenAddress ?? env.nockTokenAddress) ??
      NADA_BRIDGE_DEV_NOCK_TOKEN_ADDRESS,
    messageInboxAddress:
      evmAddress(env.bridgeDevMessageInboxAddress ?? env.messageInboxAddress) ??
      NADA_BRIDGE_DEV_MESSAGE_INBOX_ADDRESS,
    bridgeSignerPkhs:
      csv(env.bridgeDevBridgeSignerPkhs ?? env.bridgeSignerPkhs).length > 0
        ? csv(env.bridgeDevBridgeSignerPkhs ?? env.bridgeSignerPkhs)
        : [...NADA_BRIDGE_DEV_BRIDGE_SIGNER_PKHS],
    bridgeSignerAddresses:
      addressCsv(
        env.bridgeDevBridgeSignerAddresses ?? env.bridgeSignerAddresses
      ).length > 0
        ? addressCsv(
            env.bridgeDevBridgeSignerAddresses ?? env.bridgeSignerAddresses
          )
        : [...NADA_BRIDGE_DEV_BRIDGE_SIGNER_ADDRESSES],
    bridgeThreshold: intFromEnv(
      env.bridgeDevBridgeThreshold ?? env.bridgeThreshold,
      NADA_BRIDGE_DEV_BRIDGE_THRESHOLD
    ),
    bridgeLockRoot:
      clean(env.bridgeDevBridgeLockRoot ?? env.bridgeLockRoot) ??
      NADA_BRIDGE_DEV_BRIDGE_LOCK_ROOT,
    nockchainGrpcEndpoint: clean(
      env.bridgeDevNockchainGrpcEndpoint ?? env.nockchainGrpcEndpoint
    ) ?? NADA_BRIDGE_DEV_NOCKCHAIN_GRPC_ENDPOINT,
    nockchainConfirmationDepth: intFromEnv(
      env.bridgeDevNockchainConfirmationDepth ??
        env.nockchainConfirmationDepth,
      NADA_BRIDGE_DEV_NOCKCHAIN_CONFIRMATION_DEPTH
    ),
    nockchainConstants: NADA_DEFAULT_FAKENET_NOCKCHAIN_CONSTANTS,
    allowStaticBurnLockRoot: boolFromEnv(
      env.allowStaticBurnLockRoot,
      false
    ),
    requireWithdrawalsEnabled: boolFromEnv(
      env.requireWithdrawalsEnabled,
      false
    ),
  };
}

export function getBridgeConfig(network = activeBridgeNetwork()): BridgeConfig {
  if (network === "fakenet") return buildFakenetConfig();
  if (network === "bridge-dev") return buildBridgeDevConfig();
  return buildMainnetConfig();
}

export function getActiveBridgeConfig(): BridgeConfig {
  return getBridgeConfig();
}

export function isBridgeConfigComplete(config = getActiveBridgeConfig()): boolean {
  return (
    config.bridgeSignerPkhs.length > 0 &&
    config.bridgeThreshold > 0 &&
    config.bridgeThreshold <= config.bridgeSignerPkhs.length &&
    config.bridgeLockRoot.trim().length > 0
  );
}
