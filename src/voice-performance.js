export const VOICE_PERFORMANCE_SCHEMA = "shoujian.voice-performance";
const METRICS = Object.freeze(["asrFinalMs", "firstTokenMs", "firstAudioMs"]);

export class VoicePerformanceTracker {
  constructor({ limit = 30 } = {}) {
    this.limit = Math.max(1, Math.min(100, Number(limit) || 30));
    this.records = [];
  }

  record(metrics) {
    if (!metrics?.turnComplete || !Number.isFinite(metrics.listeningAt) || !Number.isFinite(metrics.submittedAt)) return this.summary;
    const id = `${metrics.listeningAt}:${metrics.submittedAt}`;
    const record = Object.fromEntries(METRICS.flatMap((key) => Number.isFinite(metrics[key]) ? [[key, Math.max(0, Math.round(metrics[key]))]] : []));
    const index = this.records.findIndex((item) => item.id === id);
    if (index >= 0) this.records[index] = { ...this.records[index], ...record };
    else this.records.push({ id, ...record });
    this.records = this.records.slice(-this.limit);
    return this.summary;
  }

  clear() {
    this.records = [];
    return this.summary;
  }

  createExport({ now = Date.now } = {}) {
    return Object.freeze({
      schema: VOICE_PERFORMANCE_SCHEMA,
      version: 1,
      generatedAt: new Date(now()).toISOString(),
      privacy: "latency-only; no transcript or audio",
      summary: this.summary,
      samples: this.records.map(({ id: _id, ...record }) => ({ ...record })),
    });
  }

  get summary() {
    return Object.freeze({
      turns: this.records.length,
      ...Object.fromEntries(METRICS.map((key) => [key, summarize(this.records.map((record) => record[key]).filter(Number.isFinite))])),
    });
  }
}

export function summarize(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  return Object.freeze({
    samples: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
  });
}

function percentile(sorted, proportion) {
  if (!sorted.length) return null;
  const index = Math.max(0, Math.ceil(sorted.length * proportion) - 1);
  return sorted[index];
}
