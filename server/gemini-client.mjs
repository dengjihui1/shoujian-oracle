import { MAX_SSE_CHUNK_BYTES, MAX_SSE_EVENT_CHARS } from "./stream-limits.mjs";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";

export const DEFAULT_MODELS = Object.freeze({
  chat: "gemini-3.1-flash-lite",
  fast: "gemini-3.1-flash-lite",
  grounded: "gemini-3.1-flash-lite",
  transcribe: "gemini-3.5-transcribe",
  speech: "gemini-3.1-flash-tts-preview"
});
const DEFAULT_FAST_FALLBACKS = Object.freeze(["gemini-3.5-flash", "gemini-3.6-flash"]);
const DEFAULT_GROUNDED_FALLBACKS = Object.freeze(["gemini-3.5-flash", "gemini-3.6-flash"]);

export class GeminiError extends Error {
  constructor(message, { status = 502, code = "gemini_error", providerStatus = null } = {}) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
    this.code = code;
    this.providerStatus = providerStatus;
  }
}

export class GeminiClient {
  constructor({ apiKey, fetchFn = globalThis.fetch, baseUrl = DEFAULT_BASE_URL, models = {}, chatFallbackModels, fastFallbackModels, groundedFallbackModels, timeoutMs = 30_000 } = {}) {
    if (!apiKey) throw new TypeError("Gemini API key is required");
    if (typeof fetchFn !== "function") throw new TypeError("fetch implementation is required");
    this.apiKey = apiKey;
    this.fetchFn = fetchFn;
    this.baseUrl = baseUrl.replace(/\/$/u, "");
    const legacyChatOverride = Object.hasOwn(models, "chat") ? models.chat : null;
    this.models = { ...DEFAULT_MODELS, ...models };
    if (legacyChatOverride && !Object.hasOwn(models, "fast")) this.models.fast = legacyChatOverride;
    if (legacyChatOverride && !Object.hasOwn(models, "grounded")) this.models.grounded = legacyChatOverride;
    const sharedFallbacks = chatFallbackModels === undefined ? null : chatFallbackModels;
    this.chatModelsByRoute = Object.freeze({
      fast: uniqueModels([this.models.fast, ...(fastFallbackModels ?? sharedFallbacks ?? DEFAULT_FAST_FALLBACKS)]),
      grounded: uniqueModels([this.models.grounded, ...(groundedFallbackModels ?? sharedFallbacks ?? DEFAULT_GROUNDED_FALLBACKS)]),
    });
    this.chatModels = this.chatModelsByRoute.grounded;
    this.timeoutMs = timeoutMs;
  }

  async chat({ input, systemInstruction, signal, route = "grounded" }) {
    let lastError;
    for (const model of this.#modelsForRoute(route)) {
      try {
        const data = await this.#interaction({
          model,
          input,
          system_instruction: systemInstruction,
          generation_config: { thinking_level: "low" }
        }, signal);
        const text = extractText(data);
        if (!text) throw new GeminiError("Gemini returned no text", { code: "empty_text" });
        return { text, interactionId: extractInteraction(data)?.id ?? null, model, provider: "gemini" };
      } catch (error) {
        lastError = error;
        if (!isTransientChatError(error)) throw error;
      }
    }
    throw lastError;
  }

  async *chatStream({ input, systemInstruction, signal, route = "grounded" }) {
    let lastError;
    for (const model of this.#modelsForRoute(route)) {
      let emitted = false;
      try {
        const response = await this.#fetch(`${this.baseUrl}/v1beta/models/${encodeURIComponent(model.replace(/^models\//u, ""))}:streamGenerateContent?alt=sse`, {
          method: "POST",
          headers: { "x-goog-api-key": this.apiKey, "content-type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: "user", parts: [{ text: input }] }],
          }),
          signal,
        });
        await ensureOk(response);
        let fullText = "";
        for await (const text of parseGeminiSse(response.body)) {
          if (!text) continue;
          emitted = true;
          fullText += text;
          yield { text, model, provider: "gemini" };
        }
        if (!fullText) throw new GeminiError("Gemini returned no text", { code: "empty_text" });
        return;
      } catch (error) {
        lastError = error instanceof GeminiError
          ? error
          : new GeminiError("Gemini stream failed", { code: "network_error" });
        if (emitted || !isTransientChatError(lastError)) throw lastError;
      }
    }
    throw lastError;
  }

  #modelsForRoute(route) {
    return route === "fast" ? this.chatModelsByRoute.fast : this.chatModelsByRoute.grounded;
  }

  async transcribe({ bytes, mimeType }) {
    const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    try {
      const data = await this.#interaction({
        model: this.models.transcribe,
        input: [{ type: "audio", data: Buffer.from(buffer).toString("base64"), mime_type: mimeType }],
        generation_config: { transcription_config: { language_codes: ["zh-CN"] } }
      });
      const text = extractText(data);
      if (!text) throw new GeminiError("Gemini returned no transcription", { code: "empty_transcript" });
      return { text, transport: "inline" };
    } catch (error) {
      if (!shouldFallbackToFileUpload(error)) throw error;
    }

    const file = await this.#upload(buffer, mimeType);
    try {
      const data = await this.#interaction({
        model: this.models.transcribe,
        input: [{ type: "audio", uri: file.uri, mime_type: mimeType }],
        generation_config: { transcription_config: { language_codes: ["zh-CN"] } }
      });
      const text = extractText(data);
      if (!text) throw new GeminiError("Gemini returned no transcription", { code: "empty_transcript" });
      return { text, fileUri: file.uri, transport: "file" };
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

  async #interaction(body, signal) {
    const response = await this.#fetch(`${this.baseUrl}/v1beta/interactions`, {
      method: "POST",
      headers: { "x-goog-api-key": this.apiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    return readJson(response);
  }

  async #fetch(url, options) {
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
    try {
      return await this.fetchFn(url, { ...options, signal });
    } catch (error) {
      if (options.signal?.aborted) {
        throw new GeminiError("Gemini request cancelled", { status: 499, code: "cancelled" });
      }
      if (error?.name === "TimeoutError" || error?.name === "AbortError") {
        throw new GeminiError("Gemini request timed out", { status: 504, code: "timeout" });
      }
      throw new GeminiError("Gemini request failed", { code: "network_error" });
    }
  }
}

function uniqueModels(models) {
  return [...new Set(models.map((model) => String(model ?? "").trim()).filter(Boolean))];
}

function isTransientChatError(error) {
  return error instanceof GeminiError && ["quota_exceeded", "upstream_error", "network_error", "timeout", "empty_text"].includes(error.code);
}

function shouldFallbackToFileUpload(error) {
  return error instanceof GeminiError && (
    ["invalid_response", "empty_transcript"].includes(error.code)
    || (error.code === "upstream_error" && [400, 404, 415].includes(error.providerStatus))
  );
}

export async function* parseGeminiSse(body) {
  if (!body?.getReader) throw new GeminiError("Gemini stream body was missing", { code: "invalid_response" });
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value?.byteLength > MAX_SSE_CHUNK_BYTES) throw new GeminiError("Gemini stream chunk was too large", { code: "invalid_response" });
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      buffer = buffer.replace(/\r\n/gu, "\n");
      if (done) buffer = buffer.replace(/\r/gu, "\n");
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        if (boundary > MAX_SSE_EVENT_CHARS) throw new GeminiError("Gemini stream event was too large", { code: "invalid_response" });
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const text = parseStreamEvent(event);
        if (text) yield text;
      }
      if (buffer.length > MAX_SSE_EVENT_CHARS) throw new GeminiError("Gemini stream event was too large", { code: "invalid_response" });
      if (done) break;
    }
    const tail = parseStreamEvent(buffer);
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

function parseStreamEvent(event) {
  const payload = event.split("\n").filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart()).join("\n");
  if (!payload || payload === "[DONE]") return "";
  let data;
  try { data = JSON.parse(payload); } catch { throw new GeminiError("Gemini returned invalid stream data", { code: "invalid_response" }); }
  return (data.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => part?.thought !== true && typeof part?.text === "string")
    .map((part) => part.text).join("");
}

async function ensureOk(response) {
  if (response.ok) return response;
  let detail = "";
  try { detail = (await response.json()).error?.message ?? ""; } catch { /* response was not JSON */ }
  const safeDetail = detail.replace(/AIza[\w-]+/gu, "[redacted]").slice(0, 240);
  throw new GeminiError(`Gemini rejected the request${safeDetail ? `: ${safeDetail}` : ""}`, {
    status: response.status === 429 ? 429 : 502,
    code: response.status === 429 ? "quota_exceeded" : "upstream_error",
    providerStatus: response.status,
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
