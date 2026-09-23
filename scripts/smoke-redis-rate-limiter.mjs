import assert from "node:assert/strict";
import { rateLimiterFromEnv } from "../server/redis-rate-limiter.mjs";

const configured = await rateLimiterFromEnv(process.env);
assert.equal(configured.mode, "redis", "REDIS_URL must enable the shared limiter");

try {
  const now = Date.now();
  assert.equal(await configured.rateLimiter.allow("ci-client", now), true);
  assert.equal(await configured.rateLimiter.allow("ci-client", now + 1), true);
  assert.equal(await configured.rateLimiter.allow("ci-client", now + 2), false);
  assert.equal(await configured.rateLimiter.allow("another-client", now + 2), true);
  console.log("Redis rate limiter smoke test passed");
} finally {
  await configured.close();
}

