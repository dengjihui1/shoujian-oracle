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

test("divination preparation sanitizes reading and binds the fixed question to retrieval", () => {
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
      primary: {
        number: 1,
        fullName: "乾为天以及应被截断的额外文字",
        lower: { name: "乾乾乾乾乾", image: "天天天天天" },
        upper: { name: "乾", image: "天" },
      },
      movingLines: [1, 7, "2", 6],
      changed: { fullName: "坤为地" },
    },
  }, fakeKnowledge(evidence, calls), FIXED_NOW);

  assert.equal(prepared.route, "grounded");
  assert.equal(prepared.knowledgeReason, "divination");
  assert.deepEqual(prepared.evidence, evidence);
  assert.equal(calls[0].query, "结合本卦解释动爻\n未来三个月是否继续项目");
  assert.deepEqual(calls[0].reading.movingLines, [1, 6]);
  assert.equal(calls[0].reading.primary.lower.name.length, 4);
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

function fakeKnowledge(evidence, calls = []) {
  return {
    retrieve(request) {
      calls.push(request);
      return evidence;
    },
  };
}
