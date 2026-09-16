import test from "node:test";
import assert from "node:assert/strict";
import { buildReading, castHexagram, coinsToLine } from "../src/oracle-engine.js";

test("three-coin values map to stable line states", () => {
  assert.deepEqual(coinsToLine([2, 2, 2]), { value: 6, yang: false, moving: true });
  assert.deepEqual(coinsToLine([3, 2, 2]), { value: 7, yang: true, moving: false });
  assert.deepEqual(coinsToLine([3, 3, 2]), { value: 8, yang: false, moving: false });
  assert.deepEqual(coinsToLine([3, 3, 3]), { value: 9, yang: true, moving: true });
});

test("six all-head casts form moving heaven over heaven", () => {
  const reading = castHexagram(() => true);
  assert.equal(reading.primary.label, "天天 · 乾上乾下");
  assert.equal(reading.changed.label, "地地 · 坤上坤下");
  assert.deepEqual(reading.movingLines, [1, 2, 3, 4, 5, 6]);
});

test("line order is bottom to top and question text is not an engine input", () => {
  const reading = buildReading([
    { value: 7 }, { value: 8 }, { value: 8 },
    { value: 8 }, { value: 7 }, { value: 7 }
  ]);
  assert.equal(reading.primary.lower.name, "震");
  assert.equal(reading.primary.upper.name, "巽");
  assert.deepEqual(reading.movingLines, []);
});

test("invalid casts fail closed", () => {
  assert.throws(() => coinsToLine([1, 2, 3]), /exactly three/);
  assert.throws(() => buildReading([{ value: 7 }]), /six lines/);
});

