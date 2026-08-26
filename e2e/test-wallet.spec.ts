import { expect, test } from "./fixtures/test-wallet";

test("deterministic wallet connects, disconnects, and reconnects", async ({
  page,
  testWallet,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("e2e-wallet-probe")).toBeVisible();
  await expect(page.getByTestId("e2e-wallet-status")).toHaveText(
    "disconnected"
  );
  await expect(page.getByTestId("e2e-wallet-chain")).toHaveText(
    String(testWallet.chainId)
  );

  await testWallet.connect();
  await testWallet.disconnect();
  await testWallet.connect();

  await expect(page.getByTestId("e2e-wallet-account")).toHaveText(
    testWallet.account
  );
  await expect(page.getByTestId("e2e-wallet-chain")).toHaveText(
    String(testWallet.chainId)
  );
});
