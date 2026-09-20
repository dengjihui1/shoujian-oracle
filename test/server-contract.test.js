import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createApp } from "../server/index.mjs";

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

test("API routes enforce boundary and preserve deterministic reading context", async () => {
  const calls = [];
  const client = {
    models: { chat: "test-chat", transcribe: "test-stt", speech: "test-tts" },
    async chat(payload) { calls.push(payload); return { text: "先核对眼前条件【ZY-01-OVERVIEW】。" }; },
    async transcribe() { return { text: "转写完成" }; },
    async speech() { return { data: "AQI=", mimeType: "audio/pcm", sampleRate: 24000 }; }
  };
  await withServer(createApp({ client }), async (base) => {
    const blocked = await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "我是否应该停药？" }) });
    assert.equal((await blocked.json()).blocked, true);
    assert.equal(calls.length, 0);

    const reading = { primary: { number: 1, fullName: "乾为天", lower: { name: "乾", image: "天" }, upper: { name: "乾", image: "天" } }, movingLines: [1], changed: { fullName: "天风姤" } };
    const chat = await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "这卦和我的问题有什么关系", stage: "reading", question: "未来三天先做什么", reading }) });
    const chatBody = await chat.json();
    assert.equal(chatBody.text, "先核对眼前条件【ZY-01-OVERVIEW】。");
    assert.equal(chatBody.grounded, true);
    assert.deepEqual(chatBody.evidence.slice(0, 2).map(({ id }) => id), ["ZY-01-OVERVIEW", "ZY-01-LINE-1"]);
    assert.match(calls[0].systemInstruction, /本卦第1卦 乾为天/u);
    assert.match(calls[0].systemInstruction, /【ZY-01-OVERVIEW】/u);
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
