import assert from "node:assert/strict";
import test from "node:test";
import { VoiceConversationController } from "../src/voice-conversation.js";
import { BrowserSpeechRecognizer } from "../src/audio-recorder.js";

class FakeRecognizer {
  supported = true;
  starts = 0;
  start({ onText }) {
    this.starts += 1;
    this.onText = onText;
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    return this.promise;
  }
  stop() { this.resolve?.(this.text ?? ""); return this.promise; }
  abort() { this.reject?.(Object.assign(new Error("aborted"), { name: "AbortError" })); }
  hear(text, detail = {}) { this.text = text; this.onText?.(text, detail); }
}

test("voice conversation only auto-submits after explicit automatic mode is enabled", async () => {
  const recognizer = new FakeRecognizer();
  const submitted = [];
  const timers = [];
  const session = new VoiceConversationController({
    recognizer,
    submit: async (text) => submitted.push(text),
    setTimeoutFn: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeoutFn() {},
  });
  session.start({ autoSubmit: true });
  recognizer.hear("今天想聊工作", { final: "今天想聊工作", interim: "" });
  assert.equal(timers[0].delay, 420);
  timers[0].callback();
  await tick();
  assert.deepEqual(submitted, ["今天想聊工作"]);
  assert.equal(session.snapshot.state, "listening");
});

test("voice recognition never auto-submits when automatic mode was not enabled", async () => {
  const recognizer = new FakeRecognizer();
  const submitted = [];
  const timers = [];
  const session = new VoiceConversationController({
    recognizer,
    submit: async (text) => submitted.push(text),
    setTimeoutFn: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeoutFn() {},
  });
  session.start();
  recognizer.hear("这句话只进草稿", { final: "这句话只进草稿" });
  assert.equal(timers.length, 0);
  assert.deepEqual(submitted, []);
  assert.equal(session.snapshot.transcript, "这句话只进草稿");
  session.stop();
});

test("interim speech waits for the longer silence window", async () => {
  const recognizer = new FakeRecognizer();
  const timers = [];
  const session = new VoiceConversationController({
    recognizer,
    submit: async () => {},
    setTimeoutFn: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeoutFn() {},
  });
  void session.start({ autoSubmit: true });
  recognizer.hear("我还在说", { final: "", interim: "我还在说" });
  assert.equal(timers[0].delay, 1_100);
  session.stop();
});

test("identical browser speech snapshots do not postpone automatic submission", async () => {
  class FakeRecognition {
    constructor() { FakeRecognition.instance = this; }
    start() {}
    stop() { this.onend(); }
    abort() { this.onend(); }
  }
  const timers = [];
  const submitted = [];
  const session = new VoiceConversationController({
    recognizer: new BrowserSpeechRecognizer({ RecognitionClass: FakeRecognition }),
    submit: async (text) => { submitted.push(text); },
    setTimeoutFn: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeoutFn() {},
  });
  session.start({ autoSubmit: true });
  const result = Object.assign([{ transcript: "今天问天气" }], { isFinal: true });
  FakeRecognition.instance.onresult({ resultIndex: 0, results: [result] });
  FakeRecognition.instance.onresult({ resultIndex: 0, results: [result] });
  FakeRecognition.instance.onresult({ resultIndex: 0, results: [result] });
  assert.equal(timers.length, 1);
  timers[0].callback();
  await tick();
  assert.deepEqual(submitted, ["今天问天气"]);
  session.stop();
});

test("quiet recognition endings restart listening with bounded backoff", async () => {
  const recognizer = new FakeRecognizer();
  const timers = [];
  const session = new VoiceConversationController({
    recognizer,
    submit: async () => {},
    setTimeoutFn(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    clearTimeoutFn() {},
  });
  session.start({ autoSubmit: true });
  recognizer.resolve("");
  await tick();
  assert.equal(session.snapshot.state, "listening");
  assert.equal(timers[0].delay, 250);
  timers[0].callback();
  assert.equal(recognizer.starts, 2);
  recognizer.reject(Object.assign(new Error("没有听到清晰语音"), { code: "no_speech" }));
  await tick();
  assert.equal(timers[1].delay, 500);
  session.stop();
  timers[1].callback();
  assert.equal(recognizer.starts, 2);
  assert.equal(session.snapshot.state, "off");
});

test("microphone permission errors do not restart listening", async () => {
  const recognizer = new FakeRecognizer();
  const timers = [];
  const session = new VoiceConversationController({
    recognizer,
    submit: async () => {},
    setTimeoutFn(callback) { timers.push(callback); return timers.length; },
  });
  session.start({ autoSubmit: true });
  recognizer.reject(new Error("麦克风权限未开启"));
  await tick();
  assert.equal(session.snapshot.state, "error");
  assert.match(session.snapshot.error, /麦克风权限/u);
  assert.equal(timers.length, 0);
  session.stop();
});

test("recognition remains paused until both text and speech are complete", async () => {
  const recognizer = new FakeRecognizer();
  let finishTurn;
  const turn = new Promise((resolve) => { finishTurn = resolve; });
  const session = new VoiceConversationController({ recognizer, submit: () => turn });
  void session.start({ autoSubmit: true });
  recognizer.hear("请回答", { final: "请回答" });
  recognizer.stop();
  await tick();
  session.markSpeechState("generating");
  finishTurn();
  await tick();
  assert.equal(session.snapshot.state, "thinking");
  session.markSpeechState("playing");
  assert.equal(session.snapshot.state, "speaking");
  session.markSpeechState("idle");
  await tick();
  assert.equal(session.snapshot.state, "listening");
});

test("interrupt cancels old output and immediately starts a fresh listening turn", async () => {
  const recognizer = new FakeRecognizer();
  let interrupted = 0;
  const session = new VoiceConversationController({
    recognizer,
    submit: () => new Promise(() => {}),
    interruptOutput: () => { interrupted += 1; },
  });
  void session.start({ autoSubmit: true });
  recognizer.hear("旧问题", { final: "旧问题" });
  recognizer.stop();
  await tick();
  assert.equal(session.snapshot.state, "thinking");
  session.interruptAndListen();
  assert.equal(interrupted, 1);
  assert.equal(session.snapshot.state, "listening");
});

test("a late completion from an interrupted turn cannot restart or overwrite the fresh turn", async () => {
  const recognizer = new FakeRecognizer();
  let finishOldTurn;
  const session = new VoiceConversationController({
    recognizer,
    submit: () => new Promise((resolve) => { finishOldTurn = resolve; }),
  });
  session.start({ autoSubmit: true });
  recognizer.hear("旧问题", { final: "旧问题" });
  recognizer.stop();
  await tick();
  session.interruptAndListen();
  assert.equal(session.snapshot.state, "listening");
  finishOldTurn();
  await tick();
  assert.equal(session.snapshot.state, "listening");
  assert.equal(session.snapshot.transcript, "");
  session.stop();
});

test("session records ASR final, first token and first audio latency", async () => {
  const recognizer = new FakeRecognizer();
  let clock = 100;
  let finishTurn;
  const session = new VoiceConversationController({
    recognizer,
    submit: () => new Promise((resolve) => { finishTurn = resolve; }),
    now: () => clock,
  });
  void session.start({ autoSubmit: true });
  clock = 680;
  recognizer.hear("测一下延迟", { final: "测一下延迟" });
  clock = 740;
  recognizer.stop();
  await tick();
  clock = 920;
  session.markFirstToken();
  clock = 1_260;
  session.markSpeechState("playing");
  assert.equal(session.snapshot.metrics.asrFinalMs, 60);
  assert.equal(session.snapshot.metrics.firstTokenMs, 180);
  assert.equal(session.snapshot.metrics.firstAudioMs, 520);
  session.markSpeechState("idle");
  finishTurn();
  await tick();
  session.stop();
});

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}
