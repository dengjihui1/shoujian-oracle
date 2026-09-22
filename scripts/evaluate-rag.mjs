import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { loadKnowledgeBase } from "../server/knowledge-retriever.mjs";

const evaluation = JSON.parse(await readFile(new URL("../evaluation/rag-cases.json", import.meta.url), "utf8"));
if (evaluation.schema !== "shoujian.rag-eval.v1") throw new Error("RAG evaluation schema mismatch");

const knowledge = await loadKnowledgeBase();
const results = [];
for (const item of evaluation.cases) {
  const startedAt = performance.now();
  const evidence = knowledge.retrieve({ query: item.query, reading: item.reading ?? null, limit: 8 });
  const elapsedMs = performance.now() - startedAt;
  const ids = evidence.map(({ id }) => id);
  const maxRank = Math.min(item.maxRank ?? 4, ids.length);
  const window = ids.slice(0, maxRank);
  const passed = item.expectedEmpty
    ? ids.length === 0
    : (item.expectedAny ?? []).every((id) => window.includes(id))
      && (item.expectedAll ?? []).every((id) => window.includes(id));
  results.push({ id: item.id, passed, elapsedMs, ids });
}

const positive = results.filter((_, index) => !evaluation.cases[index].expectedEmpty);
const negative = results.filter((_, index) => evaluation.cases[index].expectedEmpty);
const recall = positive.filter(({ passed }) => passed).length / positive.length;
const negativePrecision = negative.filter(({ passed }) => passed).length / negative.length;
const timings = results.map(({ elapsedMs }) => elapsedMs).sort((a, b) => a - b);
const mean = timings.reduce((sum, value) => sum + value, 0) / timings.length;
const p95 = timings[Math.min(timings.length - 1, Math.ceil(timings.length * 0.95) - 1)];

console.log(`RAG eval: recall@4=${percent(recall)}, negative precision=${percent(negativePrecision)}, mean=${mean.toFixed(2)}ms, p95=${p95.toFixed(2)}ms`);
for (const result of results.filter(({ passed }) => !passed)) {
  console.error(`FAIL ${result.id}: ${result.ids.join(", ") || "<empty>"}`);
}

if (recall < evaluation.quality.minimumRecallAt4
  || negativePrecision < evaluation.quality.minimumNegativePrecision
  || mean > evaluation.latencyBudgetMs.mean
  || p95 > evaluation.latencyBudgetMs.p95) {
  process.exitCode = 1;
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}
