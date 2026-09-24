import assert from "node:assert/strict";
import { rateLimiterFromEnv } from "../server/redis-rate-limiter.mjs";

const configured = await rateLimiterFromEnv(process.env);
assert.equal(configured.mode, "redis", "REDIS_URL must enable the shared limiter");

try {
  assert.equal(await configured.rateLimiter.ready(), true);
  // Deliberately pass skewed caller clocks; Redis must decide from its own clock.
  const now = Date.now();
  assert.equal(await configured.rateLimiter.allow("ci-client", now), true);
  assert.equal(await configured.rateLimiter.allow("ci-client", now + 3_600_000), true);
  assert.equal(await configured.rateLimiter.allow("ci-client", now), false);
  assert.equal(await configured.rateLimiter.allow("another-client", now + 3_600_000), true);
  console.log("Redis rate limiter smoke test passed");
} finally {
  await configured.close();
}
