import assert from "node:assert/strict";
import test from "node:test";
import { ConversationMemory, recentConversation } from "../src/conversation-memory.js";

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
  assert.deepEqual(memory.load().map(({ text }) => text), ["第一问", "第二问", "回答"]);
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

test("corrupt browser storage fails closed", () => {
  const memory = new ConversationMemory({ storage: fakeStorage("not-json") });
  assert.deepEqual(memory.load(), []);
});

