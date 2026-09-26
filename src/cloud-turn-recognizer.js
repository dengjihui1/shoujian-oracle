import { AudioRecorder, blobToBase64 } from "./audio-recorder.js";

// Hands-free turn detection when the browser's streaming recognizer is unavailable.
export class CloudTurnRecognizer {
  constructor({ recorder = new AudioRecorder(), transcribe, AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext,
    setIntervalFn = (...args) => globalThis.setInterval(...args), clearIntervalFn = (...args) => globalThis.clearInterval(...args),
    now = () => Date.now(),
    silenceMs = 850, noSpeechMs = 12_000, maxSpeechMs = 30_000 } = {}) {
    this.recorder = recorder;
    this.transcribe = transcribe;
    this.AudioContextClass = AudioContextClass;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.now = now;
    this.silenceMs = silenceMs;
    this.noSpeechMs = noSpeechMs;
    this.maxSpeechMs = maxSpeechMs;
    this.enabled = true;
  }

  get supported() { return Boolean(this.enabled && this.recorder.supported && this.AudioContextClass && this.transcribe); }

  async start({ onSpeechEnd } = {}) {
    if (!this.supported) throw new Error("当前浏览器不支持自动收音");
    if (this.active) throw new Error("自动收音已经开始");
    this.active = true;
    const controller = new AbortController();
    this.controller = controller;
    let context;
    try {
      await this.recorder.start();
      if (controller.signal.aborted) throw abortError();
      context = new this.AudioContextClass();
      this.context = context;
      if (context.state === "suspended") await context.resume();
      if (controller.signal.aborted) throw abortError();
      const source = context.createMediaStreamSource(this.recorder.stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const silentOutput = context.createGain();
      silentOutput.gain.value = 0;
      analyser.connect(silentOutput);
      silentOutput.connect(context.destination);
      const samples = new Float32Array(analyser.fftSize);
      const started = this.now();
      let heardAt = null;
      let lastVoiceAt = 0;
      let noise = 0.005;
      await new Promise((resolve, reject) => {
        this.finishListening = (error) => error ? reject(error) : resolve();
        this.timer = this.setIntervalFn(() => {
          if (controller.signal.aborted) return this.finishListening(abortError());
          analyser.getFloatTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
          const now = this.now();
          if (heardAt === null) noise = noise * 0.98 + Math.min(rms, 0.03) * 0.02;
          if (rms > Math.max(0.016, noise * 3)) {
            if (heardAt === null) heardAt = now;
            lastVoiceAt = now;
          }
          if (heardAt !== null && (now - lastVoiceAt >= this.silenceMs || now - heardAt >= this.maxSpeechMs)) this.finishListening();
          else if (heardAt === null && now - started >= this.noSpeechMs) this.finishListening(Object.assign(new Error("没有听到清晰语音"), { code: "no_speech" }));
        }, 50);
      });
      if (controller.signal.aborted) throw abortError();
      onSpeechEnd?.();
      const blob = await this.recorder.stop();
      const result = await this.transcribe({ data: await blobToBase64(blob), mimeType: blob.type || "audio/webm" }, { signal: controller.signal });
      if (controller.signal.aborted) throw abortError();
      const text = String(result?.text ?? "").trim();
      if (!text) throw Object.assign(new Error("没有听到清晰语音"), { code: "no_speech" });
      return text;
    } finally {
      this.clearIntervalFn(this.timer);
      this.timer = undefined;
      this.finishListening = null;
      try { await this.recorder.cancel(); } catch { /* the discarded silent recording may be empty */ }
      void context?.close?.();
      this.context = null;
      this.active = false;
      if (this.controller === controller) this.controller = null;
    }
  }

  stop() { this.finishListening?.(); }

  abort() {
    this.controller?.abort();
    this.finishListening?.(abortError());
    this.recorder.cancel()?.catch(() => {});
  }
}

export class ResilientTurnRecognizer {
  constructor({ browser, cloud, stream = null, onFallback = () => {} }) {
    this.browser = browser;
    this.cloud = cloud;
    this.stream = stream;
    this.onFallback = onFallback;
  }
  get supported() { return Boolean(this.stream?.supported || this.browser.supported || this.cloud.supported); }
  async start(options) {
    this.cancelled = false;
    if (this.stream?.supported) {
      this.current = this.stream;
      try { return await this.stream.start(options); }
      catch (error) {
        if (error?.code !== "stream_unavailable" || this.cancelled) throw error;
        this.stream.enabled = false;
        this.onFallback("stream");
      }
    }
    if (this.cancelled) throw abortError();
    if (this.browser.supported) {
      this.current = this.browser;
      try { return await this.browser.start(options); }
      catch (error) {
        if (error?.code !== "network_unavailable" || this.cancelled || !this.cloud.supported) throw error;
        this.onFallback("browser");
      }
    }
    if (this.cancelled) throw abortError();
    this.current = this.cloud;
    return this.cloud.start(options);
  }
  stop() { return this.current?.stop(); }
  abort() { this.cancelled = true; this.current?.abort(); }
}

function abortError() { return Object.assign(new Error("语音转写已取消"), { name: "AbortError" }); }
