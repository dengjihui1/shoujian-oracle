import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const required = [
  "README.md", "NOTICE.md", "LICENSE", "index.html", "docs/COMPONENT_MAP.md", "docs/LEARNING_GUIDE.md",
  "docs/API_SETUP.md", "server/index.mjs", "server/gemini-client.mjs", "server/prompt.mjs",
  "src/oracle-engine.js", "src/question-boundary.js", "src/dialogue-engine.js", "src/shoujian-oracle.js",
  "src/api-client.js", "src/audio-recorder.js", "src/audio-player.js"
];

for (const relativePath of required) {
  await readFile(new URL(relativePath, root), "utf8");
}

const secretLike = [/AIza[0-9A-Za-z_-]{20,}/u, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u];
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
