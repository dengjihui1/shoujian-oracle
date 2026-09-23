export class AudioRecorder {
  constructor({ mediaDevices = globalThis.navigator?.mediaDevices, MediaRecorderClass = globalThis.MediaRecorder, maxDurationMs = 45_000 } = {}) {
    this.mediaDevices = mediaDevices;
    this.MediaRecorderClass = MediaRecorderClass;
    this.maxDurationMs = maxDurationMs;
  }

  get supported() { return Boolean(this.mediaDevices?.getUserMedia && this.MediaRecorderClass); }

  async start() {
    if (!this.supported) throw new Error("当前浏览器不支持麦克风录音");
    this.stream = await this.mediaDevices.getUserMedia({ audio: true });
    try {
      const preferred = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => this.MediaRecorderClass.isTypeSupported?.(type));
      this.chunks = [];
      this.recorder = preferred ? new this.MediaRecorderClass(this.stream, { mimeType: preferred }) : new this.MediaRecorderClass(this.stream);
      this.recorder.addEventListener("dataavailable", (event) => { if (event.data?.size) this.chunks.push(event.data); });
      this.result = new Promise((resolve, reject) => {
        let settled = false;
        const finish = (value, error = null) => {
          if (settled) return;
          settled = true;
          this.#releaseStream();
          error ? reject(error) : resolve(value);
        };
        this.recorder.addEventListener("stop", () => {
          const blob = new Blob(this.chunks, { type: this.recorder.mimeType || "audio/webm" });
          blob.size ? finish(blob) : finish(null, new Error("没有录到声音，请重试"));
        }, { once: true });
        this.recorder.addEventListener("error", () => finish(null, new Error("录音失败，请检查麦克风权限")), { once: true });
      });
      this.recorder.start();
      this.timer = setTimeout(() => this.stop(), this.maxDurationMs);
    } catch (error) {
      this.#releaseStream();
      throw error;
    }
  }

  async stop() {
    if (!this.recorder || this.recorder.state === "inactive") return this.result;
    this.recorder.stop();
    return this.result;
  }

  #releaseStream() {
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}

export class BrowserSpeechRecognizer {
  constructor({ RecognitionClass = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition } = {}) {
    this.RecognitionClass = RecognitionClass;
    this.active = false;
  }

  get supported() { return typeof this.RecognitionClass === "function"; }

  start({ onText } = {}) {
    if (!this.supported) return Promise.reject(new Error("当前浏览器不支持实时语音转写"));
    if (this.active) return Promise.reject(new Error("语音转写已经开始"));
    const recognition = new this.RecognitionClass();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    this.recognition = recognition;
    this.active = true;
    this.abortRequested = false;
    this.finalText = "";
    this.latestText = "";

    this.result = new Promise((resolve, reject) => {
      let settled = false;
      const finish = (value, error = null) => {
        if (settled) return;
        settled = true;
        this.active = false;
        this.recognition = null;
        this.finishCurrent = null;
        error ? reject(error) : resolve(value);
      };
      this.finishCurrent = finish;
      recognition.onresult = (event) => {
        let interim = "";
        for (let index = event.resultIndex ?? 0; index < event.results.length; index += 1) {
          const text = String(event.results[index]?.[0]?.transcript ?? "").trim();
          if (!text) continue;
          if (event.results[index].isFinal) this.finalText = `${this.finalText} ${text}`.trim();
          else interim = `${interim} ${text}`.trim();
        }
        this.latestText = `${this.finalText} ${interim}`.trim();
        onText?.(this.latestText, { final: this.finalText, interim });
      };
      recognition.onerror = (event) => {
        if (event.error === "aborted" || this.abortRequested) return finish("", abortError());
        const messages = {
          "not-allowed": "麦克风权限未开启",
          "audio-capture": "没有找到可用麦克风",
          "no-speech": "没有听到清晰语音",
          network: "浏览器实时转写网络不可用",
        };
        const error = new Error(messages[event.error] ?? "实时语音转写失败");
        if (event.error === "no-speech") error.code = "no_speech";
        finish("", error);
      };
      recognition.onend = () => this.abortRequested
        ? finish("", abortError())
        : finish(this.finalText || this.latestText);
      try { recognition.start(); } catch (error) { finish("", error); }
    });
    return this.result;
  }

  stop() {
    if (this.active) this.recognition?.stop();
    return this.result ?? Promise.resolve("");
  }

  abort() {
    if (!this.active) return;
    this.abortRequested = true;
    const recognition = this.recognition;
    const finish = this.finishCurrent;
    try { recognition?.abort(); } finally {
      if (this.active) finish?.("", abortError());
    }
  }
}

function abortError() {
  return Object.assign(new Error("语音转写已取消"), { name: "AbortError" });
}

export async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
