"use client";

import { useEffect, useRef, useState } from "react";

import type { BridgeNetworkConfig } from "@/lib/bridgeNetworkConfig";
import { BASE_TO_NOCK_WITHDRAWALS_ENABLED } from "@/lib/constants";
import {
  isDecimal,
  isPublicResolution,
  transitionWithdrawalRecord,
  type PersistedWithdrawalV1,
  type PublicWithdrawalResolution,
  type WithdrawalLifecycleStatus,
} from "@/lib/withdrawalStore";

const DELAYED_AFTER_MS = 15 * 60 * 1000;

export interface PublicWithdrawalStatusV2 {
  schemaVersion: 2;
  withdrawalId: string;
  baseEventId: string;
  status:
    | "pending"
    | "ready"
    | "submitted"
    | "sequencer_confirmed"
    | "terminal"
    | "reorg_hold"
    | "failed";
  resolution: PublicWithdrawalResolution;
  revision: string;
  recoveryGeneration: number;
  terminalProof: boolean;
  nockTransactionId: string | null;
  nockBlockId: string | null;
  actualPayoutNicks: string | null;
  invalidatedBlockNumber: string | null;
  invalidatedBlockHash: string | null;
  priorStatus: string | null;
  recoveryReason: string | null;
  observedAt: number;
  reason: string | null;
}

export interface PublicWithdrawalHistoryV1 {
  schemaVersion: 1;
  revision: string;
  records: PublicWithdrawalStatusV2[];
}

export interface WithdrawalPollingState {
  records: PersistedWithdrawalV1[];
  publicHistory: PublicWithdrawalStatusV2[];
  loading: boolean;
  transientError: string | null;
}

export interface WithdrawalHistoryRow {
  key: string;
  status: string;
  identity: string;
  revision: string;
  observedAt: number;
  localRecord: PersistedWithdrawalV1 | null;
}

export function mergeWithdrawalHistory(
  localRecords: PersistedWithdrawalV1[],
  publicHistory: PublicWithdrawalStatusV2[]
): WithdrawalHistoryRow[] {
  const publicByBaseEvent = new Map(
    publicHistory.map((status) => [status.baseEventId.toLowerCase(), status])
  );
  const representedBaseEvents = new Set<string>();
  const rows = localRecords.map((record): WithdrawalHistoryRow => {
    const baseEventKey = record.baseEventId?.toLowerCase();
    if (baseEventKey) representedBaseEvents.add(baseEventKey);
    const authoritative = baseEventKey
      ? publicByBaseEvent.get(baseEventKey)
      : undefined;
    return {
      key: `local:${record.recordId}`,
      status: authoritative?.status ?? record.status,
      identity: authoritative?.baseEventId ?? record.baseEventId ?? record.transactionHash,
      revision: authoritative?.revision ?? record.authoritativeRevision,
      observedAt: authoritative?.observedAt ?? record.updatedAt,
      localRecord: record,
    };
  });
  for (const status of publicHistory) {
    const baseEventKey = status.baseEventId.toLowerCase();
    if (representedBaseEvents.has(baseEventKey)) continue;
    representedBaseEvents.add(baseEventKey);
    rows.push({
      key: `public:${status.withdrawalId}`,
      status: status.status,
      identity: status.baseEventId,
      revision: status.revision,
      observedAt: status.observedAt,
      localRecord: null,
    });
  }
  return rows.sort(
    (left, right) =>
      right.observedAt - left.observedAt || right.key.localeCompare(left.key)
  );
}

export function mapPublicWithdrawalStatus(
  record: PersistedWithdrawalV1,
  status: PublicWithdrawalStatusV2,
  now: number
): PersistedWithdrawalV1 {
  if (status.baseEventId.toLowerCase() !== record.baseEventId?.toLowerCase()) {
    throw new Error("Public withdrawal status identity does not match the Base event.");
  }
  const currentRevision = BigInt(record.authoritativeRevision);
  const incomingRevision = BigInt(status.revision);
  if (incomingRevision < currentRevision) {
    throw new Error("Public withdrawal status revision regressed.");
  }
  if (incomingRevision === currentRevision && record.publicResolution !== null) {
    return record;
  }

  const authoritativeFacts = {
    authoritativeRevision: status.revision,
    recoveryGeneration: status.recoveryGeneration,
    publicResolution: status.resolution,
    priorAuthoritativeStatus: status.priorStatus,
    invalidatedBlockNumber: status.invalidatedBlockNumber,
    invalidatedBlockHash: status.invalidatedBlockHash as `0x${string}` | null,
    recoveryReason: status.recoveryReason,
  };
  if (status.status === "terminal") {
    if (
      !status.terminalProof ||
      !status.nockTransactionId ||
      !status.nockBlockId ||
      !status.actualPayoutNicks ||
      BigInt(status.actualPayoutNicks) <= 0n
    ) {
      throw new Error("Terminal status is missing settlement proof.");
    }
    return transitionWithdrawalRecord(record, "confirmed", now, "Settlement proven.", {
      ...authoritativeFacts,
      nockTransactionId: status.nockTransactionId,
      nockBlockId: status.nockBlockId,
      actualPayoutNicks: status.actualPayoutNicks,
    });
  }
  const clearedTerminalFacts = {
    ...authoritativeFacts,
    nockTransactionId: null,
    nockBlockId: null,
    actualPayoutNicks: null,
  };
  if (status.status === "failed") {
    return transitionWithdrawalRecord(
      record,
      "failed",
      now,
      status.reason ?? "Backend reports withdrawal failure.",
      clearedTerminalFacts
    );
  }
  if (status.status === "reorg_hold") {
    return transitionWithdrawalRecord(
      record,
      "support",
      now,
      status.recoveryReason ??
        status.reason ??
        "Withdrawal settlement was invalidated by a chain reorganization.",
      clearedTerminalFacts
    );
  }
  const delayed = now - record.createdAt >= DELAYED_AFTER_MS;
  const next: WithdrawalLifecycleStatus = delayed ? "delayed" : "withdrawal_pending";
  return transitionWithdrawalRecord(
    record,
    next,
    now,
    delayed
      ? "Settlement is delayed; no retry or duplicate burn was submitted."
      : `Backend lifecycle: ${status.status}.`,
    clearedTerminalFacts
  );
}

export function useWithdrawalStatus(
  initialRecords: PersistedWithdrawalV1[],
  account: string | undefined,
  network: BridgeNetworkConfig | undefined,
  onUpdate: (record: PersistedWithdrawalV1) => void
): WithdrawalPollingState {
  const recordsRef = useRef(initialRecords);
  const [records, setRecords] = useState(initialRecords);
  const [publicHistory, setPublicHistory] = useState<PublicWithdrawalStatusV2[]>([]);
  const [loading, setLoading] = useState(
    Boolean(BASE_TO_NOCK_WITHDRAWALS_ENABLED && account && network?.publicStatusUrl)
  );
  const [transientError, setTransientError] = useState<string | null>(null);

  useEffect(() => {
    recordsRef.current = initialRecords;
    setRecords(initialRecords);
  }, [initialRecords]);

  useEffect(() => {
    const publicStatusUrl =
      BASE_TO_NOCK_WITHDRAWALS_ENABLED && network
        ? network.publicStatusUrl
        : undefined;
    if (!account || !publicStatusUrl) {
      setLoading(false);
      setPublicHistory([]);
      return;
    }
    let active = true;
    let timer: number | undefined;
    let failures = 0;
    const poll = async () => {
      if (!active) return;
      if (document.visibilityState === "hidden") {
        timer = window.setTimeout(poll, 5_000);
        return;
      }
      setLoading(true);
      try {
        const url = new URL(publicStatusUrl);
        url.searchParams.set("history", "1");
        url.searchParams.set("account", account);
        url.searchParams.set("limit", "50");
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`history HTTP ${response.status}`);
        const history = parsePublicWithdrawalHistory(await response.json());
        const byBaseEvent = new Map(
          history.records.map((status) => [status.baseEventId.toLowerCase(), status])
        );
        const observedAt = Date.now();
        const nextRecords = recordsRef.current.map((record) => {
          const status = record.baseEventId
            ? byBaseEvent.get(record.baseEventId.toLowerCase())
            : undefined;
          if (!status) {
            if (
              record.status === "withdrawal_pending" &&
              observedAt - record.createdAt >= DELAYED_AFTER_MS
            ) {
              const delayed = transitionWithdrawalRecord(
                record,
                "delayed",
                observedAt,
                "Settlement is delayed; no retry or duplicate burn was submitted."
              );
              onUpdate(delayed);
              return delayed;
            }
            return record;
          }
          const next = mapPublicWithdrawalStatus(record, status, observedAt);
          if (next !== record) onUpdate(next);
          return next;
        });
        if (active) {
          recordsRef.current = nextRecords;
          setRecords(nextRecords);
          setPublicHistory(history.records);
          failures = 0;
          setTransientError(null);
        }
      } catch (cause) {
        if (active) {
          failures += 1;
          const detail =
            cause instanceof Error ? cause.message : "unknown transport error";
          setTransientError(
            `Withdrawal history unavailable: ${detail}. Tracking will retry automatically; do not submit another burn.`
          );
        }
      } finally {
        if (active) {
          setLoading(false);
          const delay = Math.min(30_000, 2_000 * 2 ** Math.min(failures, 4));
          timer = window.setTimeout(poll, delay);
        }
      }
    };
    void poll();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [account, network, onUpdate]);

  return { records, publicHistory, loading, transientError };
}

export function parsePublicWithdrawalStatus(value: unknown): PublicWithdrawalStatusV2 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid public withdrawal status response.");
  }
  const status = value as Partial<PublicWithdrawalStatusV2>;
  if (
    status.schemaVersion !== 2 ||
    typeof status.withdrawalId !== "string" ||
    typeof status.baseEventId !== "string" ||
    !/^0x[0-9a-f]{64}$/i.test(status.baseEventId) ||
    !isPublicStatus(status.status) ||
    !isPublicResolution(status.resolution) ||
    !isDecimal(status.revision) ||
    !Number.isSafeInteger(status.recoveryGeneration) ||
    (status.recoveryGeneration ?? -1) < 0 ||
    typeof status.terminalProof !== "boolean" ||
    !Number.isSafeInteger(status.observedAt) ||
    (status.observedAt ?? -1) < 0 ||
    (status.nockTransactionId !== null && typeof status.nockTransactionId !== "string") ||
    (status.nockBlockId !== null && typeof status.nockBlockId !== "string") ||
    (status.actualPayoutNicks !== null && !isDecimal(status.actualPayoutNicks)) ||
    (status.invalidatedBlockNumber !== null &&
      !isDecimal(status.invalidatedBlockNumber)) ||
    (status.invalidatedBlockHash !== null &&
      (typeof status.invalidatedBlockHash !== "string" ||
        !/^0x(?:[0-9a-f]{64}|[0-9a-f]{80})$/i.test(status.invalidatedBlockHash))) ||
    (status.priorStatus !== null && typeof status.priorStatus !== "string") ||
    (status.recoveryReason !== null && typeof status.recoveryReason !== "string") ||
    (status.reason !== null && typeof status.reason !== "string")
  ) {
    throw new Error("Unsupported public withdrawal status schema.");
  }
  return status as PublicWithdrawalStatusV2;
}

export function parsePublicWithdrawalHistory(value: unknown): PublicWithdrawalHistoryV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid public withdrawal history response.");
  }
  const history = value as Partial<PublicWithdrawalHistoryV1>;
  if (
    history.schemaVersion !== 1 ||
    !isDecimal(history.revision) ||
    !Array.isArray(history.records)
  ) {
    throw new Error("Unsupported public withdrawal history schema.");
  }
  return {
    schemaVersion: 1,
    revision: history.revision,
    records: history.records.map(parsePublicWithdrawalStatus),
  };
}

function isPublicStatus(value: unknown): value is PublicWithdrawalStatusV2["status"] {
  return (
    value === "pending" ||
    value === "ready" ||
    value === "submitted" ||
    value === "sequencer_confirmed" ||
    value === "terminal" ||
    value === "reorg_hold" ||
    value === "failed"
  );
}
