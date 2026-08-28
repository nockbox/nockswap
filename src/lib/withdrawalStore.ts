import { getAddress, isAddress } from "viem";
import type { Address, Hex } from "viem";

export const WITHDRAWAL_STORE_SCHEMA_VERSION = 1;
const STORE_KEY = "nockswap.withdrawals.v1";
const MAX_RECORDS = 50;

export type WithdrawalLifecycleStatus =
  | "awaiting_wallet"
  | "awaiting_base"
  | "withdrawal_pending"
  | "confirmed"
  | "delayed"
  | "failed"
  | "support";

export interface WithdrawalHistoryEvent {
  status: WithdrawalLifecycleStatus;
  observedAt: number;
  detail: string;
}

export interface PersistedWithdrawalV1 {
  schemaVersion: 1;
  recordId: string;
  account: Address;
  chainId: number;
  nockTokenAddress: Address;
  messageInboxAddress: Address;
  submittedTransactionHash: Hex;
  transactionHash: Hex;
  blockNumber: string | null;
  blockHash: Hex | null;
  logIndex: number | null;
  baseEventId: Hex | null;
  destination: string;
  lockRoot: string;
  commitment: Hex;
  calldata: Hex;
  amountBaseUnits: string;
  amountNicks: string;
  estimatedPayoutNicks: string | null;
  actualPayoutNicks: string | null;
  nockTransactionId: string | null;
  nockBlockId: string | null;
  authoritativeRevision: string;
  recoveryGeneration: number;
  publicResolution: string | null;
  priorAuthoritativeStatus: string | null;
  invalidatedBlockNumber: string | null;
  invalidatedBlockHash: Hex | null;
  recoveryReason: string | null;
  status: WithdrawalLifecycleStatus;
  createdAt: number;
  updatedAt: number;
  confirmedAt: number | null;
  retryAuthorizedAt: number | null;
  history: WithdrawalHistoryEvent[];
}

export interface WithdrawalStoreLoad {
  records: PersistedWithdrawalV1[];
  issue: string | null;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function loadWithdrawalRecords(
  storage: StorageLike,
  account: string,
  chainId: number,
  nockTokenAddress: string
): WithdrawalStoreLoad {
  let text: string | null;
  try {
    text = storage.getItem(STORE_KEY);
  } catch {
    return { records: [], issue: "Withdrawal history storage is unavailable." };
  }
  if (!text) return { records: [], issue: null };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {
      records: [],
      issue: "Withdrawal history is corrupt. Keep this browser data for support.",
    };
  }
  if (!Array.isArray(value)) {
    return { records: [], issue: "Withdrawal history has an unsupported schema." };
  }
  const parsed: PersistedWithdrawalV1[] = [];
  for (const candidate of value) {
    const record = parseWithdrawalRecord(candidate);
    if (!record) {
      return {
        records: [],
        issue: "Withdrawal history has an unsupported or corrupt record.",
      };
    }
    parsed.push(record);
  }
  const normalizedAccount = normalizeAddress(account);
  const normalizedToken = normalizeAddress(nockTokenAddress);
  if (!normalizedAccount || !normalizedToken) {
    return { records: [], issue: "Connected account or deployment is invalid." };
  }
  return {
    records: parsed
      .filter(
        (record) =>
          record.account === normalizedAccount &&
          record.chainId === chainId &&
          record.nockTokenAddress === normalizedToken
      )
      .sort((left, right) => right.updatedAt - left.updatedAt),
    issue: null,
  };
}
export function assertWithdrawalStorageAvailable(storage: StorageLike): void {
  let current: string | null;
  try {
    current = storage.getItem(STORE_KEY);
    const probe = current ?? "[]";
    storage.setItem(STORE_KEY, probe);
    if (storage.getItem(STORE_KEY) !== probe) {
      throw new Error("Withdrawal history storage did not retain its write probe.");
    }
    const records = loadAll(storage);
    if (records.length >= MAX_RECORDS) {
      throw new Error(
        `Withdrawal history capacity (${MAX_RECORDS}) is reached; preserve or export existing records before another burn.`
      );
    }
  } catch (cause) {
    throw new Error(
      cause instanceof Error
        ? `Withdrawal history storage is unavailable: ${cause.message}`
        : "Withdrawal history storage is unavailable."
    );
  }
}

export function persistWithdrawalRecord(
  storage: StorageLike,
  record: PersistedWithdrawalV1
): void {
  const valid = parseWithdrawalRecord(record);
  if (!valid) throw new Error("Refusing to persist invalid withdrawal record.");
  const existing = loadAll(storage);
  const replacingExisting = existing.some((item) => item.recordId === valid.recordId);
  if (!replacingExisting && existing.length >= MAX_RECORDS) {
    throw new Error(
      `Withdrawal history capacity (${MAX_RECORDS}) is reached; refusing to evict a revision-tracked withdrawal.`
    );
  }
  const duplicate = existing.find(
    (item) =>
      item.recordId !== valid.recordId &&
      ((valid.baseEventId && item.baseEventId === valid.baseEventId) ||
        item.transactionHash === valid.transactionHash)
  );
  if (duplicate) {
    throw new Error("A withdrawal with this Base transaction/log already exists.");
  }
  const next = [valid, ...existing.filter((item) => item.recordId !== valid.recordId)].sort(
    (left, right) => right.updatedAt - left.updatedAt
  );
  storage.setItem(STORE_KEY, JSON.stringify(next));
}

export function transitionWithdrawalRecord(
  record: PersistedWithdrawalV1,
  status: WithdrawalLifecycleStatus,
  observedAt: number,
  detail: string,
  facts: Partial<
    Pick<
      PersistedWithdrawalV1,
      | "transactionHash"
      | "blockNumber"
      | "blockHash"
      | "logIndex"
      | "baseEventId"
      | "actualPayoutNicks"
      | "nockTransactionId"
      | "nockBlockId"
      | "authoritativeRevision"
      | "recoveryGeneration"
      | "publicResolution"
      | "priorAuthoritativeStatus"
      | "invalidatedBlockNumber"
      | "invalidatedBlockHash"
      | "recoveryReason"
    >
  > = {}
): PersistedWithdrawalV1 {
  if (!Number.isSafeInteger(observedAt) || observedAt <= 0 || !detail.trim()) {
    throw new Error("Withdrawal lifecycle transition is invalid.");
  }
  if (!allowedTransition(record.status, status)) {
    throw new Error(`Unsafe withdrawal status transition ${record.status} -> ${status}.`);
  }
  const normalizedDetail = detail.trim();
  const last = record.history.at(-1);
  const history =
    last?.status === status && last.detail === normalizedDetail
      ? record.history
      : [
          ...record.history,
          { status, observedAt, detail: normalizedDetail },
        ].slice(-100);
  const next: PersistedWithdrawalV1 = {
    ...record,
    ...facts,
    status,
    updatedAt: observedAt,
    confirmedAt:
      status === "confirmed"
        ? observedAt
        : record.status === "confirmed"
          ? null
          : record.confirmedAt,
    history,
  };
  const valid = parseWithdrawalRecord(next);
  if (!valid) throw new Error("Withdrawal lifecycle transition produced invalid state.");
  return valid;
}

export function authorizeUnknownSubmissionRetry(
  record: PersistedWithdrawalV1,
  observedAt: number
): PersistedWithdrawalV1 {
  if (record.status !== "awaiting_base" && record.status !== "support") {
    throw new Error("Only an unknown Base submission can be explicitly retried.");
  }
  return {
    ...record,
    retryAuthorizedAt: observedAt,
    updatedAt: observedAt,
    history: [
      ...record.history,
      {
        status: record.status,
        observedAt,
        detail: "User explicitly authorized retry after unknown submission.",
      },
    ],
  };
}

function loadAll(storage: StorageLike): PersistedWithdrawalV1[] {
  const text = storage.getItem(STORE_KEY);
  if (!text) return [];
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Refusing to overwrite corrupt withdrawal history.");
  }
  if (!Array.isArray(value)) {
    throw new Error("Refusing to overwrite unsupported withdrawal history.");
  }
  return value.map((candidate) => {
    const record = parseWithdrawalRecord(candidate);
    if (!record) throw new Error("Refusing to overwrite corrupt withdrawal history.");
    return record;
  });
}

function parseWithdrawalRecord(value: unknown): PersistedWithdrawalV1 | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Partial<PersistedWithdrawalV1>;
  const account = normalizeAddress(record.account);
  const token = normalizeAddress(record.nockTokenAddress);
  const inbox = normalizeAddress(record.messageInboxAddress);
  const authoritativeRevision =
    record.authoritativeRevision === undefined ? "0" : record.authoritativeRevision;
  const recoveryGeneration =
    record.recoveryGeneration === undefined ? 0 : record.recoveryGeneration;
  const publicResolution =
    record.publicResolution === undefined ? null : record.publicResolution;
  const priorAuthoritativeStatus =
    record.priorAuthoritativeStatus === undefined
      ? null
      : record.priorAuthoritativeStatus;
  const invalidatedBlockNumber =
    record.invalidatedBlockNumber === undefined ? null : record.invalidatedBlockNumber;
  const invalidatedBlockHash =
    record.invalidatedBlockHash === undefined ? null : record.invalidatedBlockHash;
  const recoveryReason =
    record.recoveryReason === undefined ? null : record.recoveryReason;
  if (
    record.schemaVersion !== WITHDRAWAL_STORE_SCHEMA_VERSION ||
    typeof record.recordId !== "string" ||
    !record.recordId ||
    !account ||
    !token ||
    !inbox ||
    !Number.isSafeInteger(record.chainId) ||
    (record.chainId ?? 0) <= 0 ||
    !isHex32(record.submittedTransactionHash) ||
    !isHex32(record.transactionHash) ||
    (record.blockNumber !== null && !isDecimal(record.blockNumber)) ||
    (record.logIndex !== null &&
      (!Number.isSafeInteger(record.logIndex) || (record.logIndex ?? -1) < 0)) ||
    (record.blockHash !== null && !isHex32(record.blockHash)) ||
    (record.baseEventId !== null && !isHex32(record.baseEventId)) ||
    typeof record.destination !== "string" ||
    !record.destination ||
    typeof record.lockRoot !== "string" ||
    !record.lockRoot ||
    !isHex32(record.commitment) ||
    typeof record.calldata !== "string" ||
    !/^0x[0-9a-f]{232}$/i.test(record.calldata) ||
    !isDecimal(record.amountBaseUnits) ||
    !isDecimal(record.amountNicks) ||
    !isNullableDecimal(record.estimatedPayoutNicks) ||
    !isNullableDecimal(record.actualPayoutNicks) ||
    (record.nockTransactionId !== null &&
      typeof record.nockTransactionId !== "string") ||
    (record.nockBlockId !== null && typeof record.nockBlockId !== "string") ||
    !isDecimal(authoritativeRevision) ||
    !Number.isSafeInteger(recoveryGeneration) ||
    recoveryGeneration < 0 ||
    (publicResolution !== null && !isPublicResolution(publicResolution)) ||
    (priorAuthoritativeStatus !== null &&
      typeof priorAuthoritativeStatus !== "string") ||
    (invalidatedBlockNumber !== null && !isDecimal(invalidatedBlockNumber)) ||
    (invalidatedBlockHash !== null && !isRecoveryBlockHash(invalidatedBlockHash)) ||
    (recoveryReason !== null && typeof recoveryReason !== "string") ||
    !isStatus(record.status) ||
    !Number.isSafeInteger(record.createdAt) ||
    (record.createdAt ?? 0) <= 0 ||
    !Number.isSafeInteger(record.updatedAt) ||
    (record.updatedAt ?? 0) < (record.createdAt ?? 0) ||
    (record.confirmedAt !== null && !Number.isSafeInteger(record.confirmedAt)) ||
    (record.retryAuthorizedAt !== null &&
      !Number.isSafeInteger(record.retryAuthorizedAt)) ||
    !isHistory(record.history) ||
    (record.status === "confirmed" &&
      (!record.confirmedAt ||
        !record.nockTransactionId ||
        !record.nockBlockId ||
        !record.actualPayoutNicks))
  ) {
    return null;
  }
  return {
    ...(record as PersistedWithdrawalV1),
    account,
    nockTokenAddress: token,
    messageInboxAddress: inbox,
    authoritativeRevision,
    recoveryGeneration,
    publicResolution,
    priorAuthoritativeStatus,
    invalidatedBlockNumber,
    invalidatedBlockHash,
    recoveryReason,
  };
}

function isHistory(value: unknown): value is WithdrawalHistoryEvent[] {
  return (
    Array.isArray(value) &&
    value.every(
      (event) =>
        typeof event === "object" &&
        event !== null &&
        !Array.isArray(event) &&
        isStatus((event as Partial<WithdrawalHistoryEvent>).status) &&
        Number.isSafeInteger(
          (event as Partial<WithdrawalHistoryEvent>).observedAt
        ) &&
        typeof (event as Partial<WithdrawalHistoryEvent>).detail === "string" &&
        Boolean((event as Partial<WithdrawalHistoryEvent>).detail?.trim())
    )
  );
}

function allowedTransition(
  from: WithdrawalLifecycleStatus,
  to: WithdrawalLifecycleStatus
): boolean {
  if (from === to) return true;
  const allowed: Record<WithdrawalLifecycleStatus, WithdrawalLifecycleStatus[]> = {
    awaiting_wallet: ["awaiting_base", "failed", "support"],
    awaiting_base: ["withdrawal_pending", "failed", "support"],
    withdrawal_pending: ["confirmed", "delayed", "failed", "support"],
    delayed: ["withdrawal_pending", "confirmed", "failed", "support"],
    confirmed: ["withdrawal_pending", "support"],
    failed: ["withdrawal_pending", "confirmed", "support"],
    support: ["withdrawal_pending", "confirmed", "failed"],
  };
  return allowed[from].includes(to);
}

function normalizeAddress(value: unknown): Address | null {
  return typeof value === "string" && isAddress(value)
    ? getAddress(value)
    : null;
}

function isHex32(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value);
}

function isRecoveryBlockHash(value: unknown): value is Hex {
  return (
    typeof value === "string" && /^0x(?:[0-9a-f]{64}|[0-9a-f]{80})$/i.test(value)
  );
}

function isDecimal(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value);
}

function isNullableDecimal(value: unknown): value is string | null {
  return value === null || isDecimal(value);
}


function isPublicResolution(value: unknown): value is string {
  return (
    value === "found" ||
    value === "not_observed" ||
    value === "ambiguous_log" ||
    value === "malformed_burn" ||
    value === "below_policy" ||
    value === "reorged" ||
    value === "inconsistent" ||
    value === "compensated"
  );
}
function isStatus(value: unknown): value is WithdrawalLifecycleStatus {
  return (
    value === "awaiting_wallet" ||
    value === "awaiting_base" ||
    value === "withdrawal_pending" ||
    value === "confirmed" ||
    value === "delayed" ||
    value === "failed" ||
    value === "support"
  );
}
