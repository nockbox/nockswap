import { getActiveBridgeConfig } from "@/lib/bridgeConfig";

/**
 * Nockchain gRPC URL for browser-side balance/tx helpers (iris-wasm `GrpcClient`).
 *
 * Iris supplies an endpoint on connect; for Base→Nock flows users may only use EVM,
 * so we also support the active bridge network's public read URL.
 */
export function resolveNockchainGrpcUrl(
  walletGrpcEndpoint: string | null | undefined
): string | null {
  const configured = getActiveBridgeConfig().nockchainGrpcEndpoint?.trim();
  if (configured) {
    return configured;
  }
  const fromWallet = walletGrpcEndpoint?.trim();
  return fromWallet || null;
}
