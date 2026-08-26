import { test } from "./fixtures/diagnostics";
import { SwapPage } from "./pages/swap-page";
import type { WithdrawalUiState } from "./pages/swap-page";

const lifecycleStates: WithdrawalUiState[] = [
  "submitted",
  "receipt",
  "pending",
  "delayed",
  "confirmed",
  "support",
];

test("page object uses stable form and result semantics", async ({
  page,
  diagnostics,
}) => {
  await page.setContent(`
    <button aria-label="Switch to Base to Nockchain" data-testid="swap-direction">switch</button>
    <section data-testid="swap-card" data-direction="nock_to_base">
      <label>Amount to send <input aria-label="Amount to send" data-testid="swap-amount" value="100001"></label>
      <input aria-label="Amount received after bridge fee" data-testid="swap-quote" value="99703" readonly>
      <label>Base receiving address <input aria-label="Base receiving address" data-testid="swap-destination" value="  destination-root  "></label>
      <button data-testid="swap-primary-action" disabled>Known blocker</button>
    </section>
    <section data-testid="result-card" data-result-status="success">
      <span data-testid="result-destination" title="destination-root">destination…root</span>
      <span data-testid="result-transaction" title="0xtransaction">0xtrans…ction</span>
      <span data-testid="base-reference" title="0xbase">Base reference</span>
      <span data-testid="nockchain-reference" title="nock-tx">Nockchain reference</span>
    </section>
    <script>
      document.querySelector('[data-testid="swap-direction"]').addEventListener('click', () => {
        document.querySelector('[data-testid="swap-card"]').dataset.direction = 'base_to_nock';
      });
    </script>
  `);

  const swap = new SwapPage(page);
  const form = await swap.readForm();
  if (
    form.amount !== "100001" ||
    form.destination !== "destination-root" ||
    form.quote !== "99703" ||
    form.primaryAction !== "Known blocker" ||
    !form.primaryActionDisabled
  ) {
    throw new Error(`unexpected page object form snapshot: ${JSON.stringify(form)}`);
  }
  await swap.selectDirection("base_to_nock");
  const references = await swap.readReferences();
  if (
    references.base !== "0xbase" ||
    references.nockchain !== "nock-tx" ||
    references.destination !== "destination-root" ||
    references.transaction !== "0xtransaction"
  ) {
    throw new Error(
      `unexpected page object references: ${JSON.stringify(references)}`
    );
  }
  await diagnostics.assertViewportFits();
});

for (const state of lifecycleStates) {
  test(`page object reads visible ${state} lifecycle state`, async ({ page }) => {
    await page.setContent(`
      <output
        data-testid="withdrawal-lifecycle-state"
        data-state="${state}"
      >${state}</output>
    `);
    const swap = new SwapPage(page);
    await swap.expectLifecycleState(state);
    const observed = await swap.readLifecycleState();
    if (observed !== state) {
      throw new Error(`expected ${state}, observed ${observed}`);
    }
  });
}
