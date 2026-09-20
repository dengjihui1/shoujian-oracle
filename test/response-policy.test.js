import test from "node:test";
import assert from "node:assert/strict";
import { assessQuestion } from "../src/question-boundary.js";
import { crisisSupportReply, divinationBoundaryReply, inferConversationPurpose, resolveResponsePolicy } from "../src/response-policy.js";

test("ordinary chat stays open even when it mentions a professional domain", () => {
  const policy = resolveResponsePolicy({ message: "基金是什么？", purpose: "chat", stage: "question" });
  assert.equal(policy.action, "allow");
  assert.equal(policy.purpose, "chat");
});

test("immediate-harm chat receives practical crisis support without divination wording", () => {
  const policy = resolveResponsePolicy({ message: "如果有人想伤害自己，现在应该怎么办？", purpose: "chat", stage: "question" });
  assert.equal(policy.action, "respond");
  assert.equal(policy.kind, "crisis-support");
  assert.equal(policy.response.blocked, undefined);
  assert.doesNotMatch(policy.response.text, /不能替你起卦/u);
  assert.match(policy.response.text, /110 或 120/u);
  assert.match(policy.response.text, /不要让当事人独处/u);
  assert.match(policy.response.text, /具体计划、工具或正在实施/u);
});

test("investment divination stops the decision but offers two safe continuations", () => {
  const assessment = assessQuestion("未来三天我是否应该买这只股票？");
  const text = divinationBoundaryReply(assessment);
  assert.match(text, /不能由卦象替你作现实决定/u);
  assert.match(text, /直接问我/u);
  assert.match(text, /若想继续起卦/u);
  assert.match(text, /风险信息/u);
});

test("immediate-harm divination prioritizes real-world safety", () => {
  const assessment = assessQuestion("我是否应该伤害自己？");
  const text = divinationBoundaryReply(assessment);
  assert.match(text, /人身安全不能交给卦象决定/u);
  assert.match(text, /最近的急诊/u);
});

test("crisis response is deterministic and directly reusable", () => {
  assert.equal(crisisSupportReply(), crisisSupportReply());
});

test("reading-stage scope keeps oracle follow-ups grounded without trapping ordinary chat", () => {
  assert.equal(inferConversationPurpose("这卦的动爻怎么理解？", "reading"), "divination");
  assert.equal(inferConversationPurpose("它和我的原问有什么关系？", "reading"), "divination");
  assert.equal(inferConversationPurpose("你是谁？", "reading"), "chat");
  assert.equal(inferConversationPurpose("基金是什么？", "reading"), "chat");
});

test("an explicitly ordinary question remains chat even when a reading exists", () => {
  const policy = resolveResponsePolicy({ message: "基金是什么？", purpose: "chat", stage: "reading" });
  assert.equal(policy.action, "allow");
  assert.equal(policy.purpose, "chat");
});
