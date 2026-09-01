import assert from "node:assert/strict";
import test from "node:test";

import {
  E2E_CHAIN_ID,
  assertAllowedWalletRequest,
  resolveTestWalletRuntime,
} from "../src/lib/e2eWallet";

const ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ALLOWED = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const OTHER = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

function validEnvironment() {
  return {
    NODE_ENV: "test",
    NEXT_PUBLIC_NOCKSWAP_E2E: "1",
    NEXT_PUBLIC_NOCKSWAP_E2E_ORIGIN: "http://127.0.0.1:3000",
    NEXT_PUBLIC_NOCKSWAP_E2E_RPC_URL: "http://localhost:8545",
    NEXT_PUBLIC_NOCKSWAP_E2E_CHAIN_ID: String(E2E_CHAIN_ID),
    NEXT_PUBLIC_NOCKSWAP_E2E_ACCOUNT: ACCOUNT,
    NEXT_PUBLIC_NOCKSWAP_E2E_CONTRACT_ALLOWLIST: ALLOWED,
  };
}

function enabledRuntime() {
  const runtime = resolveTestWalletRuntime(validEnvironment());
  assert.equal(runtime.enabled, true);
  if (!runtime.enabled) throw new Error("expected enabled runtime");
  return runtime;
}

test("test wallet stays absent unless explicitly enabled", () => {
  assert.deepEqual(resolveTestWalletRuntime({ NODE_ENV: "development" }), {
    enabled: false,
  });
  assert.deepEqual(
    resolveTestWalletRuntime({
      NODE_ENV: "development",
      NEXT_PUBLIC_NOCKSWAP_E2E: "0",
    }),
    { enabled: false }
  );
});

test("strict E2E guard accepts only loopback chain 31338 configuration", () => {
  const runtime = enabledRuntime();
  assert.equal(runtime.origin, "http://127.0.0.1:3000");
  assert.equal(runtime.rpcUrl, "http://localhost:8545");
  assert.equal(runtime.chainId, 31338);
  assert.equal(runtime.account, ACCOUNT);
  assert.deepEqual([...runtime.contractAllowlist], [ALLOWED]);
});

test("production build cannot enable the test connector", () => {
  assert.throws(
    () =>
      resolveTestWalletRuntime({
        ...validEnvironment(),
        NODE_ENV: "production",
      }),
    /forbidden in production/
  );
});

test("nonloopback origins and RPC endpoints are rejected", () => {
  assert.throws(
    () =>
      resolveTestWalletRuntime({
        ...validEnvironment(),
        NEXT_PUBLIC_NOCKSWAP_E2E_ORIGIN: "https://nockswap.example",
      }),
    /origin must use HTTP on loopback/
  );
  assert.throws(
    () =>
      resolveTestWalletRuntime({
        ...validEnvironment(),
        NEXT_PUBLIC_NOCKSWAP_E2E_RPC_URL: "https://rpc.example",
      }),
    /RPC URL must use HTTP on loopback/
  );
});

test("shared or malformed chain, account, and allowlist values are rejected", () => {
  assert.throws(
    () =>
      resolveTestWalletRuntime({
        ...validEnvironment(),
        NEXT_PUBLIC_NOCKSWAP_E2E_CHAIN_ID: "31337",
      }),
    /requires chain id 31338/
  );
  assert.throws(
    () =>
      resolveTestWalletRuntime({
        ...validEnvironment(),
        NEXT_PUBLIC_NOCKSWAP_E2E_ACCOUNT: "not-an-address",
      }),
    /not an EVM address/
  );
  assert.throws(
    () =>
      resolveTestWalletRuntime({
        ...validEnvironment(),
        NEXT_PUBLIC_NOCKSWAP_E2E_CONTRACT_ALLOWLIST: " ",
      }),
    /is required/
  );
});

test("wallet mutation guard permits only configured account and contracts", () => {
  const runtime = enabledRuntime();
  assert.doesNotThrow(() =>
    assertAllowedWalletRequest(runtime, {
      method: "eth_sendTransaction",
      params: [{ from: ACCOUNT, to: ALLOWED, data: "0x" }],
    })
  );
  assert.doesNotThrow(() =>
    assertAllowedWalletRequest(runtime, {
      method: "wallet_sendCalls",
      params: [{ from: ACCOUNT, calls: [{ to: ALLOWED, data: "0x" }] }],
    })
  );
  assert.throws(
    () =>
      assertAllowedWalletRequest(runtime, {
        method: "eth_sendTransaction",
        params: [{ from: ACCOUNT, to: OTHER }],
      }),
    /target is not in the E2E contract allowlist/
  );
  assert.throws(
    () =>
      assertAllowedWalletRequest(runtime, {
        method: "eth_sendTransaction",
        params: [{ from: OTHER, to: ALLOWED }],
      }),
    /configured E2E account/
  );
  assert.throws(
    () =>
      assertAllowedWalletRequest(runtime, {
        method: "eth_sendTransaction",
        params: [{ to: ALLOWED }],
      }),
    /configured E2E account/
  );
});

test("unguarded signing, raw transactions, and chain switching are rejected", () => {
  const runtime = enabledRuntime();
  for (const method of [
    "personal_sign",
    "eth_signTypedData_v4",
    "eth_sendRawTransaction",
  ]) {
    assert.throws(
      () => assertAllowedWalletRequest(runtime, { method, params: [] }),
      /disabled for the E2E wallet/
    );
  }
  assert.throws(
    () =>
      assertAllowedWalletRequest(runtime, {
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x7a69" }],
      }),
    /may only select E2E chain 31338/
  );
  assert.doesNotThrow(() =>
    assertAllowedWalletRequest(runtime, {
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${E2E_CHAIN_ID.toString(16)}` }],
    })
  );
});
