"use client";

import {
  useAccount,
  useChainId,
  useSendTransaction,
  useSwitchChain,
} from "wagmi";
import type { Hex } from "viem";

import {
  encodeNockBurnCalldata,
  nockAmountToTokenUnits,
  resolveNockWithdrawalDestination,
} from "@/lib/nockToken";
import { BASE_TO_NOCK_WITHDRAWALS_ENABLED } from "@/lib/constants";
import {
  getBridgeNetworkConfig,
  getPreferredBridgeNetworkConfig,
} from "@/lib/bridgeNetworkConfig";
import type { ExactNockAmount } from "@/lib/nockAmount";

export interface NockBurnSubmission {
  transactionHash: Hex;
  calldata: Hex;
  calldataByteLength: 116;
  normalizedDestination: string;
  lockRoot: string;
  commitment: Hex;
  amountBaseUnits: string;
  amountNicks: string;
}

export function useNockBurn() {
  const { address } = useAccount();
  const { sendTransactionAsync, isPending } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const chainId = useChainId();

  const burnNock = async (
    exactAmount: ExactNockAmount,
    destinationNockAddress: string,
    expectedChainId?: number
  ): Promise<NockBurnSubmission> => {
    if (!BASE_TO_NOCK_WITHDRAWALS_ENABLED) {
      throw new Error(
        "Base-to-Nockchain withdrawals are not enabled for this release."
      );
    }
    if (!address) {
      throw new Error("Connect the Base wallet before preparing a withdrawal.");
    }

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

    const amountBaseUnits = nockAmountToTokenUnits(exactAmount.baseUnits);
    const destination = await resolveNockWithdrawalDestination(
      destinationNockAddress
    );
    const encoded = encodeNockBurnCalldata({
      nockTokenAddress: expectedNetwork.nockTokenAddress,
      burnerAddress: address,
      amountBaseUnits,
      destination,
    });
    const transactionHash = await sendTransactionAsync({
      to: expectedNetwork.nockTokenAddress as Hex,
      data: encoded.calldata,
      chainId: expectedNetwork.chainId,
    });
    return {
      transactionHash,
      calldata: encoded.calldata,
      calldataByteLength: 116,
      normalizedDestination: destination.normalizedDestination,
      lockRoot: destination.lockRoot,
      commitment: encoded.commitment,
      amountBaseUnits: amountBaseUnits.toString(),
      amountNicks: encoded.amountNicks.toString(),
    };
  };

  return { burnNock, isBurning: isPending };
}
