import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

class Element {
  children = [];
  text = "";
  attributes = {};
  addClass(cls) { this.cls = cls; }
  querySelector() { return null; }
  empty() { this.children = []; }
  remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); }
  createEl(tag, options = {}) {
    const element = new Element();
    element.tag = tag;
    element.text = options.text ?? "";
    element.attributes = { ...options.attr };
    element.cls = options.cls;
    element.parent = this;
    this.children.push(element);
    return element;
  }
  setText(text) { this.text = text; }
  setAttribute(name, value) { this.attributes[name] = value; }
}

class ItemView {
  constructor(leaf) { this.app = leaf.app; this.contentEl = new Element(); }
}
class TFile {}
const navigationNotices = [];
class ButtonComponent {
  constructor(parent) { this.element = parent.createEl("button"); this.buttonEl = this.element; }
  setButtonText(text) { this.element.text = text; return this; }
  setDisabled(disabled) { this.element.disabled = disabled; return this; }
  onClick(callback) { this.element.click = callback; return this; }
}

const viewBuild = await build({
  entryPoints: [fileURLToPath(new URL("../src/scan-view.ts", import.meta.url))],
  bundle: true, external: ["obsidian"], format: "cjs", write: false,
});
const viewModule = { exports: {} };
runInNewContext(viewBuild.outputFiles[0].text, {
  module: viewModule, exports: viewModule.exports,
  require: () => ({ ItemView, ButtonComponent, TFile,
    Notice: class { constructor(message) { navigationNotices.push(message); } },
  }),
});
const { ScanView } = viewModule.exports;

function setup(initial = { status: "idle" }, ready = true) {
  let finish;
  let fail;
  let scans = 0;
  const scanner = {
    state: initial,
    run() {
      scans++;
      this.state = { status: "scanning" };
      return new Promise((resolve, reject) => {
        finish = (state) => { this.state = state; resolve([]); };
        fail = () => { this.state = { status: "error", message: "Metadata unavailable" }; reject(new Error("Metadata unavailable")); };
      });
    },
    dispose() { this.disposed = true; },
  };
  let layoutCallback;
  const view = new ScanView({ app: { workspace: {
    onLayoutReady(callback) { layoutCallback = callback; if (ready) callback(); },
  } } }, scanner);
  return { view, scanner, finish: (state) => finish(state), fail: () => fail(),
    ready: () => layoutCallback(), scans: () => scans };
}
function status(view) { return view.contentEl.children.find((element) => element.tag === "p"); }

function occurrence(offset = 0, sourcePath = "Folder/Source.md", target = "Missing") {
  return { sourcePath, target, original: `[[${target}]]`, kind: "link", sourceRevision: { mtime: 1, size: 10 }, position: {
    start: { line: offset, col: 2, offset }, end: { line: offset, col: 13, offset: offset + 11 },
  } };
}

test("view waits for layout readiness and exposes idle and empty states", async () => {
  const fixture = setup({ status: "idle" }, false);
  await fixture.view.onOpen();
  assert.match(status(fixture.view).text, /Waiting/);
  await fixture.view.scan();
  assert.equal(fixture.scans(), 0);
  fixture.ready();
  assert.match(status(fixture.view).text, /Ready/);
  const running = fixture.view.scan();
  fixture.finish({ status: "empty" });
  await running;
  assert.match(status(fixture.view).text, /No broken/);
});

test("rescan removes the old summary and blocks repeat requests while scanning", async () => {
  const fixture = setup({ status: "results", occurrences: [occurrence(), occurrence(1)] });
  await fixture.view.onOpen();
  assert.match(status(fixture.view).text, /Found 2/);
  const running = fixture.view.scan();
  assert.match(status(fixture.view).text, /Scanning/);
  assert.equal(fixture.view.contentEl.children.find((element) => element.tag === "button").disabled, true);
  await fixture.view.scan();
  assert.equal(fixture.scans(), 1);
  fixture.finish({ status: "results", occurrences: [occurrence()] });
  await running;
  assert.match(status(fixture.view).text, /Found 1/);
});

test("scan errors are shown as text and allow a retry", async () => {
  const fixture = setup();
  await fixture.view.onOpen();
  const running = fixture.view.scan();
  fixture.fail();
  await running;
  assert.match(status(fixture.view).text, /Scan failed: Metadata unavailable/);
  assert.equal(status(fixture.view).attributes.role, "alert");
  assert.equal(fixture.view.contentEl.children.find((element) => element.tag === "button").disabled, false);
});

test("keeps the live status region and scan button stable and resets alert semantics on retry", async () => {
  const fixture = setup();
  await fixture.view.onOpen();
  const originalStatus = status(fixture.view);
  const button = fixture.view.contentEl.children.find((element) => element.tag === "button");
  const running = fixture.view.scan();
  assert.equal(status(fixture.view), originalStatus);
  assert.equal(fixture.view.contentEl.children.find((element) => element.tag === "button"), button);
  fixture.fail();
  await running;
  assert.equal(originalStatus.attributes.role, "alert");
  const retry = fixture.view.scan();
  assert.equal(originalStatus.attributes.role, "status");
  assert.equal(originalStatus.attributes["aria-atomic"], "true");
  fixture.finish({ status: "empty" });
  await retry;
  assert.equal(status(fixture.view), originalStatus);
});

test("restores scan-button focus after completion when the user has not moved elsewhere", async () => {
  const fixture = setup();
  await fixture.view.onOpen();
  const button = fixture.view.contentEl.children.find((element) => element.tag === "button");
  const document = { body: {}, activeElement: button, hasFocus: () => true };
  fixture.view.contentEl.ownerDocument = document;
  button.focus = () => { document.activeElement = button; };
  const running = fixture.view.scan();
  document.activeElement = document.body;
  fixture.finish({ status: "empty" });
  await running;
  assert.equal(document.activeElement, button);
});

test("does not steal focus from another control or application after a scan", async () => {
  for (const appFocused of [true, false]) {
    const fixture = setup();
    await fixture.view.onOpen();
    const button = fixture.view.contentEl.children.find((element) => element.tag === "button");
    const document = { body: {}, activeElement: button, hasFocus: () => appFocused };
    fixture.view.contentEl.ownerDocument = document;
    button.focus = () => { assert.fail("Focus must not be stolen"); };
    const running = fixture.view.scan();
    document.activeElement = appFocused ? {} : document.body;
    fixture.finish({ status: "empty" });
    await running;
  }
});

test("closed views dispose their scanner and ignore pending scan completions", async () => {
  const fixture = setup();
  await fixture.view.onOpen();
  const running = fixture.view.scan();
  await fixture.view.onClose();
  assert.equal(fixture.scanner.disposed, true);
  fixture.finish({ status: "results", occurrences: [{}] });
  await running;
  assert.equal(fixture.view.contentEl.children.length, 0);
});

test("layout readiness arriving after closing does not rebuild a disposed view", async () => {
  const fixture = setup({ status: "idle" }, false);
  await fixture.view.onOpen();
  await fixture.view.onClose();
  fixture.ready();
  await fixture.view.scan();
  assert.equal(fixture.view.contentEl.children.length, 0);
  assert.equal(fixture.scans(), 0);
  assert.equal(fixture.scanner.disposed, true);
});

test("result rows retain repeated targets, source paths and human-readable positions", async () => {
  const fixture = setup({ status: "results", occurrences: [occurrence(), occurrence(4)] });
  await fixture.view.onOpen();
  const rows = fixture.view.contentEl.children.find((element) => element.tag === "ol").children;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].children[0].text, "Folder/Source.md");
  for (const row of rows) assert.equal(row.children[1].children[1].text, "Missing");
  assert.equal(rows[0].children[1].children[5].text, "Line 1, column 3");
  assert.equal(rows[1].children[1].children[5].text, "Line 5, column 3");
  assert.equal(rows[0].children[2].text, "Open source");
  assert.equal(rows[0].children[2].attributes["aria-label"], "Open Folder/Source.md, line 1, column 3");
});

test("renders HTML-like note paths and targets only as literal text", async () => {
  const unsafe = "<img src=x onerror=alert(1)>";
  const link = occurrence(0, `${unsafe}.md`, unsafe);
  link.kind = "embed";
  const fixture = setup({ status: "results", occurrences: [link] });
  await fixture.view.onOpen();
  const row = fixture.view.contentEl.children.find((element) => element.tag === "ol").children[0];
  assert.equal(row.children[0].text, `${unsafe}.md`);
  assert.equal(row.children[1].children[1].text, unsafe);
  assert.equal(row.children[1].children[3].text, `[[${unsafe}]]`);
  assert.equal(row.children[1].children[7].text, "Embed");
  assert.equal(row.children[0].children.length, 0);
});

test("Open source shows a rescan notice for changed and deleted notes", async () => {
  for (const file of [null, Object.assign(new TFile(), {
    extension: "md", stat: { mtime: 2, size: 10 },
  })]) {
    navigationNotices.length = 0;
    const fixture = setup({ status: "results", occurrences: [occurrence()] });
    fixture.view.app.vault = { getAbstractFileByPath: () => file };
    await fixture.view.onOpen();
    const row = fixture.view.contentEl.children.find((element) => element.tag === "ol").children[0];
    await row.children[2].click();
    assert.equal(navigationNotices.length, 1);
    assert.match(navigationNotices[0], /Run the scan again/);
    assert.equal(fixture.scans(), 0);
  }
});

test("pages results in bounded lists and resets to the first page after a rescan", async () => {
  const links = Array.from({ length: 103 }, (_, index) => occurrence(index));
  const fixture = setup({ status: "results", occurrences: links });
  await fixture.view.onOpen();
  const list = () => fixture.view.contentEl.children.find((element) => element.tag === "ol");
  const controls = () => fixture.view.contentEl.children.find((element) => element.cls === "linklens-pagination").children;
  assert.equal(list().children.length, 100);
  assert.equal(controls()[0].disabled, true);
  controls()[1].click();
  assert.equal(list().children.length, 3);
  assert.equal(list().attributes.start, "101");
  assert.equal(controls()[1].disabled, true);
  assert.equal(list().children[0].children[1].children[5].text, "Line 101, column 3");
  const running = fixture.view.scan();
  assert.equal(fixture.view.contentEl.children.some((element) => element.tag === "ol"), false);
  fixture.finish({ status: "results", occurrences: links });
  await running;
  assert.equal(list().attributes.start, "1");
  assert.equal(list().children.length, 100);
});

test("command scans into one reusable view and unload closes it", async () => {
  class Plugin {
    registerView(type, factory) { this.factory = factory; this.type = type; }
    addCommand(command) { this.command = command; }
  }
  const notices = [];
  const module = { exports: {} };
  runInNewContext(await readFile(new URL("../main.js", import.meta.url), "utf8"), {
    module, exports: module.exports, AbortController, Error, setTimeout, clearTimeout,
    require: () => ({ Plugin, ItemView, ButtonComponent,
      Notice: class { constructor(message) { notices.push(message); } },
      parseLinktext: () => ({ path: "Missing", subpath: "" }),
    }),
  });
  const plugin = new module.exports.default();
  const leaves = [];
  const app = {
    vault: { getMarkdownFiles: () => [] },
    metadataCache: {},
    workspace: {
      onLayoutReady: (callback) => callback(),
      getLeavesOfType: () => leaves,
      getLeaf() {
        const leaf = { app, async setViewState() {
          this.view = plugin.factory(this);
          leaves.push(this);
          await this.view.onOpen();
        }, detach() { void this.view.onClose(); } };
        return leaf;
      },
      revealLeaf: async () => {},
      detachLeavesOfType() { for (const leaf of leaves) leaf.detach(); },
    },
  };
  plugin.app = app;
  plugin.onload();
  assert.equal(plugin.command.id, "scan-vault");
  await Promise.all([plugin.command.callback(), plugin.command.callback()]);
  assert.equal(leaves.length, 1);
  assert.match(status(leaves[0].view).text, /No broken/);
  await plugin.command.callback();
  assert.equal(leaves.length, 1);
  plugin.onunload();
  assert.equal(leaves[0].view.contentEl.children.length, 0);
  assert.deepEqual(notices, []);
});
