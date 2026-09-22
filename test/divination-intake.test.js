import assert from "node:assert/strict";
import test from "node:test";
import { answerIntakeQuestion, buildIntakeSummary, confirmIntakeSummary, createDivinationIntake, currentIntakeQuestion, prepareIntakeReview, restoreDivinationIntake, serializeDivinationIntake, skipIntakeQuestion } from "../src/divination-intake.js";

test("a broad question receives only bounded, reality-based intake prompts", () => {
  const intake = createDivinationIntake("这段感情怎么样？");
  assert.equal(intake.status, "collecting");
  assert.ok(intake.questions.length >= 2);
  assert.ok(intake.questions.length <= 4);
  assert.ok(intake.questions.every(({ prompt }) => !/生辰|八字|出生/u.test(prompt)));
  assert.match(currentIntakeQuestion(intake).prompt, /什么时候/u);
});

test("details already present in the question avoid redundant prompts", () => {
  const intake = createDivinationIntake("未来三个月，我是否继续已经投入半年的项目？现在最担心现金流。 ");
  assert.deepEqual(intake.questions.map(({ id }) => id), ["priority", "uncertainty"]);
});

test("answers advance into an editable review without casting anything", () => {
  let intake = createDivinationIntake("我要不要投这个实习？");
  while (intake.status === "collecting") intake = answerIntakeQuestion(intake, `回答-${intake.cursor + 1}`);
  assert.equal(intake.status, "review");
  assert.match(intake.summary, /所问：我要不要投这个实习/u);
  assert.match(intake.summary, /回答-1/u);
  assert.equal("reading" in intake, false);
  assert.equal("lines" in intake, false);
});

test("a user may skip a question or organize the information early", () => {
  const skipped = skipIntakeQuestion(createDivinationIntake("我最近的生意怎么样？"));
  assert.equal(skipped.skipped.length, 1);
  const review = prepareIntakeReview(skipped);
  assert.equal(review.status, "review");
  assert.match(buildIntakeSummary(review), /未补充/u);
});

test("summary confirmation freezes the user's edited wording", () => {
  const review = prepareIntakeReview(createDivinationIntake("要不要继续这个项目？"));
  const confirmed = confirmIntakeSummary(review, "所问：未来三个月是否继续项目\n关键约束：现金流上限 2 万元");
  assert.equal(confirmed.status, "confirmed");
  assert.match(confirmed.summary, /现金流上限 2 万元/u);
});

test("serialized intake restores deterministically and rejects malformed state", () => {
  const intake = answerIntakeQuestion(createDivinationIntake("是否接受这个 offer？"), "未来两周");
  assert.deepEqual(restoreDivinationIntake(serializeDivinationIntake(intake)), intake);
  assert.equal(restoreDivinationIntake({ status: "collecting" }), null);
});
