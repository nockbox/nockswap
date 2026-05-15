import { base, baseSepolia } from "viem/chains";

/** `0x` + 64 hex chars */
const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

/**
 * Public block explorer URL for a transaction, when the chain is known.
 * Base / Base Sepolia use Basescan (via viem chain metadata).
 */
export function transactionExplorerUrl(
  chainId: number,
  txHash: string
): string | null {
  const hash = txHash.trim();
  if (!TX_HASH_RE.test(hash)) return null;
  if (chainId === base.id) {
    return `${base.blockExplorers.default.url}/tx/${hash}`;
  }
  if (chainId === baseSepolia.id) {
    return `${baseSepolia.blockExplorers.default.url}/tx/${hash}`;
  }
  return null;
}
