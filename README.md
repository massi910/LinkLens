# LinkLens
Scan Markdown notes across an Obsidian vault for broken internal file links. The scan view shows each missing occurrence with its source note, target, original link syntax, type, and line/column position. It distinguishes idle, scanning, empty, results, and error states.

The destination checker delegates file resolution to Obsidian with the source note's path. It checks file existence only, including attachments, ignores same-note fragments and non-vault URI schemes, and does not validate headings or blocks. Wikilinks, Markdown links, and embeds are read from Obsidian metadata; repeated occurrences remain separate.

The scan coordinator collects Markdown sources through Obsidian's vault API, waits a bounded number of times for unavailable metadata, and publishes only completed results. It prevents overlapping scans, yields between batches, supports disposal, and rejects results if Markdown source paths, modification times, or sizes change during the scan. This is not an atomic snapshot of the vault.

## Usage

Requires Obsidian 1.7.2 or newer. Run **LinkLens: Scan vault for broken links** from the command palette. The command opens or reuses the LinkLens tab and starts a scan once the vault layout is ready. Use **Scan vault** to rerun it. Existing results are replaced by the scanning state until the new scan finishes.

Results are ordered by source path and position, with up to 100 occurrences per page. Use **Previous page** and **Next page** for larger lists. Line and column numbers start at 1. **Open source** opens the note in the normal editor and selects the original link so you can edit it manually.

Navigation checks the source revision, original text, and editor coordinates before selecting a result. Changed, renamed, or deleted sources require a fresh scan; the plugin does not guess a new location for an old result. An unchanged source editor is reused when available.

The plugin never modifies notes or creates destinations. Edit notes in the normal editor and wait for Obsidian to index changes before rescanning. An unavailable cache or a changed Markdown source produces an error rather than a partial result. Closing the scan tab or disabling the plugin cancels pending scan work. Rerunning the command after closing creates a fresh scan view; late operations cannot update the closed view or select an occurrence from superseded results.

## Limitations

- Markdown notes are scanned; other file formats are destinations only.
- Only file existence is checked. Missing headings and blocks are not reported.
- Scans depend on Obsidian's metadata cache and are not atomic vault snapshots. Wait for indexing after edits and rerun if the vault changes.
- Manual checks have been reported successful on desktop, iPhone, and Android, including Obsidian 1.7.2. Exact device and OS versions were not recorded.

## Development

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run package
```

`npm run dev` watches TypeScript sources and rebuilds `main.js`. `npm test` builds the plugin and runs tooling, metadata, destination, orchestration, command/view, and lifecycle workflow tests using Node's test runner. Tests use synthetic API mocks; they verify delegation, classification, and scan state, not real Obsidian parsing or destination resolution.

The build uses the official Obsidian API types, TypeScript strict checking, and esbuild. Development dependencies are locked in `package-lock.json`; there are no runtime dependencies bundled with the plugin.

For real desktop integration checks, run `npm run test:vault`. It builds the plugin and creates a new synthetic vault in the system temporary directory without overwriting an existing vault. Open the printed folder in Obsidian and follow the [desktop integration procedure](tests/integration/desktop.md), including the six-occurrence resolution matrix and safe navigation checks. Generating the fixture does not run Obsidian integration tests.

`npm run test:vault -- --large` creates a larger fixture with 1,008 Markdown notes and 1,006 expected missing occurrences. Follow the [robustness procedure](tests/integration/robustness.md) for repeated scans, source changes, cancellation and recovery to an empty result. Fixture generation and mocked tests do not establish real-vault performance.

The [mobile and accessibility procedure](tests/integration/mobile-accessibility.md) covers real-device installation, narrow panes, light/dark schemes, touch, keyboard focus, and screen-reader checks. Automated tests verify stable status controls and focus handling; they do not establish visual or assistive-technology compatibility.

## Release assets

`npm run package` performs a production build and copies exactly `main.js`, `manifest.json`, and `styles.css` into `dist/<manifest-version>/`. It checks package/manifest version agreement and prints SHA-256 checksums. Generated files are excluded from Git; source, tests, tooling, manifest, styles and the dependency lockfile belong in the repository.

To check reproducibility locally, rerun `npm run package` without changing the source or dependencies and compare the printed checksums. The same locked toolchain should produce identical assets. This does not assert identical output across all operating systems or Node.js versions.

Preparing these files does not publish anything. A release tag must exactly match the manifest version (`0.1.0` for the current build), without a `v` prefix. Publication and submission are separate steps; see the [official Obsidian instructions](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin).

## Local installation

Use a disposable development vault. After building, copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/linklens/`, then enable LinkLens in **Settings → Community plugins**. Reload the plugin after rebuilding.

The plugin enables desktop and mobile loading. Manual checks on desktop, iPhone, Android, and the minimum supported Obsidian version (1.7.2) have been reported successful.

## License

[MIT](LICENSE).
