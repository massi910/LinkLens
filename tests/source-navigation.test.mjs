import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";

class TFile {}
class MarkdownView {}
const compiled = await build({
  entryPoints: [fileURLToPath(new URL("../src/source-navigation.ts", import.meta.url))],
  bundle: true, external: ["obsidian"], format: "cjs", platform: "browser", write: false,
});
const module = { exports: {} };
runInNewContext(compiled.outputFiles[0].text, {
  module, exports: module.exports, Error,
  require: () => ({ TFile, MarkdownView }),
});
const { openSourceOccurrence, hasOriginalOccurrence } = module.exports;

function setup() {
  const content = "[[Missing]]\n[[Missing]]";
  const occurrence = {
    sourcePath: "Source.md", target: "Missing", original: "[[Missing]]", kind: "link",
    position: { start: { line: 1, col: 0, offset: 12 }, end: { line: 1, col: 11, offset: 23 } },
    sourceRevision: { mtime: 1, size: content.length },
  };
  const file = Object.assign(new TFile(), { path: "Source.md", extension: "md", stat: { mtime: 1, size: content.length } });
  const selections = [];
  const scrolls = [];
  let focused = false;
  const editor = {
    getValue: () => content,
    offsetToPos(offset) { return offset < 12 ? { line: 0, ch: offset } : { line: 1, ch: offset - 12 }; },
    setSelection(from, to) { selections.push([from, to]); },
    scrollIntoView(range, center) { scrolls.push([range, center]); },
    focus() { focused = true; },
  };
  const view = Object.assign(new MarkdownView(), { file, editor });
  let opens = 0;
  const leaf = { view, async openFile(opened, options) {
    assert.equal(opened, file);
    assert.equal(options.state.mode, "source");
    opens++;
  } };
  const app = {
    vault: { getAbstractFileByPath: () => file, read: async () => content },
    workspace: { getLeavesOfType: () => [], getLeaf: () => leaf, revealLeaf: async () => {} },
  };
  return { app, occurrence, file, content, editor, leaf, selections, scrolls,
    opens: () => opens, focused: () => focused };
}

test("opens and selects the exact repeated occurrence in the normal editor", async () => {
  const fixture = setup();
  await openSourceOccurrence(fixture.app, fixture.occurrence, () => true);
  assert.equal(fixture.opens(), 1);
  assert.equal(fixture.selections[0][0].line, 1);
  assert.equal(fixture.selections[0][0].ch, 0);
  assert.equal(fixture.selections[0][1].ch, 11);
  assert.equal(fixture.scrolls[0][1], true);
  assert.equal(fixture.focused(), true);
  assert.equal(fixture.editor.getValue(), fixture.content);
});

test("reuses a source editor instead of replacing the scan view", async () => {
  const fixture = setup();
  fixture.app.workspace.getLeavesOfType = () => [fixture.leaf];
  fixture.app.workspace.getLeaf = () => { assert.fail("Must reuse the source editor"); };
  await openSourceOccurrence(fixture.app, fixture.occurrence, () => true);
  assert.equal(fixture.selections.length, 1);
});

test("refuses deleted sources and folders before opening a leaf", async () => {
  for (const source of [null, { path: "Source.md" }]) {
    const fixture = setup();
    fixture.app.vault.getAbstractFileByPath = () => source;
    await assert.rejects(openSourceOccurrence(fixture.app, fixture.occurrence, () => true), /no longer exists/);
    assert.equal(fixture.opens(), 0);
  }
});

test("refuses revised sources even when an identical link remains at the old offset", async () => {
  const fixture = setup();
  fixture.file.stat.mtime++;
  await assert.rejects(openSourceOccurrence(fixture.app, fixture.occurrence, () => true), /source note changed/);
  assert.equal(fixture.opens(), 0);
});

test("rejects a moved or removed occurrence and invalid source ranges", async () => {
  const fixture = setup();
  fixture.app.vault.read = async () => "prefix\n[[Missing]]\n[[Missing]]";
  await assert.rejects(openSourceOccurrence(fixture.app, fixture.occurrence, () => true), /occurrence changed/);
  assert.equal(fixture.opens(), 0);
  for (const offset of [-1, 999, 0.5]) {
    const occurrence = { ...fixture.occurrence, position: {
      ...fixture.occurrence.position, start: { ...fixture.occurrence.position.start, offset },
    } };
    assert.equal(hasOriginalOccurrence(fixture.content, occurrence), false);
  }
});

test("rejects unsaved editor changes and inconsistent line coordinates without selecting", async () => {
  for (const change of [
    (fixture) => { fixture.editor.getValue = () => "changed text"; },
    (fixture) => { fixture.editor.offsetToPos = () => ({ line: 0, ch: 0 }); },
  ]) {
    const fixture = setup();
    change(fixture);
    await assert.rejects(openSourceOccurrence(fixture.app, fixture.occurrence, () => true), /changed/);
    assert.equal(fixture.selections.length, 0);
  }
});

test("rechecks source identity and revision after reading and opening", async () => {
  for (const phase of ["read", "open"]) {
    const fixture = setup();
    if (phase === "read") fixture.app.vault.read = async () => { fixture.file.stat.mtime++; return fixture.content; };
    else fixture.leaf.openFile = async () => { fixture.file.stat.mtime++; };
    await assert.rejects(openSourceOccurrence(fixture.app, fixture.occurrence, () => true), /changed/);
    assert.equal(fixture.selections.length, 0);
  }
});

test("ignores inactive navigation before and after asynchronous reads", async () => {
  const fixture = setup();
  await openSourceOccurrence(fixture.app, fixture.occurrence, () => false);
  assert.equal(fixture.opens(), 0);
  let active = true;
  fixture.app.vault.read = async () => { active = false; return fixture.content; };
  await openSourceOccurrence(fixture.app, fixture.occurrence, () => active);
  assert.equal(fixture.opens(), 0);
});

test("propagates read failures without changing the editor", async () => {
  const fixture = setup();
  fixture.app.vault.read = async () => { throw new Error("Read failed"); };
  await assert.rejects(openSourceOccurrence(fixture.app, fixture.occurrence, () => true), /Read failed/);
  assert.equal(fixture.opens(), 0);
  assert.equal(fixture.selections.length, 0);
});
