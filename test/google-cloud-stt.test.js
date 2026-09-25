import assert from "node:assert/strict";
import test from "node:test";
import { PassThrough } from "node:stream";
import { once } from "node:events";
import WebSocket from "ws";
import { createHttpAppServer } from "../server/index.mjs";
import { googleCloudSttFromEnv } from "../server/google-cloud-stt.mjs";

test("Cloud STT requires an explicit switch", () => {
  assert.equal(googleCloudSttFromEnv({}), null);
  const client = {};
  assert.equal(googleCloudSttFromEnv({ GOOGLE_CLOUD_STT_ENABLED: "true" }, { client }), client);
});

test("an HTTPS proxy is made available to grpc-js when streaming STT starts", () => {
  const previous = process.env.grpc_proxy;
  const httpsProxy = process.env.https_proxy;
  const httpProxy = process.env.http_proxy;
  try {
    delete process.env.grpc_proxy;
    delete process.env.https_proxy;
    delete process.env.http_proxy;
    googleCloudSttFromEnv({ GOOGLE_CLOUD_STT_ENABLED: "true", HTTPS_PROXY: "http://127.0.0.1:1234" }, { client: {} });
    assert.equal(process.env.grpc_proxy, "http://127.0.0.1:1234");
  } finally {
    for (const [name, value] of Object.entries({ grpc_proxy: previous, https_proxy: httpsProxy, http_proxy: httpProxy })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("stream accepts PCM, returns interim and final, and closes after stop", async () => {
  let upstream;
  let config;
  const client = { streamingRecognize(value) { config = value; upstream = new PassThrough(); return upstream; } };
  const server = createHttpAppServer({ sttClient: client });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const status = await (await fetch(`${origin}/api/status`)).json();
    assert.equal(status.streamingStt, true);
    const ws = new WebSocket(`${origin.replace("http", "ws")}/api/stt/stream`, { origin });
    await once(ws, "open");
    const messages = [];
    ws.on("message", (data) => messages.push(JSON.parse(String(data))));
    ws.send(JSON.stringify({ type: "start", sampleRate: 48000 }));
    await waitFor(() => messages.some((item) => item.type === "ready"));
    assert.equal(config.config.sampleRateHertz, 48000);
    assert.equal(config.interimResults, true);
    ws.send(Buffer.from([1, 0, 2, 0]));
    upstream.emit("data", { results: [{ alternatives: [{ transcript: "搬家" }], isFinal: false }] });
    upstream.emit("data", { results: [{ alternatives: [{ transcript: "搬家合适吗" }], isFinal: true }] });
    await waitFor(() => messages.filter((item) => item.type === "text").length === 2);
    ws.send('{"type":"stop"}');
    await once(ws, "close");
    assert.deepEqual(messages.filter((item) => item.type === "text").map((item) => [item.final, item.interim]),
      [["", "搬家"], ["搬家合适吗", ""]]);
    assert.deepEqual(messages.at(-1), { type: "done", text: "搬家合适吗" });
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("WebSocket upgrade rejects a different origin", async () => {
  const server = createHttpAppServer({ sttClient: { streamingRecognize() { throw new Error("must not run"); } } });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/api/stt/stream`, { origin: "http://evil.example" });
    const [, response] = await once(ws, "unexpected-response");
    assert.equal(response.statusCode, 403);
    response.resume();
  } finally {
    server.close();
    await once(server, "close");
  }
});

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("timed out waiting for stream event");
}
