import { base58 } from "@scure/base";
import {
  bytesToHex,
  encodeFunctionData,
  isAddress,
  isHex,
  parseUnits,
  zeroHash,
} from "viem";
import {
  getActiveBridgeConfig,
  type BridgeConfig,
} from "@/lib/bridgeConfig";
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
  return getActiveBridgeConfig().nockTokenAddress;
}

export function getMessageInboxAddress(): string | undefined {
  return getActiveBridgeConfig().messageInboxAddress;
}

/**
 * Static lock roots are only valid for local smoke tests where the contract
 * accepts arbitrary calldata and no relayer will honor the destination.
 */
function burnLockRootFromEnv(): `0x${string}` {
  const h = process.env.NEXT_PUBLIC_BURN_LOCK_ROOT_HEX?.trim();
  if (h && isHex(h, { strict: true }) && h.length === 66) {
    return h;
  }
  return zeroHash;
}

export interface BurnLockRootResolution {
  lockRoot: `0x${string}`;
  source: "recipient" | "static-smoke-test";
  nockchainLockRoot?: string;
}

function parseDigestString(value: string, field: string): Digest {
  const trimmed = value.trim();
  const bytes = base58.decode(trimmed);
  if (bytes.length !== 40) {
    throw new Error(`Invalid ${field}: expected a 40-byte base58 digest`);
  }
  return trimmed as Digest;
}

export function lockRootDigestToBytes32(
  lockRootDigest: string
): `0x${string}` {
  const bytes = base58.decode(lockRootDigest.trim());
  if (bytes.length !== 32) {
    throw new Error(
      `Derived Nockchain lock root is ${bytes.length} bytes; the current Base bridge burn ABI accepts only bytes32.`
    );
  }
  return bytesToHex(bytes);
}

function staticBurnLockRootAllowed(config: BridgeConfig): boolean {
  return config.allowStaticBurnLockRoot && config.key !== "mainnet";
}

export async function burnLockRootForNockRecipient(
  recipientNockAddress: string,
  config: BridgeConfig = getActiveBridgeConfig()
): Promise<BurnLockRootResolution> {
  if (staticBurnLockRootAllowed(config)) {
    return {
      lockRoot: burnLockRootFromEnv(),
      source: "static-smoke-test",
    };
  }

  const wasm = await import("@nockbox/iris-wasm");
  if (typeof wasm.default === "function") {
    await wasm.default();
  }

  const recipientPkh = wasm.pkhSingle(
    parseDigestString(recipientNockAddress, "recipient nock address")
  );
  const recipientSpendCondition = wasm.spendConditionNewPkh(recipientPkh);
  const nockchainLockRoot = wasm.lockHash(recipientSpendCondition);
  return {
    lockRoot: lockRootDigestToBytes32(nockchainLockRoot),
    source: "recipient",
    nockchainLockRoot,
  };
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
