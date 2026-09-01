import { test } from "./fixtures/diagnostics";
import { SwapPage } from "./pages/swap-page";

test("withdrawal controls and deterministic wallet survive rerenders", async ({
  page,
  testWallet,
  diagnostics,
}) => {
  const swap = new SwapPage(page, testWallet);
  await swap.goto();

  await swap.enterExactAmount("100001");
  await swap.enterDestination(
    "nock1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"
  );
  await swap.selectDirection("base_to_nock");
  const resetForm = await swap.readForm();
  if (resetForm.amount !== "" || resetForm.destination !== "") {
    throw new Error("direction change did not reset amount and destination");
  }

  await swap.connectBaseWallet();
  const blocked = await swap.readForm();
  if (!blocked.primaryActionDisabled || !blocked.primaryAction) {
    throw new Error("authoritative readiness blocker was not visible");
  }
  await swap.disconnectBaseWallet();
  await swap.connectBaseWallet();

  await diagnostics.captureCheckpoint("base-wallet-connected");
  await diagnostics.assertViewportFits();
  diagnostics.assertNoCriticalConsole();
});
