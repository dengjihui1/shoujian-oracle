import assert from "node:assert/strict";
import test from "node:test";
import { GoogleStreamRecognizer } from "../src/google-stream-recognizer.js";

test("browser stream sends actual sample rate and exposes incremental text", async () => {
  const previous = globalThis.AudioWorkletNode;
  const sent = [];
  let stopped = false;
  class Node {
    constructor() { this.port = {}; }
    connect() {}
    disconnect() {}
  }
  class Socket {
    static OPEN = 1;
    constructor() { this.readyState = 1; queueMicrotask(() => this.onopen()); }
    send(value) {
      sent.push(value);
      if (typeof value !== "string") return;
      const message = JSON.parse(value);
      if (message.type === "start") queueMicrotask(() => this.onmessage({ data: JSON.stringify({ type: "ready" }) }));
      if (message.type === "stop") queueMicrotask(() => this.onmessage({ data: JSON.stringify({ type: "done", text: "搬家合适吗" }) }));
    }
    close() { this.readyState = 3; }
  }
  class Context {
    sampleRate = 44100;
    state = "running";
    audioWorklet = { addModule: async () => {} };
    destination = {};
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createGain() { return { gain: { value: 1 }, connect() {} }; }
    async close() {}
  }
  globalThis.AudioWorkletNode = Node;
  try {
    const recognizer = new GoogleStreamRecognizer({ enabled: true, mediaDevices: { async getUserMedia() { return { getTracks: () => [{ stop() { stopped = true; } }] }; } },
      AudioContextClass: Context, WebSocketClass: Socket, location: { protocol: "http:", host: "127.0.0.1:8000" } });
    const updates = [];
    const result = recognizer.start({ onText: (text, detail) => updates.push([text, detail]) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const socket = recognizer.socket;
    socket.onmessage({ data: JSON.stringify({ type: "text", final: "", interim: "搬家" }) });
    socket.onmessage({ data: JSON.stringify({ type: "text", final: "搬家合适吗", interim: "" }) });
    assert.deepEqual(updates.map(([text]) => text), ["搬家", "搬家合适吗"]);
    assert.equal(JSON.parse(sent[0]).sampleRate, 44100);
    recognizer.stop();
    assert.equal(await result, "搬家合适吗");
    assert.equal(stopped, true);
  } finally {
    globalThis.AudioWorkletNode = previous;
  }
});

test("a late microphone grant is released after cancellation", async () => {
  const previous = globalThis.AudioWorkletNode;
  globalThis.AudioWorkletNode = class {};
  let grant;
  let stopped = false;
  const recognizer = new GoogleStreamRecognizer({ enabled: true, mediaDevices: { getUserMedia: () => new Promise((resolve) => { grant = resolve; }) },
    AudioContextClass: class {}, WebSocketClass: class {}, location: { protocol: "http:", host: "localhost" } });
  const result = recognizer.start();
  recognizer.abort();
  grant({ getTracks: () => [{ stop() { stopped = true; } }] });
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(stopped, true);
  globalThis.AudioWorkletNode = previous;
});
