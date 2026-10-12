import { parseLinktext } from "obsidian";
import type { MetadataCache } from "obsidian";
import type { LinkOccurrence } from "./link-occurrence";

export type FileDestinationResolver = Pick<MetadataCache, "getFirstLinkpathDest">;

export type LinkResolution =
  | { readonly status: "valid"; readonly destinationPath: string }
  | { readonly status: "missing" }
  | { readonly status: "ignored"; readonly reason: "external" | "same-note" };

export function resolveLinkDestination(
  occurrence: LinkOccurrence,
  metadata: FileDestinationResolver,
): LinkResolution {
  const target = occurrence.target;
  // URI schemes and protocol-relative URLs are outside vault file resolution.
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) {
    return { status: "ignored", reason: "external" };
  }

  const { path } = parseLinktext(target);
  if (path === "") {
    return { status: "ignored", reason: "same-note" };
  }

  // Keep the cached path intact: Obsidian owns relative paths, encoding and
  // duplicate-name selection. Only the file is checked, never its fragment.
  const destination = metadata.getFirstLinkpathDest(path, occurrence.sourcePath);
  return destination === null
    ? { status: "missing" }
    : { status: "valid", destinationPath: destination.path };
}
