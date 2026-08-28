import assert from "node:assert/strict";
import test from "node:test";

import {
  assertWithdrawalBurnerCodeSupported,
  selectWithdrawalBurnClient,
} from "../src/lib/withdrawalBurnSafety";

test("receipt polling resolves the expected chain client after a switch", () => {
  const requested: number[] = [];
  const client = selectWithdrawalBurnClient(31338, (chainId) => {
    requested.push(chainId);
    return { chain: { id: chainId }, marker: "expected-chain" };
  });
  assert.deepEqual(requested, [31338]);
  assert.equal(client.marker, "expected-chain");

  assert.throws(
    () =>
      selectWithdrawalBurnClient(31338, () => ({
        chain: { id: 1 },
      })),
    /selected bridge network/
  );
});

test("contract and delegated burner bytecode is rejected", () => {
  assert.doesNotThrow(() => assertWithdrawalBurnerCodeSupported(undefined));
  assert.doesNotThrow(() => assertWithdrawalBurnerCodeSupported("0x"));
  assert.throws(
    () => assertWithdrawalBurnerCodeSupported("0x60006000"),
    /Contract-wallet and delegated-account withdrawals are unsupported/
  );
});
