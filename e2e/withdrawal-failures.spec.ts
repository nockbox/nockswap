import fs from "node:fs";
import http from "node:http";
import { once } from "node:events";

import type { Page, Route } from "@playwright/test";
import { getAddress } from "viem";

import { test, expect } from "./fixtures/diagnostics";
import type { BrowserDiagnostics } from "./fixtures/diagnostics";
import type { TestWalletFixture } from "./fixtures/test-wallet";
import { SwapPage } from "./pages/swap-page";

const BURN_TOPIC =
  "0x934d4a16140d0cf22c85c70dc423d2030b3473b02e5c37c5edc50c09a8fb2d8c";
const SECOND_ANVIL_ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const TX = `0x${"1".repeat(64)}`;
const BLOCK = `0x${"2".repeat(64)}`;
const EVENT = `0x${"3".repeat(64)}`;
const COMMITMENT = `0x${"4".repeat(64)}`;

type JsonRpcId = number | string | null;
type JsonObject = Record<string, unknown>;

interface FailureManifest {
  schema_version: 1;
  run_id: string;
  rpc_url: string;
  chain_id: 31338;
  account: string;
  contracts: Record<string, string>;
  bridge_signer_pkhs: string[];
  bridge_threshold: number;
  iris_package_version: string;
  amount_nocks: string;
  destination_v1_pkh: string;
  public_status_url: string;
}

interface PublicStatus {
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

interface StatusControl {
  readinessMode: "ready" | "unavailable" | "stale" | "policy_mismatch";
  status: PublicStatus | null;
  statusFailuresRemaining: number;
  readinessRequests: number;
  statusRequests: number;
  terminalProofResponses: number;
}

interface ScenarioContext {
  page: Page;
  testWallet: TestWalletFixture;
  diagnostics: BrowserDiagnostics;
}

interface ScenarioExpectation {
  burns: "zero" | "one" | "at_most_one";
  sends: "zero" | "one" | "at_most_one";
}

interface MatrixScenario {
  name: string;
  run(context: ScenarioContext): Promise<ScenarioExpectation>;
}

const manifest = loadManifest();
let statusControl = freshStatusControl();
let statusServer: http.Server;
let snapshotId = "";
let baselineBurnCount = 0;
let logStartBlock = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  statusServer = http.createServer(handleStatusRequest);
  const endpoint = new URL(manifest.public_status_url);
  if (endpoint.protocol !== "http:" || !isLoopback(endpoint.hostname)) {
    throw new Error("Failure-matrix status endpoint must be loopback HTTP");
  }
  statusServer.listen(Number(endpoint.port), endpoint.hostname);
  await once(statusServer, "listening");
  logStartBlock = await rpc<string>("eth_blockNumber");
});

test.afterAll(async () => {
  if (!statusServer) return;
  statusServer.close();
  await once(statusServer, "close");
});

test.beforeEach(async () => {
  statusControl = freshStatusControl();
  snapshotId = await rpc<string>("evm_snapshot");
  baselineBurnCount = await burnCount();
});

test.afterEach(async () => {
  if (!snapshotId) return;
  const reverted = await rpc<boolean>("evm_revert", [snapshotId]);
  if (!reverted) throw new Error(`Anvil snapshot ${snapshotId} could not be restored`);
  snapshotId = "";
});

const scenarios: MatrixScenario[] = [
  {
    name: "wallet cancellation is visible and creates no burn",
    async run({ page, testWallet }) {
      const swap = await prepareReview(page, testWallet);
      await rejectRpcMethod(page, "eth_sendTransaction", 4001, "User rejected request");
      await swap.confirm();
      await expect(page.getByTestId("result-error")).toContainText(
        "Transaction cancelled"
      );
      return zero();
    },
  },
  {
    name: "wallet disconnect after review blocks submission",
    async run({ page, testWallet }) {
      const swap = await prepareReview(page, testWallet);
      await testWallet.disconnect();
      await swap.confirm();
      await expect(page.getByTestId("result-error")).toContainText(
        /account|deployment is unavailable/i
      );
      return zero();
    },
  },
  {
    name: "changed wallet account fails closed during reconnect",
    async run({ page }) {
      await mismatchWalletIdentity(page, "eth_accounts", [SECOND_ANVIL_ACCOUNT]);
      const swap = new SwapPage(page);
      await swap.goto();
      await openWalletControls(page);
      await page.getByTestId("e2e-wallet-connect").click();
      await expect(page.getByTestId("e2e-wallet-error")).toContainText(
        /account is not unlocked/i
      );
      return zero();
    },
  },
  {
    name: "wrong wallet chain fails closed during reconnect",
    async run({ page }) {
      await mismatchWalletIdentity(page, "eth_chainId", "0x1");
      const swap = new SwapPage(page);
      await swap.goto();
      await openWalletControls(page);
      await page.getByTestId("e2e-wallet-connect").click();
      await expect(page.getByTestId("e2e-wallet-error")).toContainText(
        /chain mismatch/i
      );
      return zero();
    },
  },
  ...validationScenarios(),
  ...readinessScenarios(),
  {
    name: "calldata mutation after review is detected",
    async run({ page, testWallet }) {
      const swap = await prepareReview(page, testWallet);
      await mutateSubmittedTransaction(page, (transaction) => {
        const data = String(transaction.data);
        return { ...transaction, data: `${data.slice(0, -2)}00` };
      });
      await swap.confirm();
      await expect(page.getByTestId("withdrawal-lifecycle-state")).toHaveAttribute(
        "data-state",
        /support/
      );
      await expect(page.getByTestId("result-error")).toContainText(
        /does not match the prepared burn/i
      );
      return atMostOne();
    },
  },
  {
    name: "account mutation after review cannot create a valid burn",
    async run({ page, testWallet }) {
      const swap = await prepareReview(page, testWallet);
      await mutateSubmittedTransaction(page, (transaction) => ({
        ...transaction,
        from: SECOND_ANVIL_ACCOUNT,
      }));
      await swap.confirm();
      await expect(page.getByTestId("result-error")).toBeVisible();
      return zero();
    },
  },
  {
    name: "reverted receipt enters support without payout evidence",
    async run({ page, testWallet }) {
      const swap = await prepareReview(page, testWallet);
      await installRevertedSubmission(page);
      await swap.confirm();
      await expect(page.getByTestId("withdrawal-lifecycle-state")).toHaveAttribute(
        "data-state",
        "support"
      );
      await expect(page.getByTestId("result-error")).toContainText(
        /reverted/i
      );
      return zero();
    },
  },
  {
    name: "replacement receipt preserves submitted and mined identities",
    async run({ page, testWallet }) {
      const swap = await prepareReview(page, testWallet);
      const replacement = await installReplacementSubmission(page);
      await swap.confirm();
      await swap.expectLifecycleState("pending");
      const record = await activeStoredRecord(page);
      expect(record.submittedTransactionHash).toBe(replacement.submittedHash);
      expect(record.transactionHash).toBe(replacement.replacementHash);
      expect(record.transactionHash).not.toBe(record.submittedTransactionHash);
      return one();
    },
  },
  {
    name: "missing BurnForWithdrawal log enters support with no real burn",
    async run({ page, testWallet }) {
      const swap = await prepareReview(page, testWallet);
      await installReceiptLogFault(page, "missing");
      await swap.confirm();
      await expect(page.getByTestId("withdrawal-lifecycle-state")).toHaveAttribute(
        "data-state",
        "support"
      );
      await expect(page.getByTestId("result-error")).toContainText(
        /observed 0/i
      );
      return zero();
    },
  },
  {
    name: "wrong BurnForWithdrawal log enters support with no real burn",
    async run({ page, testWallet }) {
      const swap = await prepareReview(page, testWallet);
      await installReceiptLogFault(page, "wrong");
      await swap.confirm();
      await expect(page.getByTestId("withdrawal-lifecycle-state")).toHaveAttribute(
        "data-state",
        "support"
      );
      await expect(page.getByTestId("result-error")).toContainText(
        /observed 0/i
      );
      return zero();
    },
  },
  {
    name: "reload before receipt never submits a duplicate burn",
    async run({ page, testWallet }) {
      const swap = await prepareReview(page, testWallet);
      await holdReceiptUnknown(page);
      await swap.confirm();
      await expect.poll(() => storedWithdrawalStatus(page)).toBe("awaiting_base");
      await page.reload();
      await testWallet.connect();
      await swap.expectLifecycleState("submitted");
      await expect(page.getByTestId("result-transaction")).toBeVisible();
      return atMostOne();
    },
  },
  {
    name: "corrupt local record produces support guidance",
    async run({ page, testWallet }) {
      await page.addInitScript(() => {
        localStorage.setItem("nockswap.withdrawals.v1", "{corrupt");
      });
      const swap = new SwapPage(page, testWallet);
      await swap.goto();
      await swap.connectBaseWallet();
      await swap.expectLifecycleState("support");
      await expect(page.getByTestId("result-error")).toContainText(/corrupt/i);
      return zero();
    },
  },
  {
    name: "duplicate confirm clicks submit at most one burn",
    async run({ page, testWallet }) {
      const swap = await prepareReview(page, testWallet);
      await swap.confirmAction.evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });
      await swap.expectLifecycleState("pending");
      return one();
    },
  },
  {
    name: "public API outage recovers without a retry burn",
    async run({ page, testWallet }) {
      await preloadPendingRecord(page, Date.now());
      statusControl.statusFailuresRemaining = 1;
      statusControl.status = submittedStatus(EVENT);
      const swap = new SwapPage(page, testWallet);
      await swap.goto();
      await swap.connectBaseWallet();
      await swap.expectLifecycleState("pending");
      await expect.poll(() => statusControl.statusRequests).toBeGreaterThan(1);
      await expect(page.getByTestId("withdrawal-lifecycle-state")).toContainText(
        "Backend lifecycle: submitted",
        { timeout: 15_000 }
      );
      return zero();
    },
  },
  {
    name: "old pending withdrawal becomes delayed without confirmation",
    async run({ page, testWallet }) {
      await preloadPendingRecord(page, Date.now() - 16 * 60_000);
      statusControl.status = submittedStatus(EVENT);
      const swap = new SwapPage(page, testWallet);
      await swap.goto();
      await swap.connectBaseWallet();
      await swap.expectLifecycleState("delayed");
      await expect(page.getByTestId("withdrawal-history")).toContainText(
        /no retry or duplicate burn/i
      );
      return zero();
    },
  },
  {
    name: "invalidated withdrawal is failed without confirmation",
    async run({ page, testWallet }) {
      await preloadPendingRecord(page, Date.now());
      statusControl.status = {
        ...submittedStatus(EVENT),
        status: "failed",
        reason: "Base burn was invalidated.",
      };
      const swap = new SwapPage(page, testWallet);
      await swap.goto();
      await swap.connectBaseWallet();
      await swap.expectLifecycleState("support");
      await expect(page.getByTestId("result-error")).toContainText(/invalidated/i);
      return zero();
    },
  },
  {
    name: "reorg hold shows support references and never confirms",
    async run({ page, testWallet }) {
      await preloadPendingRecord(page, Date.now());
      statusControl.status = {
        ...submittedStatus(EVENT),
        status: "reorg_hold",
        reason: "Withdrawal held after a Base reorganization.",
      };
      const swap = new SwapPage(page, testWallet);
      await swap.goto();
      await swap.connectBaseWallet();
      await swap.expectLifecycleState("support");
      await expect(page.getByTestId("result-transaction")).toBeVisible();
      await expect(page.getByTestId("result-destination")).toBeVisible();
      await expect(page.getByTestId("result-error")).toContainText(/reorganization/i);
      return zero();
    },
  },
  {
    name: "public reference mismatch remains pending",
    async run({ page, testWallet }) {
      await preloadPendingRecord(page, Date.now());
      statusControl.status = submittedStatus(`0x${"9".repeat(64)}`);
      const swap = new SwapPage(page, testWallet);
      await swap.goto();
      await swap.connectBaseWallet();
      await swap.expectLifecycleState("pending");
      await expect(page.getByTestId("withdrawal-lifecycle-state")).toContainText(
        /identity does not match/i
      );
      await expect(page.getByTestId("result-transaction")).toBeVisible();
      return zero();
    },
  },
  {
    name: "terminal claim without proof remains pending",
    async run({ page, testWallet }) {
      await preloadPendingRecord(page, Date.now());
      statusControl.status = {
        ...submittedStatus(EVENT),
        status: "terminal",
        terminalProof: false,
        nockTransactionId: "nock-tx-without-proof",
        nockBlockId: "nock-block-without-proof",
        actualPayoutNicks: "1",
      };
      const swap = new SwapPage(page, testWallet);
      await swap.goto();
      await swap.connectBaseWallet();
      await swap.expectLifecycleState("pending");
      await expect(page.getByTestId("withdrawal-lifecycle-state")).toContainText(
        /missing multi-source settlement proof/i
      );
      return zero();
    },
  },
  {
    name: "ordinary or malformed ABI initiation is unavailable from the UI",
    async run({ page, testWallet }) {
      const swap = new SwapPage(page, testWallet);
      await swap.goto();
      await swap.selectDirection("base_to_nock");
      await swap.connectBaseWallet();
      await expect(page.getByText(/custom abi|approve and call|raw calldata/i)).toHaveCount(0);
      await expect(page.locator('textarea, input[name*="abi" i], input[name*="calldata" i]')).toHaveCount(0);
      await swap.expectPrimaryAction("Review withdrawal", false);
      return zero();
    },
  },
];

const orderedScenarios =
  process.env.NOCKSWAP_E2E_ORDER === "reverse"
    ? [...scenarios].reverse()
    : scenarios;

for (const scenario of orderedScenarios) {
  test(scenario.name, async ({ page, testWallet, diagnostics }, testInfo) => {
    let sendRequests = 0;
    page.on("request", (request) => {
      if (request.url() !== manifest.rpc_url || request.method() !== "POST") return;
      try {
        const payload = request.postDataJSON() as { method?: string };
        if (payload.method === "eth_sendTransaction") sendRequests += 1;
      } catch {
        // Diagnostics retains malformed requests; they are not counted as submissions.
      }
    });

    const expectation = await scenario.run({ page, testWallet, diagnostics });
    const burns = (await burnCount()) - baselineBurnCount;
    assertCount("burn", burns, expectation.burns);
    assertCount("wallet send", sendRequests, expectation.sends);
    expect(statusControl.terminalProofResponses).toBe(0);
    const lifecycle = page.getByTestId("withdrawal-lifecycle-state");
    if ((await lifecycle.count()) > 0) {
      await expect(lifecycle).not.toHaveAttribute("data-state", "confirmed");
    }
    await diagnostics.assertViewportFits();
    diagnostics.assertNoCriticalConsole();
    await testInfo.attach("failure-invariants", {
      body: Buffer.from(
        JSON.stringify(
          {
            runId: manifest.run_id,
            order: process.env.NOCKSWAP_E2E_ORDER ?? "forward",
            scenario: scenario.name,
            burns,
            sendRequests,
            terminalProofResponses: statusControl.terminalProofResponses,
            statusRequests: statusControl.statusRequests,
          },
          null,
          2
        )
      ),
      contentType: "application/json",
    });
  });
}

function validationScenarios(): MatrixScenario[] {
  return [
    invalidFormScenario(
      "invalid PKH is rejected before submission",
      manifest.amount_nocks,
      "not-a-nockchain-pkh",
      /valid Nockchain address/i
    ),
    invalidFormScenario(
      "malformed lock-root encoding is rejected before submission",
      manifest.amount_nocks,
      `${manifest.destination_v1_pkh}1`,
      /valid Nockchain address/i
    ),
    invalidFormScenario(
      "unsupported precision is rejected before submission",
      "100000.0000000000000001",
      manifest.destination_v1_pkh,
      /precision|whole nicks/i
    ),
    invalidFormScenario(
      "below-minimum amount is rejected before submission",
      "99999",
      manifest.destination_v1_pkh,
      /Minimum 100,000 NOCK/i
    ),
    {
      name: "insufficient wrapped token balance blocks submission",
      async run({ page, testWallet }) {
        const swap = await prepareForm(
          page,
          testWallet,
          "50000000",
          manifest.destination_v1_pkh
        );
        await swap.expectPrimaryAction(/Insufficient wrapped NOCK balance/i, false);
        return zero();
      },
    },
    {
      name: "insufficient native gas balance blocks submission",
      async run({ page, testWallet }) {
        await rpc("anvil_setBalance", [manifest.account, "0x0"]);
        const swap = await prepareForm(
          page,
          testWallet,
          manifest.amount_nocks,
          manifest.destination_v1_pkh
        );
        await swap.expectPrimaryAction(/Insufficient ETH for Base gas/i, false);
        return zero();
      },
    },
  ];
}

function readinessScenarios(): MatrixScenario[] {
  return [
    readinessScenario(
      "unavailable readiness blocks submission",
      "unavailable",
      /readiness failed|unavailable/i
    ),
    readinessScenario(
      "stale readiness blocks submission",
      "stale",
      /readiness is stale/i
    ),
    readinessScenario(
      "policy mismatch blocks submission",
      "policy_mismatch",
      /protocol, policy, or Iris SDK version does not match/i
    ),
  ];
}

function invalidFormScenario(
  name: string,
  amount: string,
  destination: string,
  visibleError: RegExp
): MatrixScenario {
  return {
    name,
    async run({ page, testWallet }) {
      const swap = await prepareForm(page, testWallet, amount, destination);
      await expect(swap.primaryAction).toHaveAttribute("aria-busy", "false");
      if (await swap.primaryAction.isEnabled()) await swap.primaryAction.click();
      else await swap.amount.press("Tab");
      await expect
        .poll(async () => (await swap.readBlockers()).join(" | "))
        .toMatch(visibleError);
      return zero();
    },
  };
}

function readinessScenario(
  name: string,
  mode: StatusControl["readinessMode"],
  visibleReason: RegExp
): MatrixScenario {
  return {
    name,
    async run({ page, testWallet }) {
      statusControl.readinessMode = mode;
      const swap = await prepareForm(
        page,
        testWallet,
        manifest.amount_nocks,
        manifest.destination_v1_pkh
      );
      await swap.expectPrimaryAction(visibleReason, false);
      return zero();
    },
  };
}

async function prepareForm(
  page: Page,
  testWallet: TestWalletFixture,
  amount: string,
  destination: string
): Promise<SwapPage> {
  const swap = new SwapPage(page, testWallet);
  await swap.goto();
  await swap.selectDirection("base_to_nock");
  await swap.connectBaseWallet();
  await swap.enterExactAmount(amount);
  await swap.enterDestination(destination);
  return swap;
}

async function prepareReview(
  page: Page,
  testWallet: TestWalletFixture
): Promise<SwapPage> {
  const swap = await prepareForm(
    page,
    testWallet,
    manifest.amount_nocks,
    manifest.destination_v1_pkh
  );
  await swap.expectPrimaryAction("Review withdrawal", true);
  await swap.review();
  await expect(swap.confirmAction).toBeEnabled();
  return swap;
}

async function openWalletControls(page: Page): Promise<void> {
  if ((await page.getByTestId("e2e-wallet-probe").count()) === 0) {
    await page.getByTestId("e2e-wallet-toggle").click();
  }
  await expect(page.getByTestId("e2e-wallet-probe")).toBeVisible();
}

async function mismatchWalletIdentity(
  page: Page,
  method: "eth_accounts" | "eth_chainId",
  result: unknown
): Promise<void> {
  await page.route(manifest.rpc_url, async (route) => {
    const payload = rpcRequestPayload(route);
    if (payload?.method !== method) {
      await route.continue();
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ jsonrpc: "2.0", id: payload.id, result }),
    });
  });
}

async function rejectRpcMethod(
  page: Page,
  method: string,
  code: number,
  message: string
): Promise<void> {
  await page.route(manifest.rpc_url, async (route) => {
    const payload = rpcRequestPayload(route);
    if (payload?.method !== method) {
      await route.continue();
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: payload.id,
        error: { code, message },
      }),
    });
  });
}

async function mutateSubmittedTransaction(
  page: Page,
  mutate: (transaction: JsonObject) => JsonObject
): Promise<void> {
  await page.route(manifest.rpc_url, async (route) => {
    const payload = rpcRequestPayload(route);
    if (payload?.method !== "eth_sendTransaction") {
      await route.continue();
      return;
    }
    const params = Array.isArray(payload.params) ? payload.params : [];
    const transaction = params[0];
    if (typeof transaction !== "object" || transaction === null) {
      throw new Error("eth_sendTransaction is missing its transaction object");
    }
    await route.continue({
      postData: JSON.stringify({
        ...payload,
        params: [mutate(transaction as JsonObject)],
      }),
    });
  });
}

async function installRevertedSubmission(page: Page): Promise<void> {
  await page.route(manifest.rpc_url, async (route) => {
    const payload = rpcRequestPayload(route);
    if (payload?.method !== "eth_sendTransaction") {
      await route.continue();
      return;
    }
    const response = await rpcEnvelope({
      ...payload,
      params: [
        {
          from: manifest.account,
          to: manifest.contracts.nock,
          data: "0xdeadbeef",
          gas: "0x100000",
        },
      ],
    });
    await fulfillRpc(route, response);
  });
}

async function installReceiptLogFault(
  page: Page,
  mode: "missing" | "wrong"
): Promise<void> {
  let syntheticHash = "";
  let preparedData = "";
  await page.route(manifest.rpc_url, async (route) => {
    const payload = rpcRequestPayload(route);
    if (!payload) {
      await route.continue();
      return;
    }
    if (payload.method === "eth_sendTransaction") {
      const transaction = Array.isArray(payload.params)
        ? (payload.params[0] as JsonObject)
        : undefined;
      preparedData = String(transaction?.data ?? "");
      const response = await rpcEnvelope({
        ...payload,
        params: [
          {
            from: manifest.account,
            to: manifest.account,
            value: "0x0",
            gas: "0x100000",
          },
        ],
      });
      syntheticHash = String(response.result ?? "");
      await fulfillRpc(route, response);
      return;
    }
    if (
      payload.method === "eth_getTransactionByHash" &&
      Array.isArray(payload.params) &&
      payload.params[0] === syntheticHash
    ) {
      const response = await rpcEnvelope(payload);
      const transaction = response.result as JsonObject;
      await fulfillRpc(route, {
        ...response,
        result: {
          ...transaction,
          from: manifest.account,
          to: manifest.contracts.nock,
          input: preparedData,
        },
      });
      return;
    }
    if (
      payload.method === "eth_getTransactionReceipt" &&
      Array.isArray(payload.params) &&
      payload.params[0] === syntheticHash
    ) {
      const response = await rpcEnvelope(payload);
      if (response.result === null) {
        await fulfillRpc(route, response);
        return;
      }
      const receipt = response.result as JsonObject;
      const logs =
        mode === "missing"
          ? []
          : [wrongBurnLog(receipt, syntheticHash)];
      await fulfillRpc(route, { ...response, result: { ...receipt, logs } });
      return;
    }
    await route.continue();
  });
}

async function installReplacementSubmission(
  page: Page
): Promise<{ submittedHash: string; replacementHash: string }> {
  const hashes = { submittedHash: "", replacementHash: "" };
  await page.route(manifest.rpc_url, async (route) => {
    const payload = rpcRequestPayload(route);
    if (!payload) {
      await route.continue();
      return;
    }
    if (
      payload.method === "eth_getTransactionReceipt" &&
      Array.isArray(payload.params) &&
      payload.params[0] === hashes.submittedHash &&
      hashes.replacementHash
    ) {
      const response = await rpcEnvelope({
        ...payload,
        params: [hashes.replacementHash],
      });
      await fulfillRpc(route, response);
      return;
    }
    if (payload.method !== "eth_sendTransaction") {
      await route.continue();
      return;
    }
    const transaction = Array.isArray(payload.params)
      ? (payload.params[0] as JsonObject)
      : undefined;
    if (!transaction) throw new Error("replacement test has no transaction");
    await rpc("anvil_setAutomine", [false]);
    try {
      const nonce = await rpc<string>("eth_getTransactionCount", [
        manifest.account,
        "pending",
      ]);
      hashes.submittedHash = await rpc<string>("eth_sendTransaction", [
        {
          ...transaction,
          nonce,
          gas: "0x100000",
          gasPrice: "0x3b9aca00",
        },
      ]);
      hashes.replacementHash = await rpc<string>("eth_sendTransaction", [
        {
          ...transaction,
          nonce,
          gas: "0x100000",
          gasPrice: "0x77359400",
        },
      ]);
      await rpc("evm_mine");
    } finally {
      await rpc("anvil_setAutomine", [true]);
    }
    await fulfillRpc(route, {
      jsonrpc: "2.0",
      id: payload.id,
      result: hashes.submittedHash,
    });
  });
  return hashes;
}

async function holdReceiptUnknown(page: Page): Promise<void> {
  await page.route(manifest.rpc_url, async (route) => {
    const payload = rpcRequestPayload(route);
    if (payload?.method !== "eth_getTransactionReceipt") {
      await route.continue();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    try {
      await fulfillRpc(route, { jsonrpc: "2.0", id: payload.id, result: null });
    } catch {
      // Reload intentionally cancels the in-flight receipt request.
    }
  });
}

async function preloadPendingRecord(page: Page, createdAt: number): Promise<void> {
  const record = {
    schemaVersion: 1,
    recordId: EVENT,
    account: getAddress(manifest.account),
    chainId: manifest.chain_id,
    nockTokenAddress: getAddress(manifest.contracts.nock),
    messageInboxAddress: getAddress(manifest.contracts.message_inbox),
    submittedTransactionHash: TX,
    transactionHash: TX,
    blockNumber: "10",
    blockHash: BLOCK,
    logIndex: 0,
    baseEventId: EVENT,
    destination: manifest.destination_v1_pkh,
    lockRoot: "lock-root",
    commitment: COMMITMENT,
    calldata: `0x${"ab".repeat(116)}`,
    amountBaseUnits: "1000010000000000000000",
    amountNicks: "6553665536",
    estimatedPayoutNicks: "6534150000",
    actualPayoutNicks: null,
    nockTransactionId: null,
    nockBlockId: null,
    status: "withdrawal_pending",
    createdAt,
    updatedAt: createdAt,
    confirmedAt: null,
    retryAuthorizedAt: null,
    history: [
      {
        status: "withdrawal_pending",
        observedAt: createdAt,
        detail: "Verified Base receipt.",
      },
    ],
  };
  await page.addInitScript((value) => {
    localStorage.setItem("nockswap.withdrawals.v1", JSON.stringify([value]));
  }, record);
}

async function activeStoredRecord(page: Page): Promise<JsonObject> {
  return page.evaluate(() => {
    const text = localStorage.getItem("nockswap.withdrawals.v1");
    if (!text) throw new Error("withdrawal record is missing");
    const records = JSON.parse(text) as JsonObject[];
    if (records.length !== 1) {
      throw new Error(`expected one withdrawal record, observed ${records.length}`);
    }
    return records[0];
  });
}
async function storedWithdrawalStatus(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const text = localStorage.getItem("nockswap.withdrawals.v1");
    if (!text) return null;
    try {
      const records = JSON.parse(text) as Array<{ status?: unknown }>;
      return typeof records[0]?.status === "string" ? records[0].status : null;
    } catch {
      return null;
    }
  });
}


function submittedStatus(baseEventId: string): PublicStatus {
  return {
    schemaVersion: 1,
    withdrawalId: "failure-matrix-withdrawal",
    baseEventId,
    status: "submitted",
    terminalProof: false,
    nockTransactionId: null,
    nockBlockId: null,
    actualPayoutNicks: null,
    observedAt: Date.now(),
    reason: null,
  };
}

function wrongBurnLog(receipt: JsonObject, transactionHash: string): JsonObject {
  const accountTopic = `0x${getAddress(manifest.account)
    .slice(2)
    .toLowerCase()
    .padStart(64, "0")}`;
  return {
    address: getAddress(manifest.contracts.nock),
    topics: [BURN_TOPIC, accountTopic, `0x${"0".repeat(64)}`],
    data: `0x${"0".repeat(63)}1`,
    blockHash: receipt.blockHash,
    blockNumber: receipt.blockNumber,
    transactionHash,
    transactionIndex: receipt.transactionIndex,
    logIndex: "0x0",
    removed: false,
  };
}

function freshStatusControl(): StatusControl {
  return {
    readinessMode: "ready",
    status: null,
    statusFailuresRemaining: 0,
    readinessRequests: 0,
    statusRequests: 0,
    terminalProofResponses: 0,
  };
}

function handleStatusRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse
): void {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "application/json");
  const url = new URL(request.url ?? "/", manifest.public_status_url);
  if (url.searchParams.has("base_event_id")) {
    statusControl.statusRequests += 1;
    if (statusControl.statusFailuresRemaining > 0) {
      statusControl.statusFailuresRemaining -= 1;
      response.statusCode = 503;
      response.end(JSON.stringify({ error: "injected status outage" }));
      return;
    }
    if (!statusControl.status) {
      response.statusCode = 404;
      response.end(JSON.stringify({ error: "withdrawal not indexed" }));
      return;
    }
    if (statusControl.status.terminalProof) {
      statusControl.terminalProofResponses += 1;
    }
    response.statusCode = 200;
    response.end(JSON.stringify(statusControl.status));
    return;
  }

  statusControl.readinessRequests += 1;
  if (statusControl.readinessMode === "unavailable") {
    response.statusCode = 503;
    response.end(JSON.stringify({ error: "injected readiness outage" }));
    return;
  }
  const readiness = {
    schemaVersion: 1,
    observedAt:
      statusControl.readinessMode === "stale"
        ? Date.now() - 61_000
        : Date.now(),
    ready: true,
    chainId: manifest.chain_id,
    nockTokenAddress: getAddress(manifest.contracts.nock),
    messageInboxAddress: getAddress(manifest.contracts.message_inbox),
    bridgeSignerPkhs: manifest.bridge_signer_pkhs,
    bridgeThreshold: manifest.bridge_threshold,
    withdrawalsEnabled: true,
    withdrawalWireProtocol:
      statusControl.readinessMode === "policy_mismatch"
        ? "UnsupportedWithdrawalWire"
        : "WithdrawalWireV1",
    withdrawalPolicyId: "withdrawal-policy-v1",
    irisSdkVersion: manifest.iris_package_version,
    reason: null,
  };
  response.statusCode = 200;
  response.end(JSON.stringify(readiness));
}

async function burnCount(): Promise<number> {
  const logs = await rpc<unknown[]>("eth_getLogs", [
    {
      address: getAddress(manifest.contracts.nock),
      fromBlock: logStartBlock,
      toBlock: "latest",
      topics: [BURN_TOPIC],
    },
  ]);
  return logs.length;
}

async function rpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
  const response = await rpcEnvelope({ jsonrpc: "2.0", id: 1, method, params });
  if (response.error !== undefined) {
    throw new Error(`Anvil ${method} failed: ${JSON.stringify(response.error)}`);
  }
  return response.result as T;
}

async function rpcEnvelope(payload: JsonObject): Promise<JsonObject> {
  const response = await fetch(manifest.rpc_url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Anvil RPC returned HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("Anvil RPC returned a malformed envelope");
  }
  return body as JsonObject;
}

function rpcRequestPayload(route: Route):
  | (JsonObject & { id: JsonRpcId; method: string; params?: unknown })
  | null {
  try {
    const payload: unknown = route.request().postDataJSON();
    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload) ||
      typeof (payload as JsonObject).method !== "string"
    ) {
      return null;
    }
    return payload as JsonObject & {
      id: JsonRpcId;
      method: string;
      params?: unknown;
    };
  } catch {
    return null;
  }
}

async function fulfillRpc(route: Route, envelope: JsonObject): Promise<void> {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(envelope),
  });
}

function assertCount(
  label: string,
  observed: number,
  expected: ScenarioExpectation["burns"]
): void {
  if (expected === "zero") expect(observed, `${label} count`).toBe(0);
  else if (expected === "one") expect(observed, `${label} count`).toBe(1);
  else expect(observed, `${label} count`).toBeLessThanOrEqual(1);
}

function zero(): ScenarioExpectation {
  return { burns: "zero", sends: "zero" };
}

function one(): ScenarioExpectation {
  return { burns: "one", sends: "at_most_one" };
}

function atMostOne(): ScenarioExpectation {
  return { burns: "at_most_one", sends: "at_most_one" };
}

function loadManifest(): FailureManifest {
  const path = process.env.NOCKSWAP_E2E_MANIFEST;
  if (!path) throw new Error("NOCKSWAP_E2E_MANIFEST is required");
  const value: unknown = JSON.parse(fs.readFileSync(path, "utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Failure-matrix manifest is not an object");
  }
  const candidate = value as Partial<FailureManifest>;
  if (
    candidate.schema_version !== 1 ||
    candidate.chain_id !== 31338 ||
    typeof candidate.run_id !== "string" ||
    typeof candidate.rpc_url !== "string" ||
    typeof candidate.account !== "string" ||
    typeof candidate.public_status_url !== "string" ||
    typeof candidate.amount_nocks !== "string" ||
    typeof candidate.destination_v1_pkh !== "string" ||
    typeof candidate.iris_package_version !== "string" ||
    typeof candidate.contracts !== "object" ||
    candidate.contracts === null ||
    typeof candidate.contracts.nock !== "string" ||
    typeof candidate.contracts.message_inbox !== "string" ||
    !Array.isArray(candidate.bridge_signer_pkhs) ||
    !candidate.bridge_signer_pkhs.every((value) => typeof value === "string") ||
    !Number.isSafeInteger(candidate.bridge_threshold)
  ) {
    throw new Error("Failure-matrix manifest has an unsupported schema");
  }
  return candidate as FailureManifest;
}

function isLoopback(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}
