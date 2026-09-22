import assert from "node:assert/strict";
import test from "node:test";
import { extractLinear16Pcm, GoogleCloudTtsClient, googleCloudTtsFromEnv } from "../server/google-cloud-tts-client.mjs";

test("Google Cloud TTS adapter sends a Mandarin voice request and unwraps WAV PCM", async () => {
  const calls = [];
  const pcm = Buffer.from([1, 2, 3, 4]);
  const client = {
    async synthesizeSpeech(request, options) {
      calls.push({ request, options });
      return [{ audioContent: wav(pcm, 24_000) }];
    },
  };
  const provider = new GoogleCloudTtsClient({ client, voice: "cmn-CN-Test-B", speakingRate: 0.9, pitch: -4 });
  const result = await provider.speech({ text: "先把小事做稳。" });
  assert.equal(Buffer.from(result.data, "base64").compare(pcm), 0);
  assert.equal(result.sampleRate, 24_000);
  assert.equal(calls[0].request.input.text, "先把小事做稳。");
  assert.deepEqual(calls[0].request.voice, { languageCode: "cmn-CN", name: "cmn-CN-Test-B" });
  assert.equal(calls[0].request.audioConfig.audioEncoding, "LINEAR16");
  assert.equal(calls[0].request.audioConfig.speakingRate, 0.9);
  assert.equal(calls[0].request.audioConfig.pitch, -4);
  assert.equal(calls[0].options.timeout, 20_000);
});

test("Google Cloud TTS environment adapter stays disabled without credentials", () => {
  assert.equal(googleCloudTtsFromEnv({}), null);
  const fakeClient = { synthesizeSpeech() {} };
  const configured = googleCloudTtsFromEnv({
    GOOGLE_CLOUD_TTS_API_KEY: "test-only",
    GOOGLE_CLOUD_TTS_VOICE: "cmn-CN-Test-D",
  }, { client: fakeClient });
  assert.equal(configured.provider, "google-cloud-tts");
  assert.equal(configured.voice, "cmn-CN-Test-D");
});

test("Google Cloud TTS can be explicitly enabled for Application Default Credentials", () => {
  const fakeClient = { synthesizeSpeech() {} };
  const configured = googleCloudTtsFromEnv({
    GOOGLE_CLOUD_TTS_ENABLED: "true",
    GOOGLE_CLOUD_PROJECT: "test-project",
  }, { client: fakeClient });
  assert.equal(configured.provider, "google-cloud-tts");
});

test("Google Cloud TTS maps provider quota failures to the stable speech contract", async () => {
  const client = {
    async synthesizeSpeech() { throw Object.assign(new Error("sensitive provider detail"), { code: 8 }); },
  };
  const provider = new GoogleCloudTtsClient({ client });
  await assert.rejects(
    () => provider.speech({ text: "测试配额" }),
    (error) => error.code === "quota_exceeded" && error.status === 429 && !error.message.includes("sensitive"),
  );
});

test("WAV parser rejects a malformed data chunk instead of playing container bytes", () => {
  const invalid = Buffer.alloc(20);
  invalid.write("RIFF", 0); invalid.write("WAVE", 8); invalid.write("data", 12); invalid.writeUInt32LE(20, 16);
  assert.throws(() => extractLinear16Pcm(invalid), /invalid WAV/u);
});

function wav(pcm, sampleRate) {
  const output = Buffer.alloc(44 + pcm.length);
  output.write("RIFF", 0); output.writeUInt32LE(36 + pcm.length, 4); output.write("WAVE", 8);
  output.write("fmt ", 12); output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24); output.writeUInt32LE(sampleRate * 2, 28); output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34);
  output.write("data", 36); output.writeUInt32LE(pcm.length, 40); pcm.copy(output, 44);
  return output;
}
