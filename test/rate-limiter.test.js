import assert from "node:assert/strict";
import test from "node:test";
import { SlidingWindowRateLimiter } from "../server/rate-limiter.mjs";

test("rate limiter enforces a sliding window and recovers after expiry", () => {
  const limiter = new SlidingWindowRateLimiter({ limit: 2, windowMs: 1_000, sweepEvery: 10 });
  assert.equal(limiter.allow("user", 0), true);
  assert.equal(limiter.allow("user", 100), true);
  assert.equal(limiter.allow("user", 200), false);
  assert.equal(limiter.allow("user", 1_100), true);
});

test("rate limiter periodically removes inactive keys", () => {
  const limiter = new SlidingWindowRateLimiter({ limit: 2, windowMs: 100, sweepEvery: 2 });
  limiter.allow("old", 0);
  limiter.allow("current", 200);
  assert.equal(limiter.size, 1);
});

