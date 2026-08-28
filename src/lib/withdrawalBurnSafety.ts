import type { Hex } from "viem";

interface ChainBoundClient {
  chain: { id: number };
}

export function selectWithdrawalBurnClient<T extends ChainBoundClient>(
  expectedChainId: number,
  resolve: (chainId: number) => T | undefined
): T {
  const client = resolve(expectedChainId);
  if (!client || client.chain.id !== expectedChainId) {
    throw new Error("Base RPC client is unavailable for the selected bridge network.");
  }
  return client;
}

export function assertWithdrawalBurnerCodeSupported(code: Hex | undefined): void {
  if (code && code !== "0x") {
    throw new Error(
      "Contract-wallet and delegated-account withdrawals are unsupported. Use an EOA as the Base burner."
    );
  }
}
