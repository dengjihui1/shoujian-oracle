export class OracleApiClient {
  constructor({ baseUrl = "", fetchFn = globalThis.fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/u, "");
    this.fetchFn = fetchFn === globalThis.fetch ? fetchFn.bind(globalThis) : fetchFn;
  }

  status() { return this.#request("/api/status", { method: "GET" }); }
  transcribe({ data, mimeType }) { return this.#request("/api/transcribe", { method: "POST", body: { data, mimeType } }); }
  chat(payload) { return this.#request("/api/chat", { method: "POST", body: payload }); }
  speech(text) { return this.#request("/api/speech", { method: "POST", body: { text } }); }

  async #request(path, { method, body }) {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    let data;
    try { data = await response.json(); } catch { throw new Error("服务返回了无法识别的数据"); }
    if (!response.ok) {
      const error = new Error(browserErrorMessage(data.error, data.message));
      error.code = data.error;
      error.status = response.status;
      throw error;
    }
    return data;
  }
}

function browserErrorMessage(code, fallback) {
  if (code === "quota_exceeded") return "Gemini 当前配额或服务容量不足，请稍后再试";
  if (code === "timeout") return "Gemini 回答超时，请稍后重试";
  if (code === "network_error" || code === "upstream_error") return "Gemini 服务暂时不可用，请稍后重试";
  return fallback ?? "云端服务暂时不可用";
}
