import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const bundle = await readFile(new URL("../main.js", import.meta.url), "utf8");
const settle = () => new Promise((resolve) => setImmediate(resolve));

function setup() {
  class Element {
    children = [];
    text = "";
    empty() { this.children = []; }
    remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); }
    addClass() {}
    querySelector() { return null; }
    setText(text) { this.text = text; }
    setAttribute() {}
    createEl(tag, options = {}) {
      const child = Object.assign(new Element(), { tag, text: options.text ?? "" });
      child.parent = this;
      this.children.push(child);
      return child;
    }
  }
  class Plugin {
    registerView(type, factory) { this.factory = factory; }
    addCommand(command) { this.command = command; }
  }
  class TFile {}
  class MarkdownView {}
  class ItemView {
    constructor(leaf) { this.app = leaf.app; this.contentEl = new Element(); }
  }
  class ButtonComponent {
    constructor(parent) { this.buttonEl = parent.createEl("button"); }
    setButtonText(text) { this.buttonEl.text = text; return this; }
    setDisabled(disabled) { this.buttonEl.disabled = disabled; return this; }
    onClick(click) { this.buttonEl.click = click; return this; }
  }
  const notices = [];
  const module = { exports: {} };
  runInNewContext(bundle, {
    module, exports: module.exports, AbortController, Error, setTimeout, clearTimeout,
    require: () => ({ Plugin, TFile, MarkdownView, ItemView, ButtonComponent,
      Notice: class { constructor(message) { notices.push(message); } },
      parseLinktext: (target) => ({ path: target, subpath: "" }),
    }),
  });
  let text = "[[Missing]]";
  let cachedTarget = "Missing";
  let metadataReady = true;
  let read = async () => text;
  let selections = 0;
  let activation = async () => {};
  let reveal = async () => {};
  const file = Object.assign(new TFile(), { path: "Source.md", extension: "md", stat: { mtime: 1, size: text.length } });
  const leaves = [];
  const editor = {
    getValue: () => text,
    offsetToPos: (offset) => ({ line: 0, ch: offset }),
    setSelection() { selections++; }, scrollIntoView() {}, focus() {},
  };
  const plugin = new module.exports.default();
  const app = {
    vault: { getMarkdownFiles: () => [file], getAbstractFileByPath: () => file, read: () => read() },
    metadataCache: {
      getCache: () => metadataReady ? { links: [{ link: cachedTarget, original: `[[${cachedTarget}]]`, position: {
        start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: text.length, offset: text.length },
      } }] } : null,
      getFirstLinkpathDest: (path) => path === "Target" ? { path: "Target.md" } : null,
    },
    workspace: {
      onLayoutReady: (callback) => callback(),
      getLeavesOfType: (type) => leaves.filter((leaf) => leaf.type === type),
      getLeaf() {
        const leaf = {
          app, type: "empty", view: null,
          async setViewState(state) {
            this.type = state.type;
            this.view = plugin.factory(this);
            leaves.push(this);
            await this.view.onOpen();
            await activation();
          },
          async openFile(opened) {
            this.type = "markdown";
            this.view = Object.assign(new MarkdownView(), { file: opened, editor });
            leaves.push(this);
          },
          detach() {
            const index = leaves.indexOf(this);
            if (index !== -1) leaves.splice(index, 1);
            if (this.view instanceof ItemView) void this.view.onClose();
          },
        };
        return leaf;
      },
      revealLeaf: () => reveal(),
      detachLeavesOfType() { assert.fail("Plugin unload must preserve workspace leaves"); },
    },
  };
  plugin.app = app;
  plugin.onload();
  return {
    plugin, leaves, notices,
    async unload() {
      plugin.onunload();
      // The host closes registered views without removing their workspace leaves.
      for (const leaf of leaves) if (leaf.view instanceof ItemView) await leaf.view.onClose();
    },
    scanLeaf: () => leaves.find((leaf) => leaf.type === "linklens-scan"),
    edit() { text = "[[Target]]"; cachedTarget = "Target"; file.stat.mtime++; file.stat.size = text.length; },
    setMetadataReady(value) { metadataReady = value; },
    setRead(callback) { read = callback; },
    setActivation(callback) { activation = callback; },
    setReveal(callback) { reveal = callback; },
    selections: () => selections,
  };
}

function summary(leaf) { return leaf.view.contentEl.children.find((element) => element.tag === "p").text; }
function openButton(leaf) {
  return leaf.view.contentEl.children.find((element) => element.tag === "ol").children[0].children.find((element) => element.tag === "button");
}

test("complete workflow opens an occurrence, accepts a manual edit and reruns to empty", async () => {
  const fixture = setup();
  await fixture.plugin.command.callback();
  assert.match(summary(fixture.scanLeaf()), /Found 1/);
  await openButton(fixture.scanLeaf()).click();
  assert.equal(fixture.selections(), 1);
  fixture.edit();
  await fixture.plugin.command.callback();
  assert.match(summary(fixture.scanLeaf()), /No broken/);
  assert.equal(fixture.scanLeaf().view.contentEl.children.some((child) => child.tag === "ol"), false);
  assert.deepEqual(fixture.notices, []);
  await fixture.unload();
});

test("closing a pending scan allows an immediate command to create a fresh view", async () => {
  const fixture = setup();
  fixture.setMetadataReady(false);
  const first = fixture.plugin.command.callback();
  await settle();
  const oldLeaf = fixture.scanLeaf();
  assert.match(summary(oldLeaf), /Scanning/);
  oldLeaf.detach();
  fixture.setMetadataReady(true);
  const second = fixture.plugin.command.callback();
  await Promise.all([first, second]);
  assert.notEqual(fixture.scanLeaf(), oldLeaf);
  assert.match(summary(fixture.scanLeaf()), /Found 1/);
  assert.equal(oldLeaf.view.contentEl.children.length, 0);
  assert.deepEqual(fixture.notices, []);
  await fixture.unload();
});

test("unloading during metadata waits cancels work without notices or UI updates", async () => {
  const fixture = setup();
  fixture.setMetadataReady(false);
  const running = fixture.plugin.command.callback();
  await settle();
  const leaf = fixture.scanLeaf();
  await fixture.unload();
  await running;
  assert.equal(fixture.leaves.length, 1);
  assert.equal(leaf.view.contentEl.children.length, 0);
  assert.deepEqual(fixture.notices, []);
});

test("unloading while the view activates preserves its leaf without late UI or notices", async () => {
  const fixture = setup();
  let finish;
  fixture.setActivation(() => new Promise((resolve) => { finish = resolve; }));
  const running = fixture.plugin.command.callback();
  await settle();
  await fixture.unload();
  finish();
  await running;
  assert.equal(fixture.leaves.length, 1);
  assert.equal(fixture.scanLeaf().view.contentEl.children.length, 0);
  assert.deepEqual(fixture.notices, []);
});

test("unloading during reveal preserves the workspace leaf without starting a scan", async () => {
  const fixture = setup();
  let finish;
  fixture.setReveal(() => new Promise((resolve) => { finish = resolve; }));
  const running = fixture.plugin.command.callback();
  await settle();
  const leaf = fixture.scanLeaf();
  await fixture.unload();
  finish();
  await running;
  assert.equal(fixture.leaves.length, 1);
  assert.equal(fixture.scanLeaf(), leaf);
  assert.equal(leaf.view.contentEl.children.length, 0);
  assert.deepEqual(fixture.notices, []);
});

test("a new scan invalidates pending navigation from its previous results", async () => {
  const fixture = setup();
  await fixture.plugin.command.callback();
  let finishRead;
  fixture.setRead(() => new Promise((resolve) => { finishRead = resolve; }));
  const navigating = openButton(fixture.scanLeaf()).click();
  await fixture.plugin.command.callback();
  finishRead("[[Missing]]");
  await navigating;
  assert.equal(fixture.selections(), 0);
  assert.equal(fixture.leaves.some((leaf) => leaf.type === "markdown"), false);
  assert.deepEqual(fixture.notices, []);
  await fixture.unload();
});

test("closing the view silences a navigation failure that arrives later", async () => {
  const fixture = setup();
  await fixture.plugin.command.callback();
  let failRead;
  fixture.setRead(() => new Promise((resolve, reject) => { failRead = reject; }));
  const navigating = openButton(fixture.scanLeaf()).click();
  const leaf = fixture.scanLeaf();
  leaf.detach();
  failRead(new Error("Read failed after closing"));
  await navigating;
  assert.equal(leaf.view.contentEl.children.length, 0);
  assert.deepEqual(fixture.notices, []);
  await fixture.unload();
});

test("a detached Open source button cannot open a superseded occurrence", async () => {
  const fixture = setup();
  await fixture.plugin.command.callback();
  const oldButton = openButton(fixture.scanLeaf());
  await fixture.plugin.command.callback();
  await oldButton.click();
  assert.equal(fixture.selections(), 0);
  assert.equal(fixture.leaves.some((leaf) => leaf.type === "markdown"), false);
  await fixture.unload();
});
