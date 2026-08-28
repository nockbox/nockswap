"use client";

import { getAccount, getPublicClient } from "@wagmi/core";
import {
  useAccount,
  useChainId,
  useSendTransaction,
  useSwitchChain,
} from "wagmi";
import {
  concat,
  decodeEventLog,
  getAddress,
  keccak256,
  pad,
  toHex,
} from "viem";
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
import { wagmiConfig } from "@/lib/wagmiConfig";
import {
  assertWithdrawalBurnerCodeSupported,
  selectWithdrawalBurnClient,
} from "@/lib/withdrawalBurnSafety";
import type { ExactNockAmount } from "@/lib/nockAmount";

const burnForWithdrawalAbi = [
  {
    type: "event",
    name: "BurnForWithdrawal",
    inputs: [
      { name: "burner", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "lockRoot", type: "bytes32", indexed: true },
    ],
  },
] as const;

export type NockBurnPreparedSubmission = Pick<
  NockBurnSubmission,
  | "submittedTransactionHash"
  | "calldata"
  | "calldataByteLength"
  | "normalizedDestination"
  | "lockRoot"
  | "commitment"
  | "amountBaseUnits"
  | "amountNicks"
>;

export interface NockBurnSubmission {
  transactionHash: Hex;
  submittedTransactionHash: Hex;
  blockNumber: string;
  blockHash: Hex;
  logIndex: number;
  baseEventId: Hex;
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
    expectedChainId?: number,
    onSubmitted?: (submission: NockBurnPreparedSubmission) => void | Promise<void>,
    onReplaced?: (transactionHash: Hex) => void | Promise<void>
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
    const activeWallet = getAccount(wagmiConfig);
    if (
      activeWallet.chainId !== expectedNetwork.chainId ||
      !activeWallet.address ||
      getAddress(activeWallet.address) !== getAddress(address)
    ) {
      throw new Error(
        "Base wallet account or chain changed while preparing the withdrawal."
      );
    }
    const burnerAddress = getAddress(activeWallet.address);
    const expectedPublicClient = selectWithdrawalBurnClient(
      expectedNetwork.chainId,
      (expectedChainId) =>
        getPublicClient(wagmiConfig, {
          chainId: expectedChainId,
        })
    );
    const burnerCode = await expectedPublicClient.getCode({ address: burnerAddress });
    assertWithdrawalBurnerCodeSupported(burnerCode);

    const amountBaseUnits = nockAmountToTokenUnits(exactAmount.baseUnits);
    const destination = await resolveNockWithdrawalDestination(
      destinationNockAddress
    );
    const encoded = encodeNockBurnCalldata({
      nockTokenAddress: expectedNetwork.nockTokenAddress,
      burnerAddress,
      amountBaseUnits,
      destination,
    });
    const publicClient = expectedPublicClient;
    const submittedTransactionHash = await sendTransactionAsync({
      to: expectedNetwork.nockTokenAddress as Hex,
      data: encoded.calldata,
      chainId: expectedNetwork.chainId,
    });
    await onSubmitted?.({
      submittedTransactionHash,
      calldata: encoded.calldata,
      calldataByteLength: 116,
      normalizedDestination: destination.normalizedDestination,
      lockRoot: destination.lockRoot,
      commitment: encoded.commitment,
      amountBaseUnits: amountBaseUnits.toString(),
      amountNicks: encoded.amountNicks.toString(),
    });
    let transactionHash = submittedTransactionHash;
    let replacementPersistence = Promise.resolve();
    const receipt = await publicClient
      .waitForTransactionReceipt({
        hash: submittedTransactionHash,
        confirmations: 1,
        onReplaced(replacement) {
          const replacementHash = replacement.transaction.hash;
          transactionHash = replacementHash;
          replacementPersistence = replacementPersistence.then(async () => {
            await onReplaced?.(replacementHash);
          });
        },
      })
      .catch(async (error: unknown) => {
        await replacementPersistence;
        throw error;
      });
    await replacementPersistence;
    transactionHash = receipt.transactionHash;
    if (receipt.status !== "success") {
      throw new Error("Base burn transaction reverted.");
    }
    const transaction = await publicClient.getTransaction({
      hash: transactionHash,
    });
    if (
      transaction.input.toLowerCase() !== encoded.calldata.toLowerCase() ||
      getAddress(transaction.from) !== burnerAddress ||
      transaction.to === null ||
      getAddress(transaction.to) !== getAddress(expectedNetwork.nockTokenAddress)
    ) {
      throw new Error("Mined Base transaction does not match the prepared burn.");
    }
    const matchingLogs = receipt.logs.flatMap((log) => {
      if (
        getAddress(log.address) !== getAddress(expectedNetwork.nockTokenAddress)
      ) {
        return [];
      }
      try {
        const decoded = decodeEventLog({
          abi: burnForWithdrawalAbi,
          data: log.data,
          topics: log.topics,
          eventName: "BurnForWithdrawal",
          strict: true,
        });
        return getAddress(decoded.args.burner) === burnerAddress &&
          decoded.args.amount === amountBaseUnits &&
          decoded.args.lockRoot.toLowerCase() === encoded.commitment.toLowerCase()
          ? [{ log, decoded }]
          : [];
      } catch {
        return [];
      }
    });
    if (matchingLogs.length !== 1) {
      throw new Error(
        `Expected one matching BurnForWithdrawal log, observed ${matchingLogs.length}.`
      );
    }
    const logIndex = matchingLogs[0].log.logIndex;
    const baseEventId = keccak256(
      concat([transactionHash, pad(toHex(logIndex), { size: 32 })])
    );
    return {
      transactionHash,
      submittedTransactionHash,
      blockNumber: receipt.blockNumber.toString(),
      blockHash: receipt.blockHash,
      logIndex,
      baseEventId,
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
