"use client";

import { useEffect, useState } from "react";

import type { BridgeNetworkConfig } from "@/lib/bridgeNetworkConfig";
import {
  transitionWithdrawalRecord,
  type PersistedWithdrawalV1,
  type WithdrawalLifecycleStatus,
} from "@/lib/withdrawalStore";

const DELAYED_AFTER_MS = 15 * 60 * 1000;

export interface PublicWithdrawalStatusV1 {
  schemaVersion: 1;
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
  terminalProof: boolean;
  nockTransactionId: string | null;
  nockBlockId: string | null;
  actualPayoutNicks: string | null;
  observedAt: number;
  reason: string | null;
}

export interface WithdrawalPollingState {
  record: PersistedWithdrawalV1;
  loading: boolean;
  transientError: string | null;
}

export function mapPublicWithdrawalStatus(
  record: PersistedWithdrawalV1,
  status: PublicWithdrawalStatusV1,
  now: number
): PersistedWithdrawalV1 {
  if (status.baseEventId.toLowerCase() !== record.baseEventId?.toLowerCase()) {
    throw new Error("Public withdrawal status identity does not match the Base event.");
  }
  if (status.status === "terminal") {
    if (
      !status.terminalProof ||
      !status.nockTransactionId ||
      !status.nockBlockId ||
      !status.actualPayoutNicks
    ) {
      throw new Error("Terminal status is missing multi-source settlement proof.");
    }
    return transitionWithdrawalRecord(record, "confirmed", now, "Terminal settlement proven.", {
      nockTransactionId: status.nockTransactionId,
      nockBlockId: status.nockBlockId,
      actualPayoutNicks: status.actualPayoutNicks,
    });
  }
  if (status.status === "failed") {
    return transitionWithdrawalRecord(
      record,
      "failed",
      now,
      status.reason ?? "Backend reports withdrawal failure."
    );
  }
  if (status.status === "reorg_hold") {
    return transitionWithdrawalRecord(
      record,
      "support",
      now,
      status.reason ?? "Withdrawal is held after chain reorganization."
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
      : `Backend lifecycle: ${status.status}.`
  );
}

export function useWithdrawalStatus(
  initialRecord: PersistedWithdrawalV1 | null,
  network: BridgeNetworkConfig | undefined,
  onUpdate: (record: PersistedWithdrawalV1) => void
): WithdrawalPollingState | null {
  const [record, setRecord] = useState(initialRecord);
  const [loading, setLoading] = useState(Boolean(initialRecord));
  const [transientError, setTransientError] = useState<string | null>(null);

  useEffect(() => setRecord(initialRecord), [initialRecord]);

  useEffect(() => {
    if (
      !record ||
      !network ||
      !record.baseEventId ||
      record.status === "confirmed" ||
      record.status === "failed"
    ) {
      setLoading(false);
      return;
    }
    let active = true;
    let timer: number | undefined;
    let failures = 0;
    const poll = async () => {
      if (!active) return;
      let shouldContinue = true;
      if (document.visibilityState === "hidden") {
        timer = window.setTimeout(poll, 5_000);
        return;
      }
      setLoading(true);
      try {
        const url = new URL(network.publicStatusUrl);
        url.searchParams.set("base_event_id", record.baseEventId!);
        url.searchParams.set("account", record.account);
        const response = await fetch(url, { cache: "no-store" });
        if (response.status === 404) throw new Error("Burn is not indexed yet");
        if (!response.ok) throw new Error(`status HTTP ${response.status}`);
        const status = parsePublicWithdrawalStatus(await response.json());
        const next = mapPublicWithdrawalStatus(record, status, Date.now());
        if (active) {
          failures = 0;
          setTransientError(null);
          setRecord(next);
          onUpdate(next);
          if (next.status === "confirmed" || next.status === "failed") {
            shouldContinue = false;
            return;
          }
        }
      } catch (error) {
        if (active) {
          failures += 1;
          setTransientError(
            error instanceof Error ? error.message : "Withdrawal status unavailable"
          );
        }
      } finally {
        if (active) {
          setLoading(false);
          if (shouldContinue) {
            const delay = Math.min(30_000, 2_000 * 2 ** Math.min(failures, 4));
            timer = window.setTimeout(poll, delay);
          }
        }
      }
    };
    void poll();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [network, onUpdate, record]);

  return record ? { record, loading, transientError } : null;
}

export function parsePublicWithdrawalStatus(value: unknown): PublicWithdrawalStatusV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid public withdrawal status response.");
  }
  const status = value as Partial<PublicWithdrawalStatusV1>;
  if (
    status.schemaVersion !== 1 ||
    typeof status.withdrawalId !== "string" ||
    typeof status.baseEventId !== "string" ||
    !isPublicStatus(status.status) ||
    typeof status.terminalProof !== "boolean" ||
    !Number.isSafeInteger(status.observedAt) ||
    (status.nockTransactionId !== null && typeof status.nockTransactionId !== "string") ||
    (status.nockBlockId !== null && typeof status.nockBlockId !== "string") ||
    (status.actualPayoutNicks !== null &&
      (typeof status.actualPayoutNicks !== "string" ||
        !/^(0|[1-9][0-9]*)$/.test(status.actualPayoutNicks))) ||
    (status.reason !== null && typeof status.reason !== "string")
  ) {
    throw new Error("Unsupported public withdrawal status schema.");
  }
  return status as PublicWithdrawalStatusV1;
}

function isPublicStatus(value: unknown): value is PublicWithdrawalStatusV1["status"] {
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
