import assert from "node:assert/strict";
import test from "node:test";
import { AudioRecorder, BrowserSpeechRecognizer } from "../src/audio-recorder.js";

test("browser speech recognition exposes interim text and resolves final text", async () => {
  class FakeRecognition {
    constructor() { FakeRecognition.instance = this; }
    start() {}
    stop() { this.onend(); }
    abort() { this.onend(); }
  }

  const updates = [];
  const recognizer = new BrowserSpeechRecognizer({ RecognitionClass: FakeRecognition });
  const result = recognizer.start({ onText: (text) => updates.push(text) });
  FakeRecognition.instance.onresult({
    resultIndex: 0,
    results: [Object.assign([{ transcript: "你好" }], { isFinal: false })],
  });
  FakeRecognition.instance.onresult({
    resultIndex: 0,
    results: [Object.assign([{ transcript: "你好，我叫小明" }], { isFinal: true })],
  });
  recognizer.stop();

  assert.equal(await result, "你好，我叫小明");
  assert.deepEqual(updates, ["你好", "你好，我叫小明"]);
  assert.equal(recognizer.active, false);
});

test("browser speech recognition converts provider errors into stable Chinese messages", async () => {
  class FakeRecognition {
    constructor() { FakeRecognition.instance = this; }
    start() {}
    abort() { this.onend(); }
  }
  const recognizer = new BrowserSpeechRecognizer({ RecognitionClass: FakeRecognition });
  const result = recognizer.start();
  FakeRecognition.instance.onerror({ error: "no-speech" });
  await assert.rejects(result, /没有听到清晰语音/u);
  assert.equal(recognizer.active, false);
});

test("cancelling live recognition rejects as an intentional abort", async () => {
  class FakeRecognition {
    constructor() { FakeRecognition.instance = this; }
    start() {}
    abort() { this.onend(); }
  }
  const recognizer = new BrowserSpeechRecognizer({ RecognitionClass: FakeRecognition });
  const result = recognizer.start();
  recognizer.abort();
  await assert.rejects(result, (error) => error.name === "AbortError" && /已取消/u.test(error.message));
  assert.equal(recognizer.active, false);
});

test("recording errors release the microphone track", async () => {
  let stopped = 0;
  class FakeRecorder {
    static isTypeSupported() { return true; }
    constructor() { FakeRecorder.instance = this; this.mimeType = "audio/webm"; this.listeners = {}; }
    addEventListener(name, handler) { this.listeners[name] = handler; }
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; this.listeners.stop?.(); }
  }
  const recorder = new AudioRecorder({
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped += 1; } }] }) },
    MediaRecorderClass: FakeRecorder,
  });
  await recorder.start();
  FakeRecorder.instance.listeners.error();
  await assert.rejects(recorder.result, /录音失败/u);
  assert.equal(stopped, 1);
});

test("recorder construction failures also release the microphone track", async () => {
  let stopped = 0;
  class BrokenRecorder {
    static isTypeSupported() { return false; }
    constructor() { throw new Error("unsupported recorder"); }
  }
  const recorder = new AudioRecorder({
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped += 1; } }] }) },
    MediaRecorderClass: BrokenRecorder,
  });
  await assert.rejects(() => recorder.start(), /unsupported recorder/u);
  assert.equal(stopped, 1);
});
