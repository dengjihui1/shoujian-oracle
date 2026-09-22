import { createServer as createHttpServer } from "node:http";
import { performance } from "node:perf_hooks";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { GeminiClient, GeminiError, DEFAULT_MODELS } from "./gemini-client.mjs";
import { OpenAiCompatibleClient } from "./openai-compatible-client.mjs";
import { OracleCloudClient } from "./cloud-client.mjs";
import { googleCloudTtsFromEnv } from "./google-cloud-tts-client.mjs";
import { CachedSpeechService } from "./speech-cache.mjs";
import { buildChatInput, buildSystemInstruction, formatShanghaiDateTime } from "./prompt.mjs";
import { loadKnowledgeBase } from "./knowledge-retriever.mjs";
import { assessQuestion } from "../src/question-boundary.js";
import { inferConversationPurpose, resolveResponsePolicy, withDivinationDisclaimer } from "../src/response-policy.js";
import { SlidingWindowRateLimiter } from "./rate-limiter.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const AUDIO_TYPES = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav"]);
const BODY_LIMIT = 9 * 1024 * 1024;
const defaultKnowledgeBase = await loadKnowledgeBase();

export function createApp({ client = null, knowledgeBase = defaultKnowledgeBase, rootPath = projectRoot, now = Date.now } = {}) {
  const rateLimiter = new SlidingWindowRateLimiter();
  const apiEnabled = Boolean(client);
  const speechService = typeof client?.speech === "function"
    ? new CachedSpeechService({ synthesize: (payload) => client.speech(payload), now })
    : null;

  return async function app(request, response) {
    setSecurityHeaders(response);
    try {
      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
      if (url.pathname.startsWith("/api/")) {
        if (!rateLimiter.allow(request.socket.remoteAddress ?? "unknown", now())) return json(response, 429, { error: "rate_limited", message: "请求太频繁，请稍后再试。" });
        if (request.method === "GET" && url.pathname === "/api/status") {
          return json(response, 200, {
            cloud: apiEnabled,
            provider: apiEnabled ? client.providerSummary ?? "gemini" : null,
            speechProvider: apiEnabled ? client.speechProviderName ?? "gemini" : null,
            transcribeProvider: apiEnabled ? client.transcribeProviderName ?? "gemini" : null,
            models: apiEnabled ? client.models : null,
            knowledge: knowledgeBase.summary,
            serverTime: formatShanghaiDateTime(now()),
          });
        }
        if (!apiEnabled) return json(response, 503, { error: "cloud_disabled", message: "未配置 Gemini，当前使用本地有限对话。" });
        if (request.method !== "POST") return json(response, 405, { error: "method_not_allowed", message: "请求方法不受支持。" });
        const body = await readJsonBody(request);
        if (url.pathname === "/api/transcribe") return await handleTranscribe(response, client, body);
        if (url.pathname === "/api/chat") return await handleChat(response, client, knowledgeBase, body, now);
        if (url.pathname === "/api/chat/stream") return await handleChatStream(response, client, knowledgeBase, body, now);
        if (url.pathname === "/api/speech") return await handleSpeech(response, speechService, body);
        return json(response, 404, { error: "not_found", message: "接口不存在。" });
      }
      return serveStatic(response, url.pathname, rootPath);
    } catch (error) {
      const status = error instanceof GeminiError ? error.status : error.status ?? 500;
      const code = error instanceof GeminiError ? error.code : error.code ?? "server_error";
      const message = status >= 500 && !(error instanceof GeminiError) && error.expose !== true
        ? "服务暂时不可用。"
        : error.message;
      return json(response, status, { error: code, message });
    }
  };
}

async function handleTranscribe(response, client, body) {
  const mimeType = String(body.mimeType ?? "").split(";")[0].toLowerCase();
  if (!AUDIO_TYPES.has(mimeType)) throw httpError(415, "unsupported_audio", "不支持这种录音格式。");
  if (typeof body.data !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/u.test(body.data)) throw httpError(400, "invalid_audio", "录音数据无效。");
  const bytes = Buffer.from(body.data, "base64");
  if (!bytes.length || bytes.length > 6 * 1024 * 1024) throw httpError(413, "audio_too_large", "录音需小于 6 MB。请缩短到 45 秒以内。");
  const result = await client.transcribe({ bytes, mimeType });
  return json(response, 200, { text: result.text });
}

async function handleChat(response, client, knowledgeBase, body, now) {
  const prepared = prepareChat(body, knowledgeBase, now);
  if (prepared.response) return json(response, 200, prepared.response);
  const startedAt = performance.now();
  const result = await client.chat({ input: prepared.input, systemInstruction: prepared.systemInstruction, route: prepared.route });
  validateCitations(result.text, prepared.evidence);
  const text = withDivinationDisclaimer(result.text, prepared.purpose);
  return json(response, 200, {
    text,
    evidence: prepared.evidence,
    grounded: prepared.evidence.length > 0,
    purpose: prepared.purpose,
    runtime: runtimeMetadata({ route: prepared.route, result, totalMs: performance.now() - startedAt }),
  });
}

async function handleChatStream(response, client, knowledgeBase, body, now) {
  const prepared = prepareChat(body, knowledgeBase, now);
  const startedAt = performance.now();
  const upstreamController = new AbortController();
  response.once("close", () => upstreamController.abort());
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store, no-transform",
    "connection": "keep-alive",
    "x-accel-buffering": "no",
  });
  sse(response, "meta", {
    evidence: prepared.evidence,
    grounded: prepared.evidence.length > 0,
    purpose: prepared.purpose,
    serverTime: prepared.serverTime,
    route: prepared.route,
  });
  if (prepared.response) {
    sse(response, "delta", { text: prepared.response.text });
    sse(response, "done", prepared.response);
    return response.end();
  }

  let fullText = "";
  let firstTokenMs = null;
  let lastChunk = null;
  const heartbeat = setInterval(() => {
    if (!response.writableEnded && !response.destroyed) response.write(": keep-alive\n\n");
  }, 15_000);
  heartbeat.unref?.();
  try {
    for await (const chunk of client.chatStream({
      input: prepared.input,
      systemInstruction: prepared.systemInstruction,
      signal: upstreamController.signal,
      route: prepared.route,
    })) {
      if (response.destroyed) return;
      if (firstTokenMs === null) firstTokenMs = performance.now() - startedAt;
      lastChunk = chunk;
      fullText += chunk.text;
      sse(response, "delta", { text: chunk.text });
    }
    validateCitations(fullText, prepared.evidence);
    const finalText = withDivinationDisclaimer(fullText, prepared.purpose);
    const suffix = finalText.slice(fullText.length);
    if (suffix) sse(response, "delta", { text: suffix });
    sse(response, "done", {
      text: finalText,
      runtime: runtimeMetadata({ route: prepared.route, result: lastChunk, firstTokenMs, totalMs: performance.now() - startedAt }),
    });
  } catch (error) {
    if (fullText && canRecoverInterruptedStream(error, client, upstreamController.signal)) {
      try {
        const recovered = await client.chat({
          input: prepared.input,
          systemInstruction: prepared.systemInstruction,
          signal: upstreamController.signal,
          route: prepared.route,
        });
        validateCitations(recovered.text, prepared.evidence);
        const finalText = withDivinationDisclaimer(recovered.text, prepared.purpose);
        sse(response, "replace", { text: finalText, recovered: true });
        sse(response, "done", {
          text: finalText,
          recovered: true,
          runtime: runtimeMetadata({ route: prepared.route, result: recovered, firstTokenMs, totalMs: performance.now() - startedAt, recovered: true }),
        });
        error = null;
      } catch (recoveryError) {
        error = recoveryError;
      }
    }
    if (error) {
      const exposed = publicStreamError(error);
      sse(response, "error", exposed);
    }
  } finally {
    clearInterval(heartbeat);
  }
  response.end();
}

function canRecoverInterruptedStream(error, client, signal) {
  return !signal.aborted
    && typeof client?.chat === "function"
    && ["quota_exceeded", "upstream_error", "network_error", "timeout", "empty_text"].includes(error?.code);
}

function prepareChat(body, knowledgeBase, now) {
  const message = cleanText(body.message, 2_000, "对话内容");
  const stage = ["question", "ready", "reading"].includes(body.stage) ? body.stage : "question";
  const assessment = assessQuestion(message);
  const requestedPurpose = body.purpose === "chat" || body.purpose === "divination"
    ? body.purpose
    : inferConversationPurpose(message, stage);
  const policy = resolveResponsePolicy({ message, purpose: requestedPurpose, stage, assessment });
  if (policy.action === "respond") {
    return {
      response: policy.response,
      evidence: [],
      purpose: policy.purpose,
      serverTime: formatShanghaiDateTime(now()),
    };
  }
  const question = typeof body.question === "string" ? body.question.slice(0, 500) : "";
  const reading = sanitizeReading(body.reading);
  const history = Array.isArray(body.history) ? body.history.slice(-16).map((item) => ({
    role: item?.role === "user" ? "user" : "master",
    text: String(item?.text ?? "").slice(0, 1_000)
  })) : [];
  const useReadingEvidence = policy.purpose === "divination";
  const evidence = knowledgeBase.retrieve({
    query: [message, useReadingEvidence ? question : ""].filter(Boolean).join("\n"),
    reading: useReadingEvidence ? reading : null,
    limit: 8,
  });
  const serverTime = formatShanghaiDateTime(now());
  const route = evidence.length > 0 || policy.purpose === "divination" ? "grounded" : "fast";
  return {
    evidence,
    purpose: policy.purpose,
    serverTime,
    route,
    input: buildChatInput(message, history),
    systemInstruction: buildSystemInstruction({ stage, question, reading, evidence, currentDateTime: serverTime }),
  };
}

function runtimeMetadata({ route, result, firstTokenMs = null, totalMs, recovered = false }) {
  return {
    route,
    provider: result?.provider ?? null,
    model: result?.model ?? null,
    firstTokenMs: firstTokenMs === null ? null : Math.max(0, Math.round(firstTokenMs)),
    totalMs: Math.max(0, Math.round(totalMs)),
    recovered: Boolean(recovered),
  };
}

async function handleSpeech(response, speechService, body) {
  const text = cleanText(body.text, 800, "朗读内容");
  if (!speechService) throw httpError(503, "speech_disabled", "语音合成暂不可用。");
  const result = await speechService.speech({ text });
  return json(response, 200, {
    data: result.data,
    mimeType: result.mimeType,
    sampleRate: result.sampleRate,
    runtime: { cache: result.cache, synthesisMs: result.synthesisMs },
  });
}

function sanitizeReading(value) {
  if (!value || typeof value !== "object") return null;
  const primary = value.primary;
  if (!primary || !Number.isInteger(primary.number) || primary.number < 1 || primary.number > 64) return null;
  return {
    primary: {
      number: primary.number,
      fullName: String(primary.fullName ?? "").slice(0, 24),
      lower: { name: String(primary.lower?.name ?? "").slice(0, 4), image: String(primary.lower?.image ?? "").slice(0, 4) },
      upper: { name: String(primary.upper?.name ?? "").slice(0, 4), image: String(primary.upper?.image ?? "").slice(0, 4) }
    },
    movingLines: Array.isArray(value.movingLines) ? value.movingLines.filter((line) => Number.isInteger(line) && line >= 1 && line <= 6).slice(0, 6) : [],
    changed: value.changed ? { fullName: String(value.changed.fullName ?? "").slice(0, 24) } : null
  };
}

function cleanText(value, maxLength, label) {
  if (typeof value !== "string" || !value.trim()) throw httpError(400, "invalid_text", `${label}不能为空。`);
  const text = value.trim();
  if (text.length > maxLength) throw httpError(413, "text_too_long", `${label}过长。`);
  return text;
}

function validateCitations(text, evidence) {
  const allowed = new Set(evidence.map(({ id }) => id));
  const cited = [...String(text).matchAll(/【([A-Z0-9-]+)】/gu)].map((match) => match[1]);
  if (allowed.size > 0 && cited.length === 0) {
    throw httpError(502, "ungrounded_reply", "模型没有标注本轮检索来源，回答已被拒绝。请重试。");
  }
  const unknown = cited.filter((id) => !allowed.has(id));
  if (unknown.length) throw httpError(502, "ungrounded_reply", "模型引用了本轮未检索到的来源，回答已被拒绝。请重试。");
}

async function readJsonBody(request) {
  if (!String(request.headers["content-type"] ?? "").startsWith("application/json")) throw httpError(415, "json_required", "接口只接受 JSON。" );
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw httpError(413, "body_too_large", "请求内容过大。" );
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw httpError(400, "invalid_json", "JSON 格式无效。" ); }
}

async function serveStatic(response, pathname, rootPath) {
  const relative = decodeURIComponent(pathname === "/" ? "/index.html" : pathname).replace(/^[/\\]+/u, "");
  if (relative.split(/[/\\]/u).some((segment) => segment.startsWith("."))) return json(response, 404, { error: "not_found", message: "页面不存在。" });
  const target = resolve(rootPath, relative);
  const safeRoot = resolve(rootPath);
  if (target !== safeRoot && !target.startsWith(`${safeRoot}${sep}`)) return json(response, 403, { error: "forbidden", message: "禁止访问。" });
  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error("not a file");
    const data = await readFile(target);
    response.writeHead(200, { "content-type": contentType(target), "cache-control": "no-store" });
    response.end(data);
  } catch {
    json(response, 404, { error: "not_found", message: "页面不存在。" });
  }
}

function contentType(path) {
  return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp" })[extname(path)] ?? "application/octet-stream";
}

function setSecurityHeaders(response) {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("permissions-policy", "microphone=(self)");
  response.setHeader("content-security-policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'");
}

function json(response, status, value) {
  if (response.writableEnded) return;
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

function sse(response, event, value) {
  if (!response.writableEnded && !response.destroyed) {
    response.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
  }
}

function publicStreamError(error) {
  const code = error?.code ?? "server_error";
  const messages = {
    quota_exceeded: "云端模型当前配额或服务容量不足，请稍后再试。",
    timeout: "云端回答超时，请稍后重试。",
    network_error: "云端网络连接暂时不可用，请稍后重试。",
    upstream_error: "云端服务暂时不可用，请稍后重试。",
    ungrounded_reply: error?.message,
  };
  return { error: code, message: messages[code] ?? "本次回答没有完成，请稍后重试。" };
}

function httpError(status, code, message) { return Object.assign(new Error(message), { status, code, expose: true }); }

export async function loadEnv(path = resolve(projectRoot, ".env")) {
  try {
    const text = await readFile(path, "utf8");
    for (const line of text.split(/\r?\n/u)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/u);
      if (!match || match[1] in process.env) continue;
      process.env[match[1]] = match[2].replace(/^(?:"(.*)"|'(.*)')$/u, "$1$2");
    }
  } catch (error) { if (error.code !== "ENOENT") throw error; }
}

export function clientFromEnv(env = process.env) {
  if (!env.GEMINI_API_KEY) return null;
  const primary = new GeminiClient({
    apiKey: env.GEMINI_API_KEY,
    timeoutMs: boundedTimeout(env.GEMINI_TIMEOUT_MS),
    chatFallbackModels: splitModels(env.GEMINI_CHAT_FALLBACK_MODELS),
    fastFallbackModels: splitModels(env.GEMINI_FAST_FALLBACK_MODELS),
    groundedFallbackModels: splitModels(env.GEMINI_GROUNDED_FALLBACK_MODELS),
    models: {
      fast: env.GEMINI_FAST_MODEL ?? DEFAULT_MODELS.fast,
      grounded: env.GEMINI_GROUNDED_MODEL ?? DEFAULT_MODELS.grounded,
      transcribe: env.GEMINI_TRANSCRIBE_MODEL ?? DEFAULT_MODELS.transcribe,
      speech: env.GEMINI_TTS_MODEL ?? DEFAULT_MODELS.speech
    }
  });
  const chatFallbacks = compatibleProvidersFromEnv(env).map((config) => new OpenAiCompatibleClient({
    ...config,
    timeoutMs: boundedTimeout(env.COMPATIBLE_TIMEOUT_MS ?? env.GEMINI_TIMEOUT_MS),
  }));
  const speechProvider = googleCloudTtsFromEnv(env) ?? primary;
  return new OracleCloudClient({ primary, chatFallbacks, speechProvider });
}

export function compatibleProvidersFromEnv(env = process.env) {
  const candidates = [
    {
      apiKey: env.OPENAI_COMPAT_API_KEY,
      baseUrl: env.OPENAI_COMPAT_BASE_URL,
      model: env.OPENAI_COMPAT_FAST_MODEL ?? env.OPENAI_COMPAT_MODEL,
      groundedModel: env.OPENAI_COMPAT_GROUNDED_MODEL ?? env.OPENAI_COMPAT_MODEL,
      provider: env.OPENAI_COMPAT_PROVIDER ?? "compatible",
    },
    {
      apiKey: env.GROQ_API_KEY,
      baseUrl: "https://api.groq.com/openai/v1",
      model: env.GROQ_FAST_MODEL ?? env.GROQ_CHAT_MODEL,
      groundedModel: env.GROQ_GROUNDED_MODEL ?? env.GROQ_CHAT_MODEL,
      provider: "groq",
    },
    {
      apiKey: env.OPENROUTER_API_KEY,
      baseUrl: "https://openrouter.ai/api/v1",
      model: env.OPENROUTER_FAST_MODEL ?? env.OPENROUTER_CHAT_MODEL,
      groundedModel: env.OPENROUTER_GROUNDED_MODEL ?? env.OPENROUTER_CHAT_MODEL,
      provider: "openrouter",
      headers: { "HTTP-Referer": "https://github.com/dengjihui1/shoujian-oracle", "X-Title": "Shoujian Oracle" },
    },
    {
      apiKey: env.SILICONFLOW_API_KEY,
      baseUrl: "https://api.siliconflow.cn/v1",
      model: env.SILICONFLOW_FAST_MODEL ?? env.SILICONFLOW_CHAT_MODEL,
      groundedModel: env.SILICONFLOW_GROUNDED_MODEL ?? env.SILICONFLOW_CHAT_MODEL,
      provider: "siliconflow",
    },
  ];
  return candidates.filter(({ apiKey, baseUrl, model }) => apiKey && baseUrl && model);
}

function splitModels(value) {
  return value === undefined
    ? undefined
    : String(value).split(",").map((model) => model.trim()).filter(Boolean);
}

function boundedTimeout(value) {
  const parsed = Number.parseInt(value ?? "60000", 10);
  return Number.isFinite(parsed) ? Math.max(10_000, Math.min(parsed, 120_000)) : 60_000;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await loadEnv();
  const port = Number.parseInt(process.env.PORT ?? "8000", 10);
  const client = clientFromEnv();
  createHttpServer(createApp({ client })).listen(port, "127.0.0.1", () => {
    console.log(`Shoujian Oracle: http://127.0.0.1:${port} (${client ? "Gemini cloud enabled" : "local fallback"})`);
  });
}
