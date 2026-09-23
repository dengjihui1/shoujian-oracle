import assert from "node:assert/strict";
import test from "node:test";
import { VoiceConversationController } from "../src/voice-conversation.js";

class FakeRecognizer {
  supported = true;
  start({ onText }) {
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
