# LinkLens
An Obsidian plugin project with a minimal plugin entry point and a tested metadata reader. The reader preserves individual link and embed occurrences, their original targets and source positions, and distinguishes unavailable metadata from an empty note. No scanning command or results UI is available.

## Development

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`npm run dev` watches TypeScript sources and rebuilds `main.js`. `npm test` builds the plugin and runs manifest, bundle, and metadata reader checks using Node's test runner. Metadata tests use synthetic API mocks; they do not verify real Obsidian parsing or destination resolution.

The build uses the official Obsidian API types, TypeScript strict checking, and esbuild. Development dependencies are locked in `package-lock.json`; there are no runtime dependencies bundled with the plugin.

## Local installation

Use a disposable development vault. After building, copy `main.js` and `manifest.json` into `<vault>/.obsidian/plugins/linklens/`, then enable LinkLens in **Settings → Community plugins**. Reload the plugin after rebuilding.

The manifest enables desktop and mobile loading. Actual Obsidian integration on either platform has not been verified.

## License

[MIT](LICENSE).
