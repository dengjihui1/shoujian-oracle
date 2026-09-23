import assert from "node:assert/strict";
import test from "node:test";
import { BrowserSpeechPlayer, selectMandarinVoice } from "../src/browser-speech.js";

test("Mandarin voice selection prefers a local male voice hint", () => {
  const voices = [
    { name: "English Male", lang: "en-US", localService: true },
    { name: "Google 普通话", lang: "zh-CN", localService: false },
    { name: "Microsoft Yunxi", lang: "zh-CN", localService: true },
  ];
  assert.equal(selectMandarinVoice(voices), voices[2]);
});

test("Mandarin voice selection keeps synthesis local when a local voice exists", () => {
  const voices = [
    { name: "Microsoft Yunjian Online", lang: "zh-CN", localService: false },
    { name: "系统普通话", lang: "zh-CN", localService: true },
  ];
  assert.equal(selectMandarinVoice(voices), voices[1]);
});

test("browser speech starts without a network synthesis phase and remains cancellable", async () => {
  let utterance;
  let cancelled = false;
  class FakeUtterance {
    constructor(text) { this.text = text; }
  }
  const player = new BrowserSpeechPlayer({
    UtteranceClass: FakeUtterance,
    speechSynthesis: {
      getVoices: () => [{ name: "Microsoft Yunxi", lang: "zh-CN" }],
      speak(value) { utterance = value; value.onstart(); },
      cancel() { cancelled = true; },
    },
    setIntervalFn: () => 1,
    clearIntervalFn() {},
  });
  const levels = [];
  const payload = player.prepare("先把小事做稳。");
  const playback = await player.play(payload, { onLevel: (level) => levels.push(level) });
  assert.equal(utterance.text, "先把小事做稳。");
  assert.equal(utterance.lang, "zh-CN");
  assert.equal(utterance.voice.name, "Microsoft Yunxi");
  assert.ok(levels.some((level) => level > 0));
  playback.stop();
  await playback.ended;
  assert.equal(cancelled, true);
  assert.equal(levels.at(-1), 0);
});

test("browser speech reports unsupported environments before playback", () => {
  const player = new BrowserSpeechPlayer({ speechSynthesis: null, UtteranceClass: null });
  assert.equal(player.supported, false);
  assert.throws(() => player.prepare("测试"), /不支持极速本机语音/u);
});

test("browser speech reports first sound only after onstart and recovers if speech never starts", async () => {
  let utterance;
  let timeout;
  let cancelled = 0;
  let starts = 0;
  class FakeUtterance {
    constructor(text) { this.text = text; }
  }
  const player = new BrowserSpeechPlayer({
    UtteranceClass: FakeUtterance,
    speechSynthesis: {
      getVoices: () => [],
      speak(value) { utterance = value; },
      cancel() { cancelled += 1; },
    },
    setTimeoutFn(callback) { timeout = callback; return 1; },
    clearTimeoutFn() {},
  });
  const playback = await player.play(player.prepare("你好。"), { onStart: () => { starts += 1; } });
  assert.equal(starts, 0);
  timeout();
  await assert.rejects(playback.ended, /未能开始播放/u);
  utterance.onstart();
  assert.equal(starts, 0);
  assert.equal(cancelled, 1);
});
