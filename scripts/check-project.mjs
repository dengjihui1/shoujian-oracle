import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const required = [
  "README.md", "NOTICE.md", "LICENSE", "index.html", "docs/COMPONENT_MAP.md", "docs/LEARNING_GUIDE.md",
  "src/oracle-engine.js", "src/question-boundary.js", "src/dialogue-engine.js", "src/shoujian-oracle.js"
];

for (const relativePath of required) {
  await readFile(new URL(relativePath, root), "utf8");
}

const secretLike = [/api[_-]?key\s*[:=]/i, /private[_-]?key\s*[:=]/i];
const runtimeCoupling = [/xunzhai/i, /paymentSandbox/, /najia/i];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const path = join(directory, entry.name);
    files.push(...(entry.isDirectory() ? await walk(path) : [path]));
  }
  return files;
}

const files = await walk(rootPath);
for (const file of files.filter((path) => /\.(?:js|mjs|html|md|json)$/i.test(path))) {
  const text = await readFile(file, "utf8");
  const patterns = /[\\/]src[\\/]/.test(file) ? [...secretLike, ...runtimeCoupling] : secretLike;
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      console.error(`forbidden project coupling or secret-like text in ${file}: ${pattern}`);
      process.exitCode = 1;
    }
  }
}

if (!process.exitCode) console.log(`project check passed: ${files.length} files, zero core-project coupling`);
