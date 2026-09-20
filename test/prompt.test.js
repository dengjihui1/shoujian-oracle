import assert from "node:assert/strict";
import test from "node:test";
import { buildSystemInstruction, formatShanghaiDateTime } from "../server/prompt.mjs";

test("question stage supports ordinary conversation without inventing a reading", () => {
  const prompt = buildSystemInstruction({ stage: "question", question: "", reading: null, evidence: [] });
  assert.match(prompt, /普通问候、身份、能力、使用方法和一般基础问题直接自然回答/u);
  assert.match(prompt, /不得声称已经看见卦象/u);
  assert.match(prompt, /不需要装饰性引用/u);
});

test("prompt keeps professional-domain conversation open while refusing decisions", () => {
  const prompt = buildSystemInstruction({ stage: "question", reading: null, evidence: [] });
  assert.match(prompt, /不要因为出现专业领域关键词就拒绝整段对话/u);
  assert.match(prompt, /安全路径/u);
});

test("server time is formatted in Asia/Shanghai and injected as the trusted date", () => {
  const currentDateTime = formatShanghaiDateTime("2026-09-19T16:30:45.000Z");
  assert.equal(currentDateTime, "2026年09月20日 00:30:45（Asia/Shanghai）");
  const prompt = buildSystemInstruction({ stage: "question", reading: null, evidence: [], currentDateTime });
  assert.match(prompt, /可信服务器时钟：2026年09月20日 00:30:45/u);
  assert.match(prompt, /今天几号.*可信服务器时钟/u);
  assert.match(prompt, /浏览器本机记忆在刷新后恢复/u);
});
