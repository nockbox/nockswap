import assert from "node:assert/strict";
import test from "node:test";
import {
  NOCK_TOKEN_BASE_UNITS_PER_NICK,
  NockAmountError,
  amountAfterBridgeFee,
  exactNockAmountFromNicks,
  formatApproximateUsd,
  formatNicksAsNock,
  grossNicksForNetAmount,
  parseExactNockAmount,
} from "../src/lib/nockAmount";
import {
  NICKS_PER_NOCK,
  bridgeFeeNicksCeil,
} from "../src/lib/constants";

test("decimal input preserves one exact amount through nicks and Base units", () => {
  const amount = parseExactNockAmount("100,000.5");

  assert.equal(amount.canonical, "100000.5");
  assert.equal(amount.nicks, 100_000n * NICKS_PER_NOCK + NICKS_PER_NOCK / 2n);
  assert.equal(amount.baseUnits, amount.nicks * NOCK_TOKEN_BASE_UNITS_PER_NICK);
  assert.equal(formatNicksAsNock(amount.nicks), "100,000.5");
});

test("unsupported precision is rejected instead of floored", () => {
  assert.throws(
    () => parseExactNockAmount("100000.99"),
    (error) =>
      error instanceof NockAmountError && error.code === "unsupported_precision"
  );
});

test("one nick is the smallest accepted precision", () => {
  const amount = parseExactNockAmount("0.0000152587890625");
  assert.equal(amount.nicks, 1n);
  assert.equal(amount.baseUnits, NOCK_TOKEN_BASE_UNITS_PER_NICK);
  assert.equal(exactNockAmountFromNicks(1n).canonical, amount.canonical);
});

test("withdrawal fee uses the exact submitted nicks", () => {
  const amount = parseExactNockAmount("100000.5");
  const net = amountAfterBridgeFee(amount, "ceil");

  assert.equal(net.nicks, amount.nicks - bridgeFeeNicksCeil(amount.nicks));
  assert.equal(formatNicksAsNock(net.nicks), "99,702.9506378173828125");
});

test("reverse fee calculation returns the least sufficient gross amount", () => {
  const net = 99_703n * NICKS_PER_NOCK;
  const gross = grossNicksForNetAmount(net);

  assert.ok(gross - bridgeFeeNicksCeil(gross) >= net);
  assert.ok(gross === 1n || gross - 1n - bridgeFeeNicksCeil(gross - 1n) < net);
});

test("USD text is approximate and bigint-derived", () => {
  const amount = parseExactNockAmount("100000.5");
  assert.equal(formatApproximateUsd(amount.nicks, "0.25"), "$25,000.13");
});
