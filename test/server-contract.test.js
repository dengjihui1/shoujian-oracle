import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { clientFromEnv, compatibleProvidersFromEnv, createApp, createHttpAppServer } from "../server/index.mjs";
import { OracleApiClient } from "../src/api-client.js";

async function withServer(app, run) {
  const server = createServer(app).listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try { await run(`http://127.0.0.1:${port}`); } finally { server.close(); await once(server, "close"); }
}

test("production HTTP server bounds request headers and body receive time", () => {
  const server = createHttpAppServer();
  assert.equal(server.headersTimeout, 10_000);
  assert.equal(server.requestTimeout, 60_000);
  assert.equal(server.keepAliveTimeout, 5_000);
  assert.equal(server.maxHeadersCount, 100);
});

test("status exposes local fallback without leaking credentials", async () => {
  await withServer(createApp(), async (base) => {
    const response = await fetch(`${base}/api/status`);
    assert.equal(response.status, 200);
    const status = await response.json();
    assert.equal(status.cloud, false);
    assert.equal(status.provider, null);
    assert.equal(status.speechProvider, null);
    assert.equal(status.transcribeProvider, null);
    assert.equal(status.models, null);
    assert.deepEqual(status.knowledge, {
      schema: "shoujian.oracle-rag.v1",
      version: "1.0.0",
      hexagrams: 64,
      trigrams: 8,
      fragments: 456,
    });
    const hidden = await fetch(`${base}/.env`);
    assert.equal(hidden.status, 404);
  });
});

test("static server exposes only browser assets", async () => {
  await withServer(createApp(), async (base) => {
    for (const path of ["/", "/src/shoujian-oracle.js", "/assets/avatar/moheng-neutral.webp"]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200, `${path} should load`);
    }
    for (const path of ["/server/index.mjs", "/package.json", "/knowledge/shoujian-rag.v1.json", "/node_modules/redis/package.json", "/.env"]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 404, `${path} should be private`);
    }
  });
});

test("API rejects primitive JSON bodies before calling cloud providers", async () => {
  let providerCalls = 0;
  const client = {
    models: { chat: "test", transcribe: "test", speech: "test" },
    chat() { providerCalls += 1; throw new Error("provider should not run"); },
    transcribe() { providerCalls += 1; throw new Error("provider should not run"); },
    speech() { providerCalls += 1; throw new Error("provider should not run"); },
  };
  await withServer(createApp({ client }), async (base) => {
    for (const route of ["/api/chat", "/api/transcribe", "/api/speech"]) {
      for (const body of ["null", "[]", "42"]) {
        const response = await fetch(`${base}${route}`, {
          method: "POST", headers: { "content-type": "application/json" }, body,
        });
        assert.equal(response.status, 400, `${route} should reject ${body}`);
        assert.deepEqual(await response.json(), { error: "invalid_json_body", message: "请求内容必须是 JSON 对象。" });
      }
    }
  });
  assert.equal(providerCalls, 0);
});

test("oversized cloud answers stop streaming and return a bounded error", async () => {
  let aborted = false;
  const client = {
    models: { chat: "test" },
    async chat() { return { text: "甲".repeat(16_385) }; },
    async *chatStream({ signal }) {
      try { yield { text: "甲".repeat(16_385) }; }
      finally { aborted = signal.aborted; }
    },
  };
  await withServer(createApp({ client }), async (base) => {
    const payload = JSON.stringify({ message: "你好", purpose: "chat" });
    const options = { method: "POST", headers: { "content-type": "application/json" }, body: payload };
    const standard = await fetch(`${base}/api/chat`, options);
    assert.equal(standard.status, 502);
    assert.equal((await standard.json()).error, "response_too_large");
    const streaming = await fetch(`${base}/api/chat/stream`, options);
    const events = await streaming.text();
    assert.match(events, /event: error\ndata: \{"error":"response_too_large"/u);
    assert.doesNotMatch(events, /event: delta/u);
  });
  assert.equal(aborted, true);
});

test("upstream concurrency limit sheds excess work and releases capacity", async () => {
  let entered;
  let release;
  const started = new Promise((resolve) => { entered = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const client = {
    models: { chat: "test", speech: "test" },
    async chat() { calls += 1; entered(); await gate; return { text: "完成" }; },
    async speech() { calls += 1; return { data: "AQI=", mimeType: "audio/pcm", sampleRate: 24_000 }; },
  };
  await withServer(createApp({ client, maxConcurrentUpstream: 1 }), async (base) => {
    const headers = { "content-type": "application/json" };
    const first = fetch(`${base}/api/chat`, { method: "POST", headers, body: JSON.stringify({ message: "你好", purpose: "chat" }) });
    await started;
    const excess = await fetch(`${base}/api/speech`, { method: "POST", headers, body: JSON.stringify({ text: "你好" }) });
    assert.equal(excess.status, 503);
    assert.equal(excess.headers.get("retry-after"), "2");
    assert.equal((await excess.json()).error, "server_busy");
    assert.equal(calls, 1);
    release();
    assert.equal((await first).status, 200);
    assert.equal((await fetch(`${base}/api/speech`, { method: "POST", headers, body: JSON.stringify({ text: "你好" }) })).status, 200);
    assert.equal(calls, 2);
  });
});

test("both chat modes enforce a deadline and release capacity after timeout", async () => {
  let calls = 0;
  const client = {
    models: { chat: "test" },
    async chat({ signal }) {
      calls += 1;
      if (calls > 1) return { text: "恢复" };
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
      throw Object.assign(new Error("cancelled"), { code: "cancelled", status: 499 });
    },
    async *chatStream({ signal }) {
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
      throw Object.assign(new Error("cancelled"), { code: "cancelled", status: 499 });
    },
  };
  await withServer(createApp({ client, upstreamDeadlineMs: 40, maxConcurrentUpstream: 1 }), async (base) => {
    const options = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "你好", purpose: "chat" }) };
    const standard = await fetch(`${base}/api/chat`, options);
    assert.equal(standard.status, 504);
    assert.equal((await standard.json()).error, "timeout");
    const streaming = await fetch(`${base}/api/chat/stream`, options);
    assert.match(await streaming.text(), /event: error\ndata: \{"error":"timeout"/u);
    const recovered = await fetch(`${base}/api/chat`, options);
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).text, "恢复");
  });
});

test("disconnecting a non-streaming chat aborts its upstream request", async () => {
  let markStarted;
  let markAborted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const aborted = new Promise((resolve) => { markAborted = resolve; });
  const client = {
    models: { chat: "test" },
    async chat({ signal }) {
      markStarted();
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
      markAborted(signal.aborted);
      throw Object.assign(new Error("cancelled"), { code: "cancelled", status: 499 });
    },
  };
  await withServer(createApp({ client }), async (base) => {
    const controller = new AbortController();
    const pending = fetch(`${base}/api/chat`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "你好", purpose: "chat" }), signal: controller.signal,
    }).catch((error) => error);
    await started;
    controller.abort();
    assert.equal(await aborted, true);
    await pending;
  });
});

test("citation repair uses the original chat deadline", async () => {
  const signals = [];
  const client = {
    models: { chat: "test" },
    async chat({ signal }) {
      signals.push(signal);
      if (signals.length === 1) return { text: "潜龙勿用提醒先等待。" };
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
      throw Object.assign(new Error("cancelled"), { code: "cancelled", status: 499 });
    },
  };
  await withServer(createApp({ client, upstreamDeadlineMs: 40 }), async (base) => {
    const response = await fetch(`${base}/api/chat`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "潜龙勿用是什么意思？", stage: "question" }),
    });
    assert.equal(response.status, 504);
    assert.equal((await response.json()).error, "timeout");
  });
  assert.equal(signals.length, 2);
  assert.equal(signals[0], signals[1]);
  assert.equal(signals[1].aborted, true);
});

test("transcription timeout aborts upstream and releases the shared capacity", async () => {
  let calls = 0;
  const client = {
    models: { transcribe: "test" },
    async transcribe({ signal }) {
      calls += 1;
      if (calls > 1) return { text: "恢复" };
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
      throw Object.assign(new Error("cancelled"), { code: "cancelled", status: 499 });
    },
  };
  await withServer(createApp({ client, upstreamDeadlineMs: 40, maxConcurrentUpstream: 1 }), async (base) => {
    const options = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: "AQID", mimeType: "audio/webm" }) };
    const timedOut = await fetch(`${base}/api/transcribe`, options);
    assert.equal(timedOut.status, 504);
    assert.equal((await timedOut.json()).error, "timeout");
    const recovered = await fetch(`${base}/api/transcribe`, options);
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).text, "恢复");
  });
});

test("disconnecting transcription cancels its upstream request", async () => {
  let markStarted;
  let markAborted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const aborted = new Promise((resolve) => { markAborted = resolve; });
  const client = {
    models: { transcribe: "test" },
    async transcribe({ signal }) {
      markStarted();
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
      markAborted(signal.aborted);
      throw Object.assign(new Error("cancelled"), { code: "cancelled", status: 499 });
    },
  };
  await withServer(createApp({ client }), async (base) => {
    const controller = new AbortController();
    const pending = fetch(`${base}/api/transcribe`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: "AQID", mimeType: "audio/webm" }), signal: controller.signal,
    }).catch((error) => error);
    await started;
    controller.abort();
    assert.equal(await aborted, true);
    await pending;
  });
});

test("health check bypasses API limits and exposes no provider credentials", async () => {
  const keys = [];
  const rateLimiter = { allow(key) { keys.push(key); return false; } };
  await withServer(createApp({ rateLimiter }), async (base) => {
    const health = await fetch(`${base}/healthz`);
    assert.equal(health.status, 200);
    assert.match(health.headers.get("x-request-id"), /^[0-9a-f-]{36}$/u);
    assert.deepEqual(await health.json(), {
      status: "ok",
      cloud: false,
      knowledge: { schema: "shoujian.oracle-rag.v1", version: "1.0.0" },
    });
    assert.deepEqual(keys, []);

    const status = await fetch(`${base}/api/status`);
    assert.equal(status.status, 429);
    assert.deepEqual(keys, ["127.0.0.1"]);
  });
});

test("API routes await an asynchronous shared rate limiter", async () => {
  const keys = [];
  const rateLimiter = { async allow(key) { keys.push(key); return false; } };
  await withServer(createApp({ rateLimiter }), async (base) => {
    const response = await fetch(`${base}/api/status`);
    assert.equal(response.status, 429);
    assert.deepEqual(keys, ["127.0.0.1"]);
  });
});

test("readiness checks shared dependencies without consuming request limits", async () => {
  const calls = [];
  const rateLimiter = {
    allow() { calls.push("allow"); return true; },
    async ready() { calls.push("ready"); return true; },
  };
  await withServer(createApp({ rateLimiter }), async (base) => {
    const response = await fetch(`${base}/readyz`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "ready");
    assert.deepEqual(calls, ["ready"]);
  });
});

test("readiness fails closed without exposing dependency errors", async () => {
  const rateLimiter = {
    allow() { return true; },
    async ready() { throw new Error("redis://secret-host:6379 unavailable"); },
  };
  await withServer(createApp({ rateLimiter }), async (base) => {
    const response = await fetch(`${base}/readyz`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "unavailable" });
  });
});

test("environment adapter recognizes named and generic compatible providers only when complete", () => {
  const providers = compatibleProvidersFromEnv({
    GROQ_API_KEY: "groq-secret",
    GROQ_CHAT_MODEL: "groq-model",
    OPENROUTER_API_KEY: "incomplete-without-model",
    OPENAI_COMPAT_API_KEY: "generic-secret",
    OPENAI_COMPAT_BASE_URL: "https://compatible.test/v1",
    OPENAI_COMPAT_MODEL: "generic-model",
  });
  assert.deepEqual(providers.map(({ provider }) => provider), ["compatible", "groq"]);
  assert.equal(providers[1].baseUrl, "https://api.groq.com/openai/v1");
});

test("legacy chat configuration no longer slows the ordinary fast route", () => {
  const client = clientFromEnv({ GEMINI_API_KEY: "test-only", GEMINI_CHAT_MODEL: "legacy-quality-model" });
  assert.equal(client.primary.models.chat, "gemini-3.1-flash-lite");
  assert.equal(client.primary.models.fast, "gemini-3.1-flash-lite");
  assert.equal(client.primary.models.grounded, "gemini-3.1-flash-lite");
  const overridden = clientFromEnv({ GEMINI_API_KEY: "test-only", GEMINI_GROUNDED_MODEL: "chosen-quality-model" });
  assert.equal(overridden.primary.models.grounded, "chosen-quality-model");
});

test("API routes enforce boundary and preserve deterministic reading context", async () => {
  const calls = [];
  const client = {
    models: { chat: "test-chat", transcribe: "test-stt", speech: "test-tts" },
    async chat(payload) {
      calls.push(payload);
      return { text: calls.length === 1 ? "先把症状和用药情况记录清楚。" : "先核对眼前条件【ZY-01-OVERVIEW】。" };
    },
    async transcribe() { return { text: "转写完成" }; },
    async speech() { return { data: "AQI=", mimeType: "audio/pcm", sampleRate: 24000 }; }
  };
  await withServer(createApp({ client }), async (base) => {
    const advisory = await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "我是否应该停药？", purpose: "divination" }) });
    const advisoryBody = await advisory.json();
    assert.equal(advisoryBody.blocked, undefined);
    assert.match(advisoryBody.text, /仅供传统文化体验与自我反思参考/u);
    assert.equal(calls.length, 1);

    const reading = { lines: [9, 7, 7, 7, 7, 7] };
    const chat = await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "这卦和我的问题有什么关系", stage: "reading", question: "未来三天先做什么", reading }) });
    const chatBody = await chat.json();
    assert.match(chatBody.text, /^先核对眼前条件【ZY-01-OVERVIEW】。/u);
    assert.match(chatBody.text, /仅供传统文化体验与自我反思参考/u);
    assert.equal(chatBody.grounded, true);
    assert.deepEqual(chatBody.evidence.slice(0, 2).map(({ id }) => id), ["ZY-01-OVERVIEW", "ZY-01-LINE-1"]);
    assert.match(calls[1].systemInstruction, /本卦第1卦 乾为天/u);
    assert.match(calls[1].systemInstruction, /【ZY-01-OVERVIEW】/u);
  });
});

test("voice endpoints validate media and return stable browser contracts", async () => {
  const client = {
    models: {},
    async transcribe({ bytes, mimeType }) { assert.equal(bytes.length, 3); assert.equal(mimeType, "audio/webm"); return { text: "语音问题" }; },
    async speech({ text }) { assert.equal(text, "墨衡回答"); return { data: "AQI=", mimeType: "audio/pcm;rate=24000", sampleRate: 24000 }; }
  };
  await withServer(createApp({ client }), async (base) => {
    const transcribe = await fetch(`${base}/api/transcribe`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: Buffer.from([1, 2, 3]).toString("base64"), mimeType: "audio/webm;codecs=opus" }) });
    assert.deepEqual(await transcribe.json(), { text: "语音问题" });
    const speech = await fetch(`${base}/api/speech`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "墨衡回答" }) });
    const speechBody = await speech.json();
    assert.equal(speechBody.data, "AQI=");
    assert.equal(speechBody.mimeType, "audio/pcm;rate=24000");
    assert.equal(speechBody.sampleRate, 24000);
    assert.equal(speechBody.runtime.cache, "miss");
    assert.equal(Number.isInteger(speechBody.runtime.synthesisMs), true);
  });
});

test("speech endpoint caches repeated sentences and coalesces provider work", async () => {
  let calls = 0;
  const client = {
    models: {},
    async speech() { calls += 1; return { data: "AQI=", mimeType: "audio/pcm", sampleRate: 24_000 }; },
  };
  await withServer(createApp({ client, now: () => 1_000 }), async (base) => {
    const request = () => fetch(`${base}/api/speech`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "重复句子" }),
    }).then((response) => response.json());
    const first = await request();
    const second = await request();
    assert.equal(calls, 1);
    assert.equal(first.runtime.cache, "miss");
    assert.equal(second.runtime.cache, "hit");
  });
});

test("ordinary identity questions work without a cast or decorative citation", async () => {
  const client = {
    models: { chat: "test-chat" },
    async chat({ systemInstruction, route }) {
      assert.match(systemInstruction, /目前还没有程序排出的卦象/u);
      assert.equal(route, "fast");
      return { text: "我是墨衡，一个能闲聊、讲《周易》，也能陪你起卦的虚拟卦师。", model: "test-fast", provider: "test" };
    },
  };
  await withServer(createApp({ client }), async (base) => {
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "你是谁？", purpose: "chat", stage: "question" }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.grounded, false);
    assert.equal(body.evidence.length, 0);
    assert.match(body.text, /墨衡/u);
    assert.equal(body.purpose, "chat");
    assert.equal(body.runtime.route, "fast");
    assert.equal(body.runtime.model, "test-fast");
  });
});

test("ordinary basic questions are not rejected by divination keyword rules", async () => {
  let called = false;
  const client = {
    models: { chat: "test-chat" },
    async chat() { called = true; return { text: "基金是集合投资工具；这里只作基础概念说明，不替你做投资决定。" }; },
  };
  await withServer(createApp({ client }), async (base) => {
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "基金是什么？", purpose: "chat", stage: "question" }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(called, true);
    assert.equal(body.blocked, undefined);
    assert.equal(body.purpose, "chat");
  });
});

test("immediate-harm chat uses crisis support instead of a divination refusal", async () => {
  let called = false;
  const client = {
    models: { chat: "test-chat" },
    async chat() { called = true; return { text: "should not be called" }; },
  };
  await withServer(createApp({ client }), async (base) => {
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "如果有人想伤害自己，现在应该怎么办？", purpose: "chat", stage: "question" }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(called, false);
    assert.equal(body.handled, true);
    assert.equal(body.safety, "crisis-support");
    assert.equal(body.blocked, undefined);
    assert.doesNotMatch(body.text, /不能替你起卦/u);
    assert.match(body.text, /110 或 120/u);
  });
});

test("investment and business divination are allowed with a deterministic reference note", async () => {
  let called = false;
  const client = {
    models: { chat: "test-chat" },
    async chat() { called = true; return { text: "卦象提示先看现金流、合同和退出条件。" }; },
  };
  await withServer(createApp({ client }), async (base) => {
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "这门生意和投资是否值得继续？", purpose: "divination", stage: "question" }),
    });
    const body = await response.json();
    assert.equal(called, true);
    assert.equal(body.blocked, undefined);
    assert.equal(body.purpose, "divination");
    assert.match(body.text, /现金流/u);
    assert.match(body.text, /仅供传统文化体验与自我反思参考/u);
  });
});

test("ordinary chat after a cast does not force unrelated reading evidence", async () => {
  let capturedInstruction = "";
  const client = {
    models: { chat: "test-chat" },
    async chat({ systemInstruction }) {
      capturedInstruction = systemInstruction;
      return { text: "基金是集合众多投资者资金、按既定策略投资的一类工具。" };
    },
  };
  const reading = { lines: [9, 7, 7, 7, 7, 7] };
  await withServer(createApp({ client }), async (base) => {
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "基金是什么？", purpose: "chat", stage: "reading", question: "未来三天先做什么", reading }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.purpose, "chat");
    assert.equal(body.grounded, false);
    assert.deepEqual(body.evidence, []);
    assert.match(body.text, /集合众多投资者资金/u);
    assert.doesNotMatch(capturedInstruction, /本卦第1卦 乾为天/u);
    assert.doesNotMatch(capturedInstruction, /用户固定的原问/u);
  });
});

test("streaming chat carries trusted Shanghai time and recent conversation context", async () => {
  const client = {
    models: { chat: "test-chat" },
    async *chatStream({ input, systemInstruction }) {
      assert.match(input, /我叫小明/u);
      assert.match(input, /我叫什么/u);
      assert.match(systemInstruction, /可信服务器时钟：2026年09月20日 09:15:30/u);
      yield { text: "你叫", model: "test-chat" };
      yield { text: "小明。今天是2026年9月20日。", model: "test-chat" };
    },
  };
  const fixedNow = () => Date.parse("2026-09-20T01:15:30.000Z");
  await withServer(createApp({ client, now: fixedNow }), async (base) => {
    const deltas = [];
    const api = new OracleApiClient({ baseUrl: base });
    const result = await api.chatStream({
      message: "我叫什么，今天几号？",
      purpose: "chat",
      stage: "question",
      history: [{ role: "user", text: "我叫小明" }, { role: "master", text: "记住了。" }],
    }, { onDelta: (text) => deltas.push(text) });
    assert.deepEqual(deltas, ["你叫", "小明。今天是2026年9月20日。"]);
    assert.equal(result.text, "你叫小明。今天是2026年9月20日。");
  });
});

test("streaming divination appends the same reference note as JSON chat", async () => {
  const client = {
    models: { chat: "test-chat" },
    async *chatStream() {
      yield { text: "先看市场与", model: "test-chat" };
      yield { text: "现金流。", model: "test-chat" };
    },
  };
  await withServer(createApp({ client }), async (base) => {
    const deltas = [];
    const api = new OracleApiClient({ baseUrl: base });
    const result = await api.chatStream({
      message: "这门生意如何？",
      purpose: "divination",
      stage: "question",
    }, { onDelta: (text) => deltas.push(text) });
    assert.equal(deltas.slice(0, 2).join(""), "先看市场与现金流。");
    assert.match(deltas.at(-1), /仅供传统文化体验与自我反思参考/u);
    assert.match(result.text, /仅供传统文化体验与自我反思参考/u);
  });
});

test("an interrupted stream is recovered with a complete replacement answer", async () => {
  const client = {
    models: { chat: "test-chat" },
    async *chatStream() {
      yield { text: "半截回答", model: "test-chat" };
      throw Object.assign(new Error("proxy reset"), { status: 502, code: "network_error" });
    },
    async chat({ signal }) {
      assert.equal(signal.aborted, false);
      return { text: "完整回答。" };
    },
  };
  await withServer(createApp({ client }), async (base) => {
    const replacements = [];
    const api = new OracleApiClient({ baseUrl: base });
    const result = await api.chatStream({
      message: "随便聊聊",
      purpose: "chat",
      stage: "question",
    }, { onReplace: (text) => replacements.push(text) });
    assert.deepEqual(replacements, ["完整回答。"]) ;
    assert.equal(result.text, "完整回答。");
    assert.equal(result.recovered, true);
  });
});

test("disconnecting a streaming browser aborts the upstream model request", async () => {
  let markAborted;
  const aborted = new Promise((resolve) => { markAborted = resolve; });
  let markLogged;
  const logged = new Promise((resolve) => { markLogged = resolve; });
  const logger = { info(event, details) { markLogged({ event, details }); } };
  const client = {
    models: { chat: "test-chat" },
    async *chatStream({ signal }) {
      await new Promise((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener("abort", resolve, { once: true });
      });
      markAborted(signal.aborted);
    },
  };
  await withServer(createApp({ client, logger }), async (base) => {
    const controller = new AbortController();
    const response = await fetch(`${base}/api/chat/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "请回答一个很长的问题", purpose: "chat", stage: "question" }),
      signal: controller.signal,
    });
    assert.equal(response.status, 200);
    controller.abort();
    assert.equal(await aborted, true);
    const record = await logged;
    assert.equal(record.event, "http_request_aborted");
    assert.equal(record.details.status, 499);
    assert.equal(record.details.path, "/api/chat/stream");
    assert.equal(record.details.client, null);
  });
});

test("upstream failure returns a stable error without terminating the server", async () => {
  const client = {
    models: { chat: "test-chat" },
    async chat() { throw Object.assign(new Error("upstream offline"), { status: 502, code: "network_error" }); },
  };
  await withServer(createApp({ client }), async (base) => {
    const failed = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "这卦与原问有什么关系？", stage: "reading", question: "未来三天先做什么", reading: { lines: [7, 7, 7, 7, 7, 7] } }),
    });
    assert.equal(failed.status, 502);
    assert.deepEqual(await failed.json(), { error: "network_error", message: "服务暂时不可用。" });
    assert.equal((await fetch(`${base}/api/status`)).status, 200);
  });
});

test("chat repairs a citation that was not retrieved for this turn", async () => {
  let calls = 0;
  const client = {
    models: { chat: "test-chat" },
    async chat({ systemInstruction }) {
      calls += 1;
      if (calls === 1) return { text: "这是伪造来源【ZY-63-LINE-6】。", model: "draft" };
      assert.match(systemInstruction, /上一次草稿没有满足引用约束/u);
      assert.match(systemInstruction, /【ZY-01-LINE-1】/u);
      return { text: "‘潜龙勿用’是乾卦初九爻辞【ZY-01-LINE-1】。", model: "repair" };
    },
  };
  await withServer(createApp({ client }), async (base) => {
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "潜龙勿用是什么意思？", stage: "question" }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(calls, 2);
    assert.equal(body.repaired, true);
    assert.equal(body.grounded, true);
    assert.match(body.text, /【ZY-01-LINE-1】/u);
    assert.equal(body.runtime.model, "repair");
  });
});

test("chat returns a natural retry invitation after two uncited drafts", async () => {
  let calls = 0;
  const client = {
    models: { chat: "test-chat" },
    async chat() { calls += 1; return { text: "潜龙勿用提醒先不要贸然行动。", model: `draft-${calls}` }; },
  };
  await withServer(createApp({ client }), async (base) => {
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "潜龙勿用是什么意思？", stage: "question" }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(calls, 2);
    assert.equal(body.grounded, false);
    assert.equal(body.groundingUnavailable, true);
    assert.deepEqual(body.evidence, []);
    assert.match(body.text, /经传依据核对完整/u);
    assert.doesNotMatch(body.text, /模型没有标注|回答已被拒绝/u);
  });
});

test("streaming grounded chat replaces an uncited draft with a repaired answer", async () => {
  let repairCalls = 0;
  const client = {
    models: { chat: "test-chat" },
    async *chatStream() {
      yield { text: "潜龙勿用提醒先等待。", model: "draft" };
    },
    async chat({ systemInstruction }) {
      repairCalls += 1;
      assert.match(systemInstruction, /上一次草稿没有满足引用约束/u);
      return { text: "‘潜龙勿用’强调处于初始潜藏阶段【ZY-01-LINE-1】。", model: "repair" };
    },
  };
  await withServer(createApp({ client }), async (base) => {
    const replacements = [];
    const deltas = [];
    const api = new OracleApiClient({ baseUrl: base });
    const result = await api.chatStream({ message: "潜龙勿用是什么意思？", stage: "question" }, {
      onDelta: (text) => deltas.push(text),
      onReplace: (text) => replacements.push(text),
    });
    assert.equal(repairCalls, 1);
    assert.deepEqual(deltas, [], "uncited draft must not reach text or speech callbacks");
    assert.equal(replacements.length, 1);
    assert.match(replacements[0], /【ZY-01-LINE-1】/u);
    assert.equal(result.repaired, true);
    assert.equal(result.grounded, true);
  });
});

test("streaming grounded chat releases a valid answer only after citation validation", async () => {
  const client = {
    models: { chat: "test-chat" },
    async *chatStream() {
      yield { text: "‘潜龙", model: "draft" };
      yield { text: "勿用’是乾卦初九爻辞【ZY-01-LINE-1】。", model: "draft" };
    },
  };
  await withServer(createApp({ client }), async (base) => {
    const deltas = [];
    const api = new OracleApiClient({ baseUrl: base });
    const result = await api.chatStream({ message: "潜龙勿用是什么意思？", stage: "question" }, {
      onDelta: (text) => deltas.push(text),
    });
    assert.deepEqual(deltas, ["‘潜龙勿用’是乾卦初九爻辞【ZY-01-LINE-1】。"]);
    assert.equal(result.grounded, true);
  });
});

test("ordinary chat ignores weak accidental retrieval candidates", async () => {
  const weakEvidence = [{
    id: "ZY-01-OVERVIEW",
    title: "乾为天",
    excerpt: "测试片段",
    sourceTitle: "测试来源",
    sourceUrl: "https://example.com",
    matchScore: 8,
    matchedBy: [],
  }];
  const knowledgeBase = {
    summary: { schema: "test", version: "1", hexagrams: 0, trigrams: 0, fragments: 1 },
    retrieve: () => weakEvidence,
  };
  const client = {
    models: { chat: "test-chat" },
    async chat({ route, systemInstruction }) {
      assert.equal(route, "fast");
      assert.match(systemInstruction, /本轮没有检索到经传片段/u);
      return { text: "今天上海有些凉，出门前看一下实时天气。" };
    },
  };
  await withServer(createApp({ client, knowledgeBase }), async (base) => {
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "今天适合穿什么？", purpose: "chat" }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.grounded, false);
    assert.deepEqual(body.evidence, []);
    assert.equal(body.runtime.route, "fast");
  });
});
