import {
  encodeWithdrawalWireV1,
  resolveWithdrawalDestinationV1,
  validateWithdrawalPolicyV1Amount,
} from "@nockbox/iris-sdk/withdrawal";
import type {
  EncodedWithdrawalWireV1,
  ResolvedWithdrawalDestinationV1,
} from "@nockbox/iris-sdk/withdrawal";
import { isAddress } from "viem";

import { getBridgeNetworkConfig } from "@/lib/bridgeNetworkConfig";

/** Matches `Nock.decimals()` on-chain. */
export const NOCK_TOKEN_DECIMALS = 16;

export function getNockTokenAddress(
  chainId: number | undefined
): string | undefined {
  return getBridgeNetworkConfig(chainId)?.nockTokenAddress;
}

export async function resolveNockWithdrawalDestination(
  destinationNockAddress: string
): Promise<ResolvedWithdrawalDestinationV1> {
  try {
    return await resolveWithdrawalDestinationV1({
      kind: "v1_pkh",
      value: destinationNockAddress,
    });
  } catch {
    throw new Error(
      "Enter a canonical Nockchain v1 PKH address that decodes to five Tip5 limbs."
    );
  }
}

export function encodeNockBurnCalldata(params: {
  nockTokenAddress: string;
  burnerAddress: string;
  amountBaseUnits: bigint;
  destination: ResolvedWithdrawalDestinationV1;
}): EncodedWithdrawalWireV1 {
  assertValidNockTokenAddress(params.nockTokenAddress);
  validateWithdrawalPolicyV1Amount(params.amountBaseUnits);
  const encoded = encodeWithdrawalWireV1({
    nockTokenAddress: params.nockTokenAddress,
    burnerAddress: params.burnerAddress,
    amountBaseUnits: params.amountBaseUnits,
    lockRootLimbs: params.destination.lockRootLimbs,
  });
  if (
    encoded.calldata.length !== 2 + 116 * 2 ||
    encoded.lockRootLimbs.length !== 5
  ) {
    throw new Error("Iris SDK returned a noncanonical withdrawal payload.");
  }
  return encoded;
}

export function assertValidNockTokenAddress(address: string): void {
  const normalized = address.trim();
  if (!isAddress(normalized, { strict: false })) {
    throw new Error("Invalid configured Nock token address");
  }
}

/** Exact Base token units from the validated decimal amount pipeline. */
export function nockAmountToTokenUnits(amountBaseUnits: bigint): bigint {
  if (amountBaseUnits <= 0n) {
    throw new Error("Burn amount must be positive.");
  }
  return amountBaseUnits;
}
