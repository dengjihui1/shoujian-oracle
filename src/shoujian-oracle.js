import { LINE_DEFINITIONS, castWithCoins } from "./oracle-engine.js";
import { assessQuestion } from "./question-boundary.js";
import { boundaryReply, followUpReply, readingReply, welcomeReply } from "./dialogue-engine.js";
import { OracleApiClient } from "./api-client.js";
import { AudioRecorder, BrowserSpeechRecognizer, blobToBase64 } from "./audio-recorder.js";
import { playPcmBase64 } from "./audio-player.js";
import { ConversationMemory, PERSISTED_MEMORY_MESSAGES, recentConversation } from "./conversation-memory.js";
import { StreamingTextRevealer } from "./streaming-text.js";

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
    const messages = this.memory.load();
    if (messages.length) this.messages = messages;
  }

  persistMemory() {
    this.memory.save(this.messages);
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
    if (this.busy) return;
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
    if (this.stage !== "ready") return;
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
    const reply = { role: "master", text: "", cloud: true, evidence: [], streaming: true };
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
          if (!controller.signal.aborted) revealer.enqueue(delta);
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
        reply.text = reply.text ? `${reply.text}\n\n（已停止）` : "已停止本次回答。";
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
    if (!this.cloud || this.recording || this.busy) return;
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
    const phase = this.stage === "question" ? "候问" : this.stage === "ready" ? "问已收" : "照卦答";
    const posture = this.stage === "question" ? "候" : this.stage === "ready" ? "契" : "解";
    const cloudLabel = this.cloud ? "Gemini + 周易 RAG 已连接" : "本地有限对话";
    const knowledgeLabel = this.knowledge
      ? `${this.knowledge.hexagrams} 卦 · ${this.knowledge.trigrams} 八卦 · ${this.knowledge.fragments} 条冻结片段`
      : "知识库状态未知";
    this.shadowRoot.innerHTML = `${styles}
      <main class="shell">
        <header class="master-card stage-${this.stage}">
          <div class="portrait" role="img" aria-label="中式老卦师墨衡，当前仪态：${phase}">
            <span class="hat"></span><span class="face">墨</span><span class="beard"></span><span class="seal">${posture}</span>
          </div>
           <div><p class="eyebrow">墨衡小卦 · ${phase}</p><h1>能闲聊，也能有据解卦</h1><p>普通问题直接聊；想占卜时再明确起卦，经传解释会显示检索来源。</p><span class="status ${this.cloud ? "online" : ""}">${cloudLabel}</span><small class="knowledge-status">${knowledgeLabel}</small></div>
        </header>

        <section class="dialogue" aria-label="与墨衡的当前对话" aria-live="polite">
          ${this.messages.map((message, index) => `<article class="message ${message.role} ${message.error ? "error" : ""} ${message.streaming ? "streaming" : ""}" data-message-index="${index}" ${index === this.messages.length - 1 ? 'tabindex="-1" data-latest' : ""}>
            <b>${message.role === "master" ? `墨衡${message.evidence?.length ? " · RAG" : message.cloud ? " · 云端" : ""}` : "你"}</b><p>${escapeHtml(message.text)}</p>${evidenceDetails(message.evidence)}
          </article>`).join("")}
        </section>

        ${this.reading ? readingCard(this.reading, this.question) : ""}

        <section class="controls">
          ${this.stage === "ready" ? `<button class="primary" type="button" data-action="cast">掷三钱六次，依数排卦</button>` : ""}
          ${this.stage === "reading" && !this.cloud ? `<div class="quick" aria-label="本地可追问内容">
            <button type="button" data-quick="这个卦是什么意思">什么意思</button>
            <button type="button" data-quick="动爻怎么看">动爻怎么看</button>
            <button type="button" data-quick="你是怎么算的">怎么算的</button>
            <button type="button" data-quick="边界是什么">边界是什么</button>
          </div>` : ""}
          ${this.stage === "reading" && this.cloud ? `<p class="rag-invitation">现在可自由追问：原文、动爻、上下卦关系、不同理解，或它如何映照你的原问。墨衡会显示本轮检索到的经传依据。</p>` : ""}
          <form>
            <label for="say">${this.stage === "question" ? this.cloud ? "想问墨衡什么" : "留下一件具体的事" : this.stage === "ready" ? "原问已固定" : "继续问墨衡"}</label>
            <div class="input-row">
              <textarea id="say" maxlength="500" ${this.stage === "ready" || this.busy ? "disabled" : ""} placeholder="${this.stage === "reading" ? "直接问你真正想知道的，不必套固定问法" : this.cloud ? "可闲聊、问基础问题，也可写下一件事起卦" : "例如：未来三天，我该先验证哪一步？"}">${escapeHtml(this.draft)}</textarea>
              <div class="submit-actions">
                ${this.stage === "question" && this.cloud ? `<button type="submit" data-submit-mode="chat" ${this.busy ? "disabled" : ""}>直接问墨衡</button><button class="primary" type="submit" data-submit-mode="divination" ${this.busy ? "disabled" : ""}>以此问起卦</button>` : `<button type="submit" ${this.stage === "ready" || this.busy ? "disabled" : ""}>${this.busy ? "请稍候" : "送问"}</button>`}
              </div>
            </div>
          </form>
          <div class="voice-tools" aria-label="语音工具">
            ${this.cloud && (this.liveTranscriber.supported || this.recorder.supported) ? this.transcribing
              ? `<button type="button" data-action="cancel-transcription">取消转写</button>`
              : `<button type="button" data-action="${this.recording ? "stop-record" : "record"}" ${this.busy && !this.recording ? "disabled" : ""}>${this.recording ? this.recordingMode === "live" ? "停止并采用文字" : "停止并转文字" : this.liveTranscriber.supported ? "实时语音输入" : "按下说话"}</button>` : ""}
            ${this.busy && !this.transcribing ? `<button type="button" data-action="cancel-response">停止回答</button>` : ""}
            ${this.cloud ? `<button type="button" data-action="voice" aria-pressed="${this.voiceReplies}">${this.voiceButtonLabel()}</button>` : ""}
          </div>
          ${this.cloud ? `<div class="memory-tools"><small>本机记忆最近 ${PERSISTED_MEMORY_MESSAGES} 条对话，刷新后仍可继续。</small><button type="button" data-action="clear-memory" ${this.busy || this.recording ? "disabled" : ""}>清除本机记忆</button></div>` : ""}
          ${this.stage !== "question" ? `<button class="text-button" type="button" data-action="reset" ${this.busy || this.recording ? "disabled" : ""}>另起一问</button>` : !this.cloud ? `<div class="quick"><button type="button" data-quick="我不会问，请给一个例子">我不会问</button><button type="button" data-quick="边界是什么">哪些不能问</button></div>` : ""}
        </section>

        <footer>${this.cloud ? `自由对话会把你提交的文字、最近上下文和必要检索片段发送给 Google Gemini；${this.liveTranscriber.supported ? "实时语音输入由浏览器语音服务处理" : "录音会发送给 Gemini 转写"}。最近对话只保存在此浏览器本机，可随时清除，服务端不建用户档案。` : "本地模式不上传问题，但只能回答固定意图。配置 Gemini 后可启用普通闲聊、有来源的经传问答、语音转文字和语音回答。"} 演示结果不替代医疗、法律、投资或现实安全判断。</footer>
      </main>`;
  }
}

function readingCard(reading, question) {
  const lines = [...reading.lines].reverse().map((value, visualIndex) => {
    const position = 6 - visualIndex;
    const definition = LINE_DEFINITIONS[value];
    return `<li class="line ${definition.moving ? "moving" : ""}"><span>${definition.polarity === "阳" ? "━━━━━━" : "━━  ━━"}</span><small>第${position}爻 · ${definition.label}${definition.moving ? "，动" : ""}</small></li>`;
  }).join("");
  return `<section class="reading" aria-label="本次卦象">
    <p class="question">原问：“${escapeHtml(question)}”</p>
    <div class="reading-title"><span>${reading.primary.symbol}</span><div><small>第 ${reading.primary.number} 卦</small><h2>${reading.primary.fullName}</h2></div></div>
    <ol aria-label="六爻，自上而下显示">${lines}</ol>
    <dl><div><dt>下卦</dt><dd>${reading.primary.lower.symbol}${reading.primary.lower.name} · ${reading.primary.lower.image}</dd></div><div><dt>上卦</dt><dd>${reading.primary.upper.symbol}${reading.primary.upper.name} · ${reading.primary.upper.image}</dd></div><div><dt>之卦</dt><dd>${reading.changed?.fullName ?? "无"}</dd></div></dl>
  </section>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function evidenceDetails(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) return "";
  return `<details class="rag-evidence"><summary>本答检索依据 · ${evidence.length} 条</summary><ol>${evidence.map((item) => `<li><a href="${escapeAttribute(item.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a><small>${escapeHtml(item.id)} · ${escapeHtml(item.layer)}</small><blockquote>${escapeHtml(item.excerpt)}</blockquote></li>`).join("")}</ol></details>`;
}

function escapeAttribute(value) {
  const url = String(value ?? "");
  return /^https:\/\//u.test(url) ? escapeHtml(url) : "#";
}

const styles = `<style>
  :host { color-scheme: dark; display: block; font-family: "Noto Serif SC", "Songti SC", serif; }
  * { box-sizing: border-box; } button, textarea { font: inherit; }
  .shell { width: min(100%, 680px); margin: auto; padding: 26px; color: #efe5cd; background: radial-gradient(circle at 95% 0, #493525 0, #1b1816 42%, #11100f 100%); border: 1px solid #766044; border-radius: 24px; box-shadow: 0 24px 70px #0008; }
  .master-card { display: grid; grid-template-columns: 112px 1fr; gap: 20px; align-items: center; padding-bottom: 22px; border-bottom: 1px solid #71573a80; }
  .portrait { position: relative; width: 104px; height: 118px; display: grid; place-items: center; }
  .face { z-index: 2; display: grid; place-items: center; width: 72%; aspect-ratio: 1; border-radius: 48%; color: #6b271d; background: #cfb083; border: 2px solid #8e6c49; font-weight: 800; font-size: 24px; }
  .hat { position: absolute; z-index: 3; top: 8%; width: 84%; height: 24%; background: #191919; border-radius: 50% 50% 12% 12%; border-bottom: 3px solid #9f3430; }
  .hat::after { content: ""; position: absolute; left: 12%; right: 12%; bottom: -7px; height: 7px; border-radius: 50%; background: #090909; }
  .beard { position: absolute; z-index: 1; bottom: 6%; width: 48%; height: 42%; background: linear-gradient(90deg, #aaa, #fff, #aaa); clip-path: polygon(16% 0,84% 0,100% 18%,60% 100%,42% 100%,0 18%); }
  .seal { position: absolute; z-index: 4; right: 0; bottom: 4px; display: grid; place-items: center; width: 30px; height: 30px; color: #f4d4a2; background: #812d27; border: 1px solid #da8674; border-radius: 4px; }
  .eyebrow { margin: 0 0 5px; color: #bd9362; font: 600 12px/1.4 system-ui,sans-serif; letter-spacing: .16em; }
  .status { display: inline-block; margin-top: 10px; padding: 4px 9px; color: #aaa092; background: #ffffff0b; border: 1px solid #5f5548; border-radius: 999px; font: 11px/1.4 system-ui,sans-serif; } .status.online { color: #d8c895; border-color: #7f724d; background: #77702b22; }
  .knowledge-status { display: block; margin-top: 7px; color: #938674; font: 11px/1.5 system-ui,sans-serif; }
  h1 { margin: 0 0 8px; font-size: clamp(24px, 5vw, 36px); } .master-card p { margin: 0; line-height: 1.65; color: #bdb09c; }
  .dialogue { display: grid; gap: 10px; max-height: 320px; overflow: auto; padding: 18px 2px; }
  .message { max-width: 88%; padding: 11px 14px; border-radius: 14px; background: #ffffff09; border: 1px solid #68533c; }
  .message.user { justify-self: end; background: #6d2d2729; border-color: #8e4a40; } .message b { color: #c9a46e; font-size: 13px; } .message p { margin: 5px 0 0; line-height: 1.7; white-space: pre-line; }
  .message.error { border-color: #a85248; background: #7a2c2422; }
  .message.streaming p::after { content: "▍"; margin-left: 2px; color: #d2a15b; animation: cursor-blink .8s steps(1) infinite; }
  .rag-evidence { margin-top: 10px; border-top: 1px solid #66513b; padding-top: 8px; font: 12px/1.55 system-ui,sans-serif; }
  .rag-evidence summary { color: #d0ac76; cursor: pointer; }
  .rag-evidence ol { display: grid; gap: 10px; margin: 10px 0 0; padding-left: 20px; }
  .rag-evidence a { color: #e0be86; } .rag-evidence small { display: block; color: #918574; }
  .rag-evidence blockquote { margin: 5px 0 0; padding-left: 9px; color: #c8beae; border-left: 2px solid #71573a; white-space: pre-line; }
  .reading { padding: 18px; background: #09080772; border: 1px solid #604932; border-radius: 16px; } .question { margin: 0 0 14px; color: #bca889; }
  .reading-title { display: flex; gap: 14px; align-items: center; } .reading-title > span { font-size: 46px; color: #d2b782; } h2 { margin: 2px 0 0; font-size: 25px; }
  .reading ol { display: grid; gap: 5px; padding: 15px; list-style: none; background: #05050566; border-radius: 12px; }
  .line { display: grid; grid-template-columns: 1fr auto; gap: 12px; } .line span { color: #d2b782; font: 800 21px/1 monospace; } .line small { color: #918574; font: 12px/1.4 system-ui,sans-serif; } .line.moving span,.line.moving small { color: #e5705e; }
  dl { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin: 0; } dl div { padding: 9px; text-align: center; background: #ffffff08; border-radius: 9px; } dt { color: #9d8f7b; font: 12px system-ui,sans-serif; } dd { margin: 4px 0 0; }
  .controls { display: grid; gap: 12px; padding-top: 18px; } label { display: block; margin-bottom: 7px; color: #d9bd91; font-weight: 700; } .input-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
  textarea { min-height: 70px; resize: vertical; padding: 11px 13px; color: #f3ead8; background: #090807aa; border: 1px solid #6c5942; border-radius: 12px; } button { min-height: 44px; padding: 9px 16px; color: #f8ead0; background: #593a29; border: 1px solid #826244; border-radius: 999px; cursor: pointer; } button:disabled { opacity: .48; cursor: not-allowed; } .primary { width: 100%; background: #8e332a; border-color: #bb6b5d; font-weight: 700; } .text-button { justify-self: center; background: transparent; border: 0; color: #c5aa7e; text-decoration: underline; }
  .submit-actions { display: grid; gap: 8px; align-content: start; } .submit-actions .primary { width: auto; }
  .quick { display: flex; flex-wrap: wrap; gap: 7px; } .quick button { min-height: 38px; padding: 7px 12px; font-size: 13px; }
  .rag-invitation { margin: 0; padding: 10px 12px; color: #d5c2a2; background: #88713b18; border: 1px solid #74623e; border-radius: 12px; font: 13px/1.65 system-ui,sans-serif; }
  .voice-tools { display: flex; flex-wrap: wrap; gap: 8px; } .voice-tools button { background: #25201b; }
  .memory-tools { display: flex; gap: 10px; align-items: center; justify-content: space-between; color: #938674; font: 11px/1.5 system-ui,sans-serif; } .memory-tools button { min-height: 32px; padding: 5px 10px; background: transparent; color: #bda987; font-size: 11px; }
  footer { margin-top: 18px; color: #9f9485; font: 12px/1.65 system-ui,sans-serif; }
  textarea:focus,button:focus-visible,[data-latest]:focus { outline: 3px solid #d2a15b; outline-offset: 3px; }
  @keyframes cursor-blink { 50% { opacity: 0; } }
  @media(max-width:520px){ .shell{padding:18px;border-radius:16px}.master-card{grid-template-columns:78px 1fr}.portrait{width:74px;height:86px}.input-row{grid-template-columns:1fr}.line{grid-template-columns:1fr;gap:2px}dl{grid-template-columns:1fr}.message{max-width:95%} }
  @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
</style>`;

if (!customElements.get("shoujian-oracle")) customElements.define("shoujian-oracle", ShoujianOracle);
