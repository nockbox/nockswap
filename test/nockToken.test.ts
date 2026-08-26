import { readFile } from "node:fs/promises";

import assert from "node:assert/strict";
import test from "node:test";

import { base58 } from "@scure/base";
import { decodeWithdrawalWireV1 } from "@nockbox/iris-sdk/withdrawal";
import { initWasm } from "@nockbox/iris-sdk/wasm";

import {
  encodeNockBurnCalldata,
  resolveNockWithdrawalDestination,
} from "../src/lib/nockToken";
import { isNockAddress } from "../src/lib/validators";

const DESTINATION =
  "AD6Mw1QUnPUrnVpyj2gW2jT6Jd6WsuZQmPn79XpZoFEocuvV12iDkvh";
const NOCK_TOKEN = "0x1000000000000000000000000000000000000001";
const BURNER = "0x2000000000000000000000000000000000000002";
const AMOUNT_BASE_UNITS = 100_001n * 10_000_000_000_000_000n;

test.before(async () => {
  const wasm = await readFile(
    new URL("../node_modules/@nockbox/iris-wasm/iris_wasm_bg.wasm", import.meta.url)
  );
  await initWasm({ module_or_path: wasm });
});

test("v1 PKH resolves to one canonical five-limb Tip5 destination", async () => {
  const destination = await resolveNockWithdrawalDestination(DESTINATION);
  assert.equal(destination.kind, "v1_pkh");
  assert.equal(destination.normalizedDestination, DESTINATION);
  assert.equal(base58.decode(destination.lockRoot).length, 40);
  assert.equal(destination.lockRootLimbs.length, 5);
  assert.ok(
    destination.lockRootLimbs.every(
      (limb) => limb >= 0n && limb < 0xffff_ffff_0000_0001n
    )
  );
});

test("Iris SDK produces exact self-validating 116-byte burn calldata", async () => {
  const destination = await resolveNockWithdrawalDestination(DESTINATION);
  const encoded = encodeNockBurnCalldata({
    nockTokenAddress: NOCK_TOKEN,
    burnerAddress: BURNER,
    amountBaseUnits: AMOUNT_BASE_UNITS,
    destination,
  });
  assert.equal((encoded.calldata.length - 2) / 2, 116);
  assert.equal(encoded.calldata.slice(2 + 68 * 2, 2 + 76 * 2), "4e4f434b57443121");
  assert.equal(encoded.calldata.slice(2 + 76 * 2).length / 2, 40);
  const decoded = decodeWithdrawalWireV1(encoded.calldata);
  assert.equal(decoded.amountBaseUnits, AMOUNT_BASE_UNITS);
  assert.equal(decoded.commitment, encoded.commitment);
  assert.deepEqual(decoded.lockRootLimbs, destination.lockRootLimbs);
});

test("bytes32 pseudo-roots and noncanonical encodings are rejected", async () => {
  const pseudoRoot = base58.encode(new Uint8Array(32));
  assert.equal(isNockAddress(pseudoRoot), false);
  await assert.rejects(
    () => resolveNockWithdrawalDestination(pseudoRoot),
    /canonical Nockchain v1 PKH address/
  );
  assert.equal(isNockAddress(` ${DESTINATION}`), true);
  assert.equal(isNockAddress(`${DESTINATION} `), true);
});
