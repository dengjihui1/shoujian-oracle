import { castWithCoins } from "./oracle-engine.js";
import { assessQuestion } from "./question-boundary.js";
import { boundaryReply, followUpReply, readingReply, welcomeReply } from "./dialogue-engine.js";
import { OracleApiClient } from "./api-client.js";
import { AudioRecorder, BrowserSpeechRecognizer, blobToBase64 } from "./audio-recorder.js";
import { playPcmBase64 } from "./audio-player.js";
import { ConversationMemory, recentConversation } from "./conversation-memory.js";
import { StreamingTextRevealer } from "./streaming-text.js";
import { renderOracleView } from "./oracle-view.js";

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
    this.draft = "";
    this.chatController = null;
    this.transcriptionController = null;
    this.speechController = null;
    this.audioPlayback = null;
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
        await this.askCloud(text, history);
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
    if (this.cloud) await this.askCloud("请只依据程序给出的本卦、动爻和之卦，解释它怎样帮助我重新看原问，并给一个可撤回的小行动。", this.messages.slice(0, -1));
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

  async askCloud(message, history, purpose = this.stage === "reading" ? "divination" : "chat") {
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
    let speechText = "";
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
          }
        },
      });
      await revealer.finish();
      if (controller.signal.aborted) throw Object.assign(new Error("已停止"), { name: "AbortError" });
      reply.text = result.text || reply.text;
      reply.evidence = result.evidence ?? reply.evidence;
      reply.streaming = false;
      speechText = result.text;
    } catch (error) {
      revealer.cancel();
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
    if (speechText && this.voiceReplies) void this.speak(speechText);
  }

  cancelResponse() {
    this.activeRevealer?.cancel();
    this.chatController?.abort();
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
    this.cancelSpeech();
    const controller = new AbortController();
    this.speechController = controller;
    this.voiceState = "generating";
    this.updateVoiceStatus();
    try {
      const audio = await this.api.speech(text, { signal: controller.signal });
      if (controller.signal.aborted || this.speechController !== controller || !this.voiceReplies) return;
      this.voiceState = "playing";
      this.updateVoiceStatus();
      const playback = await playPcmBase64(audio.data, { sampleRate: audio.sampleRate });
      this.audioPlayback = playback;
      await playback.ended;
    } catch (error) {
      if (error?.name !== "AbortError") console.warn("Voice reply failed:", error);
    } finally {
      if (this.speechController === controller) {
        this.speechController = null;
        this.audioPlayback = null;
        this.voiceState = "idle";
        this.updateVoiceStatus();
      }
    }
  }

  cancelSpeech() {
    this.speechController?.abort();
    this.speechController = null;
    this.audioPlayback?.stop();
    this.audioPlayback = null;
    this.voiceState = "idle";
    this.updateVoiceStatus();
  }

  updateVoiceStatus() {
    const button = this.shadowRoot?.querySelector('[data-action="voice"]');
    if (button) button.textContent = this.voiceButtonLabel();
  }

  voiceButtonLabel() {
    if (!this.voiceReplies) return "语音回答：关";
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
      voiceButtonLabel: this.voiceButtonLabel(),
    });
  }
}

if (!customElements.get("shoujian-oracle")) customElements.define("shoujian-oracle", ShoujianOracle);
