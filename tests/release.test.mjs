import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("release preparation includes exactly the three current plugin assets", async () => {
  const run = promisify(execFile);
  await run(process.execPath, [fileURLToPath(new URL("scripts/prepare-release.mjs", root))]);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  const directory = new URL(`dist/${manifest.version}/`, root);
  assert.deepEqual((await readdir(directory)).sort(), ["main.js", "manifest.json", "styles.css"]);
  for (const asset of ["main.js", "manifest.json", "styles.css"]) {
    assert.deepEqual(await readFile(new URL(asset, directory)), await readFile(new URL(asset, root)));
  }
});
