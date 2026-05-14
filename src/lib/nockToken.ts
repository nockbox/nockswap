import { base58 } from "@scure/base";
import { encodeFunctionData, isAddress, isHex, parseUnits, zeroHash } from "viem";
import type { Digest } from "@nockbox/iris-wasm";

/** Matches `Nock.decimals()` on-chain. */
export const NOCK_TOKEN_DECIMALS = 16;

export const nockBurnAbi = [
  {
    type: "function",
    name: "burn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "lockRoot", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

const nockAbi = nockBurnAbi;

export function getNockTokenAddress(): string | undefined {
  const v = process.env.NEXT_PUBLIC_NOCK_TOKEN_ADDRESS?.trim();
  return v && v.length > 0 ? v : undefined;
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function isLocalSmokeTestChain(chainId: number | undefined): boolean {
  return chainId === 31337 || chainId === 1337;
}

/**
 * Static lock roots are only valid for local contract smoke tests. Production
 * withdrawals must derive the lock root from the user-entered Nockchain PKH.
 */
export function burnLockRootFromEnv(chainId: number | undefined): `0x${string}` {
  if (!isLocalSmokeTestChain(chainId)) {
    throw new Error(
      "Static burn lock roots are only allowed for local smoke tests."
    );
  }

  const h = process.env.NEXT_PUBLIC_BURN_LOCK_ROOT_HEX?.trim();
  if (h && isHex(h, { strict: true }) && h.length === 66) {
    return h;
  }
  return zeroHash;
}

export async function burnLockRootFromRecipientPkh(
  destinationNockAddress: string,
  chainId: number | undefined
): Promise<`0x${string}`> {
  const trimmed = destinationNockAddress.trim();
  let recipientBytes: Uint8Array;
  try {
    recipientBytes = base58.decode(trimmed);
  } catch {
    throw new Error("Enter a valid Nockchain recipient address.");
  }
  if (recipientBytes.length !== 40) {
    throw new Error("Enter a valid Nockchain recipient address.");
  }

  const wasm = await import("@nockbox/iris-wasm");
  if (typeof wasm.default === "function") {
    await wasm.default();
  }

  const recipientSpend = wasm.spendConditionNewPkh(
    wasm.pkhSingle(trimmed as Digest)
  );
  const lockRoot = wasm.spendConditionHash(recipientSpend);
  const lockRootBytes = base58.decode(lockRoot);

  if (lockRootBytes.length === 32) {
    return bytesToHex(lockRootBytes);
  }

  if (isLocalSmokeTestChain(chainId)) {
    return burnLockRootFromEnv(chainId);
  }

  throw new Error(
    `Cannot submit this Base-to-Nock burn safely: the derived Nockchain lock root is ${lockRootBytes.length} bytes, but the current bridge contract accepts only bytes32.`
  );
}

export function encodeNockBurnCalldata(params: {
  amount: bigint;
  lockRoot: `0x${string}`;
}): `0x${string}` {
  return encodeFunctionData({
    abi: nockAbi,
    functionName: "burn",
    args: [params.amount, params.lockRoot],
  });
}

export function assertValidNockTokenAddress(address: string): void {
  const a = address.trim();
  if (!isAddress(a, { strict: false })) {
    throw new Error("Invalid NEXT_PUBLIC_NOCK_TOKEN_ADDRESS");
  }
}

/** NOCK amount (e.g. from the swap input) to uint256 token units (16 decimals). */
export function nockAmountToTokenUnits(nockAmount: number): bigint {
  if (!Number.isFinite(nockAmount) || nockAmount <= 0) {
    throw new Error("Burn amount must be a positive number");
  }
  return parseUnits(nockAmount.toString(), NOCK_TOKEN_DECIMALS);
}
