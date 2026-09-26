import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";

// Reproduce the browser module from the pinned MIT package; never load a CDN at runtime.
const root = new URL("../", import.meta.url);
const source = await readFile(new URL("node_modules/lunar-javascript/lunar.js", root), "utf8");
const hash = createHash("sha256").update(source).digest("hex");
const output = `// lunar-javascript 1.7.7 (MIT). See vendor/lunar-javascript.LICENSE.\n// Upstream SHA256: ${hash}\nconst module = { exports: {} };\n${source}\nexport const { Solar, Lunar } = module.exports;\n`;
await writeFile(new URL("src/lunar-vendor.js", root), output);
await mkdir(new URL("vendor/", root), { recursive: true });
await writeFile(new URL("vendor/lunar-javascript.LICENSE", root), await readFile(new URL("node_modules/lunar-javascript/LICENSE", root)));
console.log(`Vendored lunar-javascript 1.7.7: ${Buffer.byteLength(output)} bytes, SHA256 ${hash}`);
