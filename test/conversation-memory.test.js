import assert from "node:assert/strict";
import test from "node:test";
import { ConversationMemory, createConversationExport, parseConversationExport, recentConversation } from "../src/conversation-memory.js";
import { castHexagram } from "../src/oracle-engine.js";
import { answerIntakeQuestion, createDivinationIntake, prepareIntakeReview } from "../src/divination-intake.js";

function fakeStorage(initial = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
    removeItem: () => { value = null; },
    inspect: () => value,
  };
}

test("conversation memory persists only completed bounded messages", () => {
  const storage = fakeStorage();
  const memory = new ConversationMemory({ storage, limit: 3 });
  memory.save([
    { role: "master", text: "欢迎" },
    { role: "user", text: "第一问" },
    { role: "master", text: "未完成", streaming: true },
    { role: "master", text: "错误", error: true },
    { role: "user", text: "第二问" },
    { role: "master", text: "回答", cloud: true, evidence: [{ id: "A" }] },
  ]);
  assert.deepEqual(memory.load().map(({ text }) => text), ["欢迎", "第二问", "回答"]);
  assert.equal(memory.load()[2].cloud, true);
  memory.clear();
  assert.equal(storage.inspect(), null);
});

test("recent conversation uses the request window and ignores incomplete turns", () => {
  const messages = Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? "master" : "user", text: `m${index}` }));
  messages.push({ role: "master", text: "partial", cancelled: true });
  const recent = recentConversation(messages);
  assert.equal(recent.length, 16);
  assert.equal(recent[0].text, "m4");
  assert.equal(recent.at(-1).text, "m19");
});

test("cancelled or unanswered user turns do not leak into later model context", () => {
  const recent = recentConversation([
    { role: "master", text: "欢迎" },
    { role: "user", text: "写一篇很长的文章" },
    { role: "master", text: "只显示了一点", cancelled: true },
    { role: "user", text: "一加一等于几" },
    { role: "master", text: "等于二" },
    { role: "user", text: "尚未回答的问题" },
  ]);
  assert.deepEqual(recent.map(({ text }) => text), ["欢迎", "一加一等于几", "等于二"]);
});

test("corrupt browser storage fails closed", () => {
  const memory = new ConversationMemory({ storage: fakeStorage("not-json") });
  assert.deepEqual(memory.load(), []);
});

test("conversation memory restores a deterministic reading after refresh", () => {
  const storage = fakeStorage();
  const reading = castHexagram([9, 7, 8, 8, 7, 6]);
  const memory = new ConversationMemory({ storage });
  memory.saveSession({
    messages: [{ role: "user", text: "这次合作应该先验证什么？" }, { role: "master", text: "先看卦。" }],
    stage: "reading",
    question: "这次合作应该先验证什么？",
    reading,
  });

  const restored = memory.loadSession();
  assert.equal(restored.stage, "reading");
  assert.equal(restored.question, "这次合作应该先验证什么？");
  assert.deepEqual(restored.reading.lines, [9, 7, 8, 8, 7, 6]);
  assert.equal(restored.reading.primary.number, reading.primary.number);
  assert.equal(restored.reading.changed.number, reading.changed.number);
});

test("conversation memory restores an unfinished and reviewable intake", () => {
  const storage = fakeStorage();
  let intake = createDivinationIntake("我要不要投这个实习？");
  intake = answerIntakeQuestion(intake, "未来两周");
  const memory = new ConversationMemory({ storage });
  memory.saveSession({
    messages: [{ role: "user", text: "我要不要投这个实习？" }, { role: "master", text: "先理清问题。" }],
    stage: "intake",
    question: intake.originalQuestion,
    intake,
  });
  const restored = memory.loadSession();
  assert.equal(restored.stage, "intake");
  assert.equal(restored.intake.cursor, 1);
  assert.equal(restored.intake.answers.timeframe, "未来两周");

  const review = prepareIntakeReview(restored.intake);
  memory.saveSession({ messages: restored.messages, stage: "intake", question: review.originalQuestion, intake: review });
  assert.equal(memory.loadSession().intake.status, "review");
});

test("legacy message-only snapshots remain readable and corrupt session state is ignored", () => {
  const legacy = fakeStorage(JSON.stringify({ version: 1, messages: [{ role: "user", text: "旧对话" }] }));
  assert.deepEqual(new ConversationMemory({ storage: legacy }).loadSession(), {
    messages: [{ role: "user", text: "旧对话", cloud: false, evidence: [] }],
    stage: "question",
    question: "",
    reading: null,
    intake: null,
  });

  const corrupt = fakeStorage(JSON.stringify({
    version: 2,
    messages: [{ role: "master", text: "保留文字" }],
    session: { stage: "reading", question: "不完整卦", lines: [7, 7] },
  }));
  const restored = new ConversationMemory({ storage: corrupt }).loadSession();
  assert.equal(restored.stage, "question");
  assert.equal(restored.reading, null);
  assert.equal(restored.messages[0].text, "保留文字");
});

test("local session export round-trips completed messages and deterministic reading", () => {
  const reading = castHexagram([9, 7, 8, 8, 7, 6]);
  const document = createConversationExport({
    messages: [
      { role: "user", text: "导出这一卦" },
      { role: "master", text: "已经排好。" },
      { role: "user", text: "未完成问题" },
    ],
    stage: "reading",
    question: "导出这一卦",
    reading,
  }, { now: () => Date.parse("2026-09-23T04:00:00.000Z") });

  assert.equal(document.schema, "shoujian.oracle-session");
  assert.equal(document.exportedAt, "2026-09-23T04:00:00.000Z");
  const imported = parseConversationExport(JSON.stringify(document));
  assert.equal(imported.stage, "reading");
  assert.deepEqual(imported.reading.lines, reading.lines);
  assert.deepEqual(imported.messages.map(({ text }) => text), ["导出这一卦", "已经排好。"]);
});

test("local session import rejects malformed, unsupported, and oversized files", () => {
  assert.throws(() => parseConversationExport("not-json"), /不是有效 JSON/u);
  assert.throws(() => parseConversationExport({ schema: "unknown", version: 1 }), /格式或版本/u);
  assert.throws(() => parseConversationExport(`{"padding":"${"x".repeat(256 * 1024)}"}`), /文件过大/u);
});
