import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const root = new URL("../", import.meta.url);

test("manifest identifies a mobile-enabled plugin with a matching package version", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  const packageInfo = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

  for (const field of ["id", "name", "version", "minAppVersion", "description", "author"]) {
    assert.equal(typeof manifest[field], "string");
    assert.ok(manifest[field].length > 0);
  }
  assert.match(manifest.id, /^[a-z-]+$/);
  assert.ok(!manifest.id.includes("obsidian"));
  assert.ok(!manifest.id.endsWith("plugin"));
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.match(manifest.minAppVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.version, packageInfo.version);
  assert.equal(manifest.isDesktopOnly, false);
  assert.ok(manifest.description.length <= 250);
  assert.ok(manifest.description.endsWith("."));
});

test("production bundle exports an Obsidian plugin without Node or browser globals", async () => {
  const bundle = await readFile(new URL("main.js", root), "utf8");
  class Plugin {}
  const loadedModules = [];
  const module = { exports: {} };

  runInNewContext(bundle, {
    module,
    exports: module.exports,
    require(id) {
      loadedModules.push(id);
      assert.equal(id, "obsidian");
      return { Plugin, ItemView: class {} };
    },
  });

  assert.deepEqual([...new Set(loadedModules)], ["obsidian"]);
  assert.equal(typeof module.exports.default, "function");
  assert.ok(new module.exports.default() instanceof Plugin);
  assert.ok(!bundle.includes("sourceMappingURL="));
});
