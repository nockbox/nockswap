import type {
  BlockchainConstants,
  Nicks,
  TxEngineSettings,
} from "@nockbox/iris-wasm";
import type {
  BridgeConfig,
  BridgeNockchainConstantsConfig,
} from "@/lib/bridgeConfig";
import {
  getActiveBridgeConfig,
  NADA_DEFAULT_FAKENET_NOCKCHAIN_CONSTANTS,
} from "@/lib/bridgeConfig";

type IrisWasm = typeof import("@nockbox/iris-wasm");

export interface ResolvedNockchainConstants {
  constants: BridgeNockchainConstantsConfig;
  txEngineSettings: TxEngineSettings;
  blockchainConstants: BlockchainConstants;
  source:
    | "bythos-default"
    | "configured"
    | "fakenet-default";
}

function txEngineSettingsConfigFromWasm(
  settings: TxEngineSettings
): BridgeNockchainConstantsConfig["tx_engine_settings"] {
  return {
    tx_engine_version: settings.tx_engine_version,
    tx_engine_patch: settings.tx_engine_patch,
    min_fee: settings.min_fee,
    cost_per_word: settings.cost_per_word,
    witness_word_div: settings.witness_word_div,
  };
}

function blockchainConstantsConfigFromWasm(
  constants: BlockchainConstants
): BridgeNockchainConstantsConfig["blockchain_constants"] {
  return {
    first_month_coinbase_min: constants.first_month_coinbase_min,
    coinbase_timelock_min: constants.coinbase_timelock_min,
  };
}

function bythosDefaultConstants(
  wasm: IrisWasm
): BridgeNockchainConstantsConfig {
  return {
    tx_engine_settings: txEngineSettingsConfigFromWasm(
      wasm.txEngineSettingsV1BythosDefault() as TxEngineSettings
    ),
    blockchain_constants: blockchainConstantsConfigFromWasm(
      wasm.blockchainConstantsMainnet() as BlockchainConstants
    ),
  };
}

function txEngineSettingsFromConstants(
  constants: BridgeNockchainConstantsConfig,
  costPerWordOverride?: bigint
): TxEngineSettings {
  return {
    tx_engine_version: constants.tx_engine_settings.tx_engine_version,
    tx_engine_patch: constants.tx_engine_settings.tx_engine_patch,
    min_fee: constants.tx_engine_settings.min_fee as Nicks,
    cost_per_word:
      costPerWordOverride !== undefined
        ? (String(costPerWordOverride) as Nicks)
        : (constants.tx_engine_settings.cost_per_word as Nicks),
    witness_word_div: constants.tx_engine_settings.witness_word_div,
  };
}

function blockchainConstantsFromConstants(
  constants: BridgeNockchainConstantsConfig
): BlockchainConstants {
  return {
    first_month_coinbase_min:
      constants.blockchain_constants.first_month_coinbase_min,
    coinbase_timelock_min: constants.blockchain_constants.coinbase_timelock_min,
  };
}

function constantsWithCostOverride(
  constants: BridgeNockchainConstantsConfig,
  costPerWordOverride?: bigint
): BridgeNockchainConstantsConfig {
  if (costPerWordOverride === undefined) return constants;
  return {
    ...constants,
    tx_engine_settings: {
      ...constants.tx_engine_settings,
      cost_per_word: String(costPerWordOverride),
    },
  };
}

export async function resolveNockchainConstants(
  wasm: IrisWasm,
  options: {
    config?: BridgeConfig;
    costPerWordOverride?: bigint;
  } = {}
): Promise<ResolvedNockchainConstants> {
  const config = options.config ?? getActiveBridgeConfig();
  const usesFakenetDefaults =
    config.key === "fakenet" || config.key === "bridge-dev";

  const source = config.nockchainConstants
    ? "configured"
    : usesFakenetDefaults
      ? "fakenet-default"
      : "bythos-default";
  const constants = constantsWithCostOverride(
    config.nockchainConstants ??
      (usesFakenetDefaults
        ? NADA_DEFAULT_FAKENET_NOCKCHAIN_CONSTANTS
        : bythosDefaultConstants(wasm)),
    options.costPerWordOverride
  );

  return {
    constants,
    txEngineSettings: txEngineSettingsFromConstants(
      constants,
      options.costPerWordOverride
    ),
    blockchainConstants: blockchainConstantsFromConstants(constants),
    source,
  };
}

export async function resolveTxEngineSettings(
  wasm: IrisWasm,
  options: {
    config?: BridgeConfig;
    costPerWordOverride?: bigint;
  } = {}
): Promise<TxEngineSettings> {
  return (await resolveNockchainConstants(wasm, options)).txEngineSettings;
}
