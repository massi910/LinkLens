import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
const packageInfo = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(manifest.version) || manifest.version !== packageInfo.version) {
  throw new Error("Manifest and package versions must match and use x.y.z format.");
}
if (manifest.isDesktopOnly !== false) throw new Error("LinkLens must enable mobile loading.");

const assets = ["main.js", "manifest.json", "styles.css"];
const contents = await Promise.all(assets.map((asset) => readFile(new URL(asset, root))));
const output = new URL(`dist/${manifest.version}/`, root);
await mkdir(output, { recursive: true });
const extraFiles = (await readdir(output)).filter((file) => !assets.includes(file));
if (extraFiles.length > 0) throw new Error(`Unexpected files in release directory: ${extraFiles.join(", ")}`);
for (const [index, asset] of assets.entries()) {
  await writeFile(new URL(asset, output), contents[index]);
  console.log(`${createHash("sha256").update(contents[index]).digest("hex")}  ${asset}`);
}
console.log(`Release assets: ${output.pathname}`);
console.log(`Required release tag: ${manifest.version} (no tag or release created).`);
