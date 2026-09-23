export class SlidingWindowRateLimiter {
  constructor({ limit = 40, windowMs = 60_000, sweepEvery = 100 } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.sweepEvery = sweepEvery;
    this.store = new Map();
    this.operations = 0;
  }

  allow(key, timestamp = Date.now()) {
    const cutoff = timestamp - this.windowMs;
    const recent = (this.store.get(key) ?? []).filter((time) => time > cutoff);
    const allowed = recent.length < this.limit;
    if (allowed) recent.push(timestamp);
    if (recent.length) this.store.set(key, recent);
    else this.store.delete(key);
    this.operations += 1;
    if (this.operations % this.sweepEvery === 0) this.sweep(timestamp);
    return allowed;
  }

  sweep(timestamp = Date.now()) {
    const cutoff = timestamp - this.windowMs;
    for (const [key, times] of this.store) {
      const recent = times.filter((time) => time > cutoff);
      if (recent.length) this.store.set(key, recent);
      else this.store.delete(key);
    }
  }

  get size() { return this.store.size; }

  ready() { return true; }
}
