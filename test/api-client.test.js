import assert from "node:assert/strict";
import test from "node:test";
import { OracleApiClient, parseEventStream } from "../src/api-client.js";
import { MAX_CHAT_REPLY_CHARS, MAX_SSE_CHUNK_BYTES, MAX_SSE_EVENT_CHARS } from "../src/stream-limits.js";

test("default browser fetch keeps its required global receiver", async () => {
  const originalFetch = globalThis.fetch;
  const receiver = globalThis;
  globalThis.fetch = function fetchWithRequiredReceiver(url, options) {
    assert.equal(this, receiver);
    assert.equal(url, "/api/status");
    assert.equal(options.method, "GET");
    return Promise.resolve(new Response(JSON.stringify({ cloud: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
  };

  try {
    const result = await new OracleApiClient().status();
    assert.equal(result.cloud, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("browser receives a stable Chinese message for upstream failures", async () => {
  const client = new OracleApiClient({
    fetchFn: async () => Response.json({
      error: "upstream_error",
      message: "Gemini rejected the request: provider detail"
    }, { status: 502 })
  });

  await assert.rejects(
    () => client.chat({ message: "潜龙勿用是什么意思？" }),
    (error) => error.code === "upstream_error" && error.message === "云端服务暂时不可用，请稍后重试"
  );
});

test("browser client exposes metadata and text while an SSE answer is arriving", async () => {
  const sse = [
    'event: meta\ndata: {"evidence":[],"grounded":false,"purpose":"chat"}',
    'event: delta\ndata: {"text":"今天是"}',
    'event: delta\ndata: {"text":"2026年9月20日。"}',
    'event: done\ndata: {"text":"今天是2026年9月20日。"}',
    "",
  ].join("\n\n");
  const deltas = [];
  const client = new OracleApiClient({ fetchFn: async () => new Response(sse, { headers: { "content-type": "text/event-stream" } }) });
  const result = await client.chatStream({ message: "今天几号" }, { onDelta: (text) => deltas.push(text) });
  assert.deepEqual(deltas, ["今天是", "2026年9月20日。"]) ;
  assert.equal(result.text, "今天是2026年9月20日。");
  assert.equal(result.purpose, "chat");
});

test("browser replaces a partial stream when the server recovers it", async () => {
  const sse = [
    'event: meta\ndata: {"evidence":[],"grounded":false,"purpose":"chat"}',
    'event: delta\ndata: {"text":"半截"}',
    'event: replace\ndata: {"text":"恢复后的完整回答。","recovered":true}',
    'event: done\ndata: {"text":"恢复后的完整回答。","recovered":true}',
    "",
  ].join("\n\n");
  const replacements = [];
  const client = new OracleApiClient({ fetchFn: async () => new Response(sse, { headers: { "content-type": "text/event-stream" } }) });
  const result = await client.chatStream({ message: "你好" }, { onReplace: (text) => replacements.push(text) });
  assert.deepEqual(replacements, ["恢复后的完整回答。"]) ;
  assert.equal(result.text, "恢复后的完整回答。");
  assert.equal(result.recovered, true);
});

test("browser forwards cancellation signals to chat, transcription, and speech", async () => {
  const signals = [];
  const fetchFn = async (_url, options) => {
    signals.push(options.signal);
    if (signals.length === 1) {
      return new Response('event: done\ndata: {"text":"完成"}\n\n', { headers: { "content-type": "text/event-stream" } });
    }
    return Response.json(signals.length === 2 ? { text: "转写" } : { data: "AQI=" });
  };
  const client = new OracleApiClient({ fetchFn });
  const controllers = [new AbortController(), new AbortController(), new AbortController()];
  await client.chatStream({ message: "你好" }, { signal: controllers[0].signal });
  await client.transcribe({ data: "AQI=", mimeType: "audio/webm" }, { signal: controllers[1].signal });
  await client.speech("你好", { signal: controllers[2].signal });
  assert.deepEqual(signals, controllers.map(({ signal }) => signal));
});

test("browser SSE parsing handles CRLF boundaries split between chunks", async () => {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('event: delta\r\ndata: {"text":"渐'));
      controller.enqueue(encoder.encode('进"}\r'));
      controller.enqueue(encoder.encode('\n\r\n'));
      controller.close();
    }
  });
  const events = [];
  for await (const event of parseEventStream(body)) events.push(event);
  assert.deepEqual(events, [{ event: "delta", data: { text: "渐进" } }]);
});

test("browser cancels a stream with an oversized network chunk", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(MAX_SSE_CHUNK_BYTES + 1)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(async () => {
    for await (const _event of parseEventStream(body)) { /* consume */ }
  }, (error) => error.code === "invalid_stream");
  assert.equal(cancelled, true);
});

test("browser cancels a stream with an unterminated oversized event", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(new TextEncoder().encode(`data: ${"x".repeat(MAX_SSE_EVENT_CHARS)}`)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(async () => {
    for await (const _event of parseEventStream(body)) { /* consume */ }
  }, (error) => error.code === "invalid_stream");
  assert.equal(cancelled, true);
});

test("browser rejects an oversized answer before exposing it to the page", async () => {
  const reply = "甲".repeat(MAX_CHAT_REPLY_CHARS + 1);
  const sse = `event: delta\ndata: ${JSON.stringify({ text: reply })}\n\n`;
  let exposed = false;
  const client = new OracleApiClient({ fetchFn: async () => new Response(sse, { headers: { "content-type": "text/event-stream" } }) });
  await assert.rejects(() => client.chatStream({ message: "你好" }, { onDelta: () => { exposed = true; } }),
    (error) => error.code === "response_too_large");
  assert.equal(exposed, false);
});
