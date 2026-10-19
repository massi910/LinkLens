# Desktop integration checks

These checks use real Obsidian metadata, resolution, navigation, and lifecycle APIs. Mocked unit tests do not establish API compatibility. Record the Obsidian version, installer version, OS, and outcomes separately. This procedure does not establish compatibility with every supported release or with mobile.

## Prepare an isolated vault

From the repository root, with Node.js 22 or newer:

```sh
npm run typecheck
npm test
npm run test:vault
```

The last command builds the plugin and creates a new synthetic vault in the system temporary directory. It prints the exact path and copies `main.js`, `manifest.json`, and `styles.css` into it. It never modifies an existing vault. Each run creates a fresh fixture; it is not deleted automatically.

Open the printed folder using **Open another vault → Open folder as vault**. Enable community plugins and LinkLens. Do not open any missing destination links during these checks, because Obsidian may create their targets. Do not use a private vault.

## Resolution and occurrence matrix

Wait for initial indexing, then run **LinkLens: Scan vault for broken links**. Expect exactly **6 occurrences**, in this order:

| Source | Line | Column | Original link |
| --- | --- | --- | --- |
| Cases.md | 14 | 1 | `[[Missing]]` |
| Cases.md | 15 | 1 | `[[Missing]]` |
| Cases.md | 16 | 1 | `[Missing](Missing.md)` |
| Cases.md | 17 | 1 | `![[Assets/Missing.png]]` |
| One/Source.md | 3 | 1 | `[[Missing relative]]` |
| Two/Source.md | 2 | 1 | `[[Missing relative]]` |

No other fixture link should be reported. In particular, confirm that these existing files or ignored references produce no result:

- Wikilink and Markdown aliases to `Target.md`.
- Spaced wikilinks and URL-encoded Markdown paths to `Note name.md`.
- Wikilink and Markdown image embeds with spaces in their paths.
- A source-relative Markdown link from `One/Source.md` to `Target.md`.
- Duplicate filenames in `One` and `Two`. In each Source note, use Obsidian's own `[[Duplicate]]` link to confirm the selected file is the Duplicate note in that folder; return without editing it.
- Missing headings/blocks in an existing file, same-note fragments, external URLs, email and Obsidian URI schemes. Do not click external links.

The fixture uses display aliases (`[[Target|Alias]]`); it does not assume that an arbitrary frontmatter alias can be resolved as a filename.

## Navigation and manual correction

1. Use **Open source** on all six rows. Confirm the correct source tab, exact selected original link, and position, including the second `[[Missing]]`, the Markdown link, and the embed.
2. Return to the results without rescanning. Insert a line at the top of `Cases.md`, wait for saving, then click an old Cases result. Expect a rescan notice and no selection at the old coordinates. This notice occurs on **Open source**, not automatically on edit.
3. Rescan. The four Cases results must move down by one line. Open one to confirm the new selection.
4. Correct or remove one missing link manually. Wait for indexing and rescan: exactly one occurrence must disappear. The plugin must not edit any other text.
5. Rename `Two/Source.md` using Obsidian. Click its old result before rescanning: expect a missing-source notice, without creating a file at the old path. Rescan to see its new source path.
6. Delete that synthetic source using Obsidian. Its previous result must again refuse navigation and disappear after a scan.

## Lifecycle

1. Run the command repeatedly: one LinkLens scan tab, no duplicated rows.
2. Close that tab and immediately run the command again: a working new view.
3. Disable LinkLens: its view closes. Re-enable it and rerun: scanning and navigation work again.
4. Restart Obsidian with the view open. A restored view must start idle, not present old results as a new scan. Run a fresh scan.
5. If a scan or navigation is still pending when closing/disabling, verify that no late result or notice appears. If the fixture is too small to observe this, mark the real-app cancellation check pending; deterministic automated tests cover the race but do not count as a manual observation.

## Empty result

Delete only the synthetic notes `Cases.md`, `One/Source.md`, and the remaining source in `Two`. Keep the destination notes and image. Run a scan: expect **No broken internal file links found**, with no leftover list or pagination.

Report the initial six-result matrix before making any changes, plus navigation, rescan, lifecycle, and empty outcomes. Record failures with source path, original link, expected/actual behavior, and Obsidian version. Keep individual agent run reports outside public files until verified; do not claim a run passed solely because the fixture was generated.
