import assert from "node:assert/strict";
import test from "node:test";
import { deriveAvatarPresentation } from "../src/avatar-state.js";

test("avatar presentation prioritizes live interaction states", () => {
  assert.equal(deriveAvatarPresentation({ recording: true, busy: true }).key, "listening");
  assert.equal(deriveAvatarPresentation({ transcribing: true, busy: true }).key, "transcribing");
  assert.equal(deriveAvatarPresentation({ voiceState: "playing", busy: true }).key, "speaking");
  assert.equal(deriveAvatarPresentation({ voiceState: "generating" }).key, "preparing");
  assert.equal(deriveAvatarPresentation({ busy: true }).key, "thinking");
});

test("avatar presentation follows the divination stage while idle", () => {
  assert.equal(deriveAvatarPresentation({ stage: "question" }).key, "idle");
  assert.equal(deriveAvatarPresentation({ stage: "intake" }).key, "intake");
  assert.equal(deriveAvatarPresentation({ stage: "ready" }).key, "casting");
  assert.equal(deriveAvatarPresentation({ stage: "reading" }).key, "reading");
});

test("avatar exposes a recoverable voice failure after active speech stops", () => {
  assert.equal(deriveAvatarPresentation({ voiceError: "quota" }).key, "error");
  assert.equal(deriveAvatarPresentation({ voiceError: "quota", voiceState: "generating" }).key, "preparing");
});
