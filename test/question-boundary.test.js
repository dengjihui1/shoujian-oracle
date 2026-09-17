import test from "node:test";
import assert from "node:assert/strict";
import { assessQuestion } from "../src/question-boundary.js";

test("ordinary bounded question is accepted", () => assert.equal(assessQuestion("接下来三天我应该先验证哪一步？").level, "clear"));
test("medical and investment decisions are blocked", () => {
  assert.equal(assessQuestion("我是否应该停药？").level, "blocked"); assert.equal(assessQuestion("现在应该买哪只股票？").level, "blocked");
});
test("unbounded fate and compound questions require rewriting", () => {
  assert.equal(assessQuestion("我一生命运如何？").level, "rewrite"); assert.equal(assessQuestion("要不要辞职，还是继续这个项目？").level, "rewrite");
});

