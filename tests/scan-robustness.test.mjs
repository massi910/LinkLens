import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: [fileURLToPath(new URL("../src/vault-scan.ts", import.meta.url))],
  bundle: true, format: "esm", platform: "browser", write: false,
});
const { VaultScanner } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);

function occurrence(sourcePath, index, target) {
  return {
    sourcePath, target, original: `[[${target}]]`, kind: "link",
    position: {
      start: { line: index, col: 0, offset: index * 20 },
      end: { line: index, col: target.length + 4, offset: index * 20 + target.length + 4 },
    },
  };
}

function fixture() {
  const notes = Array.from({ length: 1000 }, (_, index) => ({
    path: `Nested/Note-${String(index).padStart(4, "0")}.md`, mtime: 1, size: 200,
  }));
  let broken = true;
  const source = {
    getMarkdownNotes: () => notes,
    readNoteLinks: (path) => ({ status: "available", sourcePath: path, occurrences:
      Array.from({ length: 10 }, (_, index) => occurrence(path, index, index === 9 ? "Missing" : "Target")),
    }),
    resolveLinkDestination: (link) => broken && link.target === "Missing"
      ? { status: "missing" } : { status: "valid", destinationPath: "Target.md" },
  };
  return { notes, source, fix: () => { broken = false; } };
}

test("repeated thousand-note scans preserve counts, revisions and order without accumulating results", async () => {
  const data = fixture();
  let yields = 0;
  const scanner = new VaultScanner(data.source, async () => { yields++; });
  for (let scan = 0; scan < 5; scan++) {
    const results = await scanner.run();
    assert.equal(results.length, 1000);
    assert.equal(results[0].sourcePath, "Nested/Note-0000.md");
    assert.equal(results[999].sourcePath, "Nested/Note-0999.md");
    assert.deepEqual(results[0].sourceRevision, { mtime: 1, size: 200 });
  }
  assert.ok(yields >= 350);
  data.fix();
  assert.deepEqual(await scanner.run(), []);
  assert.equal(scanner.state.status, "empty");
});

test("one note with twenty thousand links yields without losing repeated occurrences", async () => {
  const data = fixture();
  data.source.getMarkdownNotes = () => [data.notes[0]];
  data.source.readNoteLinks = (path) => ({ status: "available", sourcePath: path, occurrences:
    Array.from({ length: 20000 }, (_, index) => occurrence(path, index, "Missing")),
  });
  let yields = 0;
  const scanner = new VaultScanner(data.source, async () => { yields++; });
  const results = await scanner.run();
  assert.equal(results.length, 20000);
  assert.equal(results[19999].position.start.line, 19999);
  assert.equal(yields, 100);
});

test("a source edit during a batch discards results and a later scan recovers", async () => {
  const data = fixture();
  let changed = false;
  const scanner = new VaultScanner(data.source, async () => {
    if (!changed) { data.notes[0].mtime++; changed = true; }
  });
  await assert.rejects(scanner.run(), /changed during the scan/);
  assert.equal(scanner.state.status, "error");
  assert.equal(scanner.state.occurrences, undefined);
  assert.equal((await scanner.run()).length, 1000);
});

test("metadata failure after a completed scan removes stale results and supports recovery", async () => {
  const data = fixture();
  data.source.getMarkdownNotes = () => [data.notes[0]];
  const scanner = new VaultScanner(data.source, async () => {});
  await scanner.run();
  const read = data.source.readNoteLinks;
  data.source.readNoteLinks = (path) => ({ status: "unavailable", sourcePath: path });
  await assert.rejects(scanner.run(), /Metadata unavailable/);
  assert.equal(scanner.state.status, "error");
  assert.equal(scanner.state.occurrences, undefined);
  data.source.readNoteLinks = read;
  assert.equal((await scanner.run()).length, 1);
});

test("disposal during destination batches stops further resolution and exposes no partial result", async () => {
  const data = fixture();
  let resolved = 0;
  let scanner;
  data.source.resolveLinkDestination = () => { resolved++; return { status: "missing" }; };
  scanner = new VaultScanner(data.source, async () => {
    if (resolved >= 200) scanner.dispose();
  });
  await assert.rejects(scanner.run(), /cancelled/);
  assert.equal(resolved, 200);
  assert.equal(scanner.state.status, "idle");
  assert.equal(scanner.state.occurrences, undefined);
});
