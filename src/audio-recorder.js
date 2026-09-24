export class AudioRecorder {
  constructor({ mediaDevices = globalThis.navigator?.mediaDevices, MediaRecorderClass = globalThis.MediaRecorder, maxDurationMs = 45_000 } = {}) {
    this.mediaDevices = mediaDevices;
    this.MediaRecorderClass = MediaRecorderClass;
    this.maxDurationMs = maxDurationMs;
  }

  get supported() { return Boolean(this.mediaDevices?.getUserMedia && this.MediaRecorderClass); }

  async start() {
    if (!this.supported) throw new Error("当前浏览器不支持麦克风录音");
    if (this.starting || (this.recorder && this.recorder.state !== "inactive")) {
      throw new Error("录音正在进行，请先结束本次录音");
    }
    this.starting = true;
    const token = this.startToken = (this.startToken ?? 0) + 1;
    let stream = null;
    let timer = null;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (this.stream === stream) this.stream = null;
      if (this.timer === timer) this.timer = null;
    };
    try {
      stream = await this.mediaDevices.getUserMedia({ audio: true });
      if (token !== this.startToken) throw abortError();
      this.stream = stream;
      const preferred = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => this.MediaRecorderClass.isTypeSupported?.(type));
      const chunks = [];
      const recorder = preferred ? new this.MediaRecorderClass(stream, { mimeType: preferred }) : new this.MediaRecorderClass(stream);
      this.recorder = recorder;
      recorder.addEventListener("dataavailable", (event) => { if (event.data?.size) chunks.push(event.data); });
      this.result = new Promise((resolve, reject) => {
        let settled = false;
        const finish = (value, error = null) => {
          if (settled) return;
          settled = true;
          release();
          error ? reject(error) : resolve(value);
        };
        recorder.addEventListener("stop", () => {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          blob.size ? finish(blob) : finish(null, new Error("没有录到声音，请重试"));
        }, { once: true });
        recorder.addEventListener("error", () => finish(null, new Error("录音失败，请检查麦克风权限")), { once: true });
      });
      recorder.start();
      timer = setTimeout(() => { if (recorder.state !== "inactive") recorder.stop(); }, this.maxDurationMs);
      this.timer = timer;
    } catch (error) {
      release();
      throw error;
    } finally {
      this.starting = false;
    }
  }

  async stop() {
    if (!this.recorder || this.recorder.state === "inactive") return this.result;
    this.recorder.stop();
    return this.result;
  }

  cancel() {
    this.startToken = (this.startToken ?? 0) + 1;
    if (this.starting) return Promise.resolve();
    if (this.recorder && this.recorder.state !== "inactive") return this.stop();
    return Promise.resolve();
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
        if (settled) return;
        let final = "";
        let interim = "";
        for (let index = 0; index < event.results.length; index += 1) {
          const text = String(event.results[index]?.[0]?.transcript ?? "").trim();
          if (!text) continue;
          if (event.results[index].isFinal) final = `${final} ${text}`.trim();
          else interim = `${interim} ${text}`.trim();
        }
        const latest = `${final} ${interim}`.trim();
        if (final === this.finalText && latest === this.latestText) return;
        this.finalText = final;
        this.latestText = latest;
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
