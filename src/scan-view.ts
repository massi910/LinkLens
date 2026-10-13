import { ButtonComponent, ItemView } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import type { VaultScanner } from "./vault-scan";

export const SCAN_VIEW_TYPE = "linklens-scan";

export class ScanView extends ItemView {
  private closed = true;
  private ready = false;

  constructor(leaf: WorkspaceLeaf, private readonly scanner: Pick<VaultScanner, "state" | "run" | "dispose">) {
    super(leaf);
  }

  getViewType(): string { return SCAN_VIEW_TYPE; }
  getDisplayText(): string { return "LinkLens"; }

  async onOpen(): Promise<void> {
    this.closed = false;
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
      case "results": status.setText(`Found ${state.occurrences.length} broken internal file link occurrence(s).`); break;
      case "error":
        status.setAttribute("role", "alert");
        status.setText(`Scan failed: ${state.message}`);
        break;
    }
  }
}
