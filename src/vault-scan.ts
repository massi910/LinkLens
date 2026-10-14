import type { LinkOccurrence, NoteLinks, ScannedOccurrence } from "./link-occurrence";
import type { LinkResolution } from "./link-resolution";

export interface MarkdownNoteSnapshot {
  readonly path: string;
  readonly mtime: number;
  readonly size: number;
}

export interface ScanSource {
  getMarkdownNotes(): readonly MarkdownNoteSnapshot[];
  readNoteLinks(path: string): NoteLinks;
  resolveLinkDestination(occurrence: LinkOccurrence): LinkResolution;
}

export type ScanState =
  | { readonly status: "idle" | "scanning" | "empty" }
  | { readonly status: "results"; readonly occurrences: readonly ScannedOccurrence[] }
  | { readonly status: "error"; readonly message: string };

type ScanPause = (milliseconds: number, signal: AbortSignal) => Promise<void>;

export class VaultScanner {
  private currentState: ScanState = { status: "idle" };
  private controller: AbortController | null = null;
  private disposed = false;

  constructor(
    private readonly source: ScanSource,
    private readonly pause: ScanPause = pauseScan,
  ) {}

  get state(): ScanState {
    return this.currentState;
  }

  async run(): Promise<readonly ScannedOccurrence[]> {
    if (this.disposed) throw new Error("Scanner has been disposed.");
    if (this.controller !== null) throw new Error("A scan is already running.");

    const controller = new AbortController();
    this.controller = controller;
    // A fresh scan never exposes the previous scan's results as current.
    this.currentState = { status: "scanning" };
    try {
      const notes = this.source.getMarkdownNotes().map((note) => ({ ...note })).sort(compareNotes);
      const references = await this.collectMetadata(notes, controller.signal);
      const revisions = new Map(notes.map((note) => [note.path, note]));
      const missing: ScannedOccurrence[] = [];
      let processed = 0;
      for (const note of references) {
        for (const occurrence of note.occurrences) {
          checkCancelled(controller.signal);
          if (this.source.resolveLinkDestination(occurrence).status === "missing") {
            const revision = revisions.get(occurrence.sourcePath);
            if (revision === undefined) throw new Error("The source note is unavailable.");
            missing.push({ ...occurrence, sourceRevision: { mtime: revision.mtime, size: revision.size } });
          }
          if (++processed % 200 === 0) await this.pause(0, controller.signal);
        }
      }
      checkCancelled(controller.signal);
      // Do not publish positions collected before a source changed or vanished.
      const currentNotes = [...this.source.getMarkdownNotes()].sort(compareNotes);
      if (!sameNotes(notes, currentNotes)) {
        throw new Error("Markdown notes changed during the scan. Run the scan again.");
      }
      missing.sort((left, right) => comparePaths(left.sourcePath, right.sourcePath)
        || left.position.start.offset - right.position.start.offset);
      this.currentState = missing.length === 0
        ? { status: "empty" }
        : { status: "results", occurrences: missing };
      return missing;
    } catch (error: unknown) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.currentState = controller.signal.aborted
        ? { status: "idle" }
        : { status: "error", message: failure.message };
      throw failure;
    } finally {
      this.controller = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.controller?.abort();
    this.currentState = { status: "idle" };
  }

  private async collectMetadata(
    notes: readonly MarkdownNoteSnapshot[],
    signal: AbortSignal,
  ): Promise<Extract<NoteLinks, { status: "available" }>[]> {
    const available: Extract<NoteLinks, { status: "available" }>[] = [];
    let pending = notes.map((note) => note.path);
    // Bound indexing waits to 100 pauses of 50 ms; never publish partial data.
    for (let attempt = 0; ; attempt++) {
      const unavailable: string[] = [];
      for (let index = 0; index < pending.length; index++) {
        checkCancelled(signal);
        const path = pending[index];
        if (path === undefined) throw new Error("Missing source path during scan.");
        const note = this.source.readNoteLinks(path);
        if (note.status === "unavailable") unavailable.push(path);
        else available.push(note);
        if ((index + 1) % 50 === 0) await this.pause(0, signal);
      }
      if (unavailable.length === 0) return available;
      if (attempt === 100) {
        throw new Error(`Metadata unavailable for ${unavailable.length} Markdown note(s): ${unavailable[0]}. Run the scan again after indexing completes.`);
      }
      pending = unavailable;
      await this.pause(50, signal);
    }
  }
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareNotes(left: MarkdownNoteSnapshot, right: MarkdownNoteSnapshot): number {
  return comparePaths(left.path, right.path);
}

function sameNotes(left: readonly MarkdownNoteSnapshot[], right: readonly MarkdownNoteSnapshot[]): boolean {
  return left.length === right.length && left.every((note, index) => {
    const current = right[index];
    return current !== undefined && note.path === current.path
      && note.mtime === current.mtime && note.size === current.size;
  });
}

function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("Scan cancelled.");
}

function pauseScan(milliseconds: number, signal: AbortSignal): Promise<void> {
  checkCancelled(signal);
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new Error("Scan cancelled."));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}
