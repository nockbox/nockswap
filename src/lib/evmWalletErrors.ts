/**
 * True when an error from wagmi/viem/MetaMask indicates the user dismissed
 * the wallet prompt (vs a contract or network failure).
 */
export function isEvmWalletUserRejection(err: unknown): boolean {
  if (err === null || err === undefined) return false;

  const msg = (() => {
    if (err instanceof Error) return err.message;
    if (typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
      return (err as { message: string }).message;
    }
    return String(err);
  })();

  const lower = msg.toLowerCase();
  if (
    lower.includes("reject") ||
    lower.includes("cancel") ||
    lower.includes("denied") ||
    lower.includes("user rejected")
  ) {
    return true;
  }

  if (typeof err === "object" && err !== null) {
    const o = err as Record<string, unknown>;
    if (o.code === 4001) return true;
    const cause = o.cause;
    if (cause && typeof cause === "object" && (cause as { code?: unknown }).code === 4001) {
      return true;
    }
  }

  return false;
}
