import { ButtonComponent, ItemView } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type { VaultScanner } from "./vault-scan";
import type { LinkOccurrence } from "./link-occurrence";
import { renderOccurrences } from "./result-list";

export const SCAN_VIEW_TYPE = "linklens-scan";

export class ScanView extends ItemView {
  private closed = true;
  private ready = false;
  private page = 0;

  constructor(leaf: WorkspaceLeaf, private readonly scanner: Pick<VaultScanner, "state" | "run" | "dispose">) {
    super(leaf);
  }

  getViewType(): string { return SCAN_VIEW_TYPE; }
  getDisplayText(): string { return "LinkLens"; }

  async onOpen(): Promise<void> {
    this.closed = false;
    this.contentEl.addClass("linklens-scan-view");
    this.render();
    this.app.workspace.onLayoutReady(() => {
      if (this.closed) return;
      this.ready = true;
      this.render();
    });
  }

  async onClose(): Promise<void> {
    this.closed = true;
    this.scanner.dispose();
    this.contentEl.empty();
  }

  async scan(): Promise<void> {
    if (this.closed || !this.ready || this.scanner.state.status === "scanning") return;
    this.page = 0;
    const work = this.scanner.run();
    this.render();
    try {
      await work;
    } catch {
      // The scanner exposes the failure in its error state; closing cancels it.
      this.render();
      return;
    }
    this.render();
  }

  private render(): void {
    if (this.closed) return;
    const state = this.scanner.state;
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "LinkLens" });
    new ButtonComponent(this.contentEl)
      .setButtonText("Scan vault")
      .setDisabled(!this.ready || state.status === "scanning")
      .onClick(() => this.scan());
    const status = this.contentEl.createEl("p", { attr: { role: "status", "aria-live": "polite" } });
    switch (state.status) {
      case "idle":
        status.setText(this.ready ? "Ready to scan Markdown notes." : "Waiting for the vault to load.");
        break;
      case "scanning": status.setText("Scanning Markdown notes…"); break;
      case "empty": status.setText("No broken internal file links found."); break;
      case "results":
        status.setText(`Found ${state.occurrences.length} broken internal file link occurrence(s).`);
        this.renderResults(state.occurrences);
        break;
      case "error":
        status.setAttribute("role", "alert");
        status.setText(`Scan failed: ${state.message}`);
        break;
    }
  }

  private renderResults(occurrences: readonly LinkOccurrence[]): void {
    const pageSize = 100;
    const start = this.page * pageSize;
    const end = Math.min(start + pageSize, occurrences.length);
    this.contentEl.createEl("p", {
      text: `Showing ${start + 1}–${end} of ${occurrences.length}.`,
      cls: "linklens-range",
    });
    renderOccurrences(this.contentEl, occurrences, start, end);
    if (occurrences.length <= pageSize) return;

    const controls = this.contentEl.createEl("div", { cls: "linklens-pagination" });
    const previous = new ButtonComponent(controls).setButtonText("Previous page").setDisabled(this.page === 0);
    const next = new ButtonComponent(controls).setButtonText("Next page").setDisabled(end === occurrences.length);
    const changePage = (step: number) => {
      this.page += step;
      this.render();
      // Restore keyboard focus after replacing the pagination controls.
      this.contentEl.querySelector<HTMLButtonElement>(".linklens-pagination button:not(:disabled)")?.focus();
    };
    previous.onClick(() => changePage(-1));
    next.onClick(() => changePage(1));
  }
}
