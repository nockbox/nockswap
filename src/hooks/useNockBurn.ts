"use client";

import { useAccount, useSwitchChain, useWriteContract } from "wagmi";
import {
  assertValidNockTokenAddress,
  burnLockRootForNockRecipient,
  getNockTokenAddress,
  nockBurnAbi,
  nockAmountToTokenUnits,
} from "@/lib/nockToken";
import { getActiveBridgeConfig } from "@/lib/bridgeConfig";

export function useNockBurn() {
  const { chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();

  const burnNock = async (
    amountNock: number,
    destinationNockAddress: string,
    expectedLockRoot?: `0x${string}`
  ): Promise<string> => {
    const bridgeConfig = getActiveBridgeConfig();
    const nockAddress = getNockTokenAddress();
    if (!nockAddress) {
      throw new Error(
        "Configure the Nock token address for the active bridge network."
      );
    }
    assertValidNockTokenAddress(nockAddress);

    if (chainId !== bridgeConfig.evmChainId) {
      await switchChainAsync({ chainId: bridgeConfig.evmChainId });
    }

    const wholeNock = Math.floor(amountNock);
    if (wholeNock <= 0) {
      throw new Error("Burn amount must be at least 1 whole NOCK");
    }
    const amount = nockAmountToTokenUnits(wholeNock);
    const { lockRoot } = await burnLockRootForNockRecipient(
      destinationNockAddress,
      bridgeConfig
    );
    if (
      expectedLockRoot &&
      expectedLockRoot.toLowerCase() !== lockRoot.toLowerCase()
    ) {
      throw new Error("Recipient lock root changed before burn submission.");
    }

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
