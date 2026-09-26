import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { MonthlyUsageBudget } from "../server/usage-budget.mjs";

// Never reads .env, never deletes keys and never uses the production counter key.
const verifyRestart = process.argv.includes("--verify-restart");
const runId = process.env.BUDGET_SMOKE_RUN_ID || (verifyRestart ? "" : randomUUID());
let stage = "configuration";
const clients = new Set();
try {
  assert.ok(process.env.REDIS_URL, "REDIS_URL is required");
  assert.match(runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  const key = `shoujian:smoke:budget:${runId}`;
  async function connect() {
    const client = createClient({ url: process.env.REDIS_URL, disableOfflineQueue: true,
      socket: { connectTimeout: 5000, reconnectStrategy: false } });
    clients.add(client);
    client.on("error", () => {}); // Do not log connection URLs or credentials.
    await client.connect();
    return client;
  }
  stage = "connect";
  let first = await connect();
  const makeBudget = (client, options = {}) => new MonthlyUsageBudget({ client, key, limit: 23, ...options });
  async function verifyStoredCounter(client) {
    assert.equal(await client.hGet(key, "used"), "23");
    assert.equal((await makeBudget(client).reserve("text")).allowed, false);
    const ttl = await client.ttl(key);
    assert.ok(ttl > 0 && ttl <= 32 * 86400, "Counter must expire after its calendar month");
  }
  if (!verifyRestart) {
    stage = "fresh isolated namespace";
    assert.equal(await first.exists(key), 0, "Use a fresh smoke run UUID");
    const second = await connect();
    const budgets = [makeBudget(first), makeBudget(second)];
    stage = "concurrent shared quota";
    const results = await Promise.all(Array.from({ length: 100 }, (_, index) => budgets[index % 2].reserve("text")));
    assert.equal(results.filter(({ allowed }) => allowed).length, 23);
    assert.ok(results.every(({ unavailable }) => !unavailable));
    stage = "audio weighting";
    const audio = makeBudget(first, { key: `${key}:audio` });
    const weighted = await Promise.all(Array.from({ length: 10 }, () => audio.reserve("audio")));
    assert.equal(weighted.filter(({ allowed }) => allowed).length, 4);
    assert.equal(await first.hGet(`${key}:audio`, "used"), "20");
    stage = "clock mismatch cannot reset quota";
    assert.deepEqual(await makeBudget(first, { now: () => Date.now() + 40 * 86400_000 }).reserve("text"), { allowed: false, unavailable: true });
    await verifyStoredCounter(first);
    stage = "reconnect retains quota";
    await first.quit();
    await second.quit();
    first = await connect();
  }
  stage = verifyRestart ? "Redis restart retains quota" : "new process equivalent retains quota";
  await verifyStoredCounter(first);
  console.log(verifyRestart ? "Redis budget restart smoke passed." : "Redis budget concurrency, weighting, TTL and reconnect smoke passed.");
} catch {
  console.error(`Redis budget smoke failed at: ${stage}. Connection details are withheld.`);
  process.exitCode = 1;
} finally {
  for (const client of clients) if (client.isOpen) client.destroy();
}
