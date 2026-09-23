import assert from "node:assert/strict";
import test from "node:test";
import { StreamingSpeechQueue } from "../src/speech-queue.js";

test("speech queue prefetches two sentences but always plays in order", async () => {
  const pending = new Map();
  const synthesized = [];
  const played = [];
  const queue = new StreamingSpeechQueue({
    synthesize(text) {
      synthesized.push(text);
      return new Promise((resolve) => pending.set(text, resolve));
    },
    async play(audio) {
      played.push(audio);
      return { ended: Promise.resolve(), stop() {} };
    },
  });

  queue.enqueue("一。");
  queue.enqueue("二。");
  queue.enqueue("三。");
  assert.deepEqual(synthesized, ["一。", "二。"]);
  pending.get("二。")("audio-2");
  await tick();
  assert.deepEqual(played, []);
  pending.get("一。")("audio-1");
  await tick();
  assert.deepEqual(played, ["audio-1", "audio-2"]);
  assert.deepEqual(synthesized, ["一。", "二。", "三。"]);
  pending.get("三。")("audio-3");
  await queue.close();
  assert.deepEqual(played, ["audio-1", "audio-2", "audio-3"]);
});

test("cancelling speech aborts pending synthesis and returns to idle", async () => {
  let signal;
  const states = [];
  const queue = new StreamingSpeechQueue({
    synthesize(_text, options) {
      signal = options.signal;
      return new Promise(() => {});
    },
    play() { throw new Error("must not play"); },
    onState: (state) => states.push(state),
  });
  queue.enqueue("旧回答。");
  queue.cancel();
  await queue.done;
  assert.equal(signal.aborted, true);
  assert.deepEqual(states, ["generating", "idle"]);
});

test("prefetch window does not synthesize the whole answer ahead of playback", async () => {
  const synthesized = [];
  let releaseFirstPlayback;
  let releaseSecondPlayback;
  const firstPlaybackEnded = new Promise((resolve) => { releaseFirstPlayback = resolve; });
  const secondPlaybackEnded = new Promise((resolve) => { releaseSecondPlayback = resolve; });
  const queue = new StreamingSpeechQueue({
    async synthesize(text) {
      synthesized.push(text);
      return text;
    },
    async play(audio) {
      const ended = audio === "一。" ? firstPlaybackEnded : audio === "二。" ? secondPlaybackEnded : Promise.resolve();
      return { ended, stop() {} };
    },
  });
  queue.enqueue("一。");
  queue.enqueue("二。");
  queue.enqueue("三。");
  queue.enqueue("四。");
  await tick();
  assert.deepEqual(synthesized, ["一。", "二。"]);
  releaseFirstPlayback();
  await tick();
  assert.deepEqual(synthesized, ["一。", "二。", "三。"]);
  releaseSecondPlayback();
  await queue.close();
  assert.deepEqual(synthesized, ["一。", "二。", "三。", "四。"]);
});

test("speech stays in generating until playback actually starts", async () => {
  const states = [];
  let beginPlayback;
  let endPlayback;
  const queue = new StreamingSpeechQueue({
    async synthesize() { return "audio"; },
    async play(_audio, { onStart }) {
      beginPlayback = onStart;
      return { ended: new Promise((resolve) => { endPlayback = resolve; }), stop() {} };
    },
    onState: (state) => states.push(state),
  });
  queue.enqueue("一句话。");
  await tick();
  assert.deepEqual(states, ["generating"]);
  beginPlayback();
  assert.deepEqual(states, ["generating", "playing"]);
  endPlayback();
  await queue.close();
  assert.equal(states.at(-1), "idle");
});

test("late playback start after cancellation cannot revive the voice state", async () => {
  const states = [];
  let beginPlayback;
  const queue = new StreamingSpeechQueue({
    async synthesize() { return "audio"; },
    async play(_audio, { onStart }) {
      beginPlayback = onStart;
      return { ended: new Promise(() => {}), stop() {} };
    },
    onState: (state) => states.push(state),
  });
  queue.enqueue("旧回答。");
  await tick();
  queue.cancel();
  beginPlayback();
  assert.deepEqual(states, ["generating", "idle"]);
});

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}
