import assert from "node:assert/strict";
import test from "node:test";
import { BrowserSpeechRecognizer } from "../src/audio-recorder.js";

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

