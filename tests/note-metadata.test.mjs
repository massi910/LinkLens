import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

// Compile the actual TypeScript module using the existing build dependency.
const compiled = await build({
  entryPoints: [new URL("../src/note-metadata.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2021",
  write: false,
});
const { readNoteLinks } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`
);

const sourcePath = "Folder/Source.md";

function reference(target, original, offset = 0) {
  return {
    link: target,
    original,
    position: {
      start: { line: 2, col: 3, offset },
      end: { line: 2, col: 3 + original.length, offset: offset + original.length },
    },
  };
}

for (const [name, field, kind, target, original] of [
  ["wikilink with an alias and fragment", "links", "link", "Note name#Heading", "[[Note name#Heading|Alias]]"],
  ["Markdown link with an encoded relative path", "links", "link", "../Note%20name.md", "[Alias](../Note%20name.md)"],
  ["wikilink attachment embed", "embeds", "embed", "image.png", "![[image.png]]"],
  ["Markdown attachment embed", "embeds", "embed", "image.png", "![Image](image.png)"],
]) {
  test(`reads a ${name} from Obsidian metadata without changing its target`, () => {
    const item = reference(target, original);
    const result = readNoteLinks(sourcePath, {
      getCache(path) {
        assert.equal(path, sourcePath);
        return { [field]: [item] };
      },
    });
    assert.deepEqual(result, {
      status: "available",
      sourcePath,
      occurrences: [{ sourcePath, target, original, kind, position: item.position }],
    });
  });
}

test("reports unavailable metadata separately from an empty note", () => {
  assert.deepEqual(readNoteLinks(sourcePath, { getCache: () => null }), {
    status: "unavailable", sourcePath,
  });
});

test("returns an available empty result when cached metadata contains no references", () => {
  for (const cache of [{}, { links: [], embeds: [] }]) {
    assert.deepEqual(readNoteLinks(sourcePath, { getCache: () => cache }), {
      status: "available", sourcePath, occurrences: [],
    });
  }
});

test("merges links and embeds in source order while preserving repeated occurrences", () => {
  const later = reference("Missing", "[[Missing]]", 50);
  const earlier = reference("Missing", "[[Missing]]", 5);
  const embed = reference("Missing", "![[Missing]]", 25);
  const cache = { links: [later, earlier], embeds: [embed] };
  const result = readNoteLinks(sourcePath, { getCache: () => cache });
  assert.equal(result.status, "available");
  assert.deepEqual(result.occurrences.map((item) => item.position.start.offset), [5, 25, 50]);
  assert.deepEqual(result.occurrences.map((item) => item.kind), ["link", "embed", "link"]);
  assert.deepEqual(cache.links, [later, earlier]);
});

test("keeps the occurrence snapshot independent of later cache changes", () => {
  const item = reference("Note", "[[Note]]");
  const result = readNoteLinks(sourcePath, { getCache: () => ({ links: [item] }) });
  item.link = "Changed";
  item.position.start.line = 99;
  item.position.end.offset = 999;
  assert.equal(result.occurrences[0].target, "Note");
  assert.equal(result.occurrences[0].position.start.line, 2);
  assert.equal(result.occurrences[0].position.end.offset, 8);
});

test("propagates metadata access failures instead of reporting an empty note", () => {
  const failure = new Error("Metadata access failed");
  assert.throws(() => readNoteLinks(sourcePath, {
    getCache() { throw failure; },
  }), (error) => error === failure);
});
