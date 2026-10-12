# LinkLens
An Obsidian plugin project. The current implementation provides only the minimal plugin entry point and development tooling; no scanning command or results UI is available.

## Development

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`npm run dev` watches TypeScript sources and rebuilds `main.js`. `npm test` builds the plugin and runs manifest and bundle checks using Node's test runner.

The build uses the official Obsidian API types, TypeScript strict checking, and esbuild. Development dependencies are locked in `package-lock.json`; there are no runtime dependencies bundled with the plugin.

## Local installation

Use a disposable development vault. After building, copy `main.js` and `manifest.json` into `<vault>/.obsidian/plugins/linklens/`, then enable LinkLens in **Settings → Community plugins**. Reload the plugin after rebuilding.

The manifest enables desktop and mobile loading. Actual Obsidian integration on either platform has not been verified.

## License

[MIT](LICENSE).
