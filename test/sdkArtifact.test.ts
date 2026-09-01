import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const metadataUrl = new URL("../vendor/iris-sdk-0.3.3.json", import.meta.url);
const tarballUrl = new URL(
  "../vendor/nockbox-iris-sdk-0.3.3.tgz",
  import.meta.url
);
const packageUrl = new URL("../package.json", import.meta.url);

test("NockSwap pins the verified immutable Iris withdrawal artifact", async () => {
  const metadata = JSON.parse(await readFile(metadataUrl, "utf8")) as {
    package_name: string;
    package_version: string;
    git_revision: string;
    tarball: string;
    sha256: string;
  };
  const tarball = await readFile(tarballUrl);
  const packageJson = JSON.parse(await readFile(packageUrl, "utf8")) as {
    dependencies: Record<string, string>;
  };

  assert.equal(metadata.package_name, "@nockbox/iris-sdk");
  assert.equal(metadata.package_version, "0.3.3");
  assert.match(metadata.git_revision, /^[0-9a-f]{40}$/);
  assert.equal(metadata.tarball, "nockbox-iris-sdk-0.3.3.tgz");
  assert.equal(createHash("sha256").update(tarball).digest("hex"), metadata.sha256);
  assert.equal(
    packageJson.dependencies["@nockbox/iris-sdk"],
    "file:vendor/nockbox-iris-sdk-0.3.3.tgz"
  );
});
