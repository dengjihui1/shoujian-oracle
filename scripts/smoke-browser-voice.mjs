import { chromium, expect } from "@playwright/test";

const baseUrl = process.env.SHOUJIAN_BASE_URL ?? "http://127.0.0.1:8000";
const phrase = "你好，今天我们聊聊周易。";
const started = performance.now();
const speechResponse = await fetch(`${baseUrl}/api/speech`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ text: phrase }),
  signal: AbortSignal.timeout(45_000),
});
if (!speechResponse.ok) throw new Error(`Speech synthesis failed: HTTP ${speechResponse.status}`);
const speech = await speechResponse.json();
if (!speech.data || !Number.isFinite(speech.sampleRate)) throw new Error("Speech synthesis returned no PCM audio");
const pcm = Buffer.from(speech.data, "base64");
if (!pcm.length || pcm.length % 2) throw new Error("Speech synthesis returned invalid PCM16 audio");
const ttsMs = Math.round(performance.now() - started);
const durationMs = Math.ceil(pcm.length / 2 / speech.sampleRate * 1000);
if (durationMs > 40_000) throw new Error("Generated audio is too long for the recorder smoke test");

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.addInitScript(({ data, sampleRate }) => {
    class FakeRecognition {
      start() { globalThis.__smokeRecognition = this; }
      abort() { this.onerror?.({ error: "aborted" }); }
    }
    Object.defineProperty(globalThis, "SpeechRecognition", { configurable: true, value: FakeRecognition });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        const context = new AudioContext({ sampleRate });
        const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
        const audio = context.createBuffer(1, bytes.length / 2, sampleRate);
        const samples = audio.getChannelData(0);
        for (let index = 0; index < samples.length; index += 1) {
          const value = bytes[index * 2] | (bytes[index * 2 + 1] << 8);
          samples[index] = (value >= 0x8000 ? value - 0x10000 : value) / 0x8000;
        }
        const source = context.createBufferSource();
        const output = context.createMediaStreamDestination();
        source.buffer = audio;
        source.connect(output);
        source.start();
        globalThis.__smokeMicrophone = { context, source, stream: output.stream };
        return output.stream;
      },
    });
  }, { data: speech.data, sampleRate: speech.sampleRate });
  await page.goto(baseUrl);
  await expect(page.locator(".system-state .status")).toContainText("已连接");
  await page.locator('[data-action="voice-conversation"]').click();
  await page.evaluate(() => globalThis.__smokeRecognition.onerror({ error: "network" }));
  await expect(page.locator('[data-action="record"]')).toContainText("按下说话");
  await page.locator('[data-action="record"]').click();
  await expect(page.locator('[data-action="stop-record"]')).toContainText("停止并转文字");
  await page.waitForTimeout(durationMs + 300);
  const transcriptionStarted = performance.now();
  await page.locator('[data-action="stop-record"]').click();
  try {
    await expect(page.locator("textarea#say")).not.toHaveValue("", { timeout: 45_000 });
  } catch (error) {
    const messages = await page.locator(".message.master p").allTextContents();
    throw new Error(`Browser recording or transcription failed: ${messages.at(-1) ?? error.message}`);
  }
  const transcript = await page.locator("textarea#say").inputValue();
  const trackStates = await page.evaluate(() => globalThis.__smokeMicrophone.stream.getTracks().map((track) => track.readyState));
  if (trackStates.some((state) => state !== "ended")) throw new Error("Synthetic microphone stream was not released");
  console.log(JSON.stringify({ phrase, transcript, ttsMs, recordedAudioMs: durationMs, transcribeMs: Math.round(performance.now() - transcriptionStarted), trackStates }));
} finally {
  await browser.close();
}
