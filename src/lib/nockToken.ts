import { base58 } from "@scure/base";
import { encodeFunctionData, isAddress, parseUnits } from "viem";
import type { Digest } from "@nockbox/iris-wasm";
import { getBridgeNetworkConfig } from "@/lib/bridgeNetworkConfig";

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

export function getNockTokenAddress(chainId: number | undefined): string | undefined {
  return getBridgeNetworkConfig(chainId)?.nockTokenAddress;
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function burnLockRootFromRecipientPkh(
  destinationNockAddress: string
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
    throw new Error("Invalid configured Nock token address");
  }
}

/** NOCK amount (e.g. from the swap input) to uint256 token units (16 decimals). */
export function nockAmountToTokenUnits(nockAmount: number): bigint {
  if (!Number.isFinite(nockAmount) || nockAmount <= 0) {
    throw new Error("Burn amount must be a positive number");
  }
  return parseUnits(nockAmount.toString(), NOCK_TOKEN_DECIMALS);
}
