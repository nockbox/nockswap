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
import {
  MIN_BRIDGE_AMOUNT_NOCK,
  ZORP_BRIDGE_ADDRESSES,
  ZORP_BRIDGE_LOCK_ROOT,
  ZORP_BRIDGE_THRESHOLD,
} from "./constants";

const NOCK_TO_NICKS = 65_536n;

export const BRIDGE_NOTE_KEY = "bridge";

export { ZORP_BRIDGE_THRESHOLD, ZORP_BRIDGE_ADDRESSES, ZORP_BRIDGE_LOCK_ROOT };

export { evmAddressToBelts, verifyBeltEncoding } from "@nockbox/iris-sdk";

export function getZorpBridgeConfig(): BridgeConfig {
  return {
    threshold: ZORP_BRIDGE_THRESHOLD,
    addresses: [...ZORP_BRIDGE_ADDRESSES],
    noteDataKey: BRIDGE_NOTE_KEY,
    chainTag: "65736162",
    versionTag: "0",
    minAmountNicks: String(
      BigInt(MIN_BRIDGE_AMOUNT_NOCK) * NOCK_TO_NICKS
    ) as Nicks,
    expectedLockRoot: ZORP_BRIDGE_LOCK_ROOT,
  };
}

/** Bridge tx build/validate options using the wallet-supplied activation map (from `connect`). */
export function bridgeOptionsFromActivationHeights(
  txEngineActivationHeights: Record<number, TxEngineSettings>
): BuildBridgeTransactionOptions {
  return {
    txEngineSettings: getLatestTxEngineSettings(txEngineActivationHeights),
  };
}

export function isBridgeConfigured(): boolean {
  return irisSdkIsBridgeConfigured(getZorpBridgeConfig());
}
