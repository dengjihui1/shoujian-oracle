import test from "node:test";
import assert from "node:assert/strict";
import { calculateVoiceLevel, pcm16BytesToFloat32, pcmToWav } from "../src/audio-player.js";

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
