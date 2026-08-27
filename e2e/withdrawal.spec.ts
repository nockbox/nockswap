import { createHash } from "node:crypto";
import fs from "node:fs";

import { test, expect } from "./fixtures/diagnostics";
import { loadE2eOrchestratorConfig } from "./fixtures/test-wallet";
import { SwapPage } from "./pages/swap-page";

interface BrowserManifest {
  schema_version: 1;
  run_id: string;
  amount_nocks: string;
  destination_v1_pkh: string;
  public_status_url: string;
  terminal_proof_path: string;
  result_path: string;
  bridge_signer_pkhs: string[];
  bridge_threshold: number;
  bridge_lock_root: string;
  iris_git_revision: string;
  iris_package_version: string;
  iris_tarball_sha256: string;
  contracts: Record<string, string>;
}

interface TerminalProofFile {
  schema_version: 1;
  run_id: string;
  terminal: true;
  nock_transaction_id: string;
  nock_block_id: string;
  burn_count: 1;
  payout_count: 1;
  payout_nicks: string;
}

test("real withdrawal reaches orchestrator terminal proof exactly once", async ({
  page,
  testWallet,
  diagnostics,
}) => {
  const orchestrator = loadE2eOrchestratorConfig();
  const rpcOrigin = new URL(orchestrator.rpcUrl).origin;
  const manifest = parseBrowserManifest(
    fs.readFileSync(orchestrator.manifestPath, "utf8")
  );
  verifyVendoredIris(manifest);
  let burnRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== rpcOrigin || request.method() !== "POST") return;
    try {
      const payload = request.postDataJSON() as { method?: string };
      if (payload.method === "eth_sendTransaction") burnRequests += 1;
    } catch {
      // Non-JSON requests are recorded by the diagnostics fixture.
    }
  });


  const swap = new SwapPage(page, testWallet);
  await swap.goto();
  await swap.selectDirection("base_to_nock");
  await swap.connectBaseWallet();
  await swap.enterExactAmount(manifest.amount_nocks);
  await swap.enterDestination(manifest.destination_v1_pkh);
  await swap.expectPrimaryAction(
    "Review withdrawal",
    true,
    orchestrator.timeoutMs
  );
  const form = await swap.readForm();
  if (
    form.amount.replaceAll(",", "") !== manifest.amount_nocks ||
    form.destination !== manifest.destination_v1_pkh ||
    !form.quote
  ) {
    throw new Error(`Prepared withdrawal form diverged: ${JSON.stringify(form)}`);
  }
  await swap.review();
  await diagnostics.captureCheckpoint("withdrawal-review");
  await swap.confirm();
  await expect(swap.lifecycleState).toHaveAttribute(
    "data-state",
    /submitted|pending/
  );
  await page.reload();
  await testWallet.connect();
  await expect(swap.lifecycleState).toHaveAttribute(
    "data-state",
    /submitted|pending/
  );
  await swap.expectLifecycleState("confirmed", orchestrator.timeoutMs);
  if (burnRequests !== 1) {
    throw new Error(`Expected one Base burn request, observed ${burnRequests}`);
  }

  const observed = await swap.readBrowserEvidence();
  if (
    (observed.calldata.length - 2) / 2 !== 116 ||
    observed.historyStates.filter((state) => state === "confirmed").length !== 1
  ) {
    throw new Error(`Browser evidence is not canonical: ${JSON.stringify(observed)}`);
  }
  const proofBytes = fs.readFileSync(manifest.terminal_proof_path);
  const proof = readTerminalProof(manifest.terminal_proof_path, manifest.run_id);
  if (!proof) throw new Error("Terminal proof disappeared before result write");
  const result = {
    schema_version: 1,
    run_id: manifest.run_id,
    status: "confirmed",
    account: testWallet.account,
    chain_id: orchestrator.chainId,
    amount_nocks: manifest.amount_nocks,
    normalized_destination: manifest.destination_v1_pkh,
    calldata_hex: observed.calldata,
    calldata_byte_length: 116,
    submitted_transaction_hash: observed.submittedTransactionHash,
    transaction_hash: observed.transactionHash,
    block_number: observed.blockNumber,
    block_hash: observed.blockHash,
    log_index: observed.logIndex,
    base_event_id: observed.baseEventId,
    nock_transaction_id: observed.nockTransactionId,
    nock_block_id: observed.nockBlockId,
    burn_count: proof.burn_count,
    payout_count: proof.payout_count,
    reload_count: 1,
    terminal_proof_observed: true,
    terminal_proof_sha256: createHash("sha256").update(proofBytes).digest("hex"),
    history_states: observed.historyStates,
  };
  fs.writeFileSync(manifest.result_path, JSON.stringify(result, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
  await diagnostics.captureCheckpoint("withdrawal-terminal");
  await diagnostics.assertViewportFits();
  diagnostics.assertNoCriticalConsole();
});

function parseBrowserManifest(text: string): BrowserManifest {
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Browser driver manifest is not an object");
  }
  const manifest = value as Partial<BrowserManifest>;
  if (
    manifest.schema_version !== 1 ||
    typeof manifest.run_id !== "string" ||
    typeof manifest.amount_nocks !== "string" ||
    typeof manifest.destination_v1_pkh !== "string" ||
    typeof manifest.public_status_url !== "string" ||
    !Array.isArray(manifest.bridge_signer_pkhs) ||
    !manifest.bridge_signer_pkhs.every((value) => typeof value === "string") ||
    typeof manifest.bridge_threshold !== "number" ||
    typeof manifest.bridge_lock_root !== "string" ||
    typeof manifest.iris_git_revision !== "string" ||
    typeof manifest.iris_package_version !== "string" ||
    typeof manifest.iris_tarball_sha256 !== "string" ||
    typeof manifest.terminal_proof_path !== "string" ||
    typeof manifest.result_path !== "string" ||
    typeof manifest.contracts !== "object" ||
    manifest.contracts === null
  ) {
    throw new Error("Browser driver manifest has an unsupported schema");
  }
  return manifest as BrowserManifest;
}

function verifyVendoredIris(manifest: BrowserManifest): void {
  const metadataPath = new URL("../vendor/iris-sdk-0.3.3.json", import.meta.url);
  const tarballPath = new URL(
    "../vendor/nockbox-iris-sdk-0.3.3.tgz",
    import.meta.url
  );
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as {
    package_version?: unknown;
    git_revision?: unknown;
    sha256?: unknown;
  };
  const actualSha256 = createHash("sha256")
    .update(fs.readFileSync(tarballPath))
    .digest("hex");
  if (
    metadata.package_version !== manifest.iris_package_version ||
    metadata.git_revision !== manifest.iris_git_revision ||
    metadata.sha256 !== manifest.iris_tarball_sha256 ||
    actualSha256 !== manifest.iris_tarball_sha256
  ) {
    throw new Error("Vendored Iris artifact does not match orchestrator manifest");
  }
}

function readTerminalProof(path: string, runId: string): TerminalProofFile | null {
  if (!fs.existsSync(path)) return null;
  const value: unknown = JSON.parse(fs.readFileSync(path, "utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Terminal proof is not an object");
  }
  const proof = value as Partial<TerminalProofFile>;
  if (
    proof.schema_version !== 1 ||
    proof.run_id !== runId ||
    proof.terminal !== true ||
    typeof proof.nock_transaction_id !== "string" ||
    typeof proof.nock_block_id !== "string" ||
    typeof proof.payout_nicks !== "string" ||
    proof.burn_count !== 1 ||
    proof.payout_count !== 1
  ) {
    throw new Error("Terminal proof is incomplete or mismatched");
  }
  return proof as TerminalProofFile;
}
