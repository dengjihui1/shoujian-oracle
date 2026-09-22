import test from "node:test";
import assert from "node:assert/strict";
import { formatEvidenceForPrompt, loadKnowledgeBase } from "../server/knowledge-retriever.mjs";

const knowledge = await loadKnowledgeBase();

test("loads a complete frozen Zhouyi retrieval package", () => {
  assert.deepEqual(knowledge.summary, {
    schema: "shoujian.oracle-rag.v1",
    version: "1.0.0",
    hexagrams: 64,
    trigrams: 8,
    fragments: 456,
  });
});

test("current reading forces the primary, moving lines, changed hexagram, and trigram evidence", () => {
  const evidence = knowledge.retrieve({
    query: "所以这个卦对原问意味着什么？",
    reading: {
      primary: { number: 4, fullName: "山水蒙" },
      movingLines: [3, 4, 5],
      changed: { fullName: "天风姤" },
    },
  });
  assert.deepEqual(evidence.slice(0, 5).map(({ id }) => id), [
    "ZY-04-OVERVIEW",
    "ZY-04-LINE-3",
    "ZY-04-LINE-4",
    "ZY-04-LINE-5",
    "ZY-44-OVERVIEW",
  ]);
  assert.ok(evidence.every(({ sourceUrl }) => sourceUrl.startsWith("https://")));
});

test("free knowledge questions retrieve quoted text without a cast", () => {
  const evidence = knowledge.retrieve({ query: "潜龙勿用是什么意思？", limit: 4 });
  assert.deepEqual(evidence.map(({ id }) => id), ["ZY-01-LINE-1"]);
  assert.match(evidence[0].excerpt, /潛龍勿用/u);
  assert.match(formatEvidenceForPrompt(evidence), /【ZY-01-LINE-1】/u);
});

test("unknown questions do not fabricate a decorative source", () => {
  const evidence = knowledge.retrieve({ query: "量子芯片制程怎么设计" });
  assert.deepEqual(evidence, []);
  assert.match(formatEvidenceForPrompt(evidence), /资料不足/u);
});

test("ordinary numbers do not accidentally match a numbered hexagram", () => {
  const evidence = knowledge.retrieve({ query: "请用大约300字介绍你自己，以及你能做什么。" });
  assert.deepEqual(evidence, []);
});

test("explicit Shuogua questions prioritize the matching trigram evidence", () => {
  const cases = [
    ["《说卦》里乾为什么代表马和首？", "SG-QIAN"],
    ["《说卦》取象中坤为什么是地和母？", "SG-KUN"],
    ["八卦取象里巽为什么代表风和木？", "SG-XUN"],
  ];
  for (const [query, expected] of cases) {
    assert.equal(knowledge.retrieve({ query })[0]?.id, expected);
  }
});
