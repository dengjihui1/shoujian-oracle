export class OracleApiClient {
  constructor({ baseUrl = "", fetchFn = globalThis.fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/u, "");
    this.fetchFn = fetchFn === globalThis.fetch ? fetchFn.bind(globalThis) : fetchFn;
  }

  status() { return this.#request("/api/status", { method: "GET" }); }
  transcribe({ data, mimeType }, { signal } = {}) { return this.#request("/api/transcribe", { method: "POST", body: { data, mimeType }, signal }); }
  chat(payload) { return this.#request("/api/chat", { method: "POST", body: payload }); }
  speech(text, { signal } = {}) { return this.#request("/api/speech", { method: "POST", body: { text }, signal }); }

  async chatStream(payload, { onMeta, onDelta, signal } = {}) {
    const response = await this.fetchFn(`${this.baseUrl}/api/chat/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    if (!response.ok) {
      let data = {};
      try { data = await response.json(); } catch { /* stable fallback below */ }
      throw browserError(data.error, data.message, response.status);
    }

    const result = { text: "", evidence: [], grounded: false, purpose: "chat" };
    let completed = false;
    for await (const message of parseEventStream(response.body)) {
      if (message.event === "meta") {
        Object.assign(result, message.data);
        onMeta?.(message.data);
      } else if (message.event === "delta") {
        const text = String(message.data.text ?? "");
        result.text += text;
        onDelta?.(text, result.text);
      } else if (message.event === "error") {
        throw browserError(message.data.error, message.data.message, 502);
      } else if (message.event === "done") {
        if (typeof message.data.text === "string") result.text = message.data.text;
        Object.assign(result, message.data);
        completed = true;
      }
    }
    if (!completed) throw browserError("stream_incomplete", "回答连接提前结束，请重试", 502);
    return result;
  }

  async #request(path, { method, body, signal }) {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    let data;
    try { data = await response.json(); } catch { throw new Error("服务返回了无法识别的数据"); }
    if (!response.ok) {
      throw browserError(data.error, data.message, response.status);
    }
    return data;
  }
}

export async function* parseEventStream(body) {
  if (!body?.getReader) throw browserError("stream_unavailable", "浏览器无法读取流式回答", 500);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      buffer = buffer.replace(/\r\n/gu, "\n");
      if (done) buffer = buffer.replace(/\r/gu, "\n");
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const parsed = parseEvent(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (parsed) yield parsed;
      }
      if (done) break;
    }
    const parsed = parseEvent(buffer);
    if (parsed) yield parsed;
  } finally {
    reader.releaseLock();
  }
}

function parseEvent(block) {
  const lines = block.split("\n");
  const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "message";
  const payload = lines.filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart()).join("\n");
  if (!payload) return null;
  try { return { event, data: JSON.parse(payload) }; } catch { throw browserError("invalid_stream", "流式回答格式无效", 502); }
}

function browserError(code, fallback, status) {
  const error = new Error(browserErrorMessage(code, fallback));
  error.code = code;
  error.status = status;
  return error;
}

function browserErrorMessage(code, fallback) {
  if (code === "quota_exceeded") return "云端模型当前配额或服务容量不足，请稍后再试";
  if (code === "timeout") return "云端回答超时，请稍后重试";
  if (code === "network_error" || code === "upstream_error") return "云端服务暂时不可用，请稍后重试";
  return fallback ?? "云端服务暂时不可用";
}
