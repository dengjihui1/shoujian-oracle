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
    assert.deepEqual(await response.json(), { cloud: false, provider: null, models: null });
    const hidden = await fetch(`${base}/.env`);
    assert.equal(hidden.status, 404);
  });
});

test("API routes enforce boundary and preserve deterministic reading context", async () => {
  const calls = [];
  const client = {
    models: { chat: "test-chat", transcribe: "test-stt", speech: "test-tts" },
    async chat(payload) { calls.push(payload); return { text: "先核对眼前条件。" }; },
    async transcribe() { return { text: "转写完成" }; },
    async speech() { return { data: "AQI=", mimeType: "audio/pcm", sampleRate: 24000 }; }
  };
  await withServer(createApp({ client }), async (base) => {
    const blocked = await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "我是否应该停药？" }) });
    assert.equal((await blocked.json()).blocked, true);
    assert.equal(calls.length, 0);

    const reading = { primary: { number: 1, fullName: "乾为天", lower: { name: "乾", image: "天" }, upper: { name: "乾", image: "天" } }, movingLines: [1], changed: { fullName: "天风姤" } };
    const chat = await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "这卦和我的问题有什么关系", stage: "reading", question: "未来三天先做什么", reading }) });
    assert.deepEqual(await chat.json(), { text: "先核对眼前条件。" });
    assert.match(calls[0].systemInstruction, /本卦第1卦 乾为天/u);
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
