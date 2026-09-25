export class GoogleStreamRecognizer {
  constructor({ enabled = false, mediaDevices = globalThis.navigator?.mediaDevices,
    AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext,
    WebSocketClass = globalThis.WebSocket, location = globalThis.location } = {}) {
    Object.assign(this, { enabled, mediaDevices, AudioContextClass, WebSocketClass, location });
  }

  get supported() {
    return Boolean(this.enabled && this.mediaDevices?.getUserMedia && this.AudioContextClass &&
      globalThis.AudioWorkletNode && this.WebSocketClass);
  }

  async start({ onText } = {}) {
    if (!this.supported) throw new Error("Google Cloud 实时转写未启用或当前浏览器不支持");
    if (this.active) throw new Error("实时转写已经开始");
    this.active = true;
    this.stopping = false;
    let resolveResult;
    let rejectResult;
    const result = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
    this.result = result;
    let settled = false;
    let final = "";
    let interim = "";
    let ready = false;
    const cleanup = () => {
      this.active = false;
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
      this.node?.disconnect();
      this.source?.disconnect();
      this.node = null;
      this.source = null;
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = null;
      void this.context?.close().catch(() => {});
      this.context = null;
      if (this.socket && this.socket.readyState < 2) this.socket.close();
      this.socket = null;
    };
    const finish = (text, error) => {
      if (settled) return;
      settled = true;
      cleanup();
      error ? rejectResult(error) : resolveResult(text);
    };
    this.finish = finish;
    try {
      this.stream = await this.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      if (settled) { cleanup(); return result; }
      this.context = new this.AudioContextClass();
      await this.context.audioWorklet.addModule("/src/pcm-worklet.js");
      if (this.context.state === "suspended") await this.context.resume();
      if (settled) { cleanup(); return result; }
      const scheme = this.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new this.WebSocketClass(`${scheme}//${this.location.host}/api/stt/stream`);
      this.socket = socket;
      socket.binaryType = "arraybuffer";
      socket.onopen = () => socket.send(JSON.stringify({ type: "start", sampleRate: this.context.sampleRate }));
      socket.onmessage = (event) => {
        if (settled) return;
        let message;
        try { message = JSON.parse(event.data); } catch { return finish("", new Error("实时转写返回无效数据")); }
        if (message.type === "ready") {
          try {
            ready = true;
            this.source = this.context.createMediaStreamSource(this.stream);
            this.node = new AudioWorkletNode(this.context, "shoujian-pcm");
            const muted = this.context.createGain();
            muted.gain.value = 0;
            this.source.connect(this.node);
            this.node.connect(muted);
            muted.connect(this.context.destination);
            this.node.port.onmessage = ({ data }) => {
              if (!settled && socket.readyState === 1 && !this.stopping && socket.bufferedAmount < 128 * 1024) socket.send(data);
            };
            this.silenceTimer = setTimeout(() => finish("", Object.assign(new Error("没有听到清晰语音"), { code: "no_speech" })), 12_000);
          } catch {
            finish("", Object.assign(new Error("浏览器音频采集启动失败"), { code: "stream_unavailable" }));
          }
        } else if (message.type === "text") {
          const nextFinal = String(message.final ?? "").trim();
          const nextInterim = String(message.interim ?? "").trim();
          if (nextFinal === final && nextInterim === interim) return;
          final = nextFinal;
          interim = nextInterim;
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
          onText?.(`${final} ${interim}`.trim(), { final, interim });
        } else if (message.type === "done") {
          finish(String(message.text || final || interim).trim());
        } else if (message.type === "error") {
          finish("", Object.assign(new Error(String(message.message || "Google Cloud 实时转写失败")), { code: "stream_unavailable" }));
        }
      };
      socket.onerror = () => finish("", Object.assign(new Error("Google Cloud 实时转写连接失败"), { code: "stream_unavailable" }));
      socket.onclose = () => { if (!settled) finish("", Object.assign(new Error(ready ? "实时转写意外中断" : "实时转写连接失败"), { code: "stream_unavailable" })); };
    } catch (error) {
      finish("", error);
    }
    return result;
  }

  stop() {
    if (!this.active || this.stopping) return this.result ?? Promise.resolve("");
    this.stopping = true;
    this.node?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.socket?.readyState === 1) this.socket.send('{"type":"stop"}');
    else this.finish?.("", new Error("实时转写连接未就绪"));
    return this.result;
  }

  abort() {
    this.finish?.("", Object.assign(new Error("语音转写已取消"), { name: "AbortError" }));
  }
}
