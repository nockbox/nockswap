/**
 * Zorp bridge wiring: config for `@nockbox/iris-sdk` bridge APIs.
 * Transaction build and validation live in the SDK; tx engine settings come from the wallet `rpcConfig`.
 */

import type {
  BridgeConfig,
  BuildBridgeTransactionOptions,
} from "@nockbox/iris-sdk";
import type { Nicks, TxEngineSettings } from "@nockbox/iris-sdk/wasm";
import { getLatestTxEngineSettings, isBridgeConfigured as irisSdkIsBridgeConfigured } from "@nockbox/iris-sdk";
import { MIN_BRIDGE_AMOUNT_NOCK, NICKS_PER_NOCK } from "./constants";
import {
  getBridgeNetworkConfig,
  type BridgeNetworkConfig,
} from "./bridgeNetworkConfig";

export const BRIDGE_NOTE_KEY = "bridge";

export { evmAddressToBelts, verifyBeltEncoding } from "@nockbox/iris-sdk";

function sdkBridgeConfigFromNetwork(config: BridgeNetworkConfig): BridgeConfig {
  return {
    threshold: config.bridgeThreshold,
    addresses: [...config.bridgeSignerPkhs],
    noteDataKey: BRIDGE_NOTE_KEY,
    chainTag: "65736162",
    versionTag: "0",
    minAmountNicks: String(
      MIN_BRIDGE_AMOUNT_NOCK * NICKS_PER_NOCK
    ) as Nicks,
    expectedLockRoot: config.bridgeLockRoot,
  };
}

export function getZorpBridgeConfig(
  chainId: number | undefined
): BridgeConfig | undefined {
  const config = getBridgeNetworkConfig(chainId);
  return config ? sdkBridgeConfigFromNetwork(config) : undefined;
}

/** Bridge tx build/validate options using the wallet-supplied activation map (from `connect`). */
export function bridgeOptionsFromActivationHeights(
  txEngineActivationHeights: Record<number, TxEngineSettings>
): BuildBridgeTransactionOptions {
  return {
    txEngineSettings: getLatestTxEngineSettings(txEngineActivationHeights),
  };
}

export function isBridgeConfigured(chainId: number | undefined): boolean {
  const config = getZorpBridgeConfig(chainId);
  return config ? irisSdkIsBridgeConfigured(config) : false;
}
