import test from "node:test";
import assert from "node:assert/strict";
import { prepareChat } from "../server/chat-preparation.mjs";

const FIXED_NOW = () => Date.parse("2026-09-23T04:00:00.000Z");

test("ordinary chat prepares a fast model request without accidental evidence", () => {
  const calls = [];
  const prepared = prepareChat({
    message: "太阳为什么会发光",
    stage: "unknown-stage",
    history: [{ role: "user", text: "前一个问题" }, { role: "unexpected", text: "前一个回答" }],
  }, fakeKnowledge([{ id: "WEAK", matchScore: 1, matchedBy: [] }], calls), FIXED_NOW);

  assert.equal(prepared.route, "fast");
  assert.equal(prepared.knowledgeReason, "ordinary-chat");
  assert.deepEqual(prepared.evidence, []);
  assert.match(prepared.input, /用户：前一个问题/);
  assert.match(prepared.input, /墨衡：前一个回答/);
  assert.match(prepared.systemInstruction, /当前阶段：自由对话/);
  assert.equal(prepared.serverTime, "2026年09月23日 12:00:00（Asia/Shanghai）");
  assert.equal(calls[0].reading, null);
});

test("divination preparation recomputes reading from six lines and binds the fixed question to retrieval", () => {
  const calls = [];
  const evidence = [{
    id: "ZY-01-LINE-1",
    title: "乾卦初九",
    text: "潜龙勿用。",
    sourceUrl: "https://example.test/zhouyi",
    layer: "line",
    matchScore: 50,
    matchedBy: ["本卦"],
  }];
  const prepared = prepareChat({
    message: "结合本卦解释动爻",
    purpose: "divination",
    stage: "reading",
    question: "未来三个月是否继续项目",
    reading: {
      lines: [9, 7, 7, 7, 7, 7],
      primary: { number: 2, fullName: "伪造的坤卦" },
      movingLines: [6],
      changed: { fullName: "伪造的变卦" },
    },
  }, fakeKnowledge(evidence, calls), FIXED_NOW);

  assert.equal(prepared.route, "grounded");
  assert.equal(prepared.knowledgeReason, "divination");
  assert.deepEqual(prepared.evidence, evidence);
  assert.equal(calls[0].query, "结合本卦解释动爻\n未来三个月是否继续项目");
  assert.deepEqual(calls[0].reading.movingLines, [1]);
  assert.equal(calls[0].reading.primary.fullName, "乾为天");
  assert.equal(calls[0].reading.changed.fullName, "天风姤");
  assert.match(prepared.systemInstruction, /【ZY-01-LINE-1】/);
});

test("crisis policy returns directly without calling retrieval", () => {
  const knowledgeBase = { retrieve() { throw new Error("retrieval must not run"); } };
  const prepared = prepareChat({ message: "我现在就想伤害自己", purpose: "chat" }, knowledgeBase, FIXED_NOW);

  assert.equal(prepared.purpose, "chat");
  assert.equal(prepared.response.safety, "crisis-support");
  assert.match(prepared.response.text, /110|120/);
  assert.deepEqual(prepared.evidence, []);
  assert.equal("input" in prepared, false);
});

test("chat preparation rejects blank or oversized text before retrieval", () => {
  const knowledgeBase = fakeKnowledge([]);
  assert.throws(() => prepareChat({ message: "   " }, knowledgeBase, FIXED_NOW), { code: "invalid_text", status: 400 });
  assert.throws(() => prepareChat({ message: "问".repeat(2_001) }, knowledgeBase, FIXED_NOW), { code: "text_too_long", status: 413 });
});

test("chat preparation rejects a forged reading without six valid lines", () => {
  const knowledgeBase = fakeKnowledge([]);
  assert.throws(() => prepareChat({ message: "请解释这卦", reading: { primary: { number: 1 } } }, knowledgeBase, FIXED_NOW), { code: "invalid_reading", status: 400 });
  assert.throws(() => prepareChat({ message: "请解释这卦", reading: { lines: [7, 7, 7, 7, 7, 0] } }, knowledgeBase, FIXED_NOW), { code: "invalid_reading", status: 400 });
});

test("an explicit classics question without retrieved evidence never asks the model to invent a source", () => {
  const prepared = prepareChat({ message: "乾卦初九原文是什么？" }, fakeKnowledge([]), FIXED_NOW);
  assert.equal(prepared.response.groundingUnavailable, true);
  assert.match(prepared.response.text, /经传依据/u);
  assert.equal("input" in prepared, false);
});

test("a reading without retrieved evidence does not invite a fabricated hexagram explanation", () => {
  const prepared = prepareChat({
    message: "这对我的问题意味着什么？",
    purpose: "divination",
    stage: "reading",
    reading: { lines: [9, 7, 7, 7, 7, 7] },
  }, fakeKnowledge([]), FIXED_NOW);
  assert.equal(prepared.response.groundingUnavailable, true);
  assert.equal("input" in prepared, false);
});

function fakeKnowledge(evidence, calls = []) {
  return {
    retrieve(request) {
      calls.push(request);
      return evidence;
    },
  };
}
