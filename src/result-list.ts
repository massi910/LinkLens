import type { LinkOccurrence } from "./link-occurrence";

export function renderOccurrences(
  container: HTMLElement,
  occurrences: readonly LinkOccurrence[],
  start: number,
  end: number,
): void {
  const list = container.createEl("ol", {
    cls: "linklens-results",
    attr: { "aria-label": "Broken link occurrences", start: String(start + 1) },
  });
  for (const occurrence of occurrences.slice(start, end)) {
    const row = list.createEl("li", { cls: "linklens-result" });
    row.createEl("h3", { text: occurrence.sourcePath, cls: "linklens-source" });
    const details = row.createEl("dl", { cls: "linklens-details" });
    for (const [label, value] of [
      ["Target", occurrence.target],
      ["Original link", occurrence.original],
      ["Position", `Line ${occurrence.position.start.line + 1}, column ${occurrence.position.start.col + 1}`],
      ["Type", occurrence.kind === "embed" ? "Embed" : "Link"],
    ]) {
      details.createEl("dt", { text: label });
      // Note names and link syntax are untrusted text, never HTML.
      details.createEl("dd", { text: value });
    }
  }
}
