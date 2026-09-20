import { createServer as createHttpServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { GeminiClient, GeminiError, DEFAULT_MODELS } from "./gemini-client.mjs";
import { buildChatInput, buildSystemInstruction, formatShanghaiDateTime } from "./prompt.mjs";
import { loadKnowledgeBase } from "./knowledge-retriever.mjs";
import { assessQuestion } from "../src/question-boundary.js";
import { boundaryReply } from "../src/dialogue-engine.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const AUDIO_TYPES = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav"]);
const BODY_LIMIT = 8 * 1024 * 1024;
const defaultKnowledgeBase = await loadKnowledgeBase();

export function createApp({ client = null, knowledgeBase = defaultKnowledgeBase, rootPath = projectRoot, now = Date.now } = {}) {
  const requests = new Map();
  const apiEnabled = Boolean(client);

  return async function app(request, response) {
    setSecurityHeaders(response);
    try {
      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
      if (url.pathname.startsWith("/api/")) {
        if (!allowRequest(request.socket.remoteAddress ?? "unknown", requests, now)) return json(response, 429, { error: "rate_limited", message: "请求太频繁，请稍后再试。" });
        if (request.method === "GET" && url.pathname === "/api/status") {
          return json(response, 200, {
            cloud: apiEnabled,
            provider: apiEnabled ? "Google Gemini" : null,
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
        if (url.pathname === "/api/speech") return await handleSpeech(response, client, body);
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
  if (prepared.blocked) return json(response, 200, prepared.blocked);
  const result = await client.chat({ input: prepared.input, systemInstruction: prepared.systemInstruction });
  validateCitations(result.text, prepared.evidence);
  return json(response, 200, {
    text: result.text,
    evidence: prepared.evidence,
    grounded: prepared.evidence.length > 0,
    purpose: prepared.purpose,
  });
}

async function handleChatStream(response, client, knowledgeBase, body, now) {
  const prepared = prepareChat(body, knowledgeBase, now);
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
  });
  if (prepared.blocked) {
    sse(response, "delta", { text: prepared.blocked.text });
    sse(response, "done", prepared.blocked);
    return response.end();
  }

  let fullText = "";
  try {
    for await (const chunk of client.chatStream({ input: prepared.input, systemInstruction: prepared.systemInstruction })) {
      if (response.destroyed) return;
      fullText += chunk.text;
      sse(response, "delta", { text: chunk.text });
    }
    validateCitations(fullText, prepared.evidence);
    sse(response, "done", { text: fullText });
  } catch (error) {
    const exposed = publicStreamError(error);
    sse(response, "error", exposed);
  }
  response.end();
}

function prepareChat(body, knowledgeBase, now) {
  const message = cleanText(body.message, 2_000, "对话内容");
  const stage = ["question", "ready", "reading"].includes(body.stage) ? body.stage : "question";
  const assessment = assessQuestion(message);
  const divinationMode = stage !== "question" || body.purpose === "divination";
  const immediateDanger = assessment.issues.some(({ code }) => code === "immediate-harm");
  if ((divinationMode && assessment.level === "blocked") || immediateDanger) {
    return {
      blocked: { text: boundaryReply(assessment), blocked: true },
      evidence: [],
      purpose: divinationMode ? "divination" : "chat",
      serverTime: formatShanghaiDateTime(now()),
    };
  }
  const question = typeof body.question === "string" ? body.question.slice(0, 500) : "";
  const reading = sanitizeReading(body.reading);
  const history = Array.isArray(body.history) ? body.history.slice(-16).map((item) => ({
    role: item?.role === "user" ? "user" : "master",
    text: String(item?.text ?? "").slice(0, 1_000)
  })) : [];
  const evidence = knowledgeBase.retrieve({
    query: [message, question].filter(Boolean).join("\n"),
    reading,
    limit: 8,
  });
  const serverTime = formatShanghaiDateTime(now());
  return {
    evidence,
    purpose: divinationMode ? "divination" : "chat",
    serverTime,
    input: buildChatInput(message, history),
    systemInstruction: buildSystemInstruction({ stage, question, reading, evidence, currentDateTime: serverTime }),
  };
}

async function handleSpeech(response, client, body) {
  const text = cleanText(body.text, 800, "朗读内容");
  const result = await client.speech({ text });
  return json(response, 200, { data: result.data, mimeType: result.mimeType, sampleRate: result.sampleRate });
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

function allowRequest(key, store, now) {
  const minute = 60_000;
  const recent = (store.get(key) ?? []).filter((time) => now() - time < minute);
  if (recent.length >= 40) return false;
  recent.push(now()); store.set(key, recent); return true;
}

function contentType(path) {
  return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".svg": "image/svg+xml" })[extname(path)] ?? "application/octet-stream";
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
    quota_exceeded: "Gemini 当前配额或服务容量不足，请稍后再试。",
    timeout: "Gemini 回答超时，请稍后重试。",
    network_error: "Gemini 网络连接暂时不可用，请稍后重试。",
    upstream_error: "Gemini 服务暂时不可用，请稍后重试。",
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
  return new GeminiClient({
    apiKey: env.GEMINI_API_KEY,
    timeoutMs: boundedTimeout(env.GEMINI_TIMEOUT_MS),
    chatFallbackModels: splitModels(env.GEMINI_CHAT_FALLBACK_MODELS),
    models: {
      chat: env.GEMINI_CHAT_MODEL ?? DEFAULT_MODELS.chat,
      transcribe: env.GEMINI_TRANSCRIBE_MODEL ?? DEFAULT_MODELS.transcribe,
      speech: env.GEMINI_TTS_MODEL ?? DEFAULT_MODELS.speech
    }
  });
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
