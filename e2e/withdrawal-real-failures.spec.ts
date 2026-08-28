import fs from "node:fs";

import type { Page, Route } from "@playwright/test";
import { getAddress } from "viem";

import { test, expect } from "./fixtures/diagnostics";
import type { TestWalletFixture } from "./fixtures/test-wallet";
import { SwapPage } from "./pages/swap-page";

const BURN_TOPIC =
  "0x934d4a16140d0cf22c85c70dc423d2030b3473b02e5c37c5edc50c09a8fb2d8c";
const SECOND_ANVIL_ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

type JsonObject = Record<string, unknown>;

interface RealFailureManifest {
  schema_version: 1;
  rpc_url: string;
  account: string;
  contracts: Record<string, string>;
  amount_nocks: string;
  destination_v1_pkh: string;
  public_status_url: string;
}

interface ScenarioExpectation {
  sends: 0 | 1;
}

interface RealScenario {
  name: string;
  run(page: Page, wallet: TestWalletFixture): Promise<ScenarioExpectation>;
}

const manifest = loadManifest();
const rpcOrigin = new URL(manifest.rpc_url).origin;
let logStartBlock = "";
let baselineBurns = 0;

test.describe.configure({ mode: "default" });

test.beforeAll(async () => {
  logStartBlock = await rpc<string>("eth_blockNumber");
  const readiness = await fetch(manifest.public_status_url, { cache: "no-store" });
  if (!readiness.ok) {
    throw new Error(`real bridge readiness returned HTTP ${readiness.status}`);
  }
  const body = (await readiness.json()) as { ready?: unknown };
  if (body.ready !== true) throw new Error("real bridge readiness is not ready");
});

test.beforeEach(async () => {
  baselineBurns = await burnCount();
});

const scenarios: RealScenario[] = [
  {
    name: "real bridge readiness permits review without a burn",
    async run(page, wallet) {
      const swap = await prepareForm(page, wallet, manifest.amount_nocks, manifest.destination_v1_pkh);
      await swap.expectPrimaryAction("Review withdrawal", true);
      return { sends: 0 };
    },
  },
  {
    name: "wallet rejection remains visible without a bridge burn",
    async run(page, wallet) {
      const swap = await prepareReview(page, wallet);
      await rejectRpcMethod(page, "eth_sendTransaction", 4001, "User rejected request");
      await swap.confirm();
      await expect(page.getByTestId("result-error")).toContainText("Transaction cancelled");
      return { sends: 1 };
    },
  },
  {
    name: "disconnect after review cannot reach the real bridge",
    async run(page, wallet) {
      const swap = await prepareReview(page, wallet);
      await wallet.disconnect();
      await expect(swap.confirmAction).toHaveCount(0);
      await expect(swap.primaryAction).toBeVisible();
      return { sends: 0 };
    },
  },
  {
    name: "invalid destination is blocked before the real bridge",
    async run(page, wallet) {
      const swap = await prepareForm(page, wallet, manifest.amount_nocks, "not-a-nockchain-pkh");
      await expect(swap.primaryAction).toHaveAttribute("aria-busy", "false");
      await swap.primaryAction.click();
      await expect(page.getByTestId("swap-destination-error")).toContainText(
        /valid Nockchain address/i
      );
      return { sends: 0 };
    },
  },
  {
    name: "below-minimum amount is blocked before the real bridge",
    async run(page, wallet) {
      const swap = await prepareForm(page, wallet, "99999", manifest.destination_v1_pkh);
      await expect(page.getByTestId("swap-amount-error")).toContainText(/Minimum 100,000 NOCK/i);
      await expect(swap.primaryAction).toBeDisabled();
      return { sends: 0 };
    },
  },
  {
    name: "public readiness transport outage fails closed",
    async run(page, wallet) {
      await page.route(`${manifest.public_status_url}**`, async (route) => {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "injected transport outage" }),
        });
      });
      const swap = await prepareForm(page, wallet, manifest.amount_nocks, manifest.destination_v1_pkh);
      await swap.expectPrimaryAction(/readiness failed|unavailable/i, false);
      return { sends: 0 };
    },
  },
  {
    name: "account mutation submits once but creates no bridge burn",
    async run(page, wallet) {
      const swap = await prepareReview(page, wallet);
      await mutateSubmittedTransaction(page, (transaction) => ({
        ...transaction,
        from: SECOND_ANVIL_ACCOUNT,
      }));
      await swap.confirm();
      await expect(page.getByTestId("result-error")).toBeVisible();
      return { sends: 1 };
    },
  },
  {
    name: "reverted transaction creates no bridge burn",
    async run(page, wallet) {
      const swap = await prepareReview(page, wallet);
      await installRevertedSubmission(page);
      await swap.confirm();
      await swap.expectLifecycleState("support");
      await expect(page.getByTestId("result-error")).toContainText(/reverted/i);
      return { sends: 1 };
    },
  },
  ...(["missing", "wrong"] as const).map<RealScenario>((mode) => ({
    name: `${mode} receipt log creates no real bridge burn`,
    async run(page, wallet) {
      const swap = await prepareReview(page, wallet);
      await installReceiptLogFault(page, mode);
      await swap.confirm();
      await swap.expectLifecycleState("support");
      await expect(page.getByTestId("result-error")).toContainText(/observed 0/i);
      return { sends: 1 };
    },
  })),
  {
    name: "corrupt browser record shows support without a bridge burn",
    async run(page, wallet) {
      await page.addInitScript(() => {
        localStorage.setItem("nockswap.withdrawals.v1", "{corrupt");
      });
      const swap = new SwapPage(page, wallet);
      await swap.goto();
      await swap.connectBaseWallet();
      await swap.expectLifecycleState("support");
      await expect(page.getByTestId("result-error")).toContainText(/corrupt/i);
      return { sends: 0 };
    },
  },
  {
    name: "ordinary ABI initiation remains absent against the real bridge",
    async run(page, wallet) {
      const swap = new SwapPage(page, wallet);
      await swap.goto();
      await swap.selectDirection("base_to_nock");
      await swap.connectBaseWallet();
      await expect(page.getByText(/custom abi|approve and call|raw calldata/i)).toHaveCount(0);
      await expect(page.locator('textarea, input[name*="abi" i], input[name*="calldata" i]')).toHaveCount(0);
      return { sends: 0 };
    },
  },
];

for (const scenario of scenarios) {
  test(scenario.name, async ({ page, testWallet, diagnostics }, testInfo) => {
    let sendRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).origin !== rpcOrigin || request.method() !== "POST") return;
      try {
        const payload = request.postDataJSON() as { method?: string };
        if (payload.method === "eth_sendTransaction") sendRequests += 1;
      } catch {
        // Malformed requests are not submissions.
      }
    });
    const expected = await scenario.run(page, testWallet);
    expect(sendRequests, "browser eth_sendTransaction count").toBe(expected.sends);
    expect((await burnCount()) - baselineBurns, "real BurnForWithdrawal delta").toBe(0);
    const lifecycle = page.getByTestId("withdrawal-lifecycle-state");
    if ((await lifecycle.count()) > 0) {
      await expect(lifecycle).not.toHaveAttribute("data-state", "confirmed");
    }
    await diagnostics.assertViewportFits();
    diagnostics.assertNoCriticalConsole();
    await testInfo.attach("real-bridge-failure-invariants", {
      body: Buffer.from(
        JSON.stringify(
          {
            scenario: scenario.name,
            sendRequests,
            burnDelta: 0,
            statusEndpoint: manifest.public_status_url,
          },
          null,
          2
        )
      ),
      contentType: "application/json",
    });
  });
}

async function prepareForm(
  page: Page,
  wallet: TestWalletFixture,
  amount: string,
  destination: string
): Promise<SwapPage> {
  const swap = new SwapPage(page, wallet);
  await swap.goto();
  await swap.selectDirection("base_to_nock");
  await swap.connectBaseWallet();
  await swap.enterExactAmount(amount);
  await swap.enterDestination(destination);
  return swap;
}

async function prepareReview(page: Page, wallet: TestWalletFixture): Promise<SwapPage> {
  const swap = await prepareForm(page, wallet, manifest.amount_nocks, manifest.destination_v1_pkh);
  await swap.expectPrimaryAction("Review withdrawal", true);
  await swap.review();
  await expect(swap.confirmAction).toBeEnabled();
  return swap;
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
    await fulfillRpc(route, {
      jsonrpc: "2.0",
      id: payload.id,
      error: { code, message },
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
    const transaction = Array.isArray(payload.params) ? payload.params[0] : undefined;
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
      await fulfillRpc(route, {
        ...response,
        result: {
          ...(response.result as JsonObject),
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
      const logs = mode === "missing" ? [] : [wrongBurnLog(receipt, syntheticHash)];
      await fulfillRpc(route, { ...response, result: { ...receipt, logs } });
      return;
    }
    await route.continue();
  });
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
  | (JsonObject & { id: number | string | null; method: string; params?: unknown })
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
      id: number | string | null;
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

function loadManifest(): RealFailureManifest {
  const path = process.env.NOCKSWAP_E2E_MANIFEST;
  if (!path) throw new Error("NOCKSWAP_E2E_MANIFEST is required");
  const value: unknown = JSON.parse(fs.readFileSync(path, "utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("real failure manifest is not an object");
  }
  const candidate = value as Partial<RealFailureManifest>;
  if (
    candidate.schema_version !== 1 ||
    typeof candidate.rpc_url !== "string" ||
    typeof candidate.account !== "string" ||
    typeof candidate.amount_nocks !== "string" ||
    typeof candidate.destination_v1_pkh !== "string" ||
    typeof candidate.public_status_url !== "string" ||
    typeof candidate.contracts !== "object" ||
    candidate.contracts === null ||
    typeof candidate.contracts.nock !== "string"
  ) {
    throw new Error("real failure manifest has an unsupported schema");
  }
  return candidate as RealFailureManifest;
}
