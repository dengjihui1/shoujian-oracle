import assert from "node:assert/strict";
import test from "node:test";
import { CloudTurnRecognizer, ResilientTurnRecognizer } from "../src/cloud-turn-recognizer.js";

function setup(level, options = {}) {
  let tick;
  let released = false;
  const recorder = {
    supported: true, stream: {},
    async start() {},
    async stop() { return new Blob(["voice"], { type: "audio/webm" }); },
    async cancel() { released = true; },
  };
  class Context {
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() { return { fftSize: 0, connect() {}, getFloatTimeDomainData(samples) { samples.fill(typeof level === "function" ? level() : level); } }; }
    createGain() { return { gain: { value: 1 }, connect() {} }; }
    async close() {}
  }
  const recognizer = new CloudTurnRecognizer({ recorder, AudioContextClass: Context,
    transcribe: async () => ({ text: "这是一轮语音" }),
    setIntervalFn: (callback) => { tick = callback; return 1; }, clearIntervalFn() {}, ...options });
  return { recognizer, step: () => tick(), released: () => released };
}

test("automatic cloud turn stops after speech and sends one recording", async () => {
  const voice = setup(0.1, { silenceMs: 0 });
  let speechEnd = 0;
  const result = voice.recognizer.start({ onSpeechEnd: () => speechEnd++ });
  await Promise.resolve();
  voice.step();
  assert.equal(await result, "这是一轮语音");
  assert.equal(speechEnd, 1);
  assert.equal(voice.released(), true);
});

test("silence does not send an empty recording to the server", async () => {
  let calls = 0;
  const voice = setup(0, { noSpeechMs: 0, transcribe: async () => { calls++; return { text: "" }; } });
  const result = voice.recognizer.start();
  await Promise.resolve();
  voice.step();
  await assert.rejects(result, { code: "no_speech" });
  assert.equal(calls, 0);
  assert.equal(voice.released(), true);
});

test("browser network failure switches to the automatic cloud turn", async () => {
  let fallback = 0;
  const browser = { supported: true, async start() { throw Object.assign(new Error("network"), { code: "network_unavailable" }); }, abort() {} };
  const cloud = { supported: true, async start() { return "云端听清了"; }, abort() {} };
  const recognizer = new ResilientTurnRecognizer({ browser, cloud, onFallback: () => fallback++ });
  assert.equal(await recognizer.start(), "云端听清了");
  assert.equal(fallback, 1);
});

test("Google stream is preferred and browser takes over a stream outage", async () => {
  const calls = [];
  const stream = { supported: true, enabled: true, async start() { calls.push("google"); throw Object.assign(new Error("offline"), { code: "stream_unavailable" }); }, abort() {} };
  const browser = { supported: true, async start() { calls.push("browser"); return "已听清"; }, abort() {} };
  const recognizer = new ResilientTurnRecognizer({ stream, browser, cloud: { supported: false }, onFallback: () => calls.push("fallback") });
  assert.equal(await recognizer.start(), "已听清");
  assert.deepEqual(calls, ["google", "fallback", "browser"]);
  assert.equal(stream.enabled, false);
});

test("automatic turn waits for a real pause after speech", async () => {
  let time = 0;
  let level = 0.1;
  const voice = setup(() => level, { now: () => time, silenceMs: 850 });
  let settled = false;
  const result = voice.recognizer.start().then((text) => { settled = true; return text; });
  await Promise.resolve();
  voice.step();
  level = 0;
  time = 500;
  voice.step();
  await Promise.resolve();
  assert.equal(settled, false);
  time = 900;
  voice.step();
  assert.equal(await result, "这是一轮语音");
});

test("cancelling a listening turn does not upload audio", async () => {
  let uploads = 0;
  const voice = setup(0, { transcribe: async () => { uploads++; return { text: "" }; } });
  const result = voice.recognizer.start();
  await Promise.resolve();
  voice.recognizer.abort();
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(uploads, 0);
  assert.equal(voice.released(), true);
});
