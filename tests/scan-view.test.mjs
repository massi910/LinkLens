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
  empty() { this.children = []; }
  createEl(tag, options = {}) {
    const element = new Element();
    element.tag = tag;
    element.text = options.text ?? "";
    element.attributes = { ...options.attr };
    this.children.push(element);
    return element;
  }
  setText(text) { this.text = text; }
  setAttribute(name, value) { this.attributes[name] = value; }
}

class ItemView {
  constructor(leaf) { this.app = leaf.app; this.contentEl = new Element(); }
}
class ButtonComponent {
  constructor(parent) { this.element = parent.createEl("button"); }
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
  require: () => ({ ItemView, ButtonComponent }),
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
  const fixture = setup({ status: "results", occurrences: [{}, {}] });
  await fixture.view.onOpen();
  assert.match(status(fixture.view).text, /Found 2/);
  const running = fixture.view.scan();
  assert.match(status(fixture.view).text, /Scanning/);
  assert.equal(fixture.view.contentEl.children.find((element) => element.tag === "button").disabled, true);
  await fixture.view.scan();
  assert.equal(fixture.scans(), 1);
  fixture.finish({ status: "results", occurrences: [{}] });
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
