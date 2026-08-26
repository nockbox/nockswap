import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateBaseToNockReadiness,
  type PublicBridgeReadiness,
} from "../src/hooks/useBaseToNockContractReadiness";
import {
  mapPublicWithdrawalStatus,
  parsePublicWithdrawalStatus,
  type PublicWithdrawalStatusV1,
} from "../src/hooks/useWithdrawalStatus";
import type { BridgeNetworkConfig } from "../src/lib/bridgeNetworkConfig";
import {
  authorizeUnknownSubmissionRetry,
  loadWithdrawalRecords,
  persistWithdrawalRecord,
  transitionWithdrawalRecord,
  type PersistedWithdrawalV1,
} from "../src/lib/withdrawalStore";

const ACCOUNT = testAddress("2");
const TOKEN = testAddress("1");
const INBOX = testAddress("3");
const TX = `0x${"1".repeat(64)}` as const;
const BLOCK = `0x${"2".repeat(64)}` as const;
const EVENT = `0x${"3".repeat(64)}` as const;
const BURN_BINDING_HASH = `0x${"4".repeat(64)}` as const;

class MemoryStorage {
  value: string | null = null;
  getItem() {
    return this.value;
  }
  setItem(_key: string, value: string) {
    this.value = value;
  }
}

test("versioned withdrawal record round trips and isolates account/deployment", () => {
  const storage = new MemoryStorage();
  const record = withdrawal();
  persistWithdrawalRecord(storage, record);
  assert.deepEqual(loadWithdrawalRecords(storage, ACCOUNT, 31338, TOKEN), {
    records: [record],
    issue: null,
  });
  assert.deepEqual(
    loadWithdrawalRecords(
      storage,
      "0x4000000000000000000000000000000000000004",
      31338,
      TOKEN
    ).records,
    []
  );
  assert.deepEqual(loadWithdrawalRecords(storage, ACCOUNT, 8453, TOKEN).records, []);
});

test("duplicate, corrupt, and unknown submissions fail safely", () => {
  const storage = new MemoryStorage();
  const record = withdrawal();
  persistWithdrawalRecord(storage, record);
  assert.throws(
    () => persistWithdrawalRecord(storage, { ...record, recordId: "other" }),
    /already exists/
  );
  storage.value = "not-json";
  assert.match(
    loadWithdrawalRecords(storage, ACCOUNT, 31338, TOKEN).issue ?? "",
    /corrupt/
  );
  assert.throws(
    () => persistWithdrawalRecord(storage, record),
    /Refusing to overwrite corrupt/
  );
  const awaiting = { ...record, status: "awaiting_base" as const };
  const authorized = authorizeUnknownSubmissionRetry(awaiting, 200);
  assert.equal(authorized.retryAuthorizedAt, 200);
  assert.match(authorized.history.at(-1)?.detail ?? "", /explicitly authorized/);
});

test("public lifecycle confirms only with complete Nock settlement proof", () => {
  const record = withdrawal();
  assert.throws(
    () =>
      mapPublicWithdrawalStatus(
        record,
        publicStatus({ status: "terminal", terminalProof: false }),
        200
      ),
    /missing multi-source settlement proof/
  );
  const confirmed = mapPublicWithdrawalStatus(
    record,
    publicStatus({
      status: "terminal",
      terminalProof: true,
      nockTransactionId: "nock-tx",
      nockBlockId: "nock-block",
      actualPayoutNicks: "6500000000",
    }),
    200
  );
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.nockTransactionId, "nock-tx");
  assert.equal(confirmed.actualPayoutNicks, "6500000000");
  const regressed = transitionWithdrawalRecord(
    confirmed,
    "withdrawal_pending",
    300,
    "Confirmed inclusion was orphaned; waiting for reinclusion."
  );
  assert.equal(regressed.status, "withdrawal_pending");
  assert.equal(regressed.confirmedAt, confirmed.confirmedAt);
});

test("status parser rejects version and identity ambiguity", () => {
  assert.throws(
    () => parsePublicWithdrawalStatus({ ...publicStatus({}), schemaVersion: 2 }),
    /Unsupported/
  );
  assert.throws(
    () =>
      mapPublicWithdrawalStatus(
        withdrawal(),
        publicStatus({ baseEventId: `0x${"9".repeat(64)}` }),
        200
      ),
    /identity does not match/
  );
});

test("readiness never silently degrades to ready", () => {
  const bridge = network();
  const status = readiness();
  const ready = evaluateBaseToNockReadiness({
    chainId: bridge.chainId,
    expectedNetwork: bridge,
    contractsLoading: false,
    nockInbox: INBOX,
    inboxNock: TOKEN,
    withdrawalsEnabled: true,
    statusLoading: false,
    status,
    statusError: null,
    now: status.observedAt + 1,
  });
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.blockers, []);

  const wrongChain = evaluateBaseToNockReadiness({
    chainId: 8453,
    expectedNetwork: bridge,
    contractsLoading: false,
    statusLoading: false,
    status: null,
    statusError: null,
    now: status.observedAt,
  });
  assert.equal(wrongChain.ready, false);
  assert.equal(wrongChain.switchRequired, true);
  assert.match(wrongChain.reason ?? "", /Switch to/);

  const stale = evaluateBaseToNockReadiness({
    chainId: bridge.chainId,
    expectedNetwork: bridge,
    contractsLoading: false,
    nockInbox: INBOX,
    inboxNock: TOKEN,
    withdrawalsEnabled: true,
    statusLoading: false,
    status,
    statusError: null,
    now: status.observedAt + 60_001,
  });
  assert.equal(stale.ready, false);
  assert.ok(stale.blockers.some((blocker) => blocker.includes("stale")));

  const mismatch = evaluateBaseToNockReadiness({
    chainId: bridge.chainId,
    expectedNetwork: bridge,
    contractsLoading: false,
    nockInbox: INBOX,
    inboxNock: TOKEN,
    withdrawalsEnabled: true,
    statusLoading: false,
    status: { ...status, irisSdkVersion: "0.3.0" },
    statusError: null,
    now: status.observedAt,
  });
  assert.equal(mismatch.ready, false);
  assert.ok(mismatch.blockers.some((blocker) => blocker.includes("SDK")));
});

function withdrawal(): PersistedWithdrawalV1 {
  return {
    schemaVersion: 1,
    recordId: EVENT,
    account: ACCOUNT,
    chainId: 31338,
    nockTokenAddress: TOKEN,
    messageInboxAddress: INBOX,
    submittedTransactionHash: TX,
    transactionHash: TX,
    blockNumber: "10",
    blockHash: BLOCK,
    logIndex: 0,
    baseEventId: EVENT,
    destination: "AD6Mw1QUnPUrnVpyj2gW2jT6Jd6WsuZQmPn79XpZoFEocuvV12iDkvh",
    lockRoot: "lock-root",
    commitment: BURN_BINDING_HASH,
    calldata: `0x${"ab".repeat(116)}`,
    amountBaseUnits: "1000010000000000000000",
    amountNicks: "6553665536",
    estimatedPayoutNicks: "6534150000",
    actualPayoutNicks: null,
    nockTransactionId: null,
    nockBlockId: null,
    status: "withdrawal_pending",
    createdAt: 100,
    updatedAt: 100,
    confirmedAt: null,
    retryAuthorizedAt: null,
    history: [
      {
        status: "withdrawal_pending",
        observedAt: 100,
        detail: "Verified Base receipt.",
      },
    ],
  };
}
function publicStatus(
  overrides: Partial<PublicWithdrawalStatusV1> = {}
): PublicWithdrawalStatusV1 {
  return {
    schemaVersion: 1 as const,
    withdrawalId: "withdrawal-1",
    baseEventId: EVENT,
    status: "pending" as const,
    terminalProof: false,
    nockTransactionId: null,
    nockBlockId: null,
    actualPayoutNicks: null,
    observedAt: 100,
    reason: null,
    ...overrides,
  };
}

function network(): BridgeNetworkConfig {
  return {
    id: "bridge-dev",
    label: "Bridge dev",
    chainId: 31338,
    nockTokenAddress: TOKEN,
    messageInboxAddress: INBOX,
    bridgeSignerPkhs: ["signer-1", "signer-2"],
    bridgeThreshold: 2,
    bridgeLockRoot: "lock-root",
    nockchainConfirmationDepth: 0,
    publicStatusUrl: "http://127.0.0.1:8080/status",
    withdrawalWireProtocol: "WithdrawalWireV1",
    withdrawalPolicyId: "withdrawal-policy-v1",
    irisSdkVersion: "0.3.3",
  };
}

function readiness(): PublicBridgeReadiness {
  return {
    schemaVersion: 1,
    observedAt: 1_000,
    ready: true,
    chainId: 31338,
    nockTokenAddress: TOKEN,
    messageInboxAddress: INBOX,
    bridgeSignerPkhs: ["signer-2", "signer-1"],
    bridgeThreshold: 2,
    withdrawalsEnabled: true,
    withdrawalWireProtocol: "WithdrawalWireV1",
    withdrawalPolicyId: "withdrawal-policy-v1",
    irisSdkVersion: "0.3.3",
    reason: null,
  };
}

function testAddress(digit: string): `0x${string}` {
  return `0x${digit.repeat(40)}`;
}
