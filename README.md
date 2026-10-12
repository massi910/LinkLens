# LinkLens
An Obsidian plugin project with a minimal plugin entry point and tested modules for metadata reading and file destination checks. The reader preserves individual link and embed occurrences, their original targets and source positions, and distinguishes unavailable metadata from an empty note. No scanning command or results UI is available.

The destination checker delegates file resolution to Obsidian with the source note's path. It checks file existence only, including attachments, ignores same-note fragments and non-vault URI schemes, and does not validate headings or blocks. The modules are not yet connected to the plugin entry point.

## Development

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`npm run dev` watches TypeScript sources and rebuilds `main.js`. `npm test` builds the plugin and runs manifest, bundle, metadata reader, and destination checker tests using Node's test runner. Tests use synthetic API mocks; they verify delegation and classification, not real Obsidian parsing or destination resolution.

The build uses the official Obsidian API types, TypeScript strict checking, and esbuild. Development dependencies are locked in `package-lock.json`; there are no runtime dependencies bundled with the plugin.

## Local installation

Use a disposable development vault. After building, copy `main.js` and `manifest.json` into `<vault>/.obsidian/plugins/linklens/`, then enable LinkLens in **Settings → Community plugins**. Reload the plugin after rebuilding.

The manifest enables desktop and mobile loading. Actual Obsidian integration on either platform has not been verified.

## License

[MIT](LICENSE).
