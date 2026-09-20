import assert from "node:assert/strict";
import test from "node:test";
import { StreamingTextRevealer, characterDelay } from "../src/streaming-text.js";

test("streaming revealer preserves chunk order and updates progressively", async () => {
  const updates = [];
  const revealer = new StreamingTextRevealer({ onText: (text) => updates.push(text), waitFn: async () => {} });
  revealer.enqueue("今天");
  revealer.enqueue("很好。");
  assert.equal(await revealer.finish(), "今天很好。");
  assert.equal(updates[0], "今");
  assert.equal(updates.at(-1), "今天很好。");
});

test("large backlogs accelerate without abandoning character-level updates", async () => {
  const delays = [];
  const updates = [];
  const input = "字".repeat(200);
  const revealer = new StreamingTextRevealer({
    onText: (text) => updates.push(text.length),
    waitFn: async (delay) => { delays.push(delay); },
  });
  revealer.enqueue(input);
  assert.equal(await revealer.finish(), input);
  assert.equal(updates.length, 200);
  assert.equal(delays[0], 1);
  assert.equal(delays.at(-1), 9);
});

test("reduced motion reveals each network chunk immediately", async () => {
  let waits = 0;
  const updates = [];
  const revealer = new StreamingTextRevealer({
    reducedMotion: true,
    onText: (text) => updates.push(text),
    waitFn: async () => { waits += 1; },
  });
  revealer.enqueue("第一段");
  revealer.enqueue("第二段");
  assert.equal(await revealer.finish(), "第一段第二段");
  assert.deepEqual(updates, ["第一段", "第一段第二段"]);
  assert.equal(waits, 0);
  assert.equal(characterDelay("。", 0), 36);
});

