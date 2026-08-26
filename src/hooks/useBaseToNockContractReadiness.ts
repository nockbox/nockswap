"use client";

import { useEffect, useMemo, useState } from "react";
import { getAddress, isAddress } from "viem";
import type { Address } from "viem";
import { useChainId, useReadContracts } from "wagmi";

import {
  getBridgeNetworkConfig,
  type BridgeNetworkConfig,
} from "@/lib/bridgeNetworkConfig";

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

export interface PublicBridgeReadiness {
  schemaVersion: 1;
  observedAt: number;
  ready: boolean;
  chainId: number;
  nockTokenAddress: Address;
  messageInboxAddress: Address;
  bridgeSignerPkhs: string[];
  bridgeThreshold: number;
  withdrawalsEnabled: boolean;
  withdrawalWireProtocol: string;
  withdrawalPolicyId: string;
  irisSdkVersion: string;
  reason: string | null;
}

export interface BaseToNockContractReadiness {
  ready: boolean;
  loading: boolean;
  reason: string | null;
  blockers: string[];
  switchRequired: boolean;
}

interface ReadinessInputs {
  chainId: number;
  expectedNetwork: BridgeNetworkConfig | undefined;
  contractsLoading: boolean;
  nockInbox?: unknown;
  inboxNock?: unknown;
  withdrawalsEnabled?: unknown;
  statusLoading: boolean;
  status: PublicBridgeReadiness | null;
  statusError: string | null;
  now: number;
}

export function evaluateBaseToNockReadiness(
  inputs: ReadinessInputs
): BaseToNockContractReadiness {
  const blockers: string[] = [];
  const network = inputs.expectedNetwork;
  if (!network) {
    blockers.push("No authoritative Base bridge deployment is configured.");
    return result(blockers, false, false);
  }
  if (
    !isAddress(network.nockTokenAddress) ||
    !isAddress(network.messageInboxAddress)
  ) {
    blockers.push("Configured Nock or MessageInbox address is invalid.");
  }
  const switchRequired = inputs.chainId !== network.chainId;
  if (switchRequired) {
    blockers.push(`Switch to ${network.label} before confirming.`);
  }
  if (inputs.contractsLoading || inputs.statusLoading) {
    blockers.push("Checking contract and backend readiness.");
    return result(blockers, true, switchRequired);
  }
  if (inputs.nockInbox === undefined) {
    blockers.push("Could not read Nock.inbox().");
  } else if (
    !sameAddress(String(inputs.nockInbox), network.messageInboxAddress)
  ) {
    blockers.push("Configured MessageInbox does not match Nock.inbox().");
  }
  if (inputs.inboxNock === undefined) {
    blockers.push("Could not read MessageInbox.nock().");
  } else if (!sameAddress(String(inputs.inboxNock), network.nockTokenAddress)) {
    blockers.push("Configured Nock token does not match MessageInbox.nock().");
  }
  if (inputs.withdrawalsEnabled !== true) {
    blockers.push(
      inputs.withdrawalsEnabled === undefined
        ? "Could not read MessageInbox.withdrawalsEnabled()."
        : "Withdrawals are disabled on the configured MessageInbox."
    );
  }
  if (inputs.statusError) blockers.push(inputs.statusError);
  if (!inputs.status) {
    blockers.push("Authoritative bridge readiness is unavailable.");
  } else {
    const status = inputs.status;
    if (inputs.now - status.observedAt > 60_000) {
      blockers.push("Authoritative bridge readiness is stale.");
    }
    if (!status.ready) {
      blockers.push(status.reason ?? "Backend reports withdrawals are not ready.");
    }
    if (
      status.chainId !== network.chainId ||
      status.nockTokenAddress !== getAddress(network.nockTokenAddress) ||
      status.messageInboxAddress !== getAddress(network.messageInboxAddress)
    ) {
      blockers.push("Backend readiness deployment identity does not match.");
    }
    if (
      status.bridgeThreshold !== network.bridgeThreshold ||
      !sameStringSet(status.bridgeSignerPkhs, network.bridgeSignerPkhs)
    ) {
      blockers.push("Backend signer roster or threshold does not match.");
    }
    if (
      status.withdrawalWireProtocol !== network.withdrawalWireProtocol ||
      status.withdrawalPolicyId !== network.withdrawalPolicyId ||
      status.irisSdkVersion !== network.irisSdkVersion
    ) {
      blockers.push("Backend protocol, policy, or Iris SDK version does not match.");
    }
    if (!status.withdrawalsEnabled) {
      blockers.push("Backend reports the withdrawal gate is disabled.");
    }
  }
  return result(blockers, false, switchRequired);
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
  const addressesValid = Boolean(
    expectedNetwork &&
      isAddress(expectedNetwork.nockTokenAddress) &&
      isAddress(expectedNetwork.messageInboxAddress)
  );
  const onExpectedChain = expectedNetwork?.chainId === chainId;
  const contractsEnabled = addressesValid && onExpectedChain;
  const { data, isLoading, isFetching } = useReadContracts({
    contracts: expectedNetwork
      ? [
          {
            address: expectedNetwork.nockTokenAddress,
            abi: nockReadinessAbi,
            functionName: "inbox",
            chainId: expectedNetwork.chainId,
          },
          {
            address: expectedNetwork.messageInboxAddress,
            abi: messageInboxReadinessAbi,
            functionName: "nock",
            chainId: expectedNetwork.chainId,
          },
          {
            address: expectedNetwork.messageInboxAddress,
            abi: messageInboxReadinessAbi,
            functionName: "withdrawalsEnabled",
            chainId: expectedNetwork.chainId,
          },
        ]
      : [],
    allowFailure: true,
    query: { enabled: contractsEnabled },
  });
  const [status, setStatus] = useState<PublicBridgeReadiness | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  useEffect(() => {
    if (!expectedNetwork || !onExpectedChain) {
      setStatus(null);
      setStatusError(null);
      setStatusLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    const load = async () => {
      setStatusLoading(true);
      try {
        const response = await fetch(expectedNetwork.publicStatusUrl, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`status HTTP ${response.status}`);
        const parsed = parsePublicReadiness(await response.json());
        if (active) {
          setStatus(parsed);
          setStatusError(null);
        }
      } catch (error) {
        if (active && !controller.signal.aborted) {
          setStatus(null);
          setStatusError(
            `Authoritative bridge readiness failed: ${
              error instanceof Error ? error.message : "unknown error"
            }.`
          );
        }
      } finally {
        if (active) setStatusLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(load, 15_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [expectedNetwork, onExpectedChain]);

  return evaluateBaseToNockReadiness({
    chainId,
    expectedNetwork,
    contractsLoading: isLoading || isFetching,
    nockInbox: data?.[0]?.status === "success" ? data[0].result : undefined,
    inboxNock: data?.[1]?.status === "success" ? data[1].result : undefined,
    withdrawalsEnabled:
      data?.[2]?.status === "success" ? data[2].result : undefined,
    statusLoading,
    status,
    statusError,
    now: Date.now(),
  });
}

function parsePublicReadiness(value: unknown): PublicBridgeReadiness {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("invalid readiness response");
  }
  const candidate = value as Partial<PublicBridgeReadiness>;
  if (
    candidate.schemaVersion !== 1 ||
    !Number.isSafeInteger(candidate.observedAt) ||
    typeof candidate.ready !== "boolean" ||
    !Number.isSafeInteger(candidate.chainId) ||
    !isAddress(candidate.nockTokenAddress ?? "") ||
    !isAddress(candidate.messageInboxAddress ?? "") ||
    !Array.isArray(candidate.bridgeSignerPkhs) ||
    !candidate.bridgeSignerPkhs.every((value) => typeof value === "string") ||
    !Number.isSafeInteger(candidate.bridgeThreshold) ||
    typeof candidate.withdrawalsEnabled !== "boolean" ||
    typeof candidate.withdrawalWireProtocol !== "string" ||
    typeof candidate.withdrawalPolicyId !== "string" ||
    typeof candidate.irisSdkVersion !== "string" ||
    (candidate.reason !== null && typeof candidate.reason !== "string")
  ) {
    throw new Error("unsupported readiness response schema");
  }
  const parsed = candidate as PublicBridgeReadiness;
  return {
    ...parsed,
    nockTokenAddress: getAddress(parsed.nockTokenAddress),
    messageInboxAddress: getAddress(parsed.messageInboxAddress),
  };
}

function result(
  blockers: string[],
  loading: boolean,
  switchRequired: boolean
): BaseToNockContractReadiness {
  return {
    ready: blockers.length === 0,
    loading,
    reason: blockers[0] ?? null,
    blockers,
    switchRequired,
  };
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const a = left.map((value) => value.trim()).sort();
  const b = right.map((value) => value.trim()).sort();
  return a.every((value, index) => value === b[index]);
}
