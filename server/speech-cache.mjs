import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

export class CachedSpeechService {
  constructor({ synthesize, now = Date.now, ttlMs = 30 * 60_000, maxEntries = 48, maxBytes = 24 * 1024 * 1024 } = {}) {
    if (typeof synthesize !== "function") throw new TypeError("synthesize callback is required");
    this.synthesize = synthesize;
    this.now = now;
    this.ttlMs = Math.max(1_000, ttlMs);
    this.maxEntries = Math.max(1, maxEntries);
    this.maxBytes = Math.max(1, maxBytes);
    this.cache = new Map();
    this.pending = new Map();
    this.totalBytes = 0;
  }

  async speech({ text, voice = "Charon" }) {
    const key = cacheKey(text, voice);
    const cached = this.#read(key);
    if (cached) return { ...cached, cache: "hit", synthesisMs: 0 };

    const existing = this.pending.get(key);
    if (existing) {
      const joined = await existing;
      return { ...joined.result, cache: "joined", synthesisMs: joined.synthesisMs };
    }

    const promise = this.#create(key, { text, voice });
    this.pending.set(key, promise);
    try {
      const created = await promise;
      return { ...created.result, cache: "miss", synthesisMs: created.synthesisMs };
    } finally {
      this.pending.delete(key);
    }
  }

  get stats() {
    this.#removeExpired();
    return { entries: this.cache.size, bytes: this.totalBytes, pending: this.pending.size };
  }

  async #create(key, payload) {
    const startedAt = performance.now();
    const result = await this.synthesize(payload);
    const synthesisMs = Math.max(0, Math.round(performance.now() - startedAt));
    const bytes = audioBytes(result?.data);
    if (bytes > 0 && bytes <= this.maxBytes) this.#write(key, result, bytes);
    return { result, synthesisMs };
  }

  #read(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.#delete(key, entry);
      return null;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.result;
  }

  #write(key, result, bytes) {
    const previous = this.cache.get(key);
    if (previous) this.#delete(key, previous);
    this.cache.set(key, { result, bytes, expiresAt: this.now() + this.ttlMs });
    this.totalBytes += bytes;
    this.#removeExpired();
    while (this.cache.size > this.maxEntries || this.totalBytes > this.maxBytes) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) break;
      this.#delete(oldestKey, this.cache.get(oldestKey));
    }
  }

  #removeExpired() {
    const timestamp = this.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= timestamp) this.#delete(key, entry);
    }
  }

  #delete(key, entry) {
    if (!entry || !this.cache.delete(key)) return;
    this.totalBytes = Math.max(0, this.totalBytes - entry.bytes);
  }
}

function cacheKey(text, voice) {
  return createHash("sha256").update(String(voice)).update("\0").update(String(text)).digest("base64url");
}

function audioBytes(data) {
  if (typeof data !== "string" || !data) return 0;
  try { return Buffer.byteLength(data, "base64"); } catch { return 0; }
}
