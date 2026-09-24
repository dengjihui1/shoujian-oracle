import { castWithCoins } from "./oracle-engine.js";
import { assessQuestion } from "./question-boundary.js";
import { boundaryReply, followUpReply, readingReply, welcomeReply } from "./dialogue-engine.js";
import { inferConversationPurpose } from "./response-policy.js";
import { OracleApiClient } from "./api-client.js";
import { AudioRecorder, BrowserSpeechRecognizer, blobToBase64 } from "./audio-recorder.js";
import { playPcmBase64, primeAudioPlayback } from "./audio-player.js";
import { BrowserSpeechPlayer } from "./browser-speech.js";
import { ConversationMemory, createConversationExport, parseConversationExport, recentConversation } from "./conversation-memory.js";
import { SentenceSegmenter } from "./speech-segmenter.js";
import { StreamingSpeechQueue } from "./speech-queue.js";
import { StreamingTextRevealer } from "./streaming-text.js";
import { renderOracleView } from "./oracle-view.js";
import { deriveAvatarPresentation } from "./avatar-state.js";
import { ConversationViewport } from "./conversation-scroll.js";
import { isComposerSendShortcut, preferredComposerSubmitter } from "./composer-keys.js";
import { answerIntakeQuestion, confirmIntakeSummary, createDivinationIntake, currentIntakeQuestion, prepareIntakeReview, skipIntakeQuestion } from "./divination-intake.js";
import { VoiceConversationController } from "./voice-conversation.js";
import { deriveAvatarMotion, mouthStateForLevel } from "./avatar-motion.js";
import { VoicePerformanceTracker } from "./voice-performance.js";

export class ShoujianOracle extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.api = new OracleApiClient();
    this.recorder = new AudioRecorder();
    this.liveTranscriber = new BrowserSpeechRecognizer();
    this.browserSpeech = new BrowserSpeechPlayer();
    this.memory = new ConversationMemory();
    this.cloud = false;
    this.knowledge = null;
    this.recording = false;
    this.recordingStarting = false;
    this.recordingEpoch = 0;
    this.transcribing = false;
    this.busy = false;
    this.voiceReplies = false;
    this.voiceMode = this.browserSpeech.supported ? "fast" : "cloud";
    this.voiceState = "idle";
    this.voiceError = "";
    this.voiceInputNotice = "";
    this.draft = "";
    this.intakeSummaryDraft = "";
    this.chatController = null;
    this.statusController = null;
    this.statusEpoch = 0;
    this.transcriptionController = null;
    this.speechQueue = null;
    this.retryRequest = null;
    this.conversationViewport = new ConversationViewport();
    this.conversationRevision = 0;
    this.renderedConversationRevision = -1;
    this.voiceConversationSnapshot = {
      active: false,
      state: "off",
      autoSubmit: false,
      transcript: "",
      error: "",
      metrics: {},
    };
    this.voicePerformance = new VoicePerformanceTracker();
    this.voiceConversation = new VoiceConversationController({
      recognizer: this.liveTranscriber,
      submit: (text) => this.sendVoiceConversationText(text),
      interruptOutput: () => this.cancelResponse(),
      onUpdate: (snapshot) => this.handleVoiceConversationUpdate(snapshot),
    });
    this.initializeSession();
    this.restoreMemory();
    this.render();
  }

  connectedCallback() {
    this.shadowRoot.addEventListener("click", this.handleClick);
    this.shadowRoot.addEventListener("submit", this.handleSubmit);
    this.shadowRoot.addEventListener("input", this.handleInput);
    this.shadowRoot.addEventListener("change", this.handleChange);
    this.shadowRoot.addEventListener("keydown", this.handleKeyDown);
    this.shadowRoot.addEventListener("scroll", this.handleScroll, true);
    this.checkCloud();
  }

  disconnectedCallback() {
    this.recordingEpoch += 1;
    this.statusEpoch += 1;
    this.statusController?.abort();
    this.statusController = null;
    this.shadowRoot.removeEventListener("click", this.handleClick);
    this.shadowRoot.removeEventListener("submit", this.handleSubmit);
    this.shadowRoot.removeEventListener("input", this.handleInput);
    this.shadowRoot.removeEventListener("change", this.handleChange);
    this.shadowRoot.removeEventListener("keydown", this.handleKeyDown);
    this.shadowRoot.removeEventListener("scroll", this.handleScroll, true);
    clearTimeout(this.recordingTimer);
    this.recorder.cancel()?.catch(() => {});
    this.recording = false;
    this.transcribing = false;
    this.liveTranscriber.abort();
    this.voiceConversation.stop();
    this.cancelResponse();
    this.transcriptionController?.abort();
    this.cancelSpeech();
  }

  initializeSession() {
    this.stage = "question";
    this.question = "";
    this.reading = null;
    this.intake = null;
    this.intakeSummaryDraft = "";
    this.messages = [{ role: "master", text: welcomeReply() }];
    this.conversationRevision += 1;
    this.conversationViewport.reset();
  }

  resetSession() {
    this.stopVoiceConversation();
    this.cancelSpeech();
    this.retryRequest = null;
    this.stage = "question";
    this.question = "";
    this.reading = null;
    this.intake = null;
    this.draft = "";
    this.intakeSummaryDraft = "";
    this.conversationViewport.reset();
    this.appendMessage({ role: "master", text: "上一卦收好。前面的聊天我还记得，可以继续聊，也可以重新留一件事起卦。" });
    this.persistMemory();
    this.render();
  }

  clearMemory() {
    this.stopVoiceConversation();
    this.cancelSpeech();
    this.retryRequest = null;
    this.memory.clear();
    this.initializeSession();
    this.draft = "";
    this.render();
    this.focusComposer();
  }

  exportMemory() {
    this.persistMemory();
    const document = createConversationExport({
      messages: this.messages,
      stage: this.stage,
      question: this.question,
      reading: this.reading,
      intake: this.intake,
    });
    const blob = new Blob([`${JSON.stringify(document, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = globalThis.document.createElement("a");
    anchor.href = url;
    anchor.download = `shoujian-session-${document.exportedAt.slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  exportVoiceMetrics() {
    const document = this.voicePerformance.createExport();
    const blob = new Blob([`${JSON.stringify(document, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = globalThis.document.createElement("a");
    anchor.href = url;
    anchor.download = `shoujian-voice-performance-${document.generatedAt.slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  applyRestoredSession(session) {
    this.messages = session.messages.length ? session.messages : [{ role: "master", text: welcomeReply() }];
    this.stage = session.stage;
    this.question = session.question;
    this.reading = session.reading;
    this.intake = session.intake;
    this.intakeSummaryDraft = session.intake?.status === "review" ? session.intake.summary : "";
    this.draft = "";
    this.retryRequest = null;
    this.conversationRevision += 1;
    this.conversationViewport.reset();
  }

  restoreMemory() {
    const session = this.memory.loadSession();
    if (session.messages.length) {
      this.messages = session.messages;
      this.conversationRevision += 1;
    }
    this.stage = session.stage;
    this.question = session.question;
    this.reading = session.reading;
    this.intake = session.intake;
    this.intakeSummaryDraft = session.intake?.status === "review" ? session.intake.summary : "";
  }

  persistMemory() {
    this.memory.saveSession({
      messages: this.messages,
      stage: this.stage,
      question: this.question,
      reading: this.reading,
      intake: this.intake,
    });
  }

  handleSubmit = async (event) => {
    event.preventDefault();
    const field = this.shadowRoot.querySelector("textarea");
    const text = String(field?.value ?? this.draft).trim();
    const mode = event.submitter?.dataset.submitMode ?? "divination";
    if (text) {
      if (this.voiceConversationSnapshot.active) this.stopVoiceConversation();
      this.draft = "";
      await this.sendText(text, mode);
    }
  };

  handleInput = (event) => {
    if (event.target.matches?.("textarea:not([data-intake-summary])")) this.draft = event.target.value;
    if (event.target.matches?.("[data-intake-summary]")) this.intakeSummaryDraft = event.target.value;
  };

  handleChange = async (event) => {
    if (!event.target.matches?.("[data-session-import]")) return;
    const [file] = event.target.files ?? [];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = parseConversationExport(await file.text());
      this.stopVoiceConversation();
      this.cancelResponse();
      this.cancelSpeech();
      this.memory.saveSession(imported);
      this.applyRestoredSession(imported);
      this.appendMessage({ role: "master", text: "本机会话已导入。你可以从当前进度继续；导入文件没有上传服务器。" });
      this.persistMemory();
      this.render();
      this.focusLatest();
    } catch (error) {
      this.appendMessage({ role: "master", text: `导入失败：${String(error?.message ?? "无法读取会话文件")}`, error: true });
      this.render();
    }
  };

  handleKeyDown = (event) => {
    if (!isComposerSendShortcut(event)) return;
    event.preventDefault();
    const form = event.target.closest("form");
    const submitter = preferredComposerSubmitter(form);
    if (submitter) form.requestSubmit(submitter);
  };

  handleScroll = (event) => {
    if (!event.target.matches?.(".dialogue")) return;
    this.conversationViewport.observeScroll(event.target);
    this.syncJumpToLatestButton();
  };

  handleClick = async (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "cast") await this.cast();
    if (action === "intake-skip") this.skipCurrentIntakeQuestion();
    if (action === "intake-review") this.reviewCurrentIntake();
    if (action === "intake-confirm") this.confirmCurrentIntake();
    if (action === "reset") this.resetSession();
    if (action === "clear-memory") this.clearMemory();
    if (action === "export-memory") this.exportMemory();
    if (action === "import-memory") this.shadowRoot.querySelector("[data-session-import]")?.click();
    if (action === "jump-latest") {
      this.conversationViewport.jumpToLatest(this.shadowRoot.querySelector(".dialogue"));
      this.syncJumpToLatestButton();
    }
    if (action === "cancel-response") this.cancelResponse();
    if (action === "retry-response" && this.retryRequest && !this.busy) {
      const retry = this.retryRequest;
      this.retryRequest = null;
      await this.askCloud(retry.message, retry.history, retry.purpose);
    }
    if (action === "record") await this.startRecording();
    if (action === "cancel-record") this.cancelRecording();
    if (action === "stop-record") await this.stopRecording();
    if (action === "cancel-transcription") {
      this.transcriptionController?.abort();
      this.liveTranscriber.abort();
    }
    if (action === "voice-conversation") {
      if (this.voiceConversationSnapshot.active) this.stopVoiceConversation();
      else this.startVoiceConversation();
    }
    if (action === "voice-conversation-retry") this.voiceConversation.interruptAndListen();
    if (action === "voice-interrupt") this.voiceConversation.interruptAndListen();
    if (action === "export-voice-metrics") this.exportVoiceMetrics();
    if (action === "clear-voice-metrics") {
      this.voicePerformance.clear();
      this.render();
    }
    if (action === "voice") {
      this.voiceReplies = !this.voiceReplies;
      if (this.voiceReplies) primeAudioPlayback();
      if (!this.voiceReplies) this.cancelSpeech();
      this.render();
    }
    if (action === "voice-mode" && this.voiceReplies && this.browserSpeech.supported) {
      this.cancelSpeech();
      this.voiceMode = this.voiceMode === "fast" ? "cloud" : "fast";
      if (this.voiceMode === "cloud") primeAudioPlayback();
      this.render();
    }
    const quick = event.target.closest("[data-quick]")?.dataset.quick;
    if (quick) await this.sendText(quick);
  };

  async sendText(text, mode = "divination") {
    if (this.busy || this.recording || this.recordingStarting || this.transcribing) return;
    this.cancelSpeech();
    this.retryRequest = null;
    this.appendMessage({ role: "user", text });
    this.persistMemory();
    const history = this.messages.slice(0, -1);
    if (this.stage === "question") {
      if (mode === "chat" && this.cloud) {
        await this.askCloud(text, history);
      } else {
        this.beginDivinationIntake(text);
      }
    } else if (this.stage === "intake") {
      this.answerCurrentIntakeQuestion(text);
    } else if (this.stage === "ready") {
      this.appendMessage({ role: "master", text: "原问已经收下。请先起卦；若要换题，点“另起一问”。" });
    } else {
      const localReply = followUpReply(text, this.reading);
      if (localReply.action === "restart") {
        this.appendMessage({ role: "master", text: localReply.text });
        this.stage = "question";
        this.question = "";
        this.reading = null;
        this.intake = null;
      } else if (this.cloud) {
        await this.askCloud(text, history, inferConversationPurpose(text, this.stage));
      } else {
        this.appendMessage({ role: "master", text: localReply.text });
      }
    }
    this.persistMemory();
    this.render();
    this.focusComposer();
  }

  beginDivinationIntake(text) {
    const assessment = assessQuestion(text);
    if (assessment.level === "blocked") {
      this.appendMessage({ role: "master", text: boundaryReply(assessment) });
      return;
    }
    this.question = text;
    this.intake = createDivinationIntake(text);
    this.stage = "intake";
    const prompt = currentIntakeQuestion(this.intake);
    this.appendMessage({
      role: "master",
      text: `${boundaryReply(assessment)}\n\n先不急着掷钱。我只补问几项会真正影响解读的现实信息，不需要生辰八字。第 1 项：${prompt.prompt}`,
    });
  }

  answerCurrentIntakeQuestion(text) {
    if (this.intake?.status !== "collecting") return;
    this.intake = answerIntakeQuestion(this.intake, text);
    this.continueIntakeReply();
  }

  skipCurrentIntakeQuestion() {
    if (this.stage !== "intake" || this.intake?.status !== "collecting") return;
    this.intake = skipIntakeQuestion(this.intake);
    this.continueIntakeReply("这一项先略过。 ");
    this.persistMemory();
    this.render();
    this.focusComposer();
  }

  reviewCurrentIntake() {
    if (this.stage !== "intake" || !this.intake) return;
    this.intake = prepareIntakeReview(this.intake);
    this.intakeSummaryDraft = this.intake.summary;
    this.appendMessage({ role: "master", text: "现有信息已经整理成问卦摘要。你可以直接修改；确认前不会起卦。" });
    this.persistMemory();
    this.render();
  }

  confirmCurrentIntake() {
    if (this.stage !== "intake" || this.intake?.status !== "review") return;
    const field = this.shadowRoot.querySelector("[data-intake-summary]");
    const summary = String(field?.value ?? this.intakeSummaryDraft).trim();
    if (!summary) return;
    this.intake = confirmIntakeSummary(this.intake, summary);
    this.question = this.intake.summary;
    this.intakeSummaryDraft = "";
    this.stage = "ready";
    this.appendMessage({ role: "master", text: `问卦摘要已确认并冻结：\n${this.question}\n\n接下来才会随机掷三钱六次。文字只用于解读上下文，不会影响卦象。` });
    this.persistMemory();
    this.render();
    this.focusLatest();
  }

  continueIntakeReply(prefix = "") {
    if (this.intake.status === "review") {
      this.intakeSummaryDraft = this.intake.summary;
      this.appendMessage({ role: "master", text: `${prefix}必要信息已经问完。请检查下方问卦摘要；确认前不会起卦。` });
      return;
    }
    const prompt = currentIntakeQuestion(this.intake);
    this.appendMessage({ role: "master", text: `${prefix}第 ${this.intake.cursor + 1} 项：${prompt.prompt}` });
  }

  async cast() {
    if (this.stage !== "ready" || this.busy || this.recording || this.transcribing) return;
    this.reading = castWithCoins();
    this.stage = "reading";
    this.appendMessage({ role: "master", text: readingReply(this.reading) });
    this.persistMemory();
    this.render();
    this.focusLatest();
    if (this.cloud) await this.askCloud("请只依据程序给出的本卦、动爻和之卦，解释它怎样帮助我重新看原问，并给一个可撤回的小行动。", this.messages.slice(0, -1), "divination");
  }

  async checkCloud() {
    this.statusController?.abort();
    const controller = new AbortController();
    const epoch = ++this.statusEpoch;
    this.statusController = controller;
    try {
      const status = await this.api.status({ signal: controller.signal });
      if (controller.signal.aborted || epoch !== this.statusEpoch || !this.isConnected) return;
      this.cloud = Boolean(status.cloud);
      this.knowledge = status.knowledge ?? null;
    } catch (error) {
      if (controller.signal.aborted || epoch !== this.statusEpoch || !this.isConnected) return;
      this.cloud = false;
      this.knowledge = null;
      console.warn("Cloud capability check failed:", error);
    } finally {
      if (this.statusController === controller) this.statusController = null;
    }
    this.render();
  }

  async askCloud(message, history, purpose = "chat") {
    this.busy = true;
    const controller = new AbortController();
    this.chatController = controller;
    const reply = { role: "master", text: "墨衡正在斟酌…", cloud: true, evidence: [], streaming: true };
    this.appendMessage(reply);
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
    let speechQueue = this.voiceReplies ? this.createSpeechQueue() : null;
    let speechSegmenter = speechQueue ? this.createSpeechSegmenter() : null;
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
            if (!receivedText) this.voiceConversation.markFirstToken();
            receivedText = true;
            revealer.enqueue(delta);
            for (const sentence of speechSegmenter?.push(delta) ?? []) speechQueue.enqueue(sentence);
          }
        },
        onReplace: (text) => {
          if (controller.signal.aborted) return;
          receivedText = true;
          revealer.replace(text);
          if (speechQueue) {
            speechQueue.cancel();
            speechQueue = this.createSpeechQueue();
            speechSegmenter = this.createSpeechSegmenter();
            for (const sentence of speechSegmenter.push(text)) speechQueue.enqueue(sentence);
          }
        },
      });
      await revealer.finish();
      if (controller.signal.aborted) throw Object.assign(new Error("已停止"), { name: "AbortError" });
      reply.text = result.text || reply.text;
      reply.evidence = result.evidence ?? reply.evidence;
      reply.streaming = false;
      this.retryRequest = null;
      for (const sentence of speechSegmenter?.flush() ?? []) speechQueue.enqueue(sentence);
      speechQueue?.close();
    } catch (error) {
      revealer.cancel();
      speechQueue?.cancel();
      if (error?.name === "AbortError") {
        reply.text = receivedText && reply.text ? `${reply.text}\n\n（已停止）` : "已停止本次回答。";
        reply.cancelled = true;
        this.retryRequest = null;
      } else {
        const reason = String(error.message ?? "未知错误").replace(/[。！？!?]+$/u, "");
        reply.text = `本次回答没有完成：${reason}。没有生成替代结论，请稍后重试。`;
        reply.error = true;
        this.retryRequest = { message, history, purpose };
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
    this.conversationViewport.contentChanged(dialogue);
    this.syncJumpToLatestButton();
  }

  async startRecording() {
    if (!this.cloud || this.stage === "ready" || this.recording || this.recordingStarting || this.busy || this.transcribing) return;
    this.recordingStarting = true;
    if (this.liveTranscriber.supported) this.voiceInputNotice = "";
    const epoch = this.recordingEpoch;
    if (this.voiceConversationSnapshot.active) this.stopVoiceConversation();
    this.render();
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
        if (epoch !== this.recordingEpoch) {
          this.recorder.cancel()?.catch(() => {});
          return;
        }
      }
      this.recording = true;
      this.recordingTimer = setTimeout(() => this.stopRecording(), 45_000);
      this.render();
    } catch (error) {
      if (error?.name !== "AbortError") {
        this.appendMessage({ role: "master", text: error.message });
        this.persistMemory();
      }
    } finally {
      this.recordingStarting = false;
      this.render();
    }
  }

  cancelRecording() {
    this.recordingEpoch += 1;
    clearTimeout(this.recordingTimer);
    this.recorder.cancel()?.catch(() => {});
    this.liveTranscriber.abort();
    this.recording = false;
    this.recordingStarting = false;
    this.render();
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
        this.handleRecognitionFailure(error);
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
      this.handleRecognitionFailure(result.error);
    } else if (result.text) {
      this.draft = result.text;
    }
    this.render();
    this.focusComposer();
  }

  handleRecognitionFailure(error) {
    if (error?.code === "network_unavailable") {
      this.voiceInputNotice = this.recordingFallbackNotice();
      return;
    }
    this.appendMessage({ role: "master", text: `没能听清：${error?.message ?? "语音识别失败"}` });
    this.persistMemory();
  }

  recordingFallbackNotice() {
    return this.recorder.supported
      ? "浏览器实时转写网络不可用，本次页面已切换为录音转文字。请点击“按下说话”，说完后点击“停止并转文字”；刷新页面可重试实时模式。"
      : "浏览器实时转写网络不可用，当前浏览器也不支持录音转文字；请使用文字输入。";
  }

  async speak(text) {
    const queue = this.createSpeechQueue();
    const segmenter = this.createSpeechSegmenter();
    for (const sentence of [...segmenter.push(text), ...segmenter.flush()]) queue.enqueue(sentence);
    await queue.close();
  }

  createSpeechQueue() {
    this.cancelSpeech();
    const useFastBrowserSpeech = this.voiceMode === "fast" && this.browserSpeech.supported;
    let queue;
    queue = new StreamingSpeechQueue({
      synthesize: useFastBrowserSpeech
        ? async (text) => this.browserSpeech.prepare(text)
        : (text, { signal }) => this.api.speech(text, { signal }),
      play: useFastBrowserSpeech
        ? (payload, { onLevel, onStart }) => this.browserSpeech.play(payload, { onLevel, onStart })
        : (audio, { onLevel, onStart }) => playPcmBase64(audio.data, { sampleRate: audio.sampleRate, onLevel, onStart }),
      onState: (state) => {
        if (this.speechQueue !== queue) return;
        this.voiceState = state;
        if (state === "idle") this.speechQueue = null;
        this.voiceConversation.markSpeechState(state);
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

  createSpeechSegmenter() {
    return this.voiceMode === "fast"
      ? new SentenceSegmenter({ maxChars: 40, minSplitChars: 20 })
      : new SentenceSegmenter();
  }

  cancelSpeech() {
    const queue = this.speechQueue;
    this.speechQueue = null;
    queue?.cancel();
    this.voiceState = "idle";
    this.voiceConversation?.markSpeechState("idle");
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
    stage.dataset.mouthState = mouthStateForLevel(stage.dataset.avatarState, normalized);
  }

  updateVoiceStatus() {
    const button = this.shadowRoot?.querySelector('[data-action="voice"]');
    if (button) button.textContent = this.voiceButtonLabel();
    const avatar = deriveAvatarPresentation(this);
    const stage = this.shadowRoot?.querySelector(".avatar-stage");
    if (!stage) return;
    stage.dataset.avatarState = avatar.key;
    stage.dataset.avatarMotion = deriveAvatarMotion(avatar.key).key;
    if (avatar.key !== "speaking") stage.dataset.mouthState = "closed";
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

  startVoiceConversation() {
    if (!this.cloud || !this.liveTranscriber.supported || this.busy || this.recording || this.recordingStarting || this.transcribing || this.stage === "ready" || this.intake?.status === "review") return;
    this.voiceReplies = true;
    this.voiceError = "";
    primeAudioPlayback();
    try {
      this.voiceConversation.start({ autoSubmit: true });
    } catch (error) {
      this.voiceError = String(error?.message ?? "连续语音对话暂不可用");
      this.render();
    }
  }

  stopVoiceConversation() {
    if (!this.voiceConversationSnapshot.active) return;
    this.voiceConversation.stop();
    this.voiceReplies = false;
    this.cancelSpeech();
    this.render();
  }

  async sendVoiceConversationText(text) {
    this.draft = "";
    const mode = this.stage === "question" ? "chat" : "divination";
    await this.sendText(text, mode);
  }

  handleVoiceConversationUpdate(snapshot) {
    const previous = this.voiceConversationSnapshot;
    this.voiceConversationSnapshot = snapshot;
    if (snapshot.state === "error" && this.liveTranscriber.networkUnavailable) {
      this.voiceInputNotice = this.recordingFallbackNotice();
      this.stopVoiceConversation();
      return;
    }
    if (snapshot.metrics?.turnComplete) this.voicePerformance.record(snapshot.metrics);
    if (snapshot.state === "listening") this.draft = snapshot.transcript;
    const metricsChanged = ["asrFinalMs", "firstTokenMs", "firstAudioMs"]
      .some((key) => previous.metrics?.[key] !== snapshot.metrics?.[key]);
    if (previous.active !== snapshot.active || previous.state !== snapshot.state || previous.error !== snapshot.error || metricsChanged) {
      this.render();
      return;
    }
    const field = this.shadowRoot.querySelector("textarea:not([data-intake-summary])");
    if (field && snapshot.state === "listening") field.value = snapshot.transcript;
    const transcript = this.shadowRoot.querySelector("[data-voice-transcript]");
    if (transcript) {
      transcript.hidden = !snapshot.transcript;
      transcript.textContent = snapshot.transcript ? `“${snapshot.transcript}”` : "";
    }
  }

  voiceButtonLabel() {
    if (!this.voiceReplies) return "语音回答：关";
    if (this.voiceError) return "语音暂不可用 · 文字仍可用";
    if (this.voiceState === "generating") return "语音生成中 · 可继续问";
    if (this.voiceState === "playing") return "正在播放 · 可继续问";
    return this.voiceMode === "fast" ? "语音回答：极速" : "语音回答：云端";
  }

  voiceModeButtonLabel() {
    return this.voiceMode === "fast" ? "切换到云端音色" : "切换到极速浏览器";
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

  appendMessage(message) {
    this.messages.push(message);
    this.conversationRevision += 1;
    return message;
  }

  syncJumpToLatestButton() {
    const button = this.shadowRoot?.querySelector('[data-action="jump-latest"]');
    if (button) button.hidden = !this.conversationViewport.unread;
  }

  render() {
    if (!this.shadowRoot) return;
    const previousDialogue = this.shadowRoot.querySelector(".dialogue");
    const viewportSnapshot = this.conversationViewport.capture(previousDialogue);
    const contentChanged = this.conversationRevision !== this.renderedConversationRevision;
    this.shadowRoot.innerHTML = renderOracleView({
      stage: this.stage,
      cloud: this.cloud,
      knowledge: this.knowledge,
      messages: this.messages,
      reading: this.reading,
      question: this.question,
      intake: this.intake,
      intakeSummaryDraft: this.intakeSummaryDraft,
      busy: this.busy,
      recording: this.recording,
      recordingStarting: this.recordingStarting,
      recorderPermissionPending: this.recorder.starting,
      transcribing: this.transcribing,
      recordingMode: this.recordingMode,
      recorderSupported: this.recorder.supported,
      liveTranscriberSupported: this.liveTranscriber.supported,
      draft: this.draft,
      voiceReplies: this.voiceReplies,
      voiceMode: this.voiceMode,
      fastVoiceSupported: this.browserSpeech.supported,
      voiceState: this.voiceState,
      voiceError: this.voiceError,
      voiceInputNotice: this.voiceInputNotice,
      canRetryResponse: Boolean(this.retryRequest),
      showJumpToLatest: this.conversationViewport.unread,
      voiceButtonLabel: this.voiceButtonLabel(),
      voiceModeButtonLabel: this.voiceModeButtonLabel(),
      voiceConversationActive: this.voiceConversationSnapshot.active,
      voiceConversationState: this.voiceConversationSnapshot.state,
      voiceConversationTranscript: this.voiceConversationSnapshot.transcript,
      voiceConversationError: this.voiceConversationSnapshot.error,
      voiceConversationMetrics: this.voiceConversationSnapshot.metrics,
      voicePerformanceSummary: this.voicePerformance.summary,
    });
    this.renderedConversationRevision = this.conversationRevision;
    this.conversationViewport.restore(this.shadowRoot.querySelector(".dialogue"), viewportSnapshot, { contentChanged });
    this.syncJumpToLatestButton();
  }
}

if (!customElements.get("shoujian-oracle")) customElements.define("shoujian-oracle", ShoujianOracle);
