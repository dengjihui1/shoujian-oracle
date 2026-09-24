import assert from "node:assert/strict";
import test from "node:test";
import { RedisSlidingWindowRateLimiter, rateLimiterFromEnv } from "../server/redis-rate-limiter.mjs";
import { SlidingWindowRateLimiter } from "../server/rate-limiter.mjs";

test("Redis limiter hashes client identities and executes one atomic window script", async () => {
  const calls = [];
  const client = {
    async ping() { return "PONG"; },
    async eval(script, options) {
      calls.push({ script, options });
      return 1;
    },
  };
  const limiter = new RedisSlidingWindowRateLimiter({
    client,
    limit: 2,
    windowMs: 1_000,
    hashSalt: "0123456789abcdef",
    requestId: () => "request-1",
  });

  assert.equal(await limiter.allow("203.0.113.9"), true);
  assert.equal(await limiter.ready(), true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].script, /ZREMRANGEBYSCORE/u);
  assert.match(calls[0].script, /redis\.call\("TIME"\)/u);
  assert.deepEqual(calls[0].options.arguments, ["2", "request-1", "1000"]);
  assert.doesNotMatch(calls[0].options.keys[0], /203\.0\.113\.9/u);
});

test("Redis limiter fails closed when the atomic command is unavailable", async () => {
  const limiter = new RedisSlidingWindowRateLimiter({
    client: { eval: async () => { throw new Error("redis unavailable"); } },
    hashSalt: "0123456789abcdef",
  });
  await assert.rejects(limiter.allow("client"), /redis unavailable/u);
});

test("Redis readiness rejects a non-PONG dependency response", async () => {
  const limiter = new RedisSlidingWindowRateLimiter({
    client: { async eval() { return 1; }, async ping() { return "LOADING"; } },
    hashSalt: "0123456789abcdef",
  });
  assert.equal(await limiter.ready(), false);
});

test("environment adapter keeps local mode dependency-free and bounded", async () => {
  const configured = await rateLimiterFromEnv({ RATE_LIMIT_MAX: "2", RATE_LIMIT_WINDOW_MS: "1000" });
  assert.equal(configured.mode, "memory");
  assert.ok(configured.rateLimiter instanceof SlidingWindowRateLimiter);
  assert.equal(configured.rateLimiter.allow("client", 0), true);
  assert.equal(configured.rateLimiter.allow("client", 1), true);
  assert.equal(configured.rateLimiter.allow("client", 2), false);
  await configured.close();
});

test("environment adapter connects Redis and closes it cleanly", async () => {
  const events = [];
  const client = {
    isOpen: true,
    on(event) { events.push(event); },
    async connect() { events.push("connect"); },
    async quit() { events.push("quit"); },
    async eval() { return 0; },
  };
  const configured = await rateLimiterFromEnv({
    REDIS_URL: "redis://redis:6379",
    RATE_LIMIT_HASH_SALT: "0123456789abcdef",
  }, { createClientFn: (options) => { events.push(options.url); return client; } });

  assert.equal(configured.mode, "redis");
  assert.equal(await configured.rateLimiter.allow("client", 100), false);
  await configured.close();
  assert.deepEqual(events, ["redis://redis:6379", "error", "connect", "quit"]);
});

test("Redis mode refuses to start without a private hashing salt", async () => {
  const client = { on() {}, async connect() {}, async eval() { return 1; } };
  await assert.rejects(
    rateLimiterFromEnv({ REDIS_URL: "redis://redis:6379" }, { createClientFn: () => client }),
    /RATE_LIMIT_HASH_SALT/u,
  );
});
