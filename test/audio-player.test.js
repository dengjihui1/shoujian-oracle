import test from "node:test";
import assert from "node:assert/strict";
import { pcmToWav } from "../src/audio-player.js";

test("PCM output is wrapped in a playable mono 24 kHz WAV container", () => {
  const wav = pcmToWav(Uint8Array.from([1, 2, 3, 4]));
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), "RIFF");
  assert.equal(new DataView(wav.buffer).getUint32(24, true), 24_000);
  assert.equal(new DataView(wav.buffer).getUint32(40, true), 4);
  assert.deepEqual([...wav.slice(44)], [1, 2, 3, 4]);
});
