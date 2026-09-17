import test from "node:test";
import assert from "node:assert/strict";
import { castHexagram } from "../src/oracle-engine.js";
import { detectIntent, followUpReply, readingReply } from "../src/dialogue-engine.js";

const reading = castHexagram([7, 8, 8, 8, 7, 7]);
test("dialogue router exposes a small auditable intent set", () => {
  assert.equal(detectIntent("这个卦是什么意思"), "meaning"); assert.equal(detectIntent("动爻怎么看"), "moving");
  assert.equal(detectIntent("你是怎么算的"), "method"); assert.equal(detectIntent("请预测中奖号码"), "unknown");
});
test("reading reply uses computed result rather than question text", () => {
  assert.match(readingReply(reading), /第42卦/); assert.match(followUpReply("怎么算的", reading).text, /六爻自下而上/);
});
test("restart intent is an explicit state transition", () => assert.equal(followUpReply("我想再问一件事", reading).action, "restart"));
