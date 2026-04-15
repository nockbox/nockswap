/**
 * Nockchain gRPC URL for browser-side balance/tx helpers (iris-wasm `GrpcClient`).
 *
 * Iris supplies an endpoint on connect; for Base→Nock flows users may only use EVM,
 * so we also support a public read URL from env.
 */
export function resolveNockchainGrpcUrl(
  walletGrpcEndpoint: string | null | undefined
): string | null {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_NOCKCHAIN_GRPC_URL?.trim()
      : undefined;
  if (fromEnv) {
    return fromEnv;
  }
  const fromWallet = walletGrpcEndpoint?.trim();
  return fromWallet || null;
}
