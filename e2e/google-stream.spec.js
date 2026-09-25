import { expect, test } from "@playwright/test";
import { EventEmitter, once } from "node:events";
import { createHttpAppServer } from "../server/index.mjs";

test("AudioWorklet PCM reaches streaming STT and returns interim text", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "real AudioWorklet transport smoke runs once in Chromium");
  let audioBytes = 0;
  const client = {
    streamingRecognize(config) {
      expect(config.config.encoding).toBe("LINEAR16");
      const stream = new EventEmitter();
      stream.write = (data) => {
        audioBytes += data.length;
        if (audioBytes === data.length) stream.emit("data", { results: [{ alternatives: [{ transcript: "搬家" }], isFinal: false }] });
      };
      stream.end = () => {
        stream.emit("data", { results: [{ alternatives: [{ transcript: "搬家合适吗" }], isFinal: true }] });
        stream.emit("end");
      };
      stream.destroy = () => {};
      return stream;
    },
  };
  const server = createHttpAppServer({ sttClient: client });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const result = await page.evaluate(async () => {
      const { GoogleStreamRecognizer } = await import("/src/google-stream-recognizer.js");
      const sourceContext = new AudioContext();
      const destination = sourceContext.createMediaStreamDestination();
      const oscillator = sourceContext.createOscillator();
      oscillator.connect(destination);
      oscillator.start();
      const updates = [];
      const recognizer = new GoogleStreamRecognizer({ enabled: true,
        mediaDevices: { getUserMedia: async () => destination.stream } });
      try {
        const promise = recognizer.start({ onText: (text) => updates.push(text) });
        for (let attempt = 0; attempt < 100 && !updates.length; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        recognizer.stop();
        return { text: await promise, updates };
      } finally {
        oscillator.stop();
        await sourceContext.close();
      }
    });
    expect(result.updates).toContain("搬家");
    expect(result.text).toBe("搬家合适吗");
    expect(audioBytes).toBeGreaterThan(0);
  } finally {
    server.close();
    await once(server, "close");
  }
});
