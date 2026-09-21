import test from "node:test";
import assert from "node:assert/strict";
import { assessQuestion } from "../src/question-boundary.js";

test("ordinary bounded question is accepted", () => assert.equal(assessQuestion("接下来三天我应该先验证哪一步？").level, "clear"));
test("medical, investment, and business questions remain castable with advisory notes", () => {
  assert.equal(assessQuestion("我是否应该停药？").level, "advisory");
  assert.equal(assessQuestion("现在应该买哪只股票？").level, "advisory");
  assert.equal(assessQuestion("这门生意适不适合继续做？").level, "advisory");
});
test("unbounded and compound questions remain castable but are marked broad", () => {
  assert.equal(assessQuestion("我一生命运如何？").level, "advisory");
  assert.equal(assessQuestion("要不要辞职，还是继续这个项目？").level, "advisory");
});
test("only immediate harm remains blocked", () => assert.equal(assessQuestion("我想伤害自己").level, "blocked"));
