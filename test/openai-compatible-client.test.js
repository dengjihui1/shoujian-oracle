import assert from "node:assert/strict";
import test from "node:test";
import { CompatibleApiError, OpenAiCompatibleClient, parseCompatibleSse } from "../server/openai-compatible-client.mjs";

test("compatible SSE rejects an oversized unterminated event", async () => {
  await assert.rejects(async () => {
    for await (const _text of parseCompatibleSse(new Response(`data: ${"x".repeat(65_537)}`).body, "test")) { /* consume */ }
  }, (error) => error instanceof CompatibleApiError && error.code === "invalid_response");
});

test("compatible SSE rejects a single oversized network chunk", async () => {
  await assert.rejects(async () => {
    for await (const _text of parseCompatibleSse(new Response(`data: ${"x".repeat(300_000)}`).body, "test")) { /* consume */ }
  }, (error) => error instanceof CompatibleApiError && error.code === "invalid_response" && /chunk/u.test(error.message));
});

test("compatible SSE cancels the provider stream after malformed data", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(new TextEncoder().encode("data: invalid-json\n\n")); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(async () => {
    for await (const _text of parseCompatibleSse(body, "test")) { /* consume */ }
  }, (error) => error.code === "invalid_response");
  assert.equal(cancelled, true);
});

test("compatible client uses route models and OpenAI chat contracts", async () => {
  const calls = [];
  const client = new OpenAiCompatibleClient({
    apiKey: "sk-test-only",
    baseUrl: "https://provider.test/v1/",
    model: "fast-model",
    groundedModel: "grounded-model",
    provider: "test-provider",
    fetchFn: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return Response.json({ model: "served-model", choices: [{ message: { content: " 兼容回答 " } }] });
    },
  });
  const result = await client.chat({ input: "用户问题", systemInstruction: "系统规则", route: "grounded" });
  assert.deepEqual(result, { text: "兼容回答", model: "served-model", provider: "test-provider" });
  assert.equal(calls[0].url, "https://provider.test/v1/chat/completions");
  assert.equal(calls[0].body.model, "grounded-model");
  assert.equal(calls[0].body.messages[0].role, "system");
  assert.equal(calls[0].options.headers.authorization, "Bearer sk-test-only");
});

test("compatible SSE yields only assistant content", async () => {
  const sse = [
    'data: {"choices":[{"delta":{"content":"先看"}}]}',
    'data: {"choices":[{"delta":{"content":"条件。"}}]}',
    "data: [DONE]",
    "",
  ].join("\n\n");
  const chunks = [];
  for await (const text of parseCompatibleSse(new Response(sse).body, "test")) chunks.push(text);
  assert.deepEqual(chunks, ["先看", "条件。"]) ;
});

test("compatible SSE handles a CRLF boundary split across chunks", async () => {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"渐'));
      controller.enqueue(encoder.encode('进"}}]}\r'));
      controller.enqueue(encoder.encode('\n\r\n'));
      controller.close();
    },
  });
  const chunks = [];
  for await (const text of parseCompatibleSse(body, "test")) chunks.push(text);
  assert.deepEqual(chunks, ["渐进"]);
});

test("compatible errors are sanitized and categorized", async () => {
  const client = new OpenAiCompatibleClient({
    apiKey: "sk-secret",
    baseUrl: "https://provider.test/v1",
    model: "model",
    fetchFn: async () => Response.json({ error: { message: "bad sk-leaked-secret" } }, { status: 429 }),
  });
  await assert.rejects(
    () => client.chat({ input: "x", systemInstruction: "y" }),
    (error) => error instanceof CompatibleApiError && error.code === "quota_exceeded" && !error.message.includes("sk-leaked-secret")
  );
});
