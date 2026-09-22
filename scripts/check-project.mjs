import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const required = [
  "README.md", "NOTICE.md", "LICENSE", "index.html", "package-lock.json", "docs/COMPONENT_MAP.md", "docs/LEARNING_GUIDE.md", "docs/MODULE_POOL.md", "docs/QUALITY_BASELINE.md", "docs/VIRTUAL_HUMAN_RESEARCH.md", "docs/OPTIMIZATION_RESEARCH.md", "docs/VOICE_RAG_ARCHITECTURE.md", "docs/CACTUS_MODULE_EXTRACTION.md", "docs/USER_FEEDBACK_BACKLOG.md",
  "docs/API_SETUP.md", "server/index.mjs", "server/gemini-client.mjs", "server/prompt.mjs",
  "server/knowledge-retriever.mjs", "server/rate-limiter.mjs", "server/cloud-client.mjs", "server/openai-compatible-client.mjs", "server/speech-cache.mjs", "server/google-cloud-tts-client.mjs", "knowledge/shoujian-rag.v1.json", "knowledge/README.md", "evaluation/rag-cases.json", "scripts/evaluate-rag.mjs",
  "src/oracle-engine.js", "src/question-boundary.js", "src/response-policy.js", "src/dialogue-engine.js", "src/shoujian-oracle.js", "src/oracle-view.js",
  "src/api-client.js", "src/audio-recorder.js", "src/audio-player.js", "src/browser-speech.js", "src/conversation-memory.js", "src/streaming-text.js", "src/avatar-state.js",
  "src/speech-segmenter.js", "src/speech-queue.js",
  "assets/avatar/moheng-neutral.webp", "assets/avatar/moheng-speaking.webp"
];

for (const relativePath of required) {
  await readFile(new URL(relativePath, root), "utf8");
}

const knowledge = JSON.parse(await readFile(new URL("knowledge/shoujian-rag.v1.json", root), "utf8"));
if (knowledge.schema !== "shoujian.oracle-rag.v1"
  || knowledge.hexagrams?.length !== 64
  || knowledge.trigrams?.length !== 8
  || knowledge.hexagrams.some((record) => record.lines?.length !== 6)) {
  throw new Error("frozen RAG knowledge package is incomplete");
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

if (!process.exitCode) console.log(`project check passed: ${files.length} files, 64-hexagram RAG package, zero proprietary core-project coupling`);
