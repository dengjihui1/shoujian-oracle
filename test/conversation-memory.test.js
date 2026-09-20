import assert from "node:assert/strict";
import test from "node:test";
import { ConversationMemory, recentConversation } from "../src/conversation-memory.js";
import { castHexagram } from "../src/oracle-engine.js";

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

test("legacy message-only snapshots remain readable and corrupt session state is ignored", () => {
  const legacy = fakeStorage(JSON.stringify({ version: 1, messages: [{ role: "user", text: "旧对话" }] }));
  assert.deepEqual(new ConversationMemory({ storage: legacy }).loadSession(), {
    messages: [{ role: "user", text: "旧对话", cloud: false, evidence: [] }],
    stage: "question",
    question: "",
    reading: null,
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
