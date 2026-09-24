import { MAX_SSE_CHUNK_BYTES, MAX_SSE_EVENT_CHARS } from "./stream-limits.mjs";

const DEFAULT_TIMEOUT_MS = 30_000;

export class CompatibleApiError extends Error {
  constructor(message, { status = 502, code = "upstream_error", providerStatus = null, provider = "compatible" } = {}) {
    super(message);
    this.name = "CompatibleApiError";
    this.status = status;
    this.code = code;
    this.providerStatus = providerStatus;
    this.provider = provider;
  }
}

export class OpenAiCompatibleClient {
  constructor({ apiKey, baseUrl, model, groundedModel, provider = "compatible", fetchFn = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS, headers = {} } = {}) {
    if (!apiKey) throw new TypeError("Compatible API key is required");
    if (!baseUrl) throw new TypeError("Compatible API base URL is required");
    if (!model) throw new TypeError("Compatible API model is required");
    if (typeof fetchFn !== "function") throw new TypeError("fetch implementation is required");
    this.apiKey = apiKey;
    this.baseUrl = String(baseUrl).replace(/\/$/u, "");
    this.provider = String(provider).trim().toLowerCase() || "compatible";
    this.fetchFn = fetchFn;
    this.timeoutMs = timeoutMs;
    this.headers = { ...headers };
    this.models = Object.freeze({ fast: model, grounded: groundedModel || model });
  }

  async chat({ input, systemInstruction, signal, route = "grounded" }) {
    const model = this.#model(route);
    const response = await this.#request({ model, input, systemInstruction, stream: false }, signal);
    const data = await readJson(response, this.provider);
    const text = extractCompatibleText(data);
    if (!text) throw new CompatibleApiError("Compatible API returned no text", { code: "empty_text", provider: this.provider });
    return { text, model: data.model || model, provider: this.provider };
  }

  async *chatStream({ input, systemInstruction, signal, route = "grounded" }) {
    const model = this.#model(route);
    const response = await this.#request({ model, input, systemInstruction, stream: true }, signal);
    await ensureOk(response, this.provider);
    let fullText = "";
    for await (const text of parseCompatibleSse(response.body, this.provider)) {
      if (!text) continue;
      fullText += text;
      yield { text, model, provider: this.provider };
    }
    if (!fullText) throw new CompatibleApiError("Compatible API returned no text", { code: "empty_text", provider: this.provider });
  }

  #model(route) {
    return route === "fast" ? this.models.fast : this.models.grounded;
  }

  async #request({ model, input, systemInstruction, stream }, signal) {
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    try {
      return await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          ...this.headers,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: input },
          ],
          stream,
        }),
        signal: requestSignal,
      });
    } catch (error) {
      if (signal?.aborted) throw new CompatibleApiError("Compatible API request cancelled", { status: 499, code: "cancelled", provider: this.provider });
      if (error?.name === "TimeoutError" || error?.name === "AbortError") {
        throw new CompatibleApiError("Compatible API request timed out", { status: 504, code: "timeout", provider: this.provider });
      }
      throw new CompatibleApiError("Compatible API request failed", { code: "network_error", provider: this.provider });
    }
  }
}

export function extractCompatibleText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => typeof part === "string" ? part : part?.text ?? "").join("").trim();
  }
  return "";
}

export async function* parseCompatibleSse(body, provider = "compatible") {
  if (!body?.getReader) throw new CompatibleApiError("Compatible API stream body was missing", { code: "invalid_response", provider });
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value?.byteLength > MAX_SSE_CHUNK_BYTES) throw new CompatibleApiError("Compatible API stream chunk was too large", { code: "invalid_response", provider });
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      buffer = buffer.replace(/\r\n/gu, "\n");
      if (done) buffer = buffer.replace(/\r/gu, "\n");
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        if (boundary > MAX_SSE_EVENT_CHARS) throw new CompatibleApiError("Compatible API stream event was too large", { code: "invalid_response", provider });
        const text = parseEvent(buffer.slice(0, boundary), provider);
        buffer = buffer.slice(boundary + 2);
        if (text) yield text;
      }
      if (buffer.length > MAX_SSE_EVENT_CHARS) throw new CompatibleApiError("Compatible API stream event was too large", { code: "invalid_response", provider });
      if (done) break;
    }
    const tail = parseEvent(buffer, provider);
    if (tail) yield tail;
    finished = true;
  } finally {
    if (!finished) {
      try { await reader.cancel(); } catch { /* upstream connection may already be closed */ }
    }
    reader.releaseLock();
  }
}

function parseEvent(event, provider) {
  const payload = event.split("\n").filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart()).join("\n");
  if (!payload || payload === "[DONE]") return "";
  let data;
  try { data = JSON.parse(payload); } catch {
    throw new CompatibleApiError("Compatible API returned invalid stream data", { code: "invalid_response", provider });
  }
  const content = data?.choices?.[0]?.delta?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => part?.text ?? "").join("");
  return "";
}

async function readJson(response, provider) {
  await ensureOk(response, provider);
  try { return await response.json(); } catch {
    throw new CompatibleApiError("Compatible API returned invalid JSON", { code: "invalid_response", provider });
  }
}

async function ensureOk(response, provider) {
  if (response.ok) return response;
  let detail = "";
  try { detail = (await response.json()).error?.message ?? ""; } catch { /* stable message below */ }
  const safeDetail = String(detail).replace(/(?:sk-|Bearer\s+)[\w.-]+/giu, "[redacted]").slice(0, 240);
  const code = response.status === 429 ? "quota_exceeded"
    : response.status === 408 ? "timeout"
      : response.status >= 500 ? "upstream_error" : "invalid_request";
  throw new CompatibleApiError(`Compatible API rejected the request${safeDetail ? `: ${safeDetail}` : ""}`, {
    status: response.status === 429 ? 429 : response.status >= 500 ? 502 : 400,
    code,
    providerStatus: response.status,
    provider,
  });
}
