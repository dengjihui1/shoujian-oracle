import test from "node:test";
import assert from "node:assert/strict";
import { GeminiClient, GeminiError, extractAudio, extractText, parseGeminiSse } from "../server/gemini-client.mjs";

test("Gemini SSE rejects an oversized unterminated event", async () => {
  await assert.rejects(async () => {
    for await (const _text of parseGeminiSse(new Response(`data: ${"x".repeat(65_537)}`).body)) { /* consume */ }
  }, (error) => error instanceof GeminiError && error.code === "invalid_response");
});

test("Gemini SSE rejects a single oversized network chunk", async () => {
  await assert.rejects(async () => {
    for await (const _text of parseGeminiSse(new Response(`data: ${"x".repeat(300_000)}`).body)) { /* consume */ }
  }, (error) => error instanceof GeminiError && error.code === "invalid_response" && /chunk/u.test(error.message));
});

test("extractors understand wrapped Interactions API responses", () => {
  assert.equal(extractText({ interaction: { outputs: [{ type: "text", text: " 墨衡答复 " }] } }), "墨衡答复");
  assert.deepEqual(extractAudio({ interaction: { output_audio: { data: "AQI=", mime_type: "audio/pcm" } } }), { data: "AQI=", mimeType: "audio/pcm" });
});

test("transcription sends short audio inline in one request", async () => {
  const calls = [];
  const client = new GeminiClient({
    apiKey: "test-only",
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ interaction: { output_text: "我想问下一步" } });
    }
  });
  const result = await client.transcribe({ bytes: Uint8Array.from([1, 2, 3]), mimeType: "audio/webm" });
  assert.equal(result.text, "我想问下一步");
  assert.equal(result.transport, "inline");
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.input[0].type, "audio");
  assert.equal(body.input[0].data, "AQID");
  assert.equal(body.input[0].mime_type, "audio/webm");
});

test("transcription falls back to Files API when inline audio is rejected", async () => {
  const calls = [];
  const responses = [
    Response.json({ error: { message: "inline audio unsupported" } }, { status: 400 }),
    new Response("", { status: 200, headers: { "x-goog-upload-url": "https://upload.test/session" } }),
    Response.json({ file: { uri: "https://files.test/audio", name: "files/audio-1" } }),
    Response.json({ interaction: { output_text: "我想问下一步" } }),
    new Response("", { status: 200 })
  ];
  const client = new GeminiClient({ apiKey: "test-only", fetchFn: async (url, options) => { calls.push({ url, options }); return responses.shift(); } });
  const result = await client.transcribe({ bytes: Uint8Array.from([1, 2, 3]), mimeType: "audio/webm" });
  assert.equal(result.text, "我想问下一步");
  assert.equal(result.transport, "file");
  assert.match(calls[1].url, /upload\/v1beta\/files$/u);
  assert.equal(calls[2].url, "https://upload.test/session");
  const interaction = JSON.parse(calls[3].options.body);
  assert.equal(interaction.model, "gemini-3.5-transcribe");
  assert.equal(interaction.input[0].uri, "https://files.test/audio");
  assert.match(calls[4].url, /v1beta\/files\/audio-1$/u);
  assert.equal(calls[4].options.method, "DELETE");
});

test("transcription does not add a slow upload retry for provider outages", async () => {
  let calls = 0;
  const client = new GeminiClient({
    apiKey: "test-only",
    fetchFn: async () => {
      calls += 1;
      return Response.json({ error: { message: "temporarily unavailable" } }, { status: 503 });
    }
  });
  await assert.rejects(
    () => client.transcribe({ bytes: Uint8Array.from([1, 2, 3]), mimeType: "audio/webm" }),
    (error) => error.code === "upstream_error" && error.providerStatus === 503
  );
  assert.equal(calls, 1);
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

test("chat falls back to another model when the primary model is overloaded", async () => {
  const requestedModels = [];
  const client = new GeminiClient({
    apiKey: "test-only",
    models: { chat: "chat-busy" },
    chatFallbackModels: ["chat-stable"],
    fetchFn: async (_url, options) => {
      const body = JSON.parse(options.body);
      requestedModels.push(body.model);
      return body.model === "chat-busy"
        ? Response.json({ error: { message: "high demand" } }, { status: 503 })
        : Response.json({ interaction: { output_text: "备用模型回答正常。" } });
    }
  });

  const result = await client.chat({ input: "你是谁？", systemInstruction: "自然回答" });
  assert.equal(result.text, "备用模型回答正常。");
  assert.equal(result.model, "chat-stable");
  assert.deepEqual(requestedModels, ["chat-busy", "chat-stable"]);
});

test("chat routes ordinary and grounded requests to separate model chains", async () => {
  const requestedModels = [];
  const client = new GeminiClient({
    apiKey: "test-only",
    models: { fast: "chat-fast", grounded: "chat-grounded" },
    fastFallbackModels: [],
    groundedFallbackModels: [],
    fetchFn: async (_url, options) => {
      const body = JSON.parse(options.body);
      requestedModels.push(body.model);
      return Response.json({ interaction: { output_text: "回答" } });
    }
  });
  assert.equal((await client.chat({ input: "你好", systemInstruction: "自然回答", route: "fast" })).model, "chat-fast");
  assert.equal((await client.chat({ input: "解释卦辞", systemInstruction: "必须引证", route: "grounded" })).model, "chat-grounded");
  assert.deepEqual(requestedModels, ["chat-fast", "chat-grounded"]);
});

test("chat stream yields Gemini SSE chunks and falls back before the first chunk", async () => {
  const requestedModels = [];
  const client = new GeminiClient({
    apiKey: "test-only",
    models: { chat: "chat-busy" },
    chatFallbackModels: ["chat-streaming"],
    fetchFn: async (url) => {
      const model = decodeURIComponent(url.match(/models\/([^:]+):/u)?.[1] ?? "");
      requestedModels.push(model);
      if (model === "chat-busy") return Response.json({ error: { message: "high demand" } }, { status: 503 });
      return new Response([
        'data: {"candidates":[{"content":{"parts":[{"text":"今天是"}]}}]}',
        'data: {"candidates":[{"content":{"parts":[{"text":"2026年9月20日。"}]}}]}',
        "",
      ].join("\n\n"), { headers: { "content-type": "text/event-stream" } });
    }
  });

  const chunks = [];
  for await (const chunk of client.chatStream({ input: "今天几号", systemInstruction: "使用服务器日期" })) chunks.push(chunk);
  assert.deepEqual(chunks.map(({ text }) => text), ["今天是", "2026年9月20日。"]) ;
  assert.ok(chunks.every(({ model }) => model === "chat-streaming"));
  assert.deepEqual(requestedModels, ["chat-busy", "chat-streaming"]);
});

test("Gemini SSE parsing handles CRLF split across network chunks", async () => {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"拆'));
      controller.enqueue(encoder.encode('包"}]}}]}\r'));
      controller.enqueue(encoder.encode('\n\r\n'));
      controller.close();
    }
  });
  const chunks = [];
  for await (const text of parseGeminiSse(body)) chunks.push(text);
  assert.deepEqual(chunks, ["拆包"]);
});

test("an aborted chat stream does not try fallback models", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const client = new GeminiClient({
    apiKey: "test-only",
    models: { chat: "primary" },
    chatFallbackModels: ["fallback"],
    fetchFn: async (_url, options) => {
      calls += 1;
      if (options.signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      return new Response("");
    }
  });
  await assert.rejects(async () => {
    for await (const _chunk of client.chatStream({ input: "x", systemInstruction: "y", signal: controller.signal })) { /* no-op */ }
  }, (error) => error.code === "cancelled");
  assert.equal(calls, 1);
});
