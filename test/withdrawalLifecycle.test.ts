import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateBaseToNockReadiness,
  type PublicBridgeReadiness,
} from "../src/hooks/useBaseToNockContractReadiness";
import {
  parsePublicWithdrawalHistory,
  mergeWithdrawalHistory,
  mapPublicWithdrawalStatus,
  parsePublicWithdrawalStatus,
  type PublicWithdrawalStatusV2,
} from "../src/hooks/useWithdrawalStatus";
import { parsePublicWithdrawalQuote } from "../src/hooks/useBaseToNockNockchainFeeEstimate";
import {
  parsePublicStatusUrl,
  type BridgeNetworkConfig,
} from "../src/lib/bridgeNetworkConfig";
import {
  assertWithdrawalStorageAvailable,
  authorizeUnknownSubmissionRetry,
  transitionWithdrawalRecord,
  loadWithdrawalRecords,
  persistWithdrawalRecord,
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
    /missing settlement proof/
  );
  assert.throws(
    () =>
      mapPublicWithdrawalStatus(
        record,
        publicStatus({
          status: "terminal",
          terminalProof: true,
          nockTransactionId: "nock-tx",
          nockBlockId: "nock-block",
          actualPayoutNicks: "0",
        }),
        200
      ),
    /missing settlement proof/
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
  const reorged = mapPublicWithdrawalStatus(
    confirmed,
    publicStatus({
      revision: "2",
      status: "reorg_hold",
      resolution: "reorged",
      recoveryGeneration: 1,
      terminalProof: false,
      nockTransactionId: null,
      nockBlockId: null,
      actualPayoutNicks: null,
      invalidatedBlockNumber: "42",
      invalidatedBlockHash: `0x${"8".repeat(80)}`,
      priorStatus: "terminal",
      recoveryReason: "Confirmed inclusion was orphaned.",
    }),
    300
  );
  assert.equal(reorged.status, "support");
  assert.equal(reorged.confirmedAt, null);
  assert.equal(reorged.nockTransactionId, null);
  assert.equal(reorged.recoveryGeneration, 1);
  const resumed = mapPublicWithdrawalStatus(
    reorged,
    publicStatus({
      revision: "3",
      recoveryGeneration: 1,
      status: "pending",
      resolution: "found",
    }),
    400
  );
  assert.equal(resumed.status, "withdrawal_pending");
});

test("status parser rejects version and identity ambiguity", () => {
  assert.throws(
    () => parsePublicWithdrawalStatus({ ...publicStatus({}), schemaVersion: 1 }),
    /Unsupported/
  );
  assert.throws(
    () => parsePublicWithdrawalStatus(publicStatus({ baseEventId: "not-an-event" })),
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

test("Nockchain reorg hashes remain valid across public and local schemas", () => {
  const invalidatedBlockHash = `0x${"8".repeat(80)}` as const;
  const parsed = parsePublicWithdrawalStatus(
    publicStatus({
      revision: "2",
      status: "reorg_hold",
      resolution: "reorged",
      recoveryGeneration: 1,
      invalidatedBlockNumber: "42",
      invalidatedBlockHash,
    })
  );
  assert.equal(parsed.invalidatedBlockHash, invalidatedBlockHash);

  const storage = new MemoryStorage();
  const record = { ...withdrawal(), invalidatedBlockHash };
  persistWithdrawalRecord(storage, record);
  assert.equal(
    loadWithdrawalRecords(storage, ACCOUNT, 31338, TOKEN).records[0]
      ?.invalidatedBlockHash,
    invalidatedBlockHash
  );
});
test("status revisions reject stale responses and accept exact replay", () => {
  const record = withdrawal();
  const first = mapPublicWithdrawalStatus(record, publicStatus({ revision: "4" }), 200);
  assert.equal(first.authoritativeRevision, "4");
  assert.equal(mapPublicWithdrawalStatus(first, publicStatus({ revision: "4" }), 300), first);
  assert.throws(
    () => mapPublicWithdrawalStatus(first, publicStatus({ revision: "3" }), 300),
    /revision regressed/
  );
});

test("initial authoritative revision zero replaces the local sentinel", () => {
  const failed = mapPublicWithdrawalStatus(
    withdrawal(),
    publicStatus({
      revision: "0",
      status: "failed",
      resolution: "malformed_burn",
      reason: "Unsupported burn.",
    }),
    200
  );
  assert.equal(failed.status, "failed");
  assert.equal(failed.publicResolution, "malformed_burn");
});
test("higher authoritative revision can recover a backend failure", () => {
  const failed = mapPublicWithdrawalStatus(
    withdrawal(),
    publicStatus({
      revision: "5",
      status: "failed",
      resolution: "inconsistent",
      reason: "Temporary cross-source inconsistency.",
    }),
    200
  );
  const confirmed = mapPublicWithdrawalStatus(
    failed,
    publicStatus({
      revision: "6",
      status: "terminal",
      terminalProof: true,
      nockTransactionId: "recovered-tx",
      nockBlockId: "recovered-block",
      actualPayoutNicks: "6500000000",
    }),
    300
  );
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.nockTransactionId, "recovered-tx");
});

test("authoritative history preserves revisioned records", () => {
  const history = parsePublicWithdrawalHistory({
    schemaVersion: 1,
    revision: "9",
    records: [publicStatus({ revision: "9" })],
  });
  assert.equal(history.revision, "9");
  assert.equal(history.records[0]?.baseEventId, EVENT);
});

test("history union keeps local withdrawals visible when public status is absent", () => {
  const localTransaction = `0x${"5".repeat(64)}` as const;
  const localOnly: PersistedWithdrawalV1 = {
    ...withdrawal(),
    recordId: localTransaction,
    submittedTransactionHash: localTransaction,
    transactionHash: localTransaction,
    blockNumber: null,
    blockHash: null,
    logIndex: null,
    baseEventId: null,
    status: "awaiting_base",
    updatedAt: 300,
  };
  const remoteEvent = `0x${"6".repeat(64)}` as const;
  const rows = mergeWithdrawalHistory(
    [localOnly, withdrawal()],
    [
      publicStatus({ status: "submitted", revision: "9", observedAt: 150 }),
      publicStatus({
        withdrawalId: "withdrawal-remote",
        baseEventId: remoteEvent,
        status: "failed",
        resolution: "malformed_burn",
        revision: "10",
        observedAt: 200,
      }),
    ]
  );

  assert.equal(rows.length, 3);
  assert.equal(rows[0]?.identity, localTransaction);
  assert.equal(rows[0]?.localRecord?.recordId, localTransaction);
  assert.equal(rows[1]?.identity, remoteEvent);
  assert.equal(rows[1]?.localRecord, null);
  assert.equal(rows[2]?.identity, EVENT);
  assert.equal(rows[2]?.status, "submitted");
  assert.equal(rows[2]?.revision, "9");
});

test("authoritative quote preserves partial-NOCK fee and payout values", () => {
  const quote = parsePublicWithdrawalQuote({
    schemaVersion: 1,
    available: true,
    grossAmountNicks: "6553632768",
    bridgeFeeNicks: "19500195",
    transactionFeeNicks: "256",
    netPayoutNicks: "6534132317",
    snapshotHeight: 700,
    snapshotBlockId: "block-700",
    observedAt: 1_700_000_000_000,
    revision: "4",
    reason: null,
  });
  assert.equal(quote.bridgeFeeNicks, "19500195");
  assert.equal(quote.netPayoutNicks, "6534132317");
});

test("replacement transaction identity survives later receipt errors", () => {
  const awaiting = {
    ...withdrawal(),
    status: "awaiting_base" as const,
    transactionHash: TX,
  };
  const replacement = `0x${"7".repeat(64)}` as const;
  const replaced = transitionWithdrawalRecord(
    awaiting,
    "awaiting_base",
    200,
    "Base transaction replaced.",
    { transactionHash: replacement }
  );
  const support = transitionWithdrawalRecord(
    replaced,
    "support",
    300,
    "Receipt lookup failed after replacement."
  );
  assert.equal(support.transactionHash, replacement);
});


test("withdrawal storage preflight fails before submission when writes fail", () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota denied");
    },
  };
  assert.throws(
    () => assertWithdrawalStorageAvailable(storage),
    /storage is unavailable: quota denied/
  );
});

test("public status transport requires HTTPS or explicit loopback HTTP", () => {
  assert.equal(
    parsePublicStatusUrl("https://bridge.example/withdrawal-status"),
    "https://bridge.example/withdrawal-status"
  );
  assert.equal(
    parsePublicStatusUrl("http://127.0.0.1:8080/withdrawal-status"),
    "http://127.0.0.1:8080/withdrawal-status"
  );
  assert.equal(
    parsePublicStatusUrl("http://bridge.example/withdrawal-status"),
    undefined
  );
  assert.equal(
    parsePublicStatusUrl("https://bridge.example/withdrawal-status?unsafe=1"),
    undefined
  );
  assert.equal(
    parsePublicStatusUrl("https://user:secret@bridge.example/withdrawal-status"),
    undefined
  );
});

test("storage capacity never evicts revision-tracked withdrawals", () => {
  const storage = new MemoryStorage();
  let first: PersistedWithdrawalV1 | undefined;
  for (let index = 0; index < 50; index += 1) {
    const transactionHash = `0x${index.toString(16).padStart(64, "0")}` as const;
    const baseEventId = `0x${(index + 100).toString(16).padStart(64, "0")}` as const;
    const record = {
      ...withdrawal(),
      recordId: transactionHash,
      submittedTransactionHash: transactionHash,
      transactionHash,
      baseEventId,
      updatedAt: 100 + index,
    };
    first ??= record;
    persistWithdrawalRecord(storage, record);
  }
  assert.equal(
    loadWithdrawalRecords(storage, ACCOUNT, 31338, TOKEN).records.length,
    50
  );
  assert.throws(
    () => assertWithdrawalStorageAvailable(storage),
    /capacity \(50\) is reached/
  );
  assert.throws(
    () =>
      persistWithdrawalRecord(storage, {
        ...withdrawal(),
        recordId: `0x${"f".repeat(64)}`,
        submittedTransactionHash: `0x${"f".repeat(64)}`,
        transactionHash: `0x${"f".repeat(64)}`,
        baseEventId: `0x${"e".repeat(64)}`,
      }),
    /refusing to evict/
  );
  persistWithdrawalRecord(storage, { ...first!, updatedAt: 1_000 });
  assert.equal(
    loadWithdrawalRecords(storage, ACCOUNT, 31338, TOKEN).records.length,
    50
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
  const futureObservation = evaluateBaseToNockReadiness({
    chainId: bridge.chainId,
    expectedNetwork: bridge,
    contractsLoading: false,
    nockInbox: INBOX,
    inboxNock: TOKEN,
    withdrawalsEnabled: true,
    statusLoading: false,
    status: { ...status, baseObservedAt: status.observedAt + 5_001 },
    statusError: null,
    now: status.observedAt,
  });
  assert.equal(futureObservation.ready, false);
  assert.ok(futureObservation.blockers.some((blocker) => blocker.includes("stale")));


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
    authoritativeRevision: "0",
    recoveryGeneration: 0,
    publicResolution: null,
    priorAuthoritativeStatus: null,
    invalidatedBlockNumber: null,
    invalidatedBlockHash: null,
    recoveryReason: null,
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
  overrides: Partial<PublicWithdrawalStatusV2> = {}
): PublicWithdrawalStatusV2 {
  return {
    schemaVersion: 2 as const,
    withdrawalId: "withdrawal-1",
    baseEventId: EVENT,
    status: "pending" as const,
    resolution: "found",
    revision: "1",
    recoveryGeneration: 0,
    terminalProof: false,
    nockTransactionId: null,
    nockBlockId: null,
    actualPayoutNicks: null,
    invalidatedBlockNumber: null,
    invalidatedBlockHash: null,
    priorStatus: null,
    recoveryReason: null,
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
    baseObservedAt: 1_000,
    operatorAdmissionEnabled: true,
    contractGateEnabled: true,
    minimumGrossNocks: "100000",
    minimumGrossNicks: "6553600000",
    minimumGrossBaseUnits: "1000000000000000000000",
    baseUnitsPerNock: "10000000000000000",
    nicksPerNock: "65536",
    baseUnitsPerNick: "152587890625",
    bridgeFeeNicksPerStartedNock: "195",
    maximumNicks: "18446744073709551615",
  };
}

function testAddress(digit: string): `0x${string}` {
  return `0x${digit.repeat(40)}`;
}
