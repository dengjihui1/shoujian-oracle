import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "redis";
import { SlidingWindowRateLimiter } from "./rate-limiter.mjs";

const WINDOW_SCRIPT = `
local clock = redis.call("TIME")
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local window = tonumber(ARGV[3])
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", now - window)
local count = redis.call("ZCARD", KEYS[1])
if count >= tonumber(ARGV[1]) then
  return 0
end
redis.call("ZADD", KEYS[1], now, now .. ":" .. ARGV[2])
redis.call("PEXPIRE", KEYS[1], window)
return 1
`;

export class RedisSlidingWindowRateLimiter {
  constructor({ client, limit = 40, windowMs = 60_000, hashSalt, prefix = "shoujian:rate", requestId = randomUUID } = {}) {
    if (!client?.eval) throw new TypeError("Redis 客户端必须提供 eval()");
    if (typeof hashSalt !== "string" || hashSalt.length < 16) throw new TypeError("Redis 限流需要至少 16 字符的 RATE_LIMIT_HASH_SALT");
    this.client = client;
    this.limit = boundedInteger(limit, 1, 10_000, 40);
    this.windowMs = boundedInteger(windowMs, 1_000, 86_400_000, 60_000);
    this.hashSalt = hashSalt;
    this.prefix = String(prefix || "shoujian:rate").replace(/[^a-z0-9:_-]/giu, "_").slice(0, 64);
    this.requestId = requestId;
  }

  async allow(key) {
    const digest = createHmac("sha256", this.hashSalt).update(String(key)).digest("hex").slice(0, 32);
    const redisKey = `${this.prefix}:${digest}`;
    const result = await this.client.eval(WINDOW_SCRIPT, {
      keys: [redisKey],
      arguments: [String(this.limit), this.requestId(), String(this.windowMs)],
    });
    return Number(result) === 1;
  }

  async ready() {
    return await this.client.ping() === "PONG";
  }
}

export async function rateLimiterFromEnv(env = process.env, { createClientFn = createClient, onRedisError = () => {} } = {}) {
  const limit = boundedInteger(env.RATE_LIMIT_MAX, 1, 10_000, 40);
  const windowMs = boundedInteger(env.RATE_LIMIT_WINDOW_MS, 1_000, 86_400_000, 60_000);
  if (!env.REDIS_URL) {
    return {
      rateLimiter: new SlidingWindowRateLimiter({ limit, windowMs }),
      mode: "memory",
      close: async () => {},
    };
  }
  if (typeof env.RATE_LIMIT_HASH_SALT !== "string" || env.RATE_LIMIT_HASH_SALT.length < 16) {
    throw new TypeError("Redis 限流需要至少 16 字符的 RATE_LIMIT_HASH_SALT");
  }

  const client = createClientFn({
    url: env.REDIS_URL,
    socket: { connectTimeout: boundedInteger(env.REDIS_CONNECT_TIMEOUT_MS, 1_000, 30_000, 5_000) },
  });
  client.on?.("error", onRedisError);
  await client.connect();
  return {
    rateLimiter: new RedisSlidingWindowRateLimiter({
      client,
      limit,
      windowMs,
      hashSalt: env.RATE_LIMIT_HASH_SALT,
      prefix: env.RATE_LIMIT_PREFIX,
    }),
    mode: "redis",
    close: async () => {
      if (client.isOpen) await client.quit();
    },
  };
}

function boundedInteger(value, minimum, maximum, fallback) {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(parsed, maximum)) : fallback;
}
