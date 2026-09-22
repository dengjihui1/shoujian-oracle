import assert from "node:assert/strict";
import test from "node:test";
import { deriveAvatarMotion, mouthStateForLevel } from "../src/avatar-motion.js";

test("avatar motions give conversation states distinct physical intent", () => {
  assert.equal(deriveAvatarMotion("idle").key, "idle-breath");
  assert.equal(deriveAvatarMotion("listening").key, "listen-lean");
  assert.equal(deriveAvatarMotion("heard").key, "acknowledge");
  assert.equal(deriveAvatarMotion("thinking").key, "ponder");
  assert.equal(deriveAvatarMotion("interrupted").key, "interrupt-recover");
  assert.equal(deriveAvatarMotion("reading").key, "present-reading");
});

test("mouth stays closed without audible speech energy", () => {
  assert.equal(mouthStateForLevel("speaking", 0), "closed");
  assert.equal(mouthStateForLevel("speaking", 0.079), "closed");
  assert.equal(mouthStateForLevel("speaking", 0.4), "audio");
  assert.equal(mouthStateForLevel("thinking", 0.9), "closed");
  assert.equal(mouthStateForLevel("interrupted", 1), "closed");
});

test("unknown presentation state falls back to a calm closed-mouth idle motion", () => {
  assert.deepEqual(deriveAvatarMotion("unknown"), deriveAvatarMotion("idle"));
  assert.equal(mouthStateForLevel("unknown", 1), "closed");
});
