"use client";

import { useChainId, useWriteContract } from "wagmi";
import {
  assertValidNockTokenAddress,
  burnLockRootFromRecipientPkh,
  getNockTokenAddress,
  nockBurnAbi,
  nockAmountToTokenUnits,
} from "@/lib/nockToken";

export function useNockBurn() {
  const { writeContractAsync, isPending } = useWriteContract();
  const chainId = useChainId();

  const burnNock = async (
    amountNock: number,
    destinationNockAddress: string
  ): Promise<string> => {
    const nockAddress = getNockTokenAddress(chainId);
    if (!nockAddress) {
      throw new Error(
        `No Nock token configured for connected chain ${chainId}.`
      );
    }
    assertValidNockTokenAddress(nockAddress);

    const wholeNock = Math.floor(amountNock);
    if (wholeNock <= 0) {
      throw new Error("Burn amount must be at least 1 whole NOCK");
    }
    const amount = nockAmountToTokenUnits(wholeNock);
    const lockRoot = await burnLockRootFromRecipientPkh(destinationNockAddress);

    const hash = await writeContractAsync({
      address: nockAddress as `0x${string}`,
      abi: nockBurnAbi,
      functionName: "burn",
      args: [amount, lockRoot],
    });
    return hash;
  };

  return { burnNock, isBurning: isPending };
}
