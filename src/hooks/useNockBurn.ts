"use client";

import { useChainId, useSwitchChain, useWriteContract } from "wagmi";
import {
  assertValidNockTokenAddress,
  burnLockRootFromRecipientPkh,
  nockBurnAbi,
  nockAmountToTokenUnits,
} from "@/lib/nockToken";
import {
  getBridgeNetworkConfig,
  getPreferredBridgeNetworkConfig,
} from "@/lib/bridgeNetworkConfig";

export function useNockBurn() {
  const { writeContractAsync, isPending } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const chainId = useChainId();

  const burnNock = async (
    amountNock: number,
    destinationNockAddress: string,
    expectedChainId?: number
  ): Promise<string> => {
    const expectedNetwork =
      expectedChainId === undefined
        ? getBridgeNetworkConfig(chainId) ?? getPreferredBridgeNetworkConfig()
        : getBridgeNetworkConfig(expectedChainId);

    if (!expectedNetwork) {
      throw new Error(
        expectedChainId === undefined
          ? "No Base bridge network is configured. Set the bridge network environment variables and try again."
          : `No Base bridge network is configured for chain ${expectedChainId}.`
      );
    }

    if (chainId !== expectedNetwork.chainId) {
      await switchChainAsync({ chainId: expectedNetwork.chainId });
    }

    const nockAddress = expectedNetwork.nockTokenAddress;
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
      chainId: expectedNetwork.chainId,
    });
    return hash;
  };

  return { burnNock, isBurning: isPending };
}
