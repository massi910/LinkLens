import { Notice, Plugin } from "obsidian";
import { createVaultScanner } from "./obsidian-scan";
import { SCAN_VIEW_TYPE, ScanView } from "./scan-view";

export default class LinkLensPlugin extends Plugin {
  private disposed = false;
  private opening: Promise<ScanView> | null = null;

  onload(): void {
    this.registerView(SCAN_VIEW_TYPE, (leaf) => new ScanView(
      leaf, createVaultScanner(this.app.vault, this.app.metadataCache),
    ));
    this.addCommand({
      id: "scan-vault",
      name: "Scan vault for broken links",
      callback: () => this.scanVault(),
    });
  }

  onunload(): void {
    this.disposed = true;
    // Obsidian closes registered views while preserving their workspace location.
  }

  private async scanVault(): Promise<void> {
    if (this.disposed) return;
    try {
      const view = await this.getScanView();
      if (!this.disposed) await view.scan();
    } catch (error: unknown) {
      if (!this.disposed) new Notice(`Unable to open LinkLens: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getScanView(): Promise<ScanView> {
    const opening = this.opening ?? this.openScanView();
    this.opening = opening;
    try {
      return await opening;
    } finally {
      // Share only view activation, not the scan's lifetime. A closed scan tab
      // must not be reused while its cancelled scan is still settling.
      if (this.opening === opening) this.opening = null;
    }
  }

  private async openScanView(): Promise<ScanView> {
    const workspace = this.app.workspace;
    const existing = workspace.getLeavesOfType(SCAN_VIEW_TYPE)[0];
    const leaf = existing ?? workspace.getLeaf(true);
    if (existing === undefined) await leaf.setViewState({ type: SCAN_VIEW_TYPE, active: true });
    if (this.disposed) {
      throw new Error("LinkLens has been unloaded.");
    }
    await workspace.revealLeaf(leaf);
    if (this.disposed) {
      throw new Error("LinkLens has been unloaded.");
    }
    // revealLeaf also loads deferred views on newer Obsidian versions.
    if (!(leaf.view instanceof ScanView)) throw new Error("The scan view is unavailable.");
    return leaf.view;
  }
}
