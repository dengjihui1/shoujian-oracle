import { castWithCoins } from "./oracle-engine.js";
import { assessQuestion } from "./question-boundary.js";
import { boundaryReply, followUpReply, readingReply, welcomeReply } from "./dialogue-engine.js";
import { inferConversationPurpose } from "./response-policy.js";
import { OracleApiClient } from "./api-client.js";
import { AudioRecorder, BrowserSpeechRecognizer, blobToBase64 } from "./audio-recorder.js";
import { playPcmBase64, primeAudioPlayback } from "./audio-player.js";
import { ConversationMemory, recentConversation } from "./conversation-memory.js";
import { SentenceSegmenter } from "./speech-segmenter.js";
import { StreamingSpeechQueue } from "./speech-queue.js";
import { StreamingTextRevealer } from "./streaming-text.js";
import { renderOracleView } from "./oracle-view.js";
import { deriveAvatarPresentation } from "./avatar-state.js";

export class ShoujianOracle extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.api = new OracleApiClient();
    this.recorder = new AudioRecorder();
    this.liveTranscriber = new BrowserSpeechRecognizer();
    this.memory = new ConversationMemory();
    this.cloud = false;
    this.knowledge = null;
    this.recording = false;
    this.transcribing = false;
    this.busy = false;
    this.voiceReplies = false;
    this.voiceState = "idle";
    this.voiceError = "";
    this.draft = "";
    this.chatController = null;
    this.transcriptionController = null;
    this.speechQueue = null;
    this.initializeSession();
    this.restoreMemory();
    this.render();
  }

  connectedCallback() {
    this.shadowRoot.addEventListener("click", this.handleClick);
    this.shadowRoot.addEventListener("submit", this.handleSubmit);
    this.shadowRoot.addEventListener("input", this.handleInput);
    this.checkCloud();
  }

  disconnectedCallback() {
    this.shadowRoot.removeEventListener("click", this.handleClick);
    this.shadowRoot.removeEventListener("submit", this.handleSubmit);
    this.shadowRoot.removeEventListener("input", this.handleInput);
    clearTimeout(this.recordingTimer);
    if (this.recording && this.recordingMode === "recorded") this.recorder.stop()?.catch(() => {});
    this.recording = false;
    this.transcribing = false;
    this.liveTranscriber.abort();
    this.cancelResponse();
    this.transcriptionController?.abort();
    this.cancelSpeech();
  }

  initializeSession() {
    this.stage = "question";
    this.question = "";
    this.reading = null;
    this.messages = [{ role: "master", text: welcomeReply() }];
  }

  resetSession() {
    this.cancelSpeech();
    this.stage = "question";
    this.question = "";
    this.reading = null;
    this.draft = "";
    this.messages.push({ role: "master", text: "上一卦收好。前面的聊天我还记得，可以继续聊，也可以重新留一件事起卦。" });
    this.persistMemory();
    this.render();
  }

  clearMemory() {
    this.cancelSpeech();
    this.memory.clear();
    this.initializeSession();
    this.draft = "";
    this.render();
    this.focusComposer();
  }

  restoreMemory() {
    const session = this.memory.loadSession();
    if (session.messages.length) this.messages = session.messages;
    this.stage = session.stage;
    this.question = session.question;
    this.reading = session.reading;
  }

  persistMemory() {
    this.memory.saveSession({
      messages: this.messages,
      stage: this.stage,
      question: this.question,
      reading: this.reading,
    });
  }

  handleSubmit = async (event) => {
    event.preventDefault();
    const field = this.shadowRoot.querySelector("textarea");
    const text = String(field?.value ?? this.draft).trim();
    const mode = event.submitter?.dataset.submitMode ?? "divination";
    if (text) {
      this.draft = "";
      await this.sendText(text, mode);
    }
  };

  handleInput = (event) => {
    if (event.target.matches?.("textarea")) this.draft = event.target.value;
  };

  handleClick = async (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "cast") await this.cast();
    if (action === "reset") this.resetSession();
    if (action === "clear-memory") this.clearMemory();
    if (action === "cancel-response") this.cancelResponse();
    if (action === "record") await this.startRecording();
    if (action === "stop-record") await this.stopRecording();
    if (action === "cancel-transcription") {
      this.transcriptionController?.abort();
      this.liveTranscriber.abort();
    }
    if (action === "voice") {
      this.voiceReplies = !this.voiceReplies;
      if (this.voiceReplies) primeAudioPlayback();
      if (!this.voiceReplies) this.cancelSpeech();
      this.render();
    }
    const quick = event.target.closest("[data-quick]")?.dataset.quick;
    if (quick) await this.sendText(quick);
  };

  async sendText(text, mode = "divination") {
    if (this.busy || this.recording || this.transcribing) return;
    this.cancelSpeech();
    this.messages.push({ role: "user", text });
    this.persistMemory();
    const history = this.messages.slice(0, -1);
    if (this.stage === "question") {
      if (mode === "chat" && this.cloud) {
        await this.askCloud(text, history);
      } else {
        const assessment = assessQuestion(text);
        this.messages.push({ role: "master", text: boundaryReply(assessment) });
        if (assessment.level === "clear") {
          this.question = text;
          this.stage = "ready";
        } else if (assessment.level === "rewrite" && this.cloud) {
          await this.askCloud("请帮我把刚才的问题收窄成一个可观察、可行动、带短期限的问题。", history);
        }
      }
    } else if (this.stage === "ready") {
      this.messages.push({ role: "master", text: "原问已经收下。请先起卦；若要换题，点“另起一问”。" });
    } else {
      const localReply = followUpReply(text, this.reading);
      if (localReply.action === "restart") {
        this.messages.push({ role: "master", text: localReply.text });
        this.stage = "question";
        this.question = "";
        this.reading = null;
      } else if (this.cloud) {
        await this.askCloud(text, history, inferConversationPurpose(text, this.stage));
      } else {
        this.messages.push({ role: "master", text: localReply.text });
      }
    }
    this.persistMemory();
    this.render();
    this.focusComposer();
  }

  async cast() {
    if (this.stage !== "ready" || this.busy || this.recording || this.transcribing) return;
    this.reading = castWithCoins();
    this.stage = "reading";
    this.messages.push({ role: "master", text: readingReply(this.reading) });
    this.persistMemory();
    this.render();
    this.focusLatest();
    if (this.cloud) await this.askCloud("请只依据程序给出的本卦、动爻和之卦，解释它怎样帮助我重新看原问，并给一个可撤回的小行动。", this.messages.slice(0, -1), "divination");
  }

  async checkCloud() {
    try {
      const status = await this.api.status();
      this.cloud = Boolean(status.cloud);
      this.knowledge = status.knowledge ?? null;
    } catch (error) {
      this.cloud = false;
      this.knowledge = null;
      console.warn("Cloud capability check failed:", error);
    }
    this.render();
  }

  async askCloud(message, history, purpose = "chat") {
    this.busy = true;
    const controller = new AbortController();
    this.chatController = controller;
    const reply = { role: "master", text: "墨衡正在斟酌…", cloud: true, evidence: [], streaming: true };
    this.messages.push(reply);
    const replyIndex = this.messages.length - 1;
    const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    const revealer = new StreamingTextRevealer({
      reducedMotion: reduceMotion,
      onText: (text) => {
        reply.text = text;
        this.updateStreamingMessage(replyIndex);
      },
    });
    this.activeRevealer = revealer;
    const speechQueue = this.voiceReplies ? this.createSpeechQueue() : null;
    const speechSegmenter = speechQueue ? new SentenceSegmenter() : null;
    let receivedText = false;
    this.render();
    try {
      const result = await this.api.chatStream({
        message,
        purpose,
        stage: this.stage,
        question: this.question,
        reading: this.reading,
        history: recentConversation(history),
      }, {
        signal: controller.signal,
        onMeta: (meta) => {
          reply.evidence = meta.evidence ?? [];
          this.updateStreamingMessage(replyIndex);
        },
        onDelta: (delta) => {
          if (!controller.signal.aborted) {
            receivedText = true;
            revealer.enqueue(delta);
            for (const sentence of speechSegmenter?.push(delta) ?? []) speechQueue.enqueue(sentence);
          }
        },
      });
      await revealer.finish();
      if (controller.signal.aborted) throw Object.assign(new Error("已停止"), { name: "AbortError" });
      reply.text = result.text || reply.text;
      reply.evidence = result.evidence ?? reply.evidence;
      reply.streaming = false;
      for (const sentence of speechSegmenter?.flush() ?? []) speechQueue.enqueue(sentence);
      speechQueue?.close();
    } catch (error) {
      revealer.cancel();
      speechQueue?.cancel();
      if (error?.name === "AbortError") {
        reply.text = receivedText && reply.text ? `${reply.text}\n\n（已停止）` : "已停止本次回答。";
        reply.cancelled = true;
      } else {
        const reason = String(error.message ?? "未知错误").replace(/[。！？!?]+$/u, "");
        reply.text = `本次回答没有完成：${reason}。没有生成替代结论，请稍后重试。`;
        reply.error = true;
      }
      reply.streaming = false;
    } finally {
      if (this.activeRevealer === revealer) this.activeRevealer = null;
      if (this.chatController === controller) this.chatController = null;
      this.busy = false;
      this.persistMemory();
      this.render();
      this.focusComposer();
    }
  }

  cancelResponse() {
    this.activeRevealer?.cancel();
    this.chatController?.abort();
    this.cancelSpeech();
  }

  updateStreamingMessage(index) {
    const article = this.shadowRoot.querySelector(`[data-message-index="${index}"]`);
    if (!article) return;
    article.querySelector("p").textContent = this.messages[index].text;
    article.querySelector("b").textContent = this.messages[index].evidence?.length ? "墨衡 · RAG" : "墨衡 · 云端";
    const dialogue = this.shadowRoot.querySelector(".dialogue");
    if (dialogue) dialogue.scrollTop = dialogue.scrollHeight;
  }

  async startRecording() {
    if (!this.cloud || this.stage === "ready" || this.recording || this.busy || this.transcribing) return;
    try {
      if (this.liveTranscriber.supported) {
        this.recordingMode = "live";
        this.liveTranscriptPromise = this.liveTranscriber.start({
          onText: (text) => {
            this.draft = text;
            const field = this.shadowRoot.querySelector("textarea");
            if (field) field.value = text;
          }
        }).then((text) => ({ text }), (error) => ({ error }));
        this.liveTranscriptPromise.then((result) => {
          if (this.recording && this.recordingMode === "live") this.completeLiveRecognition(result);
        });
      } else {
        this.recordingMode = "recorded";
        await this.recorder.start();
      }
      this.recording = true;
      this.recordingTimer = setTimeout(() => this.stopRecording(), 45_000);
      this.render();
    } catch (error) {
      this.messages.push({ role: "master", text: error.message });
      this.persistMemory();
      this.render();
    }
  }

  async stopRecording() {
    if (!this.recording) return;
    clearTimeout(this.recordingTimer);
    this.recording = false;
    this.busy = true;
    this.transcribing = true;
    const controller = new AbortController();
    this.transcriptionController = controller;
    this.render();
    let transcript = "";
    try {
      if (this.recordingMode === "live") {
        this.liveTranscriber.stop();
        const result = await this.liveTranscriptPromise;
        if (result.error) throw result.error;
        transcript = result.text;
        if (!transcript) throw new Error("没有听到清晰语音");
      } else {
        const blob = await this.recorder.stop();
        const result = await this.api.transcribe(
          { data: await blobToBase64(blob), mimeType: blob.type || "audio/webm" },
          { signal: controller.signal }
        );
        transcript = result.text;
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        this.messages.push({ role: "master", text: `没能听清：${error.message}` });
        this.persistMemory();
      }
    } finally {
      if (this.transcriptionController === controller) this.transcriptionController = null;
      this.transcribing = false;
      this.busy = false;
      if (transcript) this.draft = transcript;
      this.render();
      const field = this.shadowRoot.querySelector("textarea");
      if (field && transcript) field.focus();
    }
  }

  completeLiveRecognition(result) {
    clearTimeout(this.recordingTimer);
    this.recording = false;
    if (result.error) {
      this.messages.push({ role: "master", text: `没能听清：${result.error.message}` });
      this.persistMemory();
    } else if (result.text) {
      this.draft = result.text;
    }
    this.render();
    this.focusComposer();
  }

  async speak(text) {
    const queue = this.createSpeechQueue();
    const segmenter = new SentenceSegmenter();
    for (const sentence of [...segmenter.push(text), ...segmenter.flush()]) queue.enqueue(sentence);
    await queue.close();
  }

  createSpeechQueue() {
    this.cancelSpeech();
    let queue;
    queue = new StreamingSpeechQueue({
      synthesize: (text, { signal }) => this.api.speech(text, { signal }),
      play: (audio, { onLevel }) => playPcmBase64(audio.data, { sampleRate: audio.sampleRate, onLevel }),
      onState: (state) => {
        if (this.speechQueue !== queue) return;
        this.voiceState = state;
        if (state === "idle") this.speechQueue = null;
        this.updateVoiceStatus();
      },
      onLevel: (level) => this.updateVoiceLevel(level),
      onError: (error) => {
        console.warn("Voice sentence failed:", error);
        if (!this.voiceError) this.voiceError = String(error?.message ?? "语音服务暂不可用");
        this.updateVoiceStatus();
      },
      prefetch: 2,
    });
    this.speechQueue = queue;
    return queue;
  }

  cancelSpeech() {
    const queue = this.speechQueue;
    this.speechQueue = null;
    queue?.cancel();
    this.voiceState = "idle";
    this.voiceError = "";
    this.updateVoiceLevel(0);
    this.updateVoiceStatus();
  }

  updateVoiceLevel(level) {
    const stage = this.shadowRoot?.querySelector(".avatar-stage");
    if (!stage) return;
    const normalized = Math.max(0, Math.min(1, Number(level) || 0));
    stage.style.setProperty("--voice-level", String(normalized));
    stage.style.setProperty("--voice-level-px", `${Math.round(3 + normalized * 16)}px`);
  }

  updateVoiceStatus() {
    const button = this.shadowRoot?.querySelector('[data-action="voice"]');
    if (button) button.textContent = this.voiceButtonLabel();
    const avatar = deriveAvatarPresentation(this);
    const stage = this.shadowRoot?.querySelector(".avatar-stage");
    if (!stage) return;
    stage.dataset.avatarState = avatar.key;
    stage.setAttribute("aria-label", `墨衡虚拟人，当前状态：${avatar.label}`);
    const label = stage.querySelector("[data-avatar-label]");
    const detail = stage.querySelector("[data-avatar-detail]");
    if (label) label.textContent = avatar.label;
    if (detail) detail.textContent = avatar.detail;
    const notice = this.shadowRoot.querySelector("[data-voice-notice]");
    if (notice) {
      notice.hidden = !this.voiceError;
      notice.textContent = this.voiceError ? `语音暂不可用：${this.voiceError}。文字回答仍可继续。` : "";
    }
  }

  voiceButtonLabel() {
    if (!this.voiceReplies) return "语音回答：关";
    if (this.voiceError) return "语音暂不可用 · 文字仍可用";
    if (this.voiceState === "generating") return "语音生成中 · 可继续问";
    if (this.voiceState === "playing") return "正在播放 · 可继续问";
    return "语音回答：开";
  }

  focusLatest() {
    this.shadowRoot.querySelector("[data-latest]")?.focus();
  }

  focusComposer() {
    const field = this.shadowRoot.querySelector("textarea:not([disabled])");
    if (field) {
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    } else {
      this.focusLatest();
    }
  }

  render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = renderOracleView({
      stage: this.stage,
      cloud: this.cloud,
      knowledge: this.knowledge,
      messages: this.messages,
      reading: this.reading,
      question: this.question,
      busy: this.busy,
      recording: this.recording,
      transcribing: this.transcribing,
      recordingMode: this.recordingMode,
      recorderSupported: this.recorder.supported,
      liveTranscriberSupported: this.liveTranscriber.supported,
      draft: this.draft,
      voiceReplies: this.voiceReplies,
      voiceState: this.voiceState,
      voiceError: this.voiceError,
      voiceButtonLabel: this.voiceButtonLabel(),
    });
  }
}

if (!customElements.get("shoujian-oracle")) customElements.define("shoujian-oracle", ShoujianOracle);
