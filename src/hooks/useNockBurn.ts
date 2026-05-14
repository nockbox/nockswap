"use client";

import { useWriteContract } from "wagmi";
import {
  assertValidNockTokenAddress,
  burnLockRootFromRecipientPkh,
  getNockTokenAddress,
  nockBurnAbi,
  nockAmountToTokenUnits,
} from "@/lib/nockToken";

export function useNockBurn() {
  const { writeContractAsync, isPending } = useWriteContract();

  const burnNock = async (
    amountNock: number,
    destinationNockAddress: string
  ): Promise<string> => {
    const nockAddress = getNockTokenAddress();
    if (!nockAddress) {
      throw new Error(
        "Set NEXT_PUBLIC_NOCK_TOKEN_ADDRESS to the Nock ERC-20 contract on your target chain."
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
