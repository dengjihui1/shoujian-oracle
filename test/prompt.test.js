import assert from "node:assert/strict";
import test from "node:test";
import { buildSystemInstruction } from "../server/prompt.mjs";

test("question stage supports ordinary conversation without inventing a reading", () => {
  const prompt = buildSystemInstruction({ stage: "question", question: "", reading: null, evidence: [] });
  assert.match(prompt, /普通问候、身份、能力、使用方法和一般基础问题直接自然回答/u);
  assert.match(prompt, /不得声称已经看见卦象/u);
  assert.match(prompt, /不需要装饰性引用/u);
});
