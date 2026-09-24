const ACTIVE_STATES = new Set(["listening", "heard", "thinking", "speaking", "interrupted", "error"]);

export class VoiceConversationController {
  constructor({
    recognizer,
    submit,
    interruptOutput = () => {},
    onUpdate = () => {},
    now = () => globalThis.performance?.now?.() ?? Date.now(),
    setTimeoutFn = (...args) => globalThis.setTimeout(...args),
    clearTimeoutFn = (...args) => globalThis.clearTimeout(...args),
    finalPauseMs = 420,
    interimPauseMs = 1_100,
  } = {}) {
    if (!recognizer?.start || !recognizer?.stop || !recognizer?.abort) throw new TypeError("recognizer is required");
    if (typeof submit !== "function") throw new TypeError("submit callback is required");
    this.recognizer = recognizer;
    this.submit = submit;
    this.interruptOutput = interruptOutput;
    this.onUpdate = onUpdate;
    this.now = now;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.finalPauseMs = finalPauseMs;
    this.interimPauseMs = interimPauseMs;
    this.active = false;
    this.state = "off";
    this.autoSubmit = false;
    this.transcript = "";
    this.error = "";
    this.metrics = emptyMetrics();
    this.epoch = 0;
    this.speechState = "idle";
    this.quietRetries = 0;
    this.pendingSubmission = null;
  }

  get snapshot() {
    return {
      active: this.active,
      state: ACTIVE_STATES.has(this.state) ? this.state : "off",
      autoSubmit: this.autoSubmit,
      transcript: this.transcript,
      error: this.error,
      metrics: { ...this.metrics },
    };
  }

  start({ autoSubmit = false } = {}) {
    if (this.active) return this.snapshot;
    if (!this.recognizer.supported) throw new Error("当前浏览器不支持连续语音对话");
    this.active = true;
    this.autoSubmit = Boolean(autoSubmit);
    this.error = "";
    this.transcript = "";
    this.metrics = emptyMetrics();
    this.quietRetries = 0;
    this.epoch += 1;
    this.#emit();
    void this.#listen(this.epoch);
    return this.snapshot;
  }

  stop() {
    if (!this.active && this.state === "off") return;
    this.active = false;
    this.autoSubmit = false;
    this.epoch += 1;
    this.quietRetries = 0;
    this.#clearCommitTimer();
    this.#clearQuietRetry();
    this.recognizer.abort();
    this.state = "off";
    this.transcript = "";
    this.error = "";
    this.speechState = "idle";
    this.#emit();
  }

  interruptAndListen() {
    if (!this.active) return;
    this.epoch += 1;
    const epoch = this.epoch;
    this.#clearCommitTimer();
    this.#clearQuietRetry();
    this.recognizer.abort();
    this.interruptOutput();
    this.speechState = "idle";
    this.quietRetries = 0;
    this.state = "interrupted";
    this.transcript = "";
    this.error = "";
    this.#emit();
    void this.#listen(epoch);
    return this.snapshot;
  }

  markFirstToken() {
    if (!this.active || this.metrics.submittedAt === null || this.metrics.firstTokenAt !== null) return;
    this.metrics.firstTokenAt = this.now();
    this.metrics.firstTokenMs = elapsed(this.metrics.submittedAt, this.metrics.firstTokenAt);
    this.#emit();
  }

  markSpeechState(state) {
    if (!this.active) return;
    this.speechState = state;
    if (state === "playing") {
      if (this.metrics.submittedAt !== null && this.metrics.firstAudioAt === null) {
        this.metrics.firstAudioAt = this.now();
        this.metrics.firstAudioMs = elapsed(this.metrics.submittedAt, this.metrics.firstAudioAt);
      }
      this.state = "speaking";
    } else if (state === "generating" && this.state !== "speaking") {
      this.state = "thinking";
    }
    this.#emit();
    if (state === "idle") this.#resumeIfComplete();
  }

  async #listen(epoch) {
    if (!this.active || epoch !== this.epoch) return;
    this.#clearCommitTimer();
    this.#clearQuietRetry();
    this.state = "listening";
    this.transcript = "";
    this.error = "";
    this.metrics = { ...emptyMetrics(), listeningAt: this.now() };
    this.#emit();
    let result;
    try {
      result = await this.recognizer.start({
        onText: (text, detail = {}) => this.#heard(text, detail, epoch),
      });
    } catch (error) {
      if (!this.active || epoch !== this.epoch || error?.name === "AbortError") return;
      if (error?.code === "no_speech") return this.#retryAfterQuiet(epoch);
      this.state = "error";
      this.error = String(error?.message ?? "语音识别暂不可用");
      this.#emit();
      return;
    }
    if (!this.active || epoch !== this.epoch) return;
    this.#clearCommitTimer();
    const text = String(result || this.transcript).trim();
    if (!text) {
      return this.#retryAfterQuiet(epoch);
    }
    this.quietRetries = 0;
    this.transcript = text;
    this.state = "heard";
    this.metrics.finalAt = this.now();
    this.metrics.asrFinalMs = elapsed(this.metrics.speechEndedAt ?? this.metrics.listeningAt, this.metrics.finalAt);
    this.#emit();
    if (this.autoSubmit) await this.#submit(epoch, text);
  }

  #heard(text, detail, epoch) {
    if (!this.active || epoch !== this.epoch || this.state !== "listening") return;
    this.transcript = String(text ?? "").trim();
    if (String(detail?.final ?? "").trim() && this.metrics.speechEndedAt === null) this.metrics.speechEndedAt = this.now();
    this.#emit();
    if (!this.autoSubmit || !this.transcript) return;
    this.#clearCommitTimer();
    const delay = String(detail?.final ?? "").trim() ? this.finalPauseMs : this.interimPauseMs;
    this.commitTimer = this.setTimeoutFn(() => {
      if (this.active && epoch === this.epoch && this.state === "listening") {
        if (this.metrics.speechEndedAt === null) this.metrics.speechEndedAt = this.now();
        this.state = "heard";
        this.#emit();
        this.recognizer.stop();
      }
    }, delay);
  }

  async #submit(epoch, text) {
    if (!this.active || epoch !== this.epoch) return;
    this.state = "thinking";
    this.metrics.submittedAt = this.now();
    this.metrics.autoSubmitted = true;
    this.#emit();
    const previousSubmission = this.pendingSubmission;
    if (previousSubmission) {
      try { await previousSubmission; } catch { /* previous turn already handles its error */ }
      if (!this.active || epoch !== this.epoch) return;
    }
    const submission = Promise.resolve().then(() => this.submit(text));
    this.pendingSubmission = submission;
    try {
      await submission;
    } catch (error) {
      if (!this.active || epoch !== this.epoch || error?.name === "AbortError") return;
      this.error = String(error?.message ?? "本轮回答失败，可改用文字继续");
      this.state = "error";
      this.#emit();
      return;
    } finally {
      if (this.pendingSubmission === submission) this.pendingSubmission = null;
    }
    if (!this.active || epoch !== this.epoch) return;
    this.metrics.turnComplete = true;
    this.#resumeIfComplete();
  }

  #resumeIfComplete() {
    if (!this.active || !this.metrics.turnComplete || this.speechState !== "idle") return;
    const epoch = this.epoch;
    queueMicrotask(() => {
      if (this.active && epoch === this.epoch && this.metrics.turnComplete && this.speechState === "idle") {
        void this.#listen(epoch);
      }
    });
  }

  #clearCommitTimer() {
    if (this.commitTimer !== undefined) this.clearTimeoutFn(this.commitTimer);
    this.commitTimer = undefined;
  }

  #retryAfterQuiet(epoch) {
    if (!this.active || epoch !== this.epoch) return;
    const delay = Math.min(3_000, 250 * 2 ** Math.min(this.quietRetries, 4));
    this.quietRetries += 1;
    this.state = "listening";
    this.transcript = "";
    this.error = "";
    this.#emit();
    this.quietRetryTimer = this.setTimeoutFn(() => {
      this.quietRetryTimer = undefined;
      if (this.active && epoch === this.epoch) void this.#listen(epoch);
    }, delay);
  }

  #clearQuietRetry() {
    if (this.quietRetryTimer !== undefined) this.clearTimeoutFn(this.quietRetryTimer);
    this.quietRetryTimer = undefined;
  }

  #emit() {
    this.onUpdate(this.snapshot);
  }
}

function emptyMetrics() {
  return {
    listeningAt: null,
    speechEndedAt: null,
    finalAt: null,
    submittedAt: null,
    firstTokenAt: null,
    firstAudioAt: null,
    asrFinalMs: null,
    firstTokenMs: null,
    firstAudioMs: null,
    autoSubmitted: false,
    turnComplete: false,
  };
}

function elapsed(start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.round(end - start));
}
