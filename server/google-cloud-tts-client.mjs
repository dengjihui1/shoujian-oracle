import textToSpeech from "@google-cloud/text-to-speech";

const DEFAULT_LANGUAGE = "cmn-CN";
const DEFAULT_VOICE = "cmn-CN-Wavenet-B";
const DEFAULT_SAMPLE_RATE = 24_000;

export class GoogleCloudTtsError extends Error {
  constructor(message, { status = 502, code = "google_cloud_tts_error" } = {}) {
    super(message);
    this.name = "GoogleCloudTtsError";
    this.status = status;
    this.code = code;
  }
}

export class GoogleCloudTtsClient {
  constructor({
    client = null,
    keyFilename,
    apiKey,
    projectId,
    languageCode = DEFAULT_LANGUAGE,
    voice = DEFAULT_VOICE,
    speakingRate = 0.92,
    pitch = -3,
    sampleRate = DEFAULT_SAMPLE_RATE,
    timeoutMs = 20_000,
  } = {}) {
    this.client = client ?? new textToSpeech.TextToSpeechClient(compact({ keyFilename, apiKey, projectId }));
    this.languageCode = languageCode;
    this.voice = voice;
    this.speakingRate = boundedNumber(speakingRate, 0.25, 2, 0.92);
    this.pitch = boundedNumber(pitch, -20, 20, -3);
    this.sampleRate = Math.max(8_000, Math.min(48_000, Number(sampleRate) || DEFAULT_SAMPLE_RATE));
    this.timeoutMs = Math.max(3_000, Math.min(60_000, Number(timeoutMs) || 20_000));
    this.provider = "google-cloud-tts";
    this.model = voice;
  }

  async speech({ text }) {
    try {
      const [response] = await this.client.synthesizeSpeech({
        input: { text: String(text ?? "") },
        voice: { languageCode: this.languageCode, name: this.voice },
        audioConfig: {
          audioEncoding: "LINEAR16",
          sampleRateHertz: this.sampleRate,
          speakingRate: this.speakingRate,
          pitch: this.pitch,
        },
      }, { timeout: this.timeoutMs });
      const encoded = response?.audioContent;
      if (!encoded) throw new GoogleCloudTtsError("Google Cloud TTS returned no audio", { code: "empty_audio" });
      const bytes = typeof encoded === "string" ? Buffer.from(encoded, "base64") : Buffer.from(encoded);
      const pcm = extractLinear16Pcm(bytes);
      if (!pcm.length) throw new GoogleCloudTtsError("Google Cloud TTS returned empty PCM", { code: "empty_audio" });
      return {
        data: pcm.toString("base64"),
        mimeType: `audio/pcm;rate=${this.sampleRate}`,
        sampleRate: this.sampleRate,
      };
    } catch (error) {
      if (error instanceof GoogleCloudTtsError) throw error;
      const providerCode = Number(error?.code);
      throw new GoogleCloudTtsError("Google Cloud TTS request failed", {
        status: providerCode === 8 || providerCode === 429 ? 429 : 502,
        code: providerCode === 8 || providerCode === 429 ? "quota_exceeded" : "upstream_error",
      });
    }
  }

  async close() {
    await this.client.close?.();
  }
}

export function googleCloudTtsFromEnv(env = process.env, options = {}) {
  const keyFilename = clean(env.GOOGLE_APPLICATION_CREDENTIALS ?? env.GOOGLE_CLOUD_TTS_CREDENTIALS);
  const apiKey = clean(env.GOOGLE_CLOUD_TTS_API_KEY);
  const adcEnabled = /^(?:true|1|yes)$/iu.test(String(env.GOOGLE_CLOUD_TTS_ENABLED ?? "").trim());
  if (!keyFilename && !apiKey && !adcEnabled) return null;
  return new GoogleCloudTtsClient({
    ...options,
    keyFilename,
    apiKey: keyFilename ? undefined : apiKey,
    projectId: clean(env.GOOGLE_CLOUD_PROJECT),
    languageCode: clean(env.GOOGLE_CLOUD_TTS_LANGUAGE) || DEFAULT_LANGUAGE,
    voice: clean(env.GOOGLE_CLOUD_TTS_VOICE) || DEFAULT_VOICE,
    speakingRate: env.GOOGLE_CLOUD_TTS_SPEAKING_RATE,
    pitch: env.GOOGLE_CLOUD_TTS_PITCH,
    sampleRate: env.GOOGLE_CLOUD_TTS_SAMPLE_RATE,
    timeoutMs: env.GOOGLE_CLOUD_TTS_TIMEOUT_MS,
  });
}

export function extractLinear16Pcm(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value ?? []);
  if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") return bytes;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const kind = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > bytes.length) break;
    if (kind === "data") return bytes.subarray(start, end);
    offset = end + (length % 2);
  }
  throw new GoogleCloudTtsError("Google Cloud TTS returned an invalid WAV container", { code: "invalid_audio" });
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function clean(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function boundedNumber(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}
