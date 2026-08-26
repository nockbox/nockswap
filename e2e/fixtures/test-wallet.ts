import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { expect, test as base } from "@playwright/test";
import { getAddress, isAddress } from "viem";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  E2E_CHAIN_ID,
  resolveTestWalletRuntime,
} from "../../src/lib/e2eWallet";

interface ManifestDocument {
  schema_version: number;
  base_url: string;
  rpc_url: string;
  chain_id: number;
  account: string;
  contracts: string[];
}

type E2eEnvironment = Readonly<Record<string, string | undefined>>;

export interface E2eOrchestratorConfig {
  manifestPath: string;
  baseUrl: string;
  rpcUrl: string;
  chainId: typeof E2E_CHAIN_ID;
  account: Address;
  privateKey: Hex;
  contracts: readonly Address[];
  artifactDir: string;
}

export interface TestWalletFixture {
  account: Address;
  chainId: number;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export function loadE2eOrchestratorConfig(
  environment: E2eEnvironment = process.env
): E2eOrchestratorConfig {
  const manifestPath = required(environment, "NOCKSWAP_E2E_MANIFEST");
  let manifestText: string;
  try {
    manifestText = fs.readFileSync(manifestPath, "utf8");
  } catch (error) {
    throw new Error(
      `NOCKSWAP_E2E_MANIFEST is unavailable: ${safeErrorMessage(error)}`
    );
  }
  const manifest = parseManifest(manifestText);

  const baseUrl = required(environment, "NOCKSWAP_E2E_BASE_URL");
  const rpcUrl = required(environment, "NOCKSWAP_E2E_RPC_URL");
  const chainId = required(environment, "NOCKSWAP_E2E_CHAIN_ID");
  const account = required(environment, "NOCKSWAP_E2E_ACCOUNT");
  const contractCsv = required(
    environment,
    "NOCKSWAP_E2E_CONTRACT_ALLOWLIST"
  );
  const runtime = resolveTestWalletRuntime({
    NODE_ENV: "test",
    NEXT_PUBLIC_NOCKSWAP_E2E: "1",
    NEXT_PUBLIC_NOCKSWAP_E2E_ORIGIN: baseUrl,
    NEXT_PUBLIC_NOCKSWAP_E2E_RPC_URL: rpcUrl,
    NEXT_PUBLIC_NOCKSWAP_E2E_CHAIN_ID: chainId,
    NEXT_PUBLIC_NOCKSWAP_E2E_ACCOUNT: account,
    NEXT_PUBLIC_NOCKSWAP_E2E_CONTRACT_ALLOWLIST: contractCsv,
  });
  assert.equal(runtime.enabled, true);
  if (!runtime.enabled) throw new Error("E2E wallet runtime is disabled");

  const privateKey = required(environment, "NOCKSWAP_E2E_PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("NOCKSWAP_E2E_PRIVATE_KEY must be a 32-byte hex key");
  }
  if (privateKeyToAccount(privateKey as Hex).address !== runtime.account) {
    throw new Error("NOCKSWAP_E2E_PRIVATE_KEY does not match the test account");
  }

  const contracts = [...runtime.contractAllowlist];
  assertManifestMatches(manifest, {
    baseUrl: runtime.origin,
    rpcUrl: runtime.rpcUrl,
    chainId: runtime.chainId,
    account: runtime.account,
    contracts,
  });

  return {
    manifestPath,
    baseUrl: runtime.origin,
    rpcUrl: runtime.rpcUrl,
    chainId: runtime.chainId,
    account: runtime.account,
    privateKey: privateKey as Hex,
    contracts,
    artifactDir: path.resolve(
      required(environment, "NOCKSWAP_E2E_ARTIFACT_DIR")
    ),
  };
}

export function assertArtifactTreeExcludesSecret(
  artifactDir: string,
  privateKey: Hex
): void {
  if (!fs.existsSync(artifactDir)) return;
  const canaries = [privateKey, privateKey.slice(2)];
  for (const file of walkFiles(artifactDir)) {
    const bytes = fs.readFileSync(file);
    for (const canary of canaries) {
      if (bytes.includes(Buffer.from(canary))) {
        throw new Error(
          `E2E private-key canary found in artifact ${path.relative(
            artifactDir,
            file
          )}`
        );
      }
    }
  }
}

export const test = base.extend<{ testWallet: TestWalletFixture }>({
  testWallet: async ({ page }, runFixture) => {
    const config = loadE2eOrchestratorConfig();
    const showControls = async () => {
      if ((await page.getByTestId("e2e-wallet-probe").count()) === 0) {
        await page.getByTestId("e2e-wallet-toggle").click();
      }
      await expect(page.getByTestId("e2e-wallet-probe")).toBeVisible();
    };
    const hideControls = async () => {
      await page.getByTestId("e2e-wallet-hide").click();
      await expect(page.getByTestId("e2e-wallet-toggle")).toBeVisible();
    };
    await runFixture({
      account: config.account,
      chainId: config.chainId,
      async connect() {
        await showControls();
        if (
          (await page.getByTestId("e2e-wallet-status").textContent()) !==
          "connected"
        ) {
          await page.getByTestId("e2e-wallet-connect").click();
        }
        await expect(page.getByTestId("e2e-wallet-status")).toHaveText(
          "connected"
        );
        await expect(page.getByTestId("e2e-wallet-account")).toHaveText(
          config.account
        );
        await expect(page.getByTestId("e2e-wallet-chain")).toHaveText(
          String(config.chainId)
        );
        await hideControls();
      },
      async disconnect() {
        await showControls();
        await page.getByTestId("e2e-wallet-disconnect").click();
        await expect(page.getByTestId("e2e-wallet-status")).toHaveText(
          "disconnected"
        );
        await expect(page.getByTestId("e2e-wallet-account")).toHaveText(
          "disconnected"
        );
        await hideControls();
      },
    });
  },
});

export { expect };

export default function scanE2eArtifacts() {
  const config = loadE2eOrchestratorConfig();
  assertArtifactTreeExcludesSecret(config.artifactDir, config.privateKey);
}

function parseManifest(text: string): ManifestDocument {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("NOCKSWAP_E2E_MANIFEST is not valid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("NOCKSWAP_E2E_MANIFEST must contain a JSON object");
  }
  const candidate = value as Partial<ManifestDocument> & {
    private_key?: unknown;
  };
  if (candidate.private_key !== undefined) {
    throw new Error("NOCKSWAP_E2E_MANIFEST must not contain a private key");
  }
  if (
    candidate.schema_version !== 1 ||
    typeof candidate.base_url !== "string" ||
    typeof candidate.rpc_url !== "string" ||
    typeof candidate.chain_id !== "number" ||
    typeof candidate.account !== "string" ||
    !Array.isArray(candidate.contracts) ||
    !candidate.contracts.every((contract) => typeof contract === "string")
  ) {
    throw new Error("NOCKSWAP_E2E_MANIFEST has an unsupported schema");
  }
  return candidate as ManifestDocument;
}

function assertManifestMatches(
  manifest: ManifestDocument,
  expected: {
    baseUrl: string;
    rpcUrl: string;
    chainId: number;
    account: Address;
    contracts: readonly Address[];
  }
): void {
  const manifestContracts = manifest.contracts.map((contract) => {
    if (!isAddress(contract)) {
      throw new Error("NOCKSWAP_E2E_MANIFEST contains an invalid contract");
    }
    return getAddress(contract);
  });
  if (
    new URL(manifest.base_url).origin !== expected.baseUrl ||
    manifest.rpc_url !== expected.rpcUrl ||
    manifest.chain_id !== expected.chainId ||
    !isAddress(manifest.account) ||
    getAddress(manifest.account) !== expected.account ||
    manifestContracts.length !== expected.contracts.length ||
    manifestContracts.some(
      (contract, index) => contract !== expected.contracts[index]
    )
  ) {
    throw new Error(
      "NOCKSWAP_E2E_MANIFEST does not match the orchestrator environment"
    );
  }
}

function walkFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

function required(environment: E2eEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown filesystem error";
}
