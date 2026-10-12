import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: [fileURLToPath(new URL("../src/link-resolution.ts", import.meta.url))],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  platform: "browser",
  target: "es2021",
  write: false,
});

function loadResolver(parseLinktext) {
  const module = { exports: {} };
  runInNewContext(compiled.outputFiles[0].text, {
    module,
    exports: module.exports,
    require(id) {
      assert.equal(id, "obsidian");
      return { parseLinktext };
    },
  });
  return module.exports.resolveLinkDestination;
}

function occurrence(target, original, kind = "link", sourcePath = "Folder/Source.md", offset = 0) {
  return {
    sourcePath, target, original, kind,
    position: {
      start: { line: 0, col: offset, offset },
      end: { line: 0, col: offset + original.length, offset: offset + original.length },
    },
  };
}

// These fixtures specify API responses, not a second implementation of Obsidian.
for (const [name, target, original, kind, path, destinationPath] of [
  ["wikilink alias", "Target", "[[Target|Alias]]", "link", "Target", "Target.md"],
  ["Markdown relative link", "../Target.md", "[Alias](../Target.md)", "link", "../Target.md", "Target.md"],
  ["spaced path", "Note name", "[[Note name]]", "link", "Note name", "Note name.md"],
  ["encoded path supplied by metadata", "Note%20name.md", "[Note](Note%20name.md)", "link", "Note%20name.md", "Note name.md"],
  ["wikilink attachment embed", "image.png", "![[image.png]]", "embed", "image.png", "Assets/image.png"],
  ["Markdown attachment embed", "document.pdf", "![Document](document.pdf)", "embed", "document.pdf", "Assets/document.pdf"],
  ["nonexistent heading in an existing file", "Target#Absent", "[[Target#Absent]]", "link", "Target", "Target.md"],
  ["nonexistent block in an existing file", "Target#^absent", "[[Target#^absent]]", "link", "Target", "Target.md"],
  ["literal percent sequence in a wikilink", "Rate%20", "[[Rate%20]]", "link", "Rate%20", "Rate%20.md"],
]) {
  test(`delegates a ${name} to Obsidian with the source path`, () => {
    const item = occurrence(target, original, kind);
    const resolve = loadResolver((input) => {
      assert.equal(input, target);
      return { path, subpath: "" };
    });
    const result = resolve(item, {
      getFirstLinkpathDest(inputPath, sourcePath) {
        assert.equal(inputPath, path);
        assert.equal(sourcePath, item.sourcePath);
        return { path: destinationPath };
      },
    });
    assert.equal(result.status, "valid");
    assert.equal(result.destinationPath, destinationPath);
    assert.equal(item.target, target);
    assert.equal(item.original, original);
  });
}

test("uses Obsidian's selected destination for duplicate filenames in different source folders", () => {
  const resolve = loadResolver(() => ({ path: "Target", subpath: "" }));
  for (const folder of ["One", "Two"]) {
    const result = resolve(occurrence("Target", "[[Target]]", "link", `${folder}/Source.md`), {
      getFirstLinkpathDest(path, sourcePath) {
        assert.equal(path, "Target");
        assert.equal(sourcePath, `${folder}/Source.md`);
        return { path: `${folder}/Target.md` };
      },
    });
    assert.equal(result.destinationPath, `${folder}/Target.md`);
  }
});

test("reports missing destinations for links and embeds when Obsidian returns null", () => {
  const resolve = loadResolver(() => ({ path: "Missing", subpath: "" }));
  for (const [original, kind] of [["[[Missing]]", "link"], ["[Missing](Missing)", "link"], ["![[Missing]]", "embed"], ["![Missing](Missing)", "embed"]]) {
    assert.equal(resolve(occurrence("Missing", original, kind), {
      getFirstLinkpathDest: () => null,
    }).status, "missing");
  }
});

test("ignores external URLs and non-vault URI schemes before calling Obsidian", () => {
  const unexpected = () => { assert.fail("External references must not reach the API"); };
  const resolve = loadResolver(unexpected);
  for (const target of ["https://example.com", "HTTP://example.com", "//example.com/file", "mailto:test@example.com", "obsidian://open?vault=Test", "file:///tmp/note.md", "data:text/plain,hello", "tel:123", "custom+scheme:value"]) {
    const result = resolve(occurrence(target, `[External](${target})`), {
      getFirstLinkpathDest: unexpected,
    });
    assert.equal(result.status, "ignored");
    assert.equal(result.reason, "external");
  }
});

test("ignores same-note headings and blocks without checking a file destination", () => {
  const resolve = loadResolver(() => ({ path: "", subpath: "#Absent" }));
  for (const target of ["#Absent", "#^absent", ""]) {
    const result = resolve(occurrence(target, `[[${target}]]`), {
      getFirstLinkpathDest() { assert.fail("Same-note fragments do not require resolution"); },
    });
    assert.equal(result.status, "ignored");
    assert.equal(result.reason, "same-note");
  }
});

test("preserves separate missing occurrences when composing metadata reading and resolution", async () => {
  const readerBuild = await build({
    entryPoints: [fileURLToPath(new URL("../src/note-metadata.ts", import.meta.url))],
    bundle: true, format: "esm", platform: "browser", write: false,
  });
  const { readNoteLinks } = await import(`data:text/javascript;base64,${Buffer.from(readerBuild.outputFiles[0].text).toString("base64")}`);
  const first = occurrence("Missing", "[[Missing]]", "link", "Source.md", 0);
  const second = occurrence("Missing", "[[Missing]]", "link", "Source.md", 20);
  const note = readNoteLinks("Source.md", {
    getCache: () => ({ links: [first, second].map((item) => ({
      link: item.target, original: item.original, position: item.position,
    })) }),
  });
  const resolve = loadResolver(() => ({ path: "Missing", subpath: "" }));
  const missing = note.occurrences.filter((item) => resolve(item, {
    getFirstLinkpathDest: () => null,
  }).status === "missing");
  assert.equal(missing.length, 2);
  assert.deepEqual(missing.map((item) => item.position.start.offset), [0, 20]);
});

test("propagates parser and resolver failures instead of labelling a destination missing", () => {
  const failure = new Error("Resolution failed");
  const resolve = loadResolver(() => ({ path: "Target", subpath: "" }));
  assert.throws(() => resolve(occurrence("Target", "[[Target]]"), {
    getFirstLinkpathDest() { throw failure; },
  }), (error) => error === failure);
  const parserFailure = loadResolver(() => { throw failure; });
  assert.throws(() => parserFailure(occurrence("Target", "[[Target]]"), {
    getFirstLinkpathDest() { assert.fail("Must not resolve after parsing fails"); },
  }), (error) => error === failure);
});
