export class StreamingSpeechQueue {
  constructor({ synthesize, play, onState = () => {}, onLevel = () => {}, onError = () => {}, prefetch = 2 } = {}) {
    if (typeof synthesize !== "function") throw new TypeError("synthesize callback is required");
    if (typeof play !== "function") throw new TypeError("play callback is required");
    this.synthesize = synthesize;
    this.play = play;
    this.onState = onState;
    this.onLevel = onLevel;
    this.onError = onError;
    this.prefetch = Math.max(1, Math.min(3, Number(prefetch) || 2));
    this.items = [];
    this.playIndex = 0;
    this.activeSyntheses = 0;
    this.activePlayback = null;
    this.playbackPumping = false;
    this.closed = false;
    this.cancelled = false;
    this.settled = false;
    this.state = "idle";
    this.done = new Promise((resolve) => { this.resolveDone = resolve; });
  }

  enqueue(value) {
    if (this.closed || this.cancelled) return false;
    const text = String(value ?? "").trim();
    if (!text) return false;
    this.items.push({ text, status: "pending", controller: null, audio: null });
    this.#setState(this.state === "playing" ? "playing" : "generating");
    this.#pumpSynthesis();
    return true;
  }

  close() {
    this.closed = true;
    this.#pumpPlayback();
    this.#settleIfComplete();
    return this.done;
  }

  cancel() {
    if (this.cancelled || this.settled) return;
    this.cancelled = true;
    for (const item of this.items) item.controller?.abort();
    this.activePlayback?.stop?.();
    this.activePlayback = null;
    this.onLevel(0);
    this.#setState("idle");
    this.#settle();
  }

  #pumpSynthesis() {
    if (this.cancelled) return;
    while (this.activeSyntheses < this.prefetch) {
      const item = this.items
        .slice(this.playIndex, this.playIndex + this.prefetch)
        .find((candidate) => candidate.status === "pending");
      if (!item) break;
      item.status = "synthesizing";
      item.controller = new AbortController();
      this.activeSyntheses += 1;
      void this.#synthesize(item);
    }
  }

  async #synthesize(item) {
    try {
      const audio = await this.synthesize(item.text, { signal: item.controller.signal });
      if (this.cancelled || item.controller.signal.aborted) return;
      item.audio = audio;
      item.status = "ready";
    } catch (error) {
      item.status = "failed";
      if (!this.cancelled && !item.controller.signal.aborted) this.onError(error, item.text);
    } finally {
      item.controller = null;
      this.activeSyntheses -= 1;
      if (!this.cancelled) {
        this.#pumpSynthesis();
        this.#pumpPlayback();
        this.#settleIfComplete();
      }
    }
  }

  #pumpPlayback() {
    if (this.cancelled || this.playbackPumping) return;
    this.playbackPumping = true;
    void this.#playReadyItems();
  }

  async #playReadyItems() {
    try {
      while (!this.cancelled) {
        const item = this.items[this.playIndex];
        if (!item) break;
        if (item.status === "failed") {
          this.playIndex += 1;
          this.#pumpSynthesis();
          continue;
        }
        if (item.status !== "ready") break;
        try {
          const playback = await this.play(item.audio, {
            onLevel: this.onLevel,
            onStart: () => {
              if (!this.cancelled) this.#setState("playing");
            },
          });
          if (this.cancelled) {
            playback?.stop?.();
            break;
          }
          this.activePlayback = playback;
          await playback?.ended;
        } catch (error) {
          if (!this.cancelled) this.onError(error, item.text);
        } finally {
          this.activePlayback = null;
          this.onLevel(0);
        }
        this.playIndex += 1;
        this.#pumpSynthesis();
      }
    } finally {
      this.playbackPumping = false;
      if (!this.cancelled && this.playIndex < this.items.length) this.#setState("generating");
      this.#settleIfComplete();
    }
  }

  #settleIfComplete() {
    if (!this.closed || this.cancelled || this.playbackPumping) return;
    while (this.items[this.playIndex]?.status === "failed") this.playIndex += 1;
    if (this.playIndex >= this.items.length && this.activeSyntheses === 0) {
      this.#setState("idle");
      this.#settle();
    }
  }

  #setState(next) {
    if (this.state === next) return;
    this.state = next;
    this.onState(next);
  }

  #settle() {
    if (this.settled) return;
    this.settled = true;
    this.resolveDone();
  }
}
