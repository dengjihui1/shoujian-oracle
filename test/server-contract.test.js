import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { compatibleProvidersFromEnv, createApp } from "../server/index.mjs";
import { OracleApiClient } from "../src/api-client.js";

async function withServer(app, run) {
  const server = createServer(app).listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try { await run(`http://127.0.0.1:${port}`); } finally { server.close(); await once(server, "close"); }
}

test("status exposes local fallback without leaking credentials", async () => {
  await withServer(createApp(), async (base) => {
    const response = await fetch(`${base}/api/status`);
    assert.equal(response.status, 200);
    const status = await response.json();
    assert.equal(status.cloud, false);
    assert.equal(status.provider, null);
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

    const reading = { primary: { number: 1, fullName: "乾为天", lower: { name: "乾", image: "天" }, upper: { name: "乾", image: "天" } }, movingLines: [1], changed: { fullName: "天风姤" } };
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
    assert.deepEqual(await speech.json(), { data: "AQI=", mimeType: "audio/pcm;rate=24000", sampleRate: 24000 });
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
  const reading = { primary: { number: 1, fullName: "乾为天", lower: { name: "乾", image: "天" }, upper: { name: "乾", image: "天" } }, movingLines: [1], changed: { fullName: "天风姤" } };
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
    assert.match(capturedInstruction, /本卦第1卦 乾为天/u);
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
  await withServer(createApp({ client }), async (base) => {
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
      body: JSON.stringify({ message: "这卦与原问有什么关系？", stage: "reading", question: "未来三天先做什么", reading: { primary: { number: 1, fullName: "乾为天" }, movingLines: [] } }),
    });
    assert.equal(failed.status, 502);
    assert.deepEqual(await failed.json(), { error: "network_error", message: "服务暂时不可用。" });
    assert.equal((await fetch(`${base}/api/status`)).status, 200);
  });
});

test("chat rejects citations that were not retrieved for this turn", async () => {
  const client = {
    models: { chat: "test-chat" },
    async chat() { return { text: "这是伪造来源【ZY-63-LINE-6】。" }; },
  };
  await withServer(createApp({ client }), async (base) => {
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "潜龙勿用是什么意思？", stage: "question" }),
    });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      error: "ungrounded_reply",
      message: "模型引用了本轮未检索到的来源，回答已被拒绝。请重试。",
    });
  });
});

test("chat rejects an uncited answer when this turn retrieved evidence", async () => {
  const client = {
    models: { chat: "test-chat" },
    async chat() { return { text: "潜龙勿用提醒先不要贸然行动。" }; },
  };
  await withServer(createApp({ client }), async (base) => {
    const response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "潜龙勿用是什么意思？", stage: "question" }),
    });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      error: "ungrounded_reply",
      message: "模型没有标注本轮检索来源，回答已被拒绝。请重试。",
    });
  });
});
