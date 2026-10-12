import type { MetadataCache, Vault } from "obsidian";
import { resolveLinkDestination } from "./link-resolution";
import { readNoteLinks } from "./note-metadata";
import { VaultScanner } from "./vault-scan";

export function createVaultScanner(
  vault: Pick<Vault, "getMarkdownFiles">,
  metadata: Pick<MetadataCache, "getCache" | "getFirstLinkpathDest">,
): VaultScanner {
  return new VaultScanner({
    getMarkdownNotes: () => vault.getMarkdownFiles().map((file) => ({
      path: file.path,
      mtime: file.stat.mtime,
      size: file.stat.size,
    })),
    readNoteLinks: (path) => readNoteLinks(path, metadata),
    resolveLinkDestination: (occurrence) => resolveLinkDestination(occurrence, metadata),
  });
}
