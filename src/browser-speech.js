const MALE_MANDARIN_VOICE_HINTS = [
  [/yunjian/iu, 80],
  [/yunxi/iu, 75],
  [/kangkang/iu, 70],
  [/xiaofeng/iu, 65],
  [/(?:male|男声)/iu, 40],
  [/microsoft/iu, 12],
  [/google/iu, 8],
];

export class BrowserSpeechPlayer {
  constructor({
    speechSynthesis = globalThis.speechSynthesis,
    UtteranceClass = globalThis.SpeechSynthesisUtterance,
    setIntervalFn = (...args) => globalThis.setInterval(...args),
    clearIntervalFn = (...args) => globalThis.clearInterval(...args),
    setTimeoutFn = (...args) => globalThis.setTimeout(...args),
    clearTimeoutFn = (...args) => globalThis.clearTimeout(...args),
    startTimeoutMs = 5_000,
    maxPlaybackMs = 60_000,
  } = {}) {
    this.speechSynthesis = speechSynthesis;
    this.UtteranceClass = UtteranceClass;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.startTimeoutMs = startTimeoutMs;
    this.maxPlaybackMs = maxPlaybackMs;
  }

  get supported() {
    return Boolean(this.speechSynthesis?.speak && this.speechSynthesis?.cancel && this.UtteranceClass);
  }

  prepare(text) {
    if (!this.supported) throw new Error("当前浏览器不支持极速本机语音");
    return { kind: "browser-speech", text: String(text ?? "").trim() };
  }

  async play(payload, { onLevel = () => {}, onStart = () => {} } = {}) {
    if (!this.supported) throw new Error("当前浏览器不支持极速本机语音");
    const text = String(payload?.text ?? "").trim();
    if (!text) throw new Error("朗读内容为空");

    const utterance = new this.UtteranceClass(text);
    utterance.lang = "zh-CN";
    utterance.rate = 0.92;
    utterance.pitch = 0.82;
    utterance.volume = 1;
    const voice = selectMandarinVoice(this.speechSynthesis.getVoices?.() ?? []);
    if (voice) utterance.voice = voice;

    let timer = null;
    let startTimer = null;
    let playbackTimer = null;
    let pulse = 0;
    let settled = false;
    let finish;
    let fail;
    const ended = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
    const release = (error = null) => {
      if (settled) return;
      settled = true;
      if (timer !== null) this.clearIntervalFn(timer);
      if (startTimer !== null) this.clearTimeoutFn(startTimer);
      if (playbackTimer !== null) this.clearTimeoutFn(playbackTimer);
      onLevel(0);
      error ? fail(error) : finish();
    };
    utterance.onstart = () => {
      if (settled) return;
      if (startTimer !== null) this.clearTimeoutFn(startTimer);
      startTimer = null;
      onStart();
      const playbackBudget = Math.min(this.maxPlaybackMs, Math.max(12_000, 5_000 + text.length * 800));
      playbackTimer = this.setTimeoutFn(() => {
        if (settled) return;
        release(new Error("本机语音播放超时，请切换云端音色或继续文字对话"));
        this.speechSynthesis.cancel();
      }, playbackBudget);
      onLevel(0.42);
      timer = this.setIntervalFn(() => {
        pulse = (pulse + 1) % 5;
        onLevel(0.34 + pulse * 0.11);
      }, 90);
    };
    utterance.onboundary = () => onLevel(0.68);
    utterance.onend = () => release();
    utterance.onerror = (event) => {
      if (event?.error === "canceled" || event?.error === "interrupted") release();
      else release(new Error("本机语音播放失败"));
    };

    try {
      startTimer = this.setTimeoutFn(() => {
        if (settled) return;
        release(new Error("本机语音未能开始播放，请切换云端音色或继续文字对话"));
        this.speechSynthesis.cancel();
      }, this.startTimeoutMs);
      this.speechSynthesis.speak(utterance);
    } catch (error) {
      release();
      throw error;
    }
    return {
      ended,
      stop: () => {
        if (settled) return;
        this.speechSynthesis.cancel();
        release();
      },
    };
  }
}

export function selectMandarinVoice(voices) {
  const candidates = (Array.isArray(voices) ? voices : [])
    .filter((voice) => String(voice?.lang ?? "").toLowerCase().replace(/_/gu, "-").startsWith("zh"));
  const local = candidates.filter((voice) => voice?.localService);
  const ranked = (local.length ? local : candidates)
    .map((voice, order) => ({ voice, order, score: voiceScore(voice) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.order - right.order);
  return ranked[0]?.voice ?? null;
}

function voiceScore(voice) {
  const language = String(voice?.lang ?? "").toLowerCase().replace(/_/gu, "-");
  if (!language.startsWith("zh")) return 0;
  let score = language === "zh-cn" || language === "zh-hans" ? 100 : 70;
  const name = String(voice?.name ?? "");
  for (const [pattern, bonus] of MALE_MANDARIN_VOICE_HINTS) {
    if (pattern.test(name)) score += bonus;
  }
  if (voice?.localService) score += 5;
  if (voice?.default) score += 2;
  return score;
}
