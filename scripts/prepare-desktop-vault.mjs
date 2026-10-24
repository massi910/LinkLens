import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const root = new URL("../", import.meta.url);
const large = process.argv.includes("--large");
if (process.argv.slice(2).some((argument) => argument !== "--large")) {
  throw new Error("Usage: node scripts/prepare-desktop-vault.mjs [--large]");
}
// Always create a new vault: never overwrite an existing vault or user notes.
const vault = await mkdtemp(join(tmpdir(), "linklens-desktop-"));
const notes = {
  "Target.md": "# Existing heading\n\nDestination. ^existing-block\n",
  "Note name.md": "Spaced destination.\n",
  "One/Duplicate.md": "Destination in One.\n",
  "Two/Duplicate.md": "Destination in Two.\n",
  "One/Source.md": [
    "[[Duplicate]]",
    "[Relative](../Target.md)",
    "[[Missing relative]]",
  ].join("\n") + "\n",
  "Two/Source.md": "[[Duplicate]]\n[[Missing relative]]\n",
  "Cases.md": [
    "[[Target|Alias]]",
    "[Alias](Target.md)",
    "[[Note name]]",
    "[Spaced](Note%20name.md)",
    "![[Assets/My Image.png]]",
    "![Image](Assets/My%20Image.png)",
    "[[Target#Absent heading]]",
    "[[Target#^absent-block]]",
    "[[#Absent heading]]",
    "[Local](#Absent-heading)",
    "[External](https://example.com)",
    "[Email](mailto:test@example.com)",
    "[App](obsidian://open?vault=Unused)",
    "[[Missing]]",
    "[[Missing]]",
    "[Missing](Missing.md)",
    "![[Assets/Missing.png]]",
  ].join("\n") + "\n",
};

for (const [path, content] of Object.entries(notes)) {
  const destination = join(vault, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, content, { flag: "wx" });
}
if (large) {
  for (let group = 0; group < 10; group++) {
    const directory = join(vault, "Stress", `Group-${String(group).padStart(2, "0")}`);
    await mkdir(directory, { recursive: true });
    for (let index = 0; index < 100; index++) {
      const content = [...Array(9).fill("[[Target]]"), "[[Stress missing]]"].join("\n") + "\n";
      await writeFile(join(directory, `Note-${String(index).padStart(3, "0")}.md`), content, { flag: "wx" });
    }
  }
  await writeFile(join(vault, "Stress", "Many links.md"), "[[Target]]\n".repeat(20000), { flag: "wx" });
}
await mkdir(join(vault, "Assets"));
await writeFile(join(vault, "Assets", "My Image.png"), Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64",
));
const pluginDirectory = join(vault, ".obsidian", "plugins", "linklens");
await mkdir(pluginDirectory, { recursive: true });
for (const asset of ["main.js", "manifest.json", "styles.css"]) {
  await copyFile(new URL(asset, root), join(pluginDirectory, asset));
}
const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
console.log(`Desktop test vault: ${vault}`);
console.log(`Plugin version: ${manifest.version}; minimum Obsidian: ${manifest.minAppVersion}`);
console.log("Open this folder as a vault in Obsidian and enable LinkLens.");
console.log(large
  ? "Large fixture: 1,008 Markdown notes; 1,006 missing occurrences; 20,000 valid links in Stress/Many links.md. See tests/integration/robustness.md."
  : "Expected first scan: 6 missing occurrences. See tests/integration/desktop.md.");
