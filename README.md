# LinkLens
Scan Markdown notes across an Obsidian vault for broken internal file links. The scan view shows each missing occurrence with its source note, target, original link syntax, type, and line/column position. It distinguishes idle, scanning, empty, results, and error states.

The destination checker delegates file resolution to Obsidian with the source note's path. It checks file existence only, including attachments, ignores same-note fragments and non-vault URI schemes, and does not validate headings or blocks. Wikilinks, Markdown links, and embeds are read from Obsidian metadata; repeated occurrences remain separate.

The scan coordinator collects Markdown sources through Obsidian's vault API, waits a bounded number of times for unavailable metadata, and publishes only completed results. It prevents overlapping scans, yields between batches, supports disposal, and rejects results if Markdown source paths, modification times, or sizes change during the scan. This is not an atomic snapshot of the vault.

## Usage

Requires Obsidian 1.7.2 or newer. Run **LinkLens: Scan vault for broken links** from the command palette. The command opens or reuses the LinkLens tab and starts a scan once the vault layout is ready. Use **Scan vault** to rerun it. Existing results are replaced by the scanning state until the new scan finishes.

Results are ordered by source path and position, with up to 100 occurrences per page. Use **Previous page** and **Next page** for larger lists. Line and column numbers start at 1. Results are informational; they do not currently open the source note.

The plugin never modifies notes or creates destinations. Edit notes in the normal editor and wait for Obsidian to index changes before rescanning. An unavailable cache or a changed Markdown source produces an error rather than a partial result. Closing the scan tab cancels its work.

## Development

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`npm run dev` watches TypeScript sources and rebuilds `main.js`. `npm test` builds the plugin and runs tooling, metadata, destination, orchestration, and command/view tests using Node's test runner. Tests use synthetic API mocks; they verify delegation, classification, and scan state, not real Obsidian parsing or destination resolution.

The build uses the official Obsidian API types, TypeScript strict checking, and esbuild. Development dependencies are locked in `package-lock.json`; there are no runtime dependencies bundled with the plugin.

## Local installation

Use a disposable development vault. After building, copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/linklens/`, then enable LinkLens in **Settings → Community plugins**. Reload the plugin after rebuilding.

The manifest enables desktop and mobile loading. Actual Obsidian integration on either platform has not been verified.

## License

[MIT](LICENSE).
