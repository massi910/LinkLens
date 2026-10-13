# LinkLens
An Obsidian plugin project with a minimal plugin entry point and tested modules for metadata reading, file destination checks, and vault scan orchestration. The reader preserves individual link and embed occurrences, their original targets and source positions, and distinguishes unavailable metadata from an empty note. No scanning command or results UI is available.

The destination checker delegates file resolution to Obsidian with the source note's path. It checks file existence only, including attachments, ignores same-note fragments and non-vault URI schemes, and does not validate headings or blocks. The modules are not yet connected to the plugin entry point.

The scan coordinator collects Markdown sources through Obsidian's vault API, waits a bounded number of times for unavailable metadata, and publishes only completed results. It prevents overlapping scans, yields between batches, supports disposal, and rejects results if Markdown source paths, modification times, or sizes change during the scan. This is not an atomic snapshot of the vault.

## Development

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`npm run dev` watches TypeScript sources and rebuilds `main.js`. `npm test` builds the plugin and runs tooling, metadata, destination, and scan orchestration tests using Node's test runner. Tests use synthetic API mocks; they verify delegation, classification, and scan state, not real Obsidian parsing or destination resolution.

The build uses the official Obsidian API types, TypeScript strict checking, and esbuild. Development dependencies are locked in `package-lock.json`; there are no runtime dependencies bundled with the plugin.

## Local installation

Use a disposable development vault. After building, copy `main.js` and `manifest.json` into `<vault>/.obsidian/plugins/linklens/`, then enable LinkLens in **Settings → Community plugins**. Reload the plugin after rebuilding.

The manifest enables desktop and mobile loading. Actual Obsidian integration on either platform has not been verified.

## License

[MIT](LICENSE).
