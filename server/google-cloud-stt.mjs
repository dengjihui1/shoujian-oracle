import speech from "@google-cloud/speech";
import { WebSocketServer } from "ws";

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_DURATION_MS = 35_000;

export function googleCloudSttFromEnv(env = process.env, options = {}) {
  if (!/^(?:true|1|yes)$/iu.test(String(env.GOOGLE_CLOUD_STT_ENABLED ?? "").trim())) return null;
  // grpc-js reads lowercase proxy variables; Node's --use-env-proxy accepts HTTPS_PROXY.
  if (env.HTTPS_PROXY && !process.env.grpc_proxy && !process.env.https_proxy && !process.env.http_proxy) {
    process.env.grpc_proxy = env.HTTPS_PROXY;
  }
  return options.client ?? new speech.SpeechClient({
    ...(env.GOOGLE_APPLICATION_CREDENTIALS ? { keyFilename: env.GOOGLE_APPLICATION_CREDENTIALS } : {}),
    ...(env.GOOGLE_CLOUD_PROJECT ? { projectId: env.GOOGLE_CLOUD_PROJECT } : {}),
  });
}

export function attachStreamingStt(server, { client, rateLimiter, now = Date.now, trustProxy = false,
  resolveClientAddress, maxConcurrent = 4 } = {}) {
  if (!client) return;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024, perMessageDeflate: false });
  const sessions = new Set();
  let pending = 0;
  server.on("upgrade", async (request, socket, head) => {
    const reject = (status) => {
      if (!socket.destroyed) socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    };
    let url;
    try { url = new URL(request.url, `http://${request.headers.host}`); }
    catch { return reject("400 Bad Request"); }
    if (url.pathname !== "/api/stt/stream") return reject("404 Not Found");
    const origin = request.headers.origin;
    let sameOrigin = false;
    const forwardedScheme = trustProxy ? String(request.headers["x-forwarded-proto"] ?? "").split(",", 1)[0].trim() : "";
    const scheme = request.socket.encrypted || forwardedScheme === "https" ? "https:" : "http:";
    try {
      const parsedOrigin = new URL(origin);
      sameOrigin = parsedOrigin.host === request.headers.host && parsedOrigin.protocol === scheme;
    } catch { /* reject below */ }
    if (!sameOrigin) return reject("403 Forbidden");
    if (sessions.size + pending >= maxConcurrent) return reject("503 Service Unavailable");
    pending += 1;
    try {
      const address = resolveClientAddress(request, { trustProxy });
      if (!await rateLimiter.allow(address, now())) return reject("429 Too Many Requests");
    } catch { return reject("503 Service Unavailable"); }
    finally { pending -= 1; }
    if (socket.destroyed) return;
    wss.handleUpgrade(request, socket, head, (ws) => {
      sessions.add(ws);
      ws.once("close", () => sessions.delete(ws));
      serveSttSession(ws, client);
    });
  });
  server.on("close", () => { for (const ws of sessions) ws.terminate(); wss.close(); });
}

export function serveSttSession(ws, client) {
  let stream = null;
  let timer = setTimeout(() => fail("start_timeout", "语音流启动超时"), 5_000);
  let bytes = 0;
  let final = "";
  let stopping = false;
  let closed = false;
  const send = (value) => { if (ws.readyState === 1) ws.send(JSON.stringify(value)); };
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    stream?.destroy?.();
  };
  const finish = () => {
    if (closed) return;
    send({ type: "done", text: final.trim() });
    cleanup();
    ws.close(1000);
  };
  const fail = (code, message) => {
    if (closed) return;
    send({ type: "error", code, message });
    cleanup();
    ws.close(1011);
  };
  ws.on("message", (data, binary) => {
    if (closed) return;
    if (!stream) {
      if (binary) return fail("invalid_start", "语音流初始化失败");
      let start;
      try { start = JSON.parse(String(data)); } catch { return fail("invalid_start", "语音流初始化失败"); }
      const rate = Number(start?.sampleRate);
      if (start?.type !== "start" || !Number.isInteger(rate) || rate < 8000 || rate > 48000) {
        return fail("invalid_start", "音频采样率不受支持");
      }
      try {
        stream = client.streamingRecognize({
          config: { encoding: "LINEAR16", sampleRateHertz: rate, languageCode: "zh-CN", enableAutomaticPunctuation: true },
          interimResults: true,
        });
        stream.on("data", (response) => {
          for (const result of response.results ?? []) {
            const transcript = String(result.alternatives?.[0]?.transcript ?? "").trim().slice(0, 2000);
            if (!transcript) continue;
            if (result.isFinal) final = `${final} ${transcript}`.trim().slice(0, 4000);
            send({ type: "text", final, interim: result.isFinal ? "" : transcript });
          }
        });
        stream.on("error", () => fail("upstream_error", "Google Cloud 实时转写暂不可用"));
        stream.on("end", finish);
        clearTimeout(timer);
        timer = setTimeout(() => fail("duration_limit", "本轮语音已超过时长限制"), MAX_DURATION_MS);
        send({ type: "ready" });
      } catch { fail("upstream_error", "Google Cloud 实时转写暂不可用"); }
      return;
    }
    if (!binary) {
      if (String(data) !== '{"type":"stop"}' || stopping) return fail("invalid_message", "语音流指令无效");
      stopping = true;
      stream.end();
      return;
    }
    if (stopping || data.length % 2 || data.length === 0 || (bytes += data.length) > MAX_AUDIO_BYTES) {
      return fail("audio_limit", "本轮录音超过限制");
    }
    stream.write(data);
  });
  ws.on("close", cleanup);
  ws.on("error", cleanup);
}
