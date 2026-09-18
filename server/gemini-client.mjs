const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";

export const DEFAULT_MODELS = Object.freeze({
  chat: "gemini-3.8-flash",
  transcribe: "gemini-3.5-transcribe",
  speech: "gemini-3.1-flash-tts-preview"
});

export class GeminiError extends Error {
  constructor(message, { status = 502, code = "gemini_error" } = {}) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
    this.code = code;
  }
}

export class GeminiClient {
  constructor({ apiKey, fetchFn = globalThis.fetch, baseUrl = DEFAULT_BASE_URL, models = {}, timeoutMs = 30_000 } = {}) {
    if (!apiKey) throw new TypeError("Gemini API key is required");
    if (typeof fetchFn !== "function") throw new TypeError("fetch implementation is required");
    this.apiKey = apiKey;
    this.fetchFn = fetchFn;
    this.baseUrl = baseUrl.replace(/\/$/u, "");
    this.models = { ...DEFAULT_MODELS, ...models };
    this.timeoutMs = timeoutMs;
  }

  async chat({ input, systemInstruction }) {
    const data = await this.#interaction({
      model: this.models.chat,
      input,
      system_instruction: systemInstruction,
      generation_config: { thinking_level: "low" }
    });
    const text = extractText(data);
    if (!text) throw new GeminiError("Gemini returned no text", { code: "empty_text" });
    return { text, interactionId: extractInteraction(data)?.id ?? null };
  }

  async transcribe({ bytes, mimeType }) {
    const file = await this.#upload(bytes, mimeType);
    try {
      const data = await this.#interaction({
        model: this.models.transcribe,
        input: [{ type: "audio", uri: file.uri, mime_type: mimeType }],
        generation_config: { transcription_config: { language_codes: ["zh-CN"] } }
      });
      const text = extractText(data);
      if (!text) throw new GeminiError("Gemini returned no transcription", { code: "empty_transcript" });
      return { text, fileUri: file.uri };
    } finally {
      if (file.name) await this.#deleteFile(file.name);
    }
  }

  async speech({ text, voice = "Charon" }) {
    const data = await this.#interaction({
      model: this.models.speech,
      input: `请用沉稳、亲切、克制的中年中文男声朗读，不要添加原文没有的内容：${text}`,
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice }] }
    });
    const audio = extractAudio(data);
    if (!audio?.data) throw new GeminiError("Gemini returned no audio", { code: "empty_audio" });
    return { data: audio.data, mimeType: audio.mimeType ?? "audio/pcm;rate=24000", sampleRate: 24_000 };
  }

  async #upload(bytes, mimeType) {
    const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const start = await this.#fetch(`${this.baseUrl}/upload/v1beta/files`, {
      method: "POST",
      headers: {
        "x-goog-api-key": this.apiKey,
        "x-goog-upload-protocol": "resumable",
        "x-goog-upload-command": "start",
        "x-goog-upload-header-content-length": String(buffer.byteLength),
        "x-goog-upload-header-content-type": mimeType,
        "content-type": "application/json"
      },
      body: JSON.stringify({ file: { display_name: "shoujian-voice" } })
    });
    await ensureOk(start);
    const uploadUrl = start.headers.get("x-goog-upload-url");
    if (!uploadUrl) throw new GeminiError("Gemini upload URL was missing", { code: "upload_protocol_error" });

    const uploaded = await this.#fetch(uploadUrl, {
      method: "POST",
      headers: {
        "content-length": String(buffer.byteLength),
        "x-goog-upload-offset": "0",
        "x-goog-upload-command": "upload, finalize"
      },
      body: buffer
    });
    const data = await readJson(uploaded);
    const uri = data.file?.uri;
    if (!uri) throw new GeminiError("Gemini file URI was missing", { code: "upload_protocol_error" });
    return { uri, name: data.file?.name ?? null };
  }

  async #deleteFile(name) {
    const safeName = String(name).replace(/^files\//u, "");
    if (!/^[A-Za-z0-9_-]+$/u.test(safeName)) return;
    try {
      await this.#fetch(`${this.baseUrl}/v1beta/files/${safeName}`, { method: "DELETE", headers: { "x-goog-api-key": this.apiKey } });
    } catch { /* best-effort cleanup; transcription result remains usable */ }
  }

  async #interaction(body) {
    const response = await this.#fetch(`${this.baseUrl}/v1beta/interactions`, {
      method: "POST",
      headers: { "x-goog-api-key": this.apiKey, "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return readJson(response);
  }

  async #fetch(url, options) {
    try {
      return await this.fetchFn(url, { ...options, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      if (error?.name === "TimeoutError" || error?.name === "AbortError") {
        throw new GeminiError("Gemini request timed out", { status: 504, code: "timeout" });
      }
      throw new GeminiError("Gemini request failed", { code: "network_error" });
    }
  }
}

async function ensureOk(response) {
  if (response.ok) return response;
  let detail = "";
  try { detail = (await response.json()).error?.message ?? ""; } catch { /* response was not JSON */ }
  const safeDetail = detail.replace(/AIza[\w-]+/gu, "[redacted]").slice(0, 240);
  throw new GeminiError(`Gemini rejected the request${safeDetail ? `: ${safeDetail}` : ""}`, {
    status: response.status === 429 ? 429 : 502,
    code: response.status === 429 ? "quota_exceeded" : "upstream_error"
  });
}

async function readJson(response) {
  await ensureOk(response);
  try { return await response.json(); } catch { throw new GeminiError("Gemini returned invalid JSON", { code: "invalid_response" }); }
}

function extractInteraction(data) {
  return data?.interaction ?? data;
}

export function extractText(data) {
  const root = extractInteraction(data);
  if (typeof root?.output_text === "string") return root.output_text.trim();
  const found = [];
  walk(root?.outputs ?? root?.output ?? root?.steps ?? [], (node) => {
    if (node && typeof node === "object" && node.type === "text" && node.thought !== true && typeof node.text === "string") found.push(node.text);
  });
  return found.join("").trim();
}

export function extractAudio(data) {
  const root = extractInteraction(data);
  const direct = root?.output_audio;
  if (direct?.data) return { data: direct.data, mimeType: direct.mime_type ?? direct.mimeType };
  let found = null;
  walk(root?.outputs ?? root?.output ?? root?.steps ?? [], (node) => {
    if (!found && node && typeof node === "object" && node.type === "audio" && typeof node.data === "string") {
      found = { data: node.data, mimeType: node.mime_type ?? node.mimeType };
    }
  });
  return found;
}

function walk(value, visit) {
  if (!value || typeof value !== "object") return;
  visit(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) walk(child, visit);
}
