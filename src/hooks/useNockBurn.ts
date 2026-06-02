"use client";

import {
  useAccount,
  useChainId,
  useConfig,
  useSendTransaction,
  useSwitchChain,
} from "wagmi";
import { waitForTransactionReceipt } from "@wagmi/core";
import {
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";
import {
  assertValidNockTokenAddress,
  deriveFullLockRootLimbBytes,
  encodeWithdrawalBurnCalldata,
  nockAmountToTokenUnits,
  withdrawalBurnCommitment,
  WITHDRAWAL_BURN_BASE_CALLDATA_LEN,
  WITHDRAWAL_BURN_CALLDATA_LEN,
  WITHDRAWAL_BURN_TRAILER_MAGIC,
} from "@/lib/nockToken";
import {
  getBridgeNetworkConfig,
  getPreferredBridgeNetworkConfig,
} from "@/lib/bridgeNetworkConfig";

const BURN_FOR_WITHDRAWAL_TOPIC = keccak256(
  toHex(new TextEncoder().encode("BurnForWithdrawal(address,bytes32,uint256)"))
);

function addressFromTopic(topic: Hex | undefined): Address | undefined {
  if (!topic || topic.length !== 66) return undefined;
  return `0x${topic.slice(-40)}` as Address;
}

export function useNockBurn() {
  const { address } = useAccount();
  const { sendTransactionAsync, isPending } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const chainId = useChainId();
  const config = useConfig();

  const burnNock = async (
    amountNock: number,
    destinationNockAddress: string,
    expectedChainId?: number
  ): Promise<string> => {
    if (!address) {
      throw new Error("Connect your wallet before burning NOCK.");
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

    const nockAddress = expectedNetwork.nockTokenAddress;
    assertValidNockTokenAddress(nockAddress);

    const wholeNock = Math.floor(amountNock);
    if (wholeNock <= 0) {
      throw new Error("Burn amount must be at least 1 whole NOCK");
    }
    const amount = nockAmountToTokenUnits(wholeNock);
    const fullLockRootBytes = await deriveFullLockRootLimbBytes(
      destinationNockAddress
    );
    const data = encodeWithdrawalBurnCalldata({
      nockContractAddress: nockAddress as Address,
      burner: address,
      amount,
      fullLockRootBytes,
    });
    const commitment = withdrawalBurnCommitment(
      nockAddress as Address,
      address,
      amount,
      fullLockRootBytes
    );

    console.info("[nockswap] withdrawal burn calldata", {
      spec: "burn selector | amount uint256 | commitment bytes32 | NOCKWD1! | full 40-byte lock root",
      chainId: expectedNetwork.chainId,
      nockContractAddress: nockAddress,
      burner: address,
      amountRaw: amount.toString(),
      commitment,
      fullLockRootHex: toHex(fullLockRootBytes),
      trailerMagicHex: toHex(WITHDRAWAL_BURN_TRAILER_MAGIC),
      baseCalldataBytes: WITHDRAWAL_BURN_BASE_CALLDATA_LEN,
      fullCalldataBytes: WITHDRAWAL_BURN_CALLDATA_LEN,
      actualCalldataBytes: (data.length - 2) / 2,
      calldata: data,
    });

    const hash = await sendTransactionAsync({
      to: nockAddress as Address,
      data,
      chainId: expectedNetwork.chainId,
    });

    void waitForTransactionReceipt(config, {
      hash,
      chainId: expectedNetwork.chainId,
    })
      .then((receipt) => {
        const nockAddressLower = nockAddress.toLowerCase();
        const burnLogs = receipt.logs.filter(
          (log) =>
            log.address.toLowerCase() === nockAddressLower &&
            log.topics[0]?.toLowerCase() === BURN_FOR_WITHDRAWAL_TOPIC
        );

        console.info("[nockswap] withdrawal burn receipt", {
          txHash: hash,
          status: receipt.status,
          blockNumber: receipt.blockNumber.toString(),
          gasUsed: receipt.gasUsed.toString(),
          nockBurnForWithdrawalLogCount: burnLogs.length,
        });

        for (const [index, log] of burnLogs.entries()) {
          const chainBurner = addressFromTopic(log.topics[1]);
          const chainCommitment = log.topics[2];
          const chainAmountRaw = BigInt(log.data);
          console.info("[nockswap] chain BurnForWithdrawal log", {
            txHash: hash,
            logIndex: index,
            chainBurner,
            expectedBurner: address,
            burnerMatches:
              chainBurner?.toLowerCase() === address.toLowerCase(),
            chainCommitment,
            expectedCommitment: commitment,
            commitmentMatches:
              chainCommitment?.toLowerCase() === commitment.toLowerCase(),
            chainAmountRaw: chainAmountRaw.toString(),
            expectedAmountRaw: amount.toString(),
            amountMatches: chainAmountRaw === amount,
          });
        }
      })
      .catch((err) => {
        console.warn("[nockswap] failed to read withdrawal burn receipt", {
          txHash: hash,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return hash;
  };

  return { burnNock, isBurning: isPending };
}
