import test from "node:test";
import assert from "node:assert/strict";
import { GeminiClient, GeminiError, extractAudio, extractText } from "../server/gemini-client.mjs";

test("extractors understand wrapped Interactions API responses", () => {
  assert.equal(extractText({ interaction: { outputs: [{ type: "text", text: " 墨衡答复 " }] } }), "墨衡答复");
  assert.deepEqual(extractAudio({ interaction: { output_audio: { data: "AQI=", mime_type: "audio/pcm" } } }), { data: "AQI=", mimeType: "audio/pcm" });
});

test("transcription uploads bytes before creating an interaction", async () => {
  const calls = [];
  const responses = [
    new Response("", { status: 200, headers: { "x-goog-upload-url": "https://upload.test/session" } }),
    Response.json({ file: { uri: "https://files.test/audio", name: "files/audio-1" } }),
    Response.json({ interaction: { output_text: "我想问下一步" } }),
    new Response("", { status: 200 })
  ];
  const client = new GeminiClient({ apiKey: "test-only", fetchFn: async (url, options) => { calls.push({ url, options }); return responses.shift(); } });
  const result = await client.transcribe({ bytes: Uint8Array.from([1, 2, 3]), mimeType: "audio/webm" });
  assert.equal(result.text, "我想问下一步");
  assert.match(calls[0].url, /upload\/v1beta\/files$/u);
  assert.equal(calls[1].url, "https://upload.test/session");
  const interaction = JSON.parse(calls[2].options.body);
  assert.equal(interaction.model, "gemini-3.5-transcribe");
  assert.equal(interaction.input[0].uri, "https://files.test/audio");
  assert.match(calls[3].url, /v1beta\/files\/audio-1$/u);
  assert.equal(calls[3].options.method, "DELETE");
});

test("chat and speech use configurable current model IDs", async () => {
  const bodies = [];
  const client = new GeminiClient({
    apiKey: "test-only",
    models: { chat: "chat-current", speech: "speech-current" },
    fetchFn: async (_url, options) => {
      const body = JSON.parse(options.body); bodies.push(body);
      return body.response_format ? Response.json({ interaction: { output_audio: { data: "AQI=" } } }) : Response.json({ interaction: { output_text: "可先做一件小事。" } });
    }
  });
  assert.equal((await client.chat({ input: "你好", systemInstruction: "守边界" })).text, "可先做一件小事。");
  assert.equal((await client.speech({ text: "慢慢说" })).data, "AQI=");
  assert.equal(bodies[0].model, "chat-current");
  assert.equal(bodies[1].model, "speech-current");
});

test("upstream errors are sanitized and categorized", async () => {
  const client = new GeminiClient({ apiKey: "test-only", fetchFn: async () => Response.json({ error: { message: "bad AIzaSecretValue" } }, { status: 429 }) });
  await assert.rejects(() => client.chat({ input: "x", systemInstruction: "y" }), (error) => error instanceof GeminiError && error.code === "quota_exceeded" && !error.message.includes("AIzaSecretValue"));
});
