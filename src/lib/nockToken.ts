import { base58 } from "@scure/base";
import {
  concatHex,
  isAddress,
  keccak256,
  numberToHex,
  parseUnits,
  toFunctionSelector,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { initWasm, wasm } from "@nockbox/iris-sdk";
import type { Digest } from "@nockbox/iris-sdk/wasm";
import { getBridgeNetworkConfig } from "@/lib/bridgeNetworkConfig";

/** Matches `Nock.decimals()` on-chain. */
export const NOCK_TOKEN_DECIMALS = 16;

export const WITHDRAWAL_BURN_TRAILER_MAGIC = new TextEncoder().encode("NOCKWD1!");
export const WITHDRAWAL_BURN_FULL_LOCK_ROOT_LEN = 40;
export const WITHDRAWAL_BURN_BASE_CALLDATA_LEN = 4 + 32 + 32;
export const WITHDRAWAL_BURN_TRAILER_LEN =
  WITHDRAWAL_BURN_TRAILER_MAGIC.length + WITHDRAWAL_BURN_FULL_LOCK_ROOT_LEN;
export const WITHDRAWAL_BURN_CALLDATA_LEN =
  WITHDRAWAL_BURN_BASE_CALLDATA_LEN + WITHDRAWAL_BURN_TRAILER_LEN;

const WITHDRAWAL_BURN_COMMITMENT_DOMAIN = new TextEncoder().encode(
  "nock-withdrawal-calldata-v1"
);

export function getNockTokenAddress(chainId: number | undefined): string | undefined {
  return getBridgeNetworkConfig(chainId)?.nockTokenAddress;
}

async function ensureIrisWasmInitialized(): Promise<typeof wasm> {
  await initWasm();
  return wasm;
}

function digestToBeLimbBytes(digest: Digest, wasmApi: typeof wasm): Uint8Array {
  const pb = wasmApi.digestToProtobuf(digest);
  const limbs = [
    pb.belt_1?.value,
    pb.belt_2?.value,
    pb.belt_3?.value,
    pb.belt_4?.value,
    pb.belt_5?.value,
  ];
  const requiredLimbs: string[] = [];
  for (const limb of limbs) {
    if (limb === undefined) {
      throw new Error("Invalid digest protobuf: expected five belt values");
    }
    requiredLimbs.push(limb);
  }

  const bytes = new Uint8Array(WITHDRAWAL_BURN_FULL_LOCK_ROOT_LEN);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < 5; i++) {
    view.setBigUint64(i * 8, BigInt(requiredLimbs[i]!), false);
  }
  return bytes;
}

/** Derive the 40-byte Tip5 lock root (limb encoding) for a Nockchain recipient PKH. */
export async function deriveFullLockRootLimbBytes(
  destinationNockAddress: string
): Promise<Uint8Array> {
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

  const wasmApi = await ensureIrisWasmInitialized();
  const recipientSpend = wasmApi.spendConditionNewPkh(
    wasmApi.pkhSingle(trimmed as Digest)
  );
  const lockRoot = wasmApi.spendConditionHash(recipientSpend) as Digest;
  return digestToBeLimbBytes(lockRoot, wasmApi);
}

function padUint256(value: bigint): Hex {
  return numberToHex(value, { size: 32 });
}

export function withdrawalBurnCommitment(
  nockContractAddress: Address,
  burner: Address,
  amountRaw: bigint,
  fullLockRootBytes: Uint8Array
): Hex {
  if (fullLockRootBytes.length !== WITHDRAWAL_BURN_FULL_LOCK_ROOT_LEN) {
    throw new Error(
      `Full lock root must be ${WITHDRAWAL_BURN_FULL_LOCK_ROOT_LEN} bytes`
    );
  }

  return keccak256(
    concatHex([
      toHex(WITHDRAWAL_BURN_COMMITMENT_DOMAIN),
      nockContractAddress,
      burner,
      padUint256(amountRaw),
      toHex(fullLockRootBytes),
    ])
  );
}

/** Encode `Nock.burn` calldata with the bridge withdrawal trailer. */
export function encodeWithdrawalBurnCalldata(params: {
  nockContractAddress: Address;
  burner: Address;
  amount: bigint;
  fullLockRootBytes: Uint8Array;
}): Hex {
  const { nockContractAddress, burner, amount, fullLockRootBytes } = params;
  if (fullLockRootBytes.length !== WITHDRAWAL_BURN_FULL_LOCK_ROOT_LEN) {
    throw new Error(
      `Full lock root must be ${WITHDRAWAL_BURN_FULL_LOCK_ROOT_LEN} bytes`
    );
  }

  const commitment = withdrawalBurnCommitment(
    nockContractAddress,
    burner,
    amount,
    fullLockRootBytes
  );

  const calldata = concatHex([
    toFunctionSelector("burn(uint256,bytes32)"),
    padUint256(amount),
    commitment,
    toHex(WITHDRAWAL_BURN_TRAILER_MAGIC),
    toHex(fullLockRootBytes),
  ]);

  const byteLength = (calldata.length - 2) / 2;
  if (byteLength !== WITHDRAWAL_BURN_CALLDATA_LEN) {
    throw new Error(
      `Withdrawal burn calldata must be ${WITHDRAWAL_BURN_CALLDATA_LEN} bytes, got ${byteLength}`
    );
  }

  return calldata;
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
