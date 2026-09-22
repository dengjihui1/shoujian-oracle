import assert from "node:assert/strict";
import test from "node:test";
import { CachedSpeechService } from "../server/speech-cache.mjs";

test("speech cache reuses completed audio without retaining plain text keys", async () => {
  let calls = 0;
  const service = new CachedSpeechService({
    synthesize: async () => { calls += 1; return { data: "AQI=", mimeType: "audio/pcm", sampleRate: 24_000 }; },
  });
  const first = await service.speech({ text: "慢慢说" });
  const second = await service.speech({ text: "慢慢说" });
  assert.equal(calls, 1);
  assert.equal(first.cache, "miss");
  assert.equal(second.cache, "hit");
  assert.equal(service.stats.entries, 1);
  assert.equal([...service.cache.keys()].some((key) => key.includes("慢慢说")), false);
});

test("speech cache joins identical in-flight synthesis requests", async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const service = new CachedSpeechService({
    synthesize: async () => { calls += 1; await gate; return { data: "AQI=" }; },
  });
  const first = service.speech({ text: "同一句" });
  const second = service.speech({ text: "同一句" });
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(a.cache, "miss");
  assert.equal(b.cache, "joined");
});

test("speech cache expires old audio and evicts least recently used entries", async () => {
  let time = 1_000;
  let calls = 0;
  const service = new CachedSpeechService({
    now: () => time,
    ttlMs: 1_000,
    maxEntries: 2,
    synthesize: async ({ text }) => { calls += 1; return { data: Buffer.from(text).toString("base64") }; },
  });
  await service.speech({ text: "甲" });
  await service.speech({ text: "乙" });
  await service.speech({ text: "甲" });
  await service.speech({ text: "丙" });
  assert.equal(service.stats.entries, 2);
  await service.speech({ text: "乙" });
  assert.equal(calls, 4);
  time += 1_001;
  await service.speech({ text: "乙" });
  assert.equal(calls, 5);
});
