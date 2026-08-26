import { test } from "./fixtures/diagnostics";
import { SwapPage } from "./pages/swap-page";

const TOKEN = testAddress("1");
const INBOX = testAddress("3");
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

test("pending withdrawal survives reload and confirms only with terminal proof", async ({
  page,
  testWallet,
  diagnostics,
}) => {
  const createdAt = Date.now();
  await page.addInitScript(
    ({ account, token, inbox, tx, block, event, commitment, destination, created }) => {
      localStorage.setItem(
        "nockswap.withdrawals.v1",
        JSON.stringify([
          {
            schemaVersion: 1,
            recordId: event,
            account,
            chainId: 31338,
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

  let terminal = false;
  await page.route("http://127.0.0.1:19090/status**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has("base_event_id")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          schemaVersion: 1,
          observedAt: Date.now(),
          ready: true,
          chainId: 31338,
          nockTokenAddress: TOKEN,
          messageInboxAddress: INBOX,
          bridgeSignerPkhs: ["signer-1"],
          bridgeThreshold: 1,
          withdrawalsEnabled: true,
          withdrawalWireProtocol: "WithdrawalWireV1",
          withdrawalPolicyId: "withdrawal-policy-v1",
          irisSdkVersion: "0.3.3",
          reason: null,
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        withdrawalId: "withdrawal-1",
        baseEventId: EVENT,
        status: terminal ? "terminal" : "submitted",
        terminalProof: terminal,
        nockTransactionId: terminal ? "nock-tx-1" : null,
        nockBlockId: terminal ? "nock-block-1" : null,
        actualPayoutNicks: terminal ? "6500000000" : null,
        observedAt: Date.now(),
        reason: null,
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
  terminal = true;
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
  await diagnostics.captureCheckpoint("withdrawal-confirmed-after-reload");
  await diagnostics.assertViewportFits();
  diagnostics.assertNoCriticalConsole();
});

function testAddress(digit: string): `0x${string}` {
  return `0x${digit.repeat(40)}`;
}
