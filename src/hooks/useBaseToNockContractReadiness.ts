"use client";

import { isAddress, type Address } from "viem";
import { useMemo } from "react";
import { useChainId, useReadContracts } from "wagmi";
import { getBridgeNetworkConfig } from "@/lib/bridgeNetworkConfig";

const nockReadinessAbi = [
  {
    type: "function",
    name: "inbox",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const messageInboxReadinessAbi = [
  {
    type: "function",
    name: "nock",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "withdrawalsEnabled",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const messageInboxOptionalBridgeAbi = [
  {
    type: "function",
    name: "threshold",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "bridgeThreshold",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "bridgeSignerPkhs",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string[]" }],
  },
  {
    type: "function",
    name: "bridgeNodePkhs",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string[]" }],
  },
] as const;

export interface BaseToNockContractReadiness {
  ready: boolean;
  loading: boolean;
  reason: string | null;
}

function sameAddress(a: string | undefined, b: string | undefined): boolean {
  return a?.toLowerCase() === b?.toLowerCase();
}

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = a.map((value) => value.trim()).sort();
  const right = b.map((value) => value.trim()).sort();
  return left.every((value, index) => value === right[index]);
}

export function useBaseToNockContractReadiness(
  expectedChainId: number | undefined
): BaseToNockContractReadiness {
  const chainId = useChainId();
  const expectedNetwork = useMemo(
    () =>
      expectedChainId === undefined
        ? getBridgeNetworkConfig(chainId)
        : getBridgeNetworkConfig(expectedChainId),
    [chainId, expectedChainId]
  );

  const hasValidAddresses =
    Boolean(expectedNetwork) &&
    isAddress(expectedNetwork!.nockTokenAddress, { strict: false }) &&
    isAddress(expectedNetwork!.messageInboxAddress, { strict: false });
  const onExpectedChain =
    Boolean(expectedNetwork) && chainId === expectedNetwork!.chainId;
  const enabled = hasValidAddresses && onExpectedChain;

  const { data, isLoading, isFetching } = useReadContracts({
    contracts: expectedNetwork
      ? [
          {
            address: expectedNetwork.nockTokenAddress as Address,
            abi: nockReadinessAbi,
            functionName: "inbox",
            chainId: expectedNetwork.chainId,
          },
          {
            address: expectedNetwork.messageInboxAddress as Address,
            abi: messageInboxReadinessAbi,
            functionName: "nock",
            chainId: expectedNetwork.chainId,
          },
          {
            address: expectedNetwork.messageInboxAddress as Address,
            abi: messageInboxReadinessAbi,
            functionName: "withdrawalsEnabled",
            chainId: expectedNetwork.chainId,
          },
          {
            address: expectedNetwork.messageInboxAddress as Address,
            abi: messageInboxOptionalBridgeAbi,
            functionName: "threshold",
            chainId: expectedNetwork.chainId,
          },
          {
            address: expectedNetwork.messageInboxAddress as Address,
            abi: messageInboxOptionalBridgeAbi,
            functionName: "bridgeThreshold",
            chainId: expectedNetwork.chainId,
          },
          {
            address: expectedNetwork.messageInboxAddress as Address,
            abi: messageInboxOptionalBridgeAbi,
            functionName: "bridgeSignerPkhs",
            chainId: expectedNetwork.chainId,
          },
          {
            address: expectedNetwork.messageInboxAddress as Address,
            abi: messageInboxOptionalBridgeAbi,
            functionName: "bridgeNodePkhs",
            chainId: expectedNetwork.chainId,
          },
        ]
      : [],
    allowFailure: true,
    query: { enabled },
  });

  return useMemo(() => {
    if (!expectedNetwork) {
      return {
        ready: false,
        loading: false,
        reason:
          "No Base bridge network is configured. Set the bridge network environment variables.",
      };
    }

    if (!hasValidAddresses) {
      return {
        ready: false,
        loading: false,
        reason: "Configured Nock or MessageInbox address is invalid.",
      };
    }

    if (!onExpectedChain) {
      return {
        ready: false,
        loading: false,
        reason: `Switch to ${expectedNetwork.label} before confirming.`,
      };
    }

    if (isLoading || isFetching || !data) {
      return { ready: false, loading: true, reason: "Checking contracts..." };
    }

    const [
      nockInbox,
      inboxNock,
      withdrawalsEnabled,
      threshold,
      bridgeThreshold,
      bridgeSignerPkhs,
      bridgeNodePkhs,
    ] = data;
    if (nockInbox?.status !== "success") {
      return {
        ready: false,
        loading: false,
        reason: "Could not read Nock.inbox().",
      };
    }
    if (
      !sameAddress(String(nockInbox.result), expectedNetwork.messageInboxAddress)
    ) {
      return {
        ready: false,
        loading: false,
        reason: "Configured MessageInbox does not match Nock.inbox().",
      };
    }

    if (inboxNock?.status !== "success") {
      return {
        ready: false,
        loading: false,
        reason: "Could not read MessageInbox.nock().",
      };
    }
    if (!sameAddress(String(inboxNock.result), expectedNetwork.nockTokenAddress)) {
      return {
        ready: false,
        loading: false,
        reason: "Configured Nock token does not match MessageInbox.nock().",
      };
    }

    if (withdrawalsEnabled?.status !== "success") {
      return {
        ready: false,
        loading: false,
        reason: "Could not read MessageInbox.withdrawalsEnabled().",
      };
    }
    if (withdrawalsEnabled.result !== true) {
      return {
        ready: false,
        loading: false,
        reason: "Withdrawals are disabled on the configured MessageInbox.",
      };
    }

    const exposedThreshold =
      threshold?.status === "success"
        ? threshold.result
        : bridgeThreshold?.status === "success"
          ? bridgeThreshold.result
          : undefined;
    if (
      exposedThreshold !== undefined &&
      BigInt(exposedThreshold) !== BigInt(expectedNetwork.bridgeThreshold)
    ) {
      return {
        ready: false,
        loading: false,
        reason: "Contract bridge threshold does not match configured threshold.",
      };
    }

    const exposedSignerPkhs =
      bridgeSignerPkhs?.status === "success"
        ? bridgeSignerPkhs.result
        : bridgeNodePkhs?.status === "success"
          ? bridgeNodePkhs.result
          : undefined;
    if (
      Array.isArray(exposedSignerPkhs) &&
      !sameStringSet(
        exposedSignerPkhs.map(String),
        expectedNetwork.bridgeSignerPkhs
      )
    ) {
      return {
        ready: false,
        loading: false,
        reason: "Contract bridge node roster does not match configured signer PKHs.",
      };
    }

    return { ready: true, loading: false, reason: null };
  }, [
    data,
    expectedNetwork,
    hasValidAddresses,
    isFetching,
    isLoading,
    onExpectedChain,
  ]);
}
