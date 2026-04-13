import { encodeFunctionData, isAddress, isHex, parseUnits, zeroHash } from "viem";

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

/**
 * Lock root passed to `Nock.burn`. Use a real 32-byte commitment for production
 * withdrawals; for Anvil smoke tests `zeroHash` is valid calldata.
 */
export function burnLockRootFromEnv(): `0x${string}` {
  const h = process.env.NEXT_PUBLIC_BURN_LOCK_ROOT_HEX?.trim();
  if (h && isHex(h, { strict: true }) && h.length === 66) {
    return h;
  }
  return zeroHash;
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
