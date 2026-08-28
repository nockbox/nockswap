import fs from "node:fs";

import { test } from "./fixtures/diagnostics";
import { SwapPage } from "./pages/swap-page";

interface LifecycleManifest {
  schema_version: 1;
  chain_id: 31338;
  contracts: Record<string, string>;
  bridge_signer_pkhs: string[];
  bridge_threshold: number;
  public_status_url: string;
}

const manifest = loadManifest();
const TOKEN = requiredContract("nock");
const INBOX = requiredContract("message_inbox");
const TX = `0x${"1".repeat(64)}`;
const BLOCK = `0x${"2".repeat(64)}`;
const EVENT = `0x${"3".repeat(64)}`;
const BURN_BINDING_HASH = `0x${"4".repeat(64)}`;
const DESTINATION = [
  "AD6Mw1QUnPUr",
  "nVpyj2gW2jT6",
  "Jd6WsuZQmPn7",
  "9XpZoFEocuvV",
  "12iDkvh",
].join("");

test("revisioned withdrawal survives reload, reorgs, and resumes safely", async ({
  page,
  testWallet,
  diagnostics,
}) => {
  const createdAt = Date.now();
  await page.addInitScript(
    ({ account, chainId, token, inbox, tx, block, event, commitment, destination, created }) => {
      localStorage.setItem(
        "nockswap.withdrawals.v1",
        JSON.stringify([
          {
            schemaVersion: 1,
            recordId: event,
            account,
            chainId,
            nockTokenAddress: token,
            messageInboxAddress: inbox,
            submittedTransactionHash: tx,
            transactionHash: tx,
            blockNumber: "10",
            blockHash: block,
            logIndex: 0,
            baseEventId: event,
            destination,
            lockRoot: "lock-root",
            commitment,
            calldata: `0x${"ab".repeat(116)}`,
            amountBaseUnits: "1000010000000000000000",
            amountNicks: "6553665536",
            estimatedPayoutNicks: "6534150000",
            actualPayoutNicks: null,
            nockTransactionId: null,
            nockBlockId: null,
            status: "withdrawal_pending",
            createdAt: created,
            updatedAt: created,
            confirmedAt: null,
            retryAuthorizedAt: null,
            history: [
              {
                status: "withdrawal_pending",
                observedAt: created,
                detail: "Verified Base receipt.",
              },
            ],
          },
        ])
      );
    },
    {
      account: testWallet.account,
      chainId: manifest.chain_id,
      token: TOKEN,
      inbox: INBOX,
      tx: TX,
      block: BLOCK,
      event: EVENT,
      commitment: BURN_BINDING_HASH,
      destination: DESTINATION,
      created: createdAt,
    }
  );

  let lifecycle: "submitted" | "terminal" | "reorg" | "resumed" = "submitted";
  await page.route(`${manifest.public_status_url}**`, async (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has("history")) {
      const observedAt = Date.now();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          schemaVersion: 1,
          observedAt,
          ready: true,
          chainId: manifest.chain_id,
          nockTokenAddress: TOKEN,
          messageInboxAddress: INBOX,
          bridgeSignerPkhs: manifest.bridge_signer_pkhs,
          bridgeThreshold: manifest.bridge_threshold,
          withdrawalsEnabled: true,
          withdrawalWireProtocol: "WithdrawalWireV1",
          withdrawalPolicyId: "withdrawal-policy-v1",
          irisSdkVersion: "0.3.3",
          reason: null,
          baseObservedAt: observedAt,
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
        }),
      });
      return;
    }
    const terminal = lifecycle === "terminal";
    const reorged = lifecycle === "reorg";
    const status = {
      schemaVersion: 2,
      withdrawalId: "withdrawal-1",
      baseEventId: EVENT,
      status: terminal
        ? "terminal"
        : reorged
          ? "reorg_hold"
          : lifecycle === "resumed"
            ? "pending"
            : "submitted",
      resolution: reorged ? "reorged" : "found",
      revision:
        lifecycle === "submitted"
          ? "1"
          : lifecycle === "terminal"
            ? "2"
            : lifecycle === "reorg"
              ? "3"
              : "4",
      recoveryGeneration: reorged || lifecycle === "resumed" ? 1 : 0,
      terminalProof: terminal,
      nockTransactionId: terminal ? "nock-tx-1" : null,
      nockBlockId: terminal ? "nock-block-1" : null,
      actualPayoutNicks: terminal ? "6500000000" : null,
      invalidatedBlockNumber: reorged ? "700" : null,
      invalidatedBlockHash: reorged ? BLOCK : null,
      priorStatus: reorged ? "terminal" : null,
      recoveryReason: reorged ? "Confirmed inclusion was orphaned." : null,
      observedAt: Date.now(),
      reason: reorged ? "Confirmed inclusion was orphaned." : null,
    };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        revision: status.revision,
        records: [status],
      }),
    });
  });

  const swap = new SwapPage(page, testWallet);
  await swap.goto();
  await swap.connectBaseWallet();
  await swap.expectLifecycleState("pending");
  await page.reload();
  await testWallet.connect();
  await swap.expectLifecycleState("pending");
  lifecycle = "terminal";
  await swap.expectLifecycleState("confirmed");
  const references = await swap.readReferences();
  if (
    references.transaction !== TX ||
    references.nockchain !== "nock-tx-1"
  ) {
    throw new Error(
      `withdrawal references diverged: ${JSON.stringify(references)}`
    );
  }
  lifecycle = "reorg";
  await swap.expectLifecycleState("support");
  const reorgReferences = await swap.readReferences();
  if (reorgReferences.nockchain !== null) {
    throw new Error(
      `reorg retained stale Nockchain reference: ${JSON.stringify(reorgReferences)}`
    );
  }
  lifecycle = "resumed";
  await swap.expectLifecycleState("pending");
  await diagnostics.captureCheckpoint("withdrawal-confirmed-after-reload");
  await diagnostics.assertViewportFits();
  diagnostics.assertNoCriticalConsole();
});


function loadManifest(): LifecycleManifest {
  const manifestPath = process.env.NOCKSWAP_E2E_MANIFEST;
  if (!manifestPath) throw new Error("NOCKSWAP_E2E_MANIFEST is required");
  const value: unknown = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (value as Partial<LifecycleManifest>).schema_version !== 1 ||
    (value as Partial<LifecycleManifest>).chain_id !== 31338 ||
    typeof (value as Partial<LifecycleManifest>).public_status_url !== "string" ||
    !Array.isArray((value as Partial<LifecycleManifest>).bridge_signer_pkhs) ||
    !Number.isSafeInteger((value as Partial<LifecycleManifest>).bridge_threshold) ||
    typeof (value as Partial<LifecycleManifest>).contracts !== "object" ||
    (value as Partial<LifecycleManifest>).contracts === null
  ) {
    throw new Error("withdrawal lifecycle manifest is invalid");
  }
  return value as LifecycleManifest;
}

function requiredContract(name: string): string {
  const address = manifest.contracts[name];
  if (!address) throw new Error(`withdrawal lifecycle manifest is missing ${name}`);
  return address;
}
