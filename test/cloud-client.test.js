import assert from "node:assert/strict";
import test from "node:test";
import { OracleCloudClient } from "../server/cloud-client.mjs";

function transientError(code = "upstream_error") {
  return Object.assign(new Error(code), { code, status: 502 });
}

test("cloud client crosses providers after transient text failure", async () => {
  const calls = [];
  const primary = {
    models: { fast: "primary" },
    async chat() { calls.push("primary"); throw transientError("quota_exceeded"); },
    async transcribe() { return { text: "voice" }; },
    async speech() { return { data: "AQI=" }; },
  };
  const fallback = {
    provider: "fallback",
    async chat({ route }) { calls.push(`fallback:${route}`); return { text: "备用回答", model: "fallback-model", provider: "fallback" }; },
  };
  const client = new OracleCloudClient({ primary, chatFallbacks: [fallback] });
  assert.equal((await client.chat({ route: "fast" })).text, "备用回答");
  assert.deepEqual(calls, ["primary", "fallback:fast"]);
  assert.equal((await client.transcribe({})).text, "voice");
});

test("cloud client routes speech to a dedicated provider while keeping Gemini transcription", async () => {
  const calls = [];
  const primary = {
    provider: "gemini",
    models: { speech: "gemini-tts", transcribe: "gemini-stt" },
    async transcribe() { calls.push("gemini-stt"); return { text: "实时文字" }; },
    async speech() { throw new Error("primary TTS must not be used"); },
  };
  const speechProvider = {
    provider: "google-cloud-tts",
    model: "cmn-CN-Test-B",
    async speech() { calls.push("cloud-tts"); return { data: "AQI=" }; },
  };
  const client = new OracleCloudClient({ primary, speechProvider });
  await client.transcribe({});
  await client.speech({ text: "测试" });
  assert.deepEqual(calls, ["gemini-stt", "cloud-tts"]);
  assert.equal(client.models.speech, "cmn-CN-Test-B");
  assert.equal(client.speechProviderName, "google-cloud-tts");
  assert.equal(client.transcribeProviderName, "gemini");
});

test("stream fallback happens only before any text was emitted", async () => {
  const fallbackCalls = [];
  const primaryBeforeText = { models: {}, async *chatStream() { throw transientError(); }, async transcribe() {}, async speech() {} };
  const fallback = { provider: "fallback", async *chatStream() { fallbackCalls.push("called"); yield { text: "恢复", model: "m", provider: "fallback" }; } };
  const client = new OracleCloudClient({ primary: primaryBeforeText, chatFallbacks: [fallback] });
  const chunks = [];
  for await (const chunk of client.chatStream({})) chunks.push(chunk.text);
  assert.deepEqual(chunks, ["恢复"]);

  const primaryAfterText = { models: {}, async *chatStream() { yield { text: "半截" }; throw transientError(); }, async transcribe() {}, async speech() {} };
  const secondClient = new OracleCloudClient({ primary: primaryAfterText, chatFallbacks: [fallback] });
  await assert.rejects(async () => {
    for await (const _chunk of secondClient.chatStream({})) { /* consume */ }
  }, /upstream_error/u);
  assert.equal(fallbackCalls.length, 1);
});

test("circuit breaker skips a repeatedly failing provider during cooldown", async () => {
  let time = 1_000;
  let primaryCalls = 0;
  const primary = {
    models: {},
    async chat() { primaryCalls += 1; throw transientError(); },
    async transcribe() {},
    async speech() {},
  };
  const fallback = { provider: "fallback", async chat() { return { text: "ok" }; } };
  const client = new OracleCloudClient({ primary, chatFallbacks: [fallback], now: () => time, failureThreshold: 2, cooldownMs: 5_000 });
  await client.chat({});
  await client.chat({});
  await client.chat({});
  assert.equal(primaryCalls, 2);
  time += 5_001;
  await client.chat({});
  assert.equal(primaryCalls, 3);
});

test("all open chat circuits fail fast until cooldown ends", async () => {
  let time = 1_000;
  let calls = 0;
  const primary = {
    models: {},
    async chat() { calls += 1; throw transientError(); },
  };
  const fallback = { provider: "fallback", async chat() { calls += 1; throw transientError(); } };
  const client = new OracleCloudClient({ primary, chatFallbacks: [fallback], now: () => time, failureThreshold: 1, cooldownMs: 5_000 });
  await assert.rejects(() => client.chat({}), (error) => error.code === "upstream_error");
  assert.equal(calls, 2);
  await assert.rejects(() => client.chat({}), (error) => error.status === 503 && error.code === "upstream_error");
  assert.equal(calls, 2);
  time += 5_001;
  await assert.rejects(() => client.chat({}), (error) => error.code === "upstream_error");
  assert.equal(calls, 4);
});

test("all open streaming circuits also fail fast", async () => {
  let calls = 0;
  const primary = { models: {}, async *chatStream() { calls += 1; throw transientError(); } };
  const fallback = { provider: "fallback", async *chatStream() { calls += 1; throw transientError(); } };
  const client = new OracleCloudClient({ primary, chatFallbacks: [fallback], failureThreshold: 1 });
  const consume = async () => { for await (const _chunk of client.chatStream({})) { /* consume */ } };
  await assert.rejects(consume, (error) => error.code === "upstream_error");
  assert.equal(calls, 2);
  await assert.rejects(consume, (error) => error.status === 503 && error.code === "upstream_error");
  assert.equal(calls, 2);
});
