import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: [fileURLToPath(new URL("../src/vault-scan.ts", import.meta.url))],
  bundle: true, format: "esm", platform: "browser", write: false,
});
const { VaultScanner } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);

function item(sourcePath, target = "Missing", offset = 0) {
  return {
    sourcePath, target, original: `[[${target}]]`, kind: "link",
    position: {
      start: { line: 0, col: offset, offset },
      end: { line: 0, col: offset + 11, offset: offset + 11 },
    },
  };
}

function source(paths = ["Source.md"]) {
  return {
    getMarkdownNotes: () => paths.map((path) => ({ path, mtime: 1, size: 10 })),
    readNoteLinks: (path) => ({ status: "available", sourcePath: path, occurrences: [item(path)] }),
    resolveLinkDestination: () => ({ status: "missing" }),
  };
}

test("transitions from idle through scanning to sorted results without partial state", async () => {
  const scanSource = source(["Z.md", "Nested/A.md"]);
  scanSource.readNoteLinks = (path) => ({
    status: "available", sourcePath: path, occurrences: [item(path, "Missing", 20), item(path, "Missing", 1)],
  });
  const scanner = new VaultScanner(scanSource);
  assert.equal(scanner.state.status, "idle");
  const running = scanner.run();
  assert.equal(scanner.state.status, "scanning");
  assert.equal(scanner.state.occurrences, undefined);
  const results = await running;
  assert.equal(scanner.state.status, "results");
  assert.deepEqual(results.map((link) => [link.sourcePath, link.position.start.offset]), [
    ["Nested/A.md", 1], ["Nested/A.md", 20], ["Z.md", 1], ["Z.md", 20],
  ]);
});

test("finishes empty for an empty vault and for notes without broken destinations", async () => {
  for (const scanSource of [source([]), {
    ...source(), resolveLinkDestination: () => ({ status: "valid", destinationPath: "Target.md" }),
  }, {
    ...source(), resolveLinkDestination: () => ({ status: "ignored", reason: "external" }),
  }]) {
    const scanner = new VaultScanner(scanSource);
    assert.deepEqual(await scanner.run(), []);
    assert.equal(scanner.state.status, "empty");
  }
});

test("rejects an overlapping scan while leaving the first scan intact", async () => {
  const scanner = new VaultScanner(source());
  const first = scanner.run();
  await assert.rejects(scanner.run(), /already running/);
  await first;
  assert.equal(scanner.state.status, "results");
});

test("reruns after edits and hides old results immediately", async () => {
  const scanSource = source();
  const scanner = new VaultScanner(scanSource);
  await scanner.run();
  scanSource.resolveLinkDestination = () => ({ status: "valid", destinationPath: "Missing.md" });
  const rerun = scanner.run();
  assert.equal(scanner.state.status, "scanning");
  assert.equal(scanner.state.occurrences, undefined);
  assert.deepEqual(await rerun, []);
  assert.equal(scanner.state.status, "empty");
});

test("waits for unavailable metadata and retries only unavailable notes", async () => {
  const scanSource = source(["Ready.md", "Waiting.md"]);
  let waiting = true;
  const reads = [];
  const delays = [];
  scanSource.readNoteLinks = (path) => {
    reads.push(path);
    return path === "Waiting.md" && waiting
      ? { status: "unavailable", sourcePath: path }
      : { status: "available", sourcePath: path, occurrences: [item(path)] };
  };
  const scanner = new VaultScanner(scanSource, async (ms) => { delays.push(ms); waiting = false; });
  assert.equal((await scanner.run()).length, 2);
  assert.deepEqual(reads, ["Ready.md", "Waiting.md", "Waiting.md"]);
  assert.deepEqual(delays, [50]);
});

test("fails explicitly for persistently unavailable metadata without publishing ready-note results", async () => {
  const scanSource = source(["Ready.md", "Waiting.md"]);
  scanSource.readNoteLinks = (path) => path === "Waiting.md"
    ? { status: "unavailable", sourcePath: path }
    : { status: "available", sourcePath: path, occurrences: [item(path)] };
  let pauses = 0;
  const scanner = new VaultScanner(scanSource, async () => { pauses++; });
  await assert.rejects(scanner.run(), /Metadata unavailable.*Waiting.md/);
  assert.equal(pauses, 100);
  assert.equal(scanner.state.status, "error");
  assert.equal(scanner.state.occurrences, undefined);
});

test("discards collected results after a note is changed, deleted or added", async () => {
  for (const mutation of [
    (notes) => { notes[0].mtime++; },
    (notes) => { notes[0].size++; },
    (notes) => { notes.length = 0; },
    (notes) => { notes.push({ path: "New.md", mtime: 1, size: 0 }); },
  ]) {
    const notes = [{ path: "Source.md", mtime: 1, size: 10 }];
    const scanSource = source();
    scanSource.getMarkdownNotes = () => notes;
    scanSource.resolveLinkDestination = () => { mutation(notes); return { status: "missing" }; };
    const scanner = new VaultScanner(scanSource);
    await assert.rejects(scanner.run(), /changed during the scan/);
    assert.equal(scanner.state.status, "error");
  }
});

test("yields for many notes and for a single note with many links", async () => {
  const paths = Array.from({ length: 150 }, (_, index) => `${index}.md`);
  const scanSource = source(paths);
  scanSource.readNoteLinks = (path) => ({
    status: "available", sourcePath: path,
    occurrences: path === "0.md" ? Array.from({ length: 450 }, (_, offset) => item(path, "Missing", offset)) : [],
  });
  const delays = [];
  const scanner = new VaultScanner(scanSource, async (ms) => { delays.push(ms); });
  assert.equal((await scanner.run()).length, 450);
  assert.deepEqual(delays, [0, 0, 0, 0, 0]);
});

test("recovers after a resolver error and never exposes partial results", async () => {
  const scanSource = source();
  const scanner = new VaultScanner(scanSource);
  scanSource.resolveLinkDestination = () => { throw new Error("Resolver failed"); };
  await assert.rejects(scanner.run(), /Resolver failed/);
  assert.equal(scanner.state.status, "error");
  scanSource.resolveLinkDestination = () => ({ status: "missing" });
  assert.equal((await scanner.run()).length, 1);
  assert.equal(scanner.state.status, "results");
});

test("disposal cancels a metadata timer and prevents subsequent scans", async () => {
  const scanSource = source();
  scanSource.readNoteLinks = (path) => ({ status: "unavailable", sourcePath: path });
  const scanner = new VaultScanner(scanSource);
  const running = scanner.run();
  scanner.dispose();
  await assert.rejects(running, /cancelled/);
  assert.equal(scanner.state.status, "idle");
  await assert.rejects(scanner.run(), /disposed/);
});

test("Obsidian adapter composes the reader and resolver using only Markdown source files", async () => {
  const adapterBuild = await build({
    entryPoints: [fileURLToPath(new URL("../src/obsidian-scan.ts", import.meta.url))],
    bundle: true, external: ["obsidian"], format: "cjs", platform: "browser", write: false,
  });
  const module = { exports: {} };
  runInNewContext(adapterBuild.outputFiles[0].text, {
    module, exports: module.exports, AbortController, Error, setTimeout, clearTimeout,
    require(id) {
      assert.equal(id, "obsidian");
      return { parseLinktext: () => ({ path: "Missing", subpath: "" }) };
    },
  });
  const link = item("Nested/Source.md");
  const scanner = module.exports.createVaultScanner({
    getMarkdownFiles: () => [{ path: link.sourcePath, stat: { mtime: 1, size: 10 } }],
  }, {
    getCache(path) {
      assert.equal(path, link.sourcePath);
      return { links: [{ link: link.target, original: link.original, position: link.position }] };
    },
    getFirstLinkpathDest(path, sourcePath) {
      assert.equal(path, "Missing");
      assert.equal(sourcePath, link.sourcePath);
      return null;
    },
  });
  const results = await scanner.run();
  assert.equal(results.length, 1);
  assert.equal(results[0].sourcePath, "Nested/Source.md");
});
