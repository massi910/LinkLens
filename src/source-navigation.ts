import { MarkdownView, TFile } from "obsidian";
import type { App } from "obsidian";
import type { ScannedOccurrence } from "./link-occurrence";

export function hasOriginalOccurrence(content: string, occurrence: ScannedOccurrence): boolean {
  const { start, end } = occurrence.position;
  return Number.isInteger(start.offset) && Number.isInteger(end.offset)
    && start.offset >= 0 && end.offset > start.offset && end.offset <= content.length
    && content.slice(start.offset, end.offset) === occurrence.original;
}

export async function openSourceOccurrence(
  app: Pick<App, "vault" | "workspace">,
  occurrence: ScannedOccurrence,
  isActive: () => boolean,
): Promise<void> {
  if (!isActive()) return;
  const file = app.vault.getAbstractFileByPath(occurrence.sourcePath);
  if (!(file instanceof TFile) || file.extension !== "md") {
    throw new Error("The source note no longer exists. Run the scan again.");
  }
  const isCurrent = () => app.vault.getAbstractFileByPath(occurrence.sourcePath) === file
    && file.stat.mtime === occurrence.sourceRevision.mtime
    && file.stat.size === occurrence.sourceRevision.size;
  if (!isCurrent()) throw new Error("The source note changed. Run the scan again.");
  const content = await app.vault.read(file);
  if (!isActive()) return;
  if (!isCurrent() || !hasOriginalOccurrence(content, occurrence)) {
    throw new Error("The source occurrence changed. Run the scan again.");
  }

  const existing = app.workspace.getLeavesOfType("markdown").find((leaf) =>
    leaf.view instanceof MarkdownView && leaf.view.file === file);
  const leaf = existing ?? app.workspace.getLeaf(true);
  await leaf.openFile(file, { active: true, state: { mode: "source" } });
  if (!isActive()) return;
  await app.workspace.revealLeaf(leaf);
  if (!isActive()) return;
  const view = leaf.view;
  if (!(view instanceof MarkdownView) || view.file !== file || !isCurrent()) {
    throw new Error("The source editor is unavailable or changed. Run the scan again.");
  }
  const editor = view.editor;
  // Unsaved editor changes can invalidate a position even before vault stats change.
  if (!hasOriginalOccurrence(editor.getValue(), occurrence)) {
    throw new Error("The source editor changed. Run the scan again.");
  }
  const from = editor.offsetToPos(occurrence.position.start.offset);
  const to = editor.offsetToPos(occurrence.position.end.offset);
  if (from.line !== occurrence.position.start.line || from.ch !== occurrence.position.start.col
    || to.line !== occurrence.position.end.line || to.ch !== occurrence.position.end.col) {
    throw new Error("The source position changed. Run the scan again.");
  }
  editor.setSelection(from, to);
  editor.scrollIntoView({ from, to }, true);
  editor.focus();
}
