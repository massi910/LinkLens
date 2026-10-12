export interface SourceLocation {
  /** Obsidian coordinates are zero-based. */
  readonly line: number;
  readonly col: number;
  readonly offset: number;
}

export interface LinkOccurrence {
  readonly sourcePath: string;
  readonly target: string;
  readonly original: string;
  readonly kind: "link" | "embed";
  readonly position: {
    readonly start: SourceLocation;
    readonly end: SourceLocation;
  };
}

export type NoteLinks =
  | { readonly status: "unavailable"; readonly sourcePath: string }
  | {
      readonly status: "available";
      readonly sourcePath: string;
      readonly occurrences: readonly LinkOccurrence[];
    };
