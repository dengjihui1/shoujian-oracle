import test from "node:test";
import assert from "node:assert/strict";
import { castHexagram, castWithCoins, coinsToLine } from "../src/oracle-engine.js";

test("three-coin values map to 6 through 9", () => {
  assert.equal(coinsToLine([2, 2, 2]), 6); assert.equal(coinsToLine([3, 2, 2]), 7);
  assert.equal(coinsToLine([3, 3, 2]), 8); assert.equal(coinsToLine([3, 3, 3]), 9);
});
test("all young yang lines form Qian", () => {
  const reading = castHexagram([7, 7, 7, 7, 7, 7]);
  assert.equal(reading.primary.number, 1); assert.equal(reading.primary.fullName, "乾为天"); assert.equal(reading.changed, null);
});
test("all old yang lines change from Qian to Kun", () => {
  const reading = castWithCoins(() => true);
  assert.equal(reading.primary.fullName, "乾为天"); assert.equal(reading.changed.fullName, "坤为地");
  assert.deepEqual(reading.movingLines, [1, 2, 3, 4, 5, 6]);
});
test("line order is bottom to top", () => {
  const reading = castHexagram([7, 8, 8, 8, 7, 7]);
  assert.equal(reading.primary.lower.name, "震"); assert.equal(reading.primary.upper.name, "巽"); assert.equal(reading.primary.number, 42);
});
test("invalid casts fail closed", () => {
  assert.throws(() => coinsToLine([1, 2, 3]), /exactly three/); assert.throws(() => castHexagram([7]), /six values/);
});

