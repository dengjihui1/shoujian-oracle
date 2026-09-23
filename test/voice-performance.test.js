import test from "node:test";
import assert from "node:assert/strict";
import { VoicePerformanceTracker, summarize } from "../src/voice-performance.js";

test("voice performance tracker computes bounded P50 and P95 without content", () => {
  const tracker = new VoicePerformanceTracker({ limit: 3 });
  for (let index = 1; index <= 4; index += 1) {
    tracker.record({
      listeningAt: index * 100,
      submittedAt: index * 100 + 10,
      asrFinalMs: index * 100,
      firstTokenMs: index * 200,
      firstAudioMs: index === 2 ? null : index * 300,
      turnComplete: true,
    });
  }
  assert.equal(tracker.summary.turns, 3);
  assert.deepEqual(tracker.summary.asrFinalMs, { samples: 3, p50: 300, p95: 400 });
  assert.deepEqual(tracker.summary.firstAudioMs, { samples: 2, p50: 900, p95: 1_200 });
});

test("later events enrich the same completed turn instead of duplicating it", () => {
  const tracker = new VoicePerformanceTracker();
  tracker.record({ listeningAt: 10, submittedAt: 20, firstTokenMs: 100, turnComplete: true });
  tracker.record({ listeningAt: 10, submittedAt: 20, firstTokenMs: 100, firstAudioMs: 240, turnComplete: true });
  assert.equal(tracker.summary.turns, 1);
  assert.equal(tracker.summary.firstAudioMs.p50, 240);
});

test("voice performance export contains latency only and clear resets it", () => {
  const tracker = new VoicePerformanceTracker();
  tracker.record({ listeningAt: 10, submittedAt: 20, asrFinalMs: 40, firstTokenMs: 60, turnComplete: true, transcript: "不得导出" });
  const report = tracker.createExport({ now: () => Date.parse("2026-09-23T04:00:00.000Z") });
  assert.equal(report.schema, "shoujian.voice-performance");
  assert.equal(report.generatedAt, "2026-09-23T04:00:00.000Z");
  assert.equal(JSON.stringify(report).includes("不得导出"), false);
  assert.deepEqual(tracker.clear(), {
    turns: 0,
    asrFinalMs: { samples: 0, p50: null, p95: null },
    firstTokenMs: { samples: 0, p50: null, p95: null },
    firstAudioMs: { samples: 0, p50: null, p95: null },
  });
});

test("percentile summary handles empty and unordered input", () => {
  assert.deepEqual(summarize([]), { samples: 0, p50: null, p95: null });
  assert.deepEqual(summarize([900, 100, 500]), { samples: 3, p50: 500, p95: 900 });
});
