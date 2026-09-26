import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import WebSocket from "ws";
import { MonthlyUsageBudget, usageBudgetFromEnv, monthWindow, BUDGET_MESSAGE } from "../server/usage-budget.mjs";
import { createHttpAppServer } from "../server/index.mjs";

test("monthly units are global, weighted, atomic locally, and reset at Shanghai month boundary", async () => {
  let clock = Date.parse("2026-09-30T15:59:59Z");
  const budget = new MonthlyUsageBudget({ limit: 8, audioUnits: 5, now: () => clock });
  assert.equal((await budget.reserve("audio")).allowed, true);
  const results = await Promise.all(Array.from({ length: 12 }, () => budget.reserve("text")));
  assert.equal(results.filter((result) => result.allowed).length, 3);
  assert.equal((await budget.reserve("audio")).allowed, false);
  clock += 1000;
  assert.equal((await budget.reserve("audio")).allowed, true);
  assert.deepEqual(monthWindow(clock), [Date.parse("2026-09-30T16:00:00Z") / 1000, Date.parse("2026-10-31T16:00:00Z") / 1000]);
  const [start, end] = monthWindow(Date.parse("2028-02-10T00:00:00Z"));
  assert.equal(end - start, 29 * 86400);
});

test("configuration defaults disabled, rejects invalid values and forbids production memory fallback", async () => {
  const disabled = usageBudgetFromEnv({});
  assert.equal(disabled.limit, 0);
  assert.equal((await disabled.reserve("audio")).allowed, true);
  assert.throws(() => usageBudgetFromEnv({ MONTHLY_BUDGET_UNITS: "100oops" }), /整数/u);
  assert.throws(() => usageBudgetFromEnv({ MONTHLY_BUDGET_UNITS: "", NODE_ENV: "production" }), /整数/u);
  assert.throws(() => usageBudgetFromEnv({ BUDGET_AUDIO_UNITS: "0" }), /整数/u);
  assert.throws(() => usageBudgetFromEnv({ MONTHLY_BUDGET_UNITS: "10", NODE_ENV: "production" }), /Redis/u);
  assert.throws(() => usageBudgetFromEnv({ MONTHLY_BUDGET_UNITS: "10", REDIS_URL: "redis://example" }), /Redis/u);
});

test("Redis reservation uses one fixed non-personal key, atomic script, expiry and authoritative clock validation", async () => {
  let call;
  const budget = new MonthlyUsageBudget({ limit: 10, client: { async eval(script, options) { call = { script, options }; return 1; } },
    now: () => Date.parse("2026-09-15T00:00:00Z") });
  assert.equal((await budget.reserve("audio")).allowed, true);
  assert.deepEqual(call.options.keys, ["shoujian:usage:monthly"]);
  assert.deepEqual(call.options.arguments.slice(0, 2), ["10", "5"]);
  assert.match(call.script, /redis.call\("TIME"\)/u);
  assert.match(call.script, /now < start or now >= finish/u);
  assert.match(call.script, /EXPIREAT/u);
  assert.match(call.script, /used \+ weight > tonumber\(ARGV\[1\]\)/u);
});

test("Redis exhaustion, clock mismatch, failure and timeout all deny admission", async () => {
  for (const [evalFn, expectedUnavailable] of [
    [async () => 0, false], [async () => -1, true], [async () => "garbage", true],
    [async () => { throw new Error("SECRET internal host"); }, true],
    [() => new Promise(() => {}), true],
  ]) {
    const budget = new MonthlyUsageBudget({ limit: 10, client: { eval: evalFn }, timeoutMs: 5 });
    assert.deepEqual(await budget.reserve("text"), { allowed: false, unavailable: expectedUnavailable });
  }
});

test("constructor-only Redis namespace injection isolates smoke counters", async () => {
  let observedKey;
  const client = { async eval(_script, { keys }) { observedKey = keys[0]; return 1; } };
  const budget = new MonthlyUsageBudget({ limit: 1, key: "shoujian:smoke:budget:test", client });
  await budget.reserve("text");
  assert.equal(observedKey, "shoujian:smoke:budget:test");
  const production = usageBudgetFromEnv({ MONTHLY_BUDGET_UNITS: "1", USAGE_BUDGET_KEY: "ignored" }, { client });
  await production.reserve("text");
  assert.equal(observedKey, "shoujian:usage:monthly");
  assert.throws(() => new MonthlyUsageBudget({ key: "unsafe key\r\n" }), /Invalid usage budget key/u);
});

async function withServer(options, run) {
  const server = createHttpAppServer(options).listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  try { await run(origin); } finally { server.close(); await once(server, "close"); }
}
const post = (base, path, body = {}) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("HTTP budget covers text, stream, speech and transcribe before invoking providers", async () => {
  let calls = 0;
  const client = { chat() { calls++; }, speech() { calls++; }, transcribe() { calls++; } };
  const budget = new MonthlyUsageBudget({ limit: 1 });
  await budget.reserve("text");
  await withServer({ client, usageBudget: budget }, async (base) => {
    for (const path of ["/api/chat", "/api/chat/stream", "/api/speech", "/api/transcribe"]) {
      const response = await post(base, path);
      assert.equal(response.status, 429);
      assert.deepEqual(await response.json(), { error: "monthly_budget_exhausted", message: BUDGET_MESSAGE });
    }
    assert.equal((await fetch(`${base}/api/status`)).status, 200);
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
  });
  assert.equal(calls, 0);
});

test("HTTP Redis failure closes cloud access with sanitized errors", async () => {
  const budget = new MonthlyUsageBudget({ limit: 1, client: { eval: async () => { throw new Error("private credential"); } } });
  await withServer({ client: {}, usageBudget: budget }, async (base) => {
    const response = await post(base, "/api/chat");
    assert.equal(response.status, 503);
    const result = await response.json();
    assert.equal(result.error, "usage_budget_unavailable");
    assert.doesNotMatch(JSON.stringify(result), /private credential/u);
  });
});

test("paid audio switch disables both HTTP audio providers and WebSocket upgrades", async () => {
  let reservations = 0;
  await withServer({ client: {}, sttClient: {}, paidAudioEnabled: false,
    usageBudget: { async reserve() { reservations++; return { allowed: true }; } } }, async (base) => {
    const status = await (await fetch(`${base}/api/status`)).json();
    assert.equal(status.paidAudioEnabled, false);
    assert.equal(status.streamingStt, false);
    assert.equal(status.speechProvider, null);
    assert.equal(status.transcribeProvider, null);
    for (const path of ["/api/speech", "/api/transcribe"]) {
      assert.equal((await post(base, path)).status, 403);
    }
    const ws = new WebSocket(`${base.replace("http", "ws")}/api/stt/stream`, { origin: base });
    const [, response] = await once(ws, "unexpected-response");
    assert.equal(response.statusCode, 403);
    response.resume();
  });
  assert.equal(reservations, 0);
});

test("WebSocket STT and HTTP share one audio/text quota, including sessions cancelled before start", async () => {
  const budget = new MonthlyUsageBudget({ limit: 5, audioUnits: 5 });
  let calls = 0;
  await withServer({ client: {}, sttClient: { streamingRecognize() { calls++; } }, usageBudget: budget }, async (base) => {
    const ws = new WebSocket(`${base.replace("http", "ws")}/api/stt/stream`, { origin: base });
    await once(ws, "open");
    ws.close();
    await once(ws, "close");
    assert.equal((await post(base, "/api/chat")).status, 429);
    const denied = new WebSocket(`${base.replace("http", "ws")}/api/stt/stream`, { origin: base });
    const [, response] = await once(denied, "unexpected-response");
    assert.equal(response.statusCode, 429);
    const chunks = [];
    for await (const chunk of response) chunks.push(chunk);
    assert.equal(JSON.parse(Buffer.concat(chunks).toString()).message, BUDGET_MESSAGE);
  });
  assert.equal(calls, 0);
});
