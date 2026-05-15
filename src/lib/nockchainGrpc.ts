/**
 * Nockchain gRPC URL for browser-side balance/tx helpers (iris-wasm `GrpcClient`).
 *
 * Iris supplies an endpoint on connect; for Base→Nock flows users may only use EVM,
 * so a network config may also provide a public read URL for fee estimates.
 */
export function resolveNockchainGrpcUrl(
  walletGrpcEndpoint: string | null | undefined,
  configuredGrpcEndpoint?: string
): string | null {
  const fromWallet = walletGrpcEndpoint?.trim();
  if (fromWallet) {
    return fromWallet;
  }
  return configuredGrpcEndpoint?.trim() || null;
}
