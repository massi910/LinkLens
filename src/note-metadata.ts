import type { MetadataCache, ReferenceCache } from "obsidian";
import type { LinkOccurrence, NoteLinks } from "./link-occurrence";

export type NoteMetadataReader = Pick<MetadataCache, "getCache">;

export function readNoteLinks(
  sourcePath: string,
  metadata: NoteMetadataReader,
): NoteLinks {
  const cache = metadata.getCache(sourcePath);
  // Missing cache data must never be interpreted as a note with no links.
  if (cache === null) {
    return { status: "unavailable", sourcePath };
  }

  const occurrences = [
    ...(cache.links ?? []).map((link) => toOccurrence(sourcePath, link, "link")),
    ...(cache.embeds ?? []).map((embed) => toOccurrence(sourcePath, embed, "embed")),
  ];
  occurrences.sort((left, right) => left.position.start.offset - right.position.start.offset);
  return { status: "available", sourcePath, occurrences };
}

function toOccurrence(
  sourcePath: string,
  reference: ReferenceCache,
  kind: LinkOccurrence["kind"],
): LinkOccurrence {
  return {
    sourcePath,
    target: reference.link,
    original: reference.original,
    kind,
    // Copy positions so later metadata updates do not alter an existing result.
    position: {
      start: { ...reference.position.start },
      end: { ...reference.position.end },
    },
  };
}
