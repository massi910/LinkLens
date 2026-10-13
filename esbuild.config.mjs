import { build, context } from "esbuild";

const production = process.argv[2] === "production";
const options = {
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  bundle: true,
  // Obsidian provides this module; browser mode rejects Node-only imports.
  external: ["obsidian"],
  platform: "browser",
  format: "cjs",
  target: "es2021",
  sourcemap: production ? false : "inline",
  minify: production,
  treeShaking: true,
  logLevel: "info",
};

if (production) {
  await build(options);
} else {
  const watcher = await context(options);
  await watcher.watch();
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, async () => {
      await watcher.dispose();
      process.exit(0);
    });
  }
}
