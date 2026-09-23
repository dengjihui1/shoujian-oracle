import test from "node:test";
import assert from "node:assert/strict";
import { calculateVoiceLevel, pcm16BytesToFloat32, pcmToWav, playPcmBase64 } from "../src/audio-player.js";

test("PCM output is wrapped in a playable mono 24 kHz WAV container", () => {
  const wav = pcmToWav(Uint8Array.from([1, 2, 3, 4]));
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), "RIFF");
  assert.equal(new DataView(wav.buffer).getUint32(24, true), 24_000);
  assert.equal(new DataView(wav.buffer).getUint32(40, true), 4);
  assert.deepEqual([...wav.slice(44)], [1, 2, 3, 4]);
});

test("PCM16 samples are converted to normalized floats for Web Audio", () => {
  const bytes = Uint8Array.from([0x00, 0x80, 0x00, 0x00, 0xff, 0x7f]);
  const samples = pcm16BytesToFloat32(bytes);
  assert.deepEqual([...samples], [-1, 0, 1]);
});

test("voice level ignores silence and scales audible samples", () => {
  assert.equal(calculateVoiceLevel(new Float32Array(32)), 0);
  assert.ok(calculateVoiceLevel(Float32Array.from([0.25, -0.25, 0.25, -0.25])) > 0.9);
});

test("HTML audio fallback remains cancellable while play is pending", async () => {
  const OriginalAudio = globalThis.Audio;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let audio;
  let revoked = 0;
  try {
    globalThis.Audio = class {
      constructor() { audio = this; this.handlers = new Map(); }
      addEventListener(name, handler) { this.handlers.set(name, handler); }
      play() { return new Promise(() => {}); }
      pause() { this.paused = true; }
      removeAttribute() {}
    };
    URL.createObjectURL = () => "blob:test-audio";
    URL.revokeObjectURL = () => { revoked += 1; };
    let starts = 0;
    const playback = await playPcmBase64("AQI=", { onStart: () => { starts += 1; } });
    assert.equal(starts, 0);
    playback.stop();
    await playback.ended;
    assert.equal(audio.paused, true);
    assert.equal(revoked, 1);
  } finally {
    globalThis.Audio = OriginalAudio;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});

test("HTML audio fallback reports an error after playback starts", async () => {
  const OriginalAudio = globalThis.Audio;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let audio;
  try {
    globalThis.Audio = class {
      constructor() { audio = this; this.handlers = new Map(); }
      addEventListener(name, handler) { this.handlers.set(name, handler); }
      play() { return Promise.resolve(); }
    };
    URL.createObjectURL = () => "blob:test-audio";
    URL.revokeObjectURL = () => {};
    let starts = 0;
    const playback = await playPcmBase64("AQI=", { onStart: () => { starts += 1; } });
    audio.handlers.get("playing")();
    assert.equal(starts, 1);
    audio.handlers.get("error")();
    await assert.rejects(playback.ended, /音频播放失败/u);
  } finally {
    globalThis.Audio = OriginalAudio;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});
