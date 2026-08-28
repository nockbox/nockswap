import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  assertArtifactTreeExcludesSecret,
  loadE2eOrchestratorConfig,
} from "../e2e/fixtures/test-wallet";

const TEST_KEY = `0x${"11".repeat(32)}` as Hex;
const ACCOUNT = privateKeyToAccount(TEST_KEY).address;
const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const NOCKSWAP_REVISION = "a".repeat(40);

function preservedDirectory(label: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `nockswap-${label}-`));
}

test("orchestrator manifest and nonsecret environment agree exactly", () => {
  const root = preservedDirectory("manifest");
  const manifestPath = path.join(root, "manifest.json");
  const artifactDir = path.join(root, "artifacts");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      schema_version: 2,
      base_url: "http://127.0.0.1:3000",
      rpc_url: "http://127.0.0.1:8545",
      chain_id: 31338,
      account: ACCOUNT,
      nockswap_git_revision: NOCKSWAP_REVISION,
      contracts: [CONTRACT],
    })
  );

  const config = loadE2eOrchestratorConfig({
    NOCKSWAP_E2E_MANIFEST: manifestPath,
    NOCKSWAP_E2E_BASE_URL: "http://127.0.0.1:3000",
    NOCKSWAP_E2E_RPC_URL: "http://127.0.0.1:8545",
    NOCKSWAP_E2E_CHAIN_ID: "31338",
    NOCKSWAP_E2E_ACCOUNT: ACCOUNT,
    NOCKSWAP_E2E_PRIVATE_KEY: TEST_KEY,
    NOCKSWAP_E2E_CONTRACT_ALLOWLIST: CONTRACT,
    NOCKSWAP_E2E_TIMEOUT_MS: "900000",
    NOCKSWAP_E2E_ARTIFACT_DIR: artifactDir,
  });

  assert.equal(config.account, ACCOUNT);
  assert.equal(config.chainId, 31338);
  assert.deepEqual(config.contracts, [CONTRACT]);
  assert.equal(config.timeoutMs, 900_000);
});

test("artifact canary scan rejects either private-key representation", () => {
  const safeRoot = preservedDirectory("safe-artifacts");
  fs.writeFileSync(path.join(safeRoot, "report.json"), '{"status":"passed"}');
  assert.doesNotThrow(() =>
    assertArtifactTreeExcludesSecret(safeRoot, TEST_KEY)
  );

  const leakedRoot = preservedDirectory("leaked-artifacts");
  fs.writeFileSync(path.join(leakedRoot, "trace.txt"), TEST_KEY.slice(2));
  assert.throws(
    () => assertArtifactTreeExcludesSecret(leakedRoot, TEST_KEY),
    /private-key canary found/
  );
});

test("manifest cannot carry the private key", () => {
  const root = preservedDirectory("secret-manifest");
  const manifestPath = path.join(root, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      schema_version: 2,
      base_url: "http://127.0.0.1:3000",
      rpc_url: "http://127.0.0.1:8545",
      chain_id: 31338,
      account: ACCOUNT,
      nockswap_git_revision: NOCKSWAP_REVISION,
      contracts: [CONTRACT],
      private_key: TEST_KEY,
    })
  );
  assert.throws(
    () =>
      loadE2eOrchestratorConfig({
        NOCKSWAP_E2E_MANIFEST: manifestPath,
      }),
    /must not contain a private key/
  );
});
