import { LINE_DEFINITIONS } from "./oracle-engine.js";
import { PERSISTED_MEMORY_MESSAGES } from "./conversation-memory.js";
import { deriveAvatarPresentation } from "./avatar-state.js";
import { deriveAvatarMotion } from "./avatar-motion.js";
import { courtyardStyles } from "./courtyard-styles.js";

const AVATAR_NEUTRAL = new URL("../assets/avatar/moheng-neutral.webp", import.meta.url).href;
const AVATAR_SPEAKING = new URL("../assets/avatar/moheng-speaking.webp", import.meta.url).href;

export function renderOracleView(state) {
  const stage = ["question", "intake", "ready", "reading"].includes(state.stage) ? state.stage : "question";
  const phase = stage === "question" ? "候问" : stage === "intake" ? "理问" : stage === "ready" ? "问已收" : "照卦答";
  const cloudLabel = state.cloud ? "墨衡已连接" : "本地体验 · 可起卦";
  const messages = Array.isArray(state.messages) ? state.messages : [];
  const liveSupported = Boolean(state.liveTranscriberSupported);
  const recorderSupported = Boolean(state.recorderSupported);
  const interactionLocked = Boolean(state.busy || state.recording || state.recordingStarting || state.transcribing);
  const intakeReview = stage === "intake" && state.intake?.status === "review";
  const composerLocked = stage === "ready" || intakeReview || interactionLocked;
  const avatar = deriveAvatarPresentation({ ...state, stage });
  const avatarMotion = deriveAvatarMotion(avatar.key);

  const welcoming = stage === "question" && messages.length <= 1 && !messages.some((message) => message.role === "user" || message.error);
  return `${courtyardStyles}
    <main class="shell stage-${stage} ${welcoming ? "is-welcome" : "is-conversation"}">
      <header class="masthead"><a class="wordmark" href="#" aria-label="守简问卦首页"><span class="seal">守</span><span>守简<small>一室观心 · SHOUJIAN</small></span></a><div class="system-state"><span class="status ${state.cloud ? "online" : ""}">${cloudLabel}</span><button class="quiet-button" type="button" data-action="replay-entry" ${interactionLocked || state.voiceConversationActive ? "disabled" : ""}>重游山门 ↗</button></div></header>
      <section class="master-card stage-${stage}">
        <div class="landscape" aria-hidden="true"><div class="moon"></div><div class="mountain mountain-back"></div><div class="mountain mountain-front"></div><div class="water"></div><span class="landscape-caption">山静 · 心明</span></div>
        <div class="hero-copy"><p class="eyebrow">此间一叙，万事慢慢说</p><h1>借一卦，<em>照眼前的路。</em></h1><p>${welcoming ? "不必急着找答案。先把心里的事，放在这里。" : "一事一问。从你的处境出发，把眼前的路看清。"}</p></div>
      </section>
      <div class="experience">
        <div class="conversation-column">
          <div class="conversation-head">${avatarStage(avatar, phase, avatarMotion)}<div class="host-copy"><span>墨衡 <small>你的问卦引路人</small></span><p>${welcoming ? "我在。想聊一聊，还是问上一卦？" : escapeHtml(avatar.detail)}</p></div><span class="room-seal" aria-hidden="true">问心</span></div>
          ${stage !== "question" ? `<ol class="journey" aria-label="问卦进度">${["理清问题", "确认起卦", "观卦解意"].map((label, index) => `<li ${index === ["intake", "ready", "reading"].indexOf(stage) ? 'aria-current="step"' : ""}><span>0${index + 1}</span>${label}</li>`).join("")}</ol>` : ""}
          ${state.reading ? readingCard(state.reading, state.question) : ""}
          <section class="dialogue" aria-label="与墨衡的当前对话" aria-live="polite">
            ${messages.map((message, index) => messageHtml(message, index, messages.length)).join("")}
          </section>
          <button class="jump-latest" type="button" data-action="jump-latest" ${state.showJumpToLatest ? "" : "hidden"}>回到最新消息 ↓</button>

          <section class="controls">
            ${welcoming ? `<div class="question-seeds" aria-label="问题灵感"><span>从一件事开始</span><button type="button" data-seed="最近在工作上遇到一个选择，想聊聊该怎样理清思路。" ${interactionLocked ? "disabled" : ""}>事业进退 ↗</button><button type="button" data-seed="有一段关系让我困惑，想梳理自己的想法。" ${interactionLocked ? "disabled" : ""}>相处之道 ↗</button><button type="button" data-seed="最近心里有些迷茫，想找一个能开始的小方向。" ${interactionLocked ? "disabled" : ""}>心中未决 ↗</button></div>` : ""}
            ${stage === "intake" ? intakePanel(state.intake, state.intakeSummaryDraft, interactionLocked) : ""}
            ${stage === "ready" && state.intake?.summary ? confirmedIntakeCard(state.intake.summary) : ""}
            ${stage === "ready" ? `<div class="casting-invitation"><div class="coins" aria-hidden="true"><i>乾</i><i>元</i><i>通</i></div><h2>此问已定，静候一卦。</h2><p>三枚铜钱，六次掷取。让卦象带来一个新的观察角度。</p><button class="primary" type="button" data-action="cast" ${interactionLocked ? "disabled" : ""}>掷三钱六次，依数排卦</button></div>` : ""}
            ${stage === "reading" && !state.cloud ? `<div class="quick" aria-label="本地可追问内容">
              <button type="button" data-quick="这个卦是什么意思">什么意思</button>
              <button type="button" data-quick="动爻怎么看">动爻怎么看</button>
              <button type="button" data-quick="你是怎么算的">怎么算的</button>
              <button type="button" data-quick="边界是什么">边界是什么</button>
            </div>` : ""}
            ${stage === "reading" && state.cloud ? `<p class="rag-invitation">现在可自由追问原文、动爻、上下卦关系、不同理解，或它如何映照你的原问。</p>` : ""}
            ${intakeReview || stage === "ready" ? "" : `<form>
              <label for="say">${escapeHtml(composerLabel(stage, state))}</label>
              <div class="input-row">
                <textarea id="say" maxlength="500" ${composerLocked ? "disabled" : ""} placeholder="${escapeHtml(composerPlaceholder(stage, state))}">${escapeHtml(state.draft)}</textarea>
                <div class="submit-actions">
                  ${stage === "question" ? `<button class="primary" type="submit" data-submit-mode="chat" ${interactionLocked ? "disabled" : ""}>与墨衡聊聊 ↗</button><button type="submit" data-submit-mode="divination" ${interactionLocked ? "disabled" : ""}>以此问起卦</button>` : stage === "intake" ? `<button class="primary" type="submit" data-submit-mode="intake" ${composerLocked ? "disabled" : ""}>记下这一项</button>` : `<button class="primary" type="submit" ${composerLocked ? "disabled" : ""}>${interactionLocked ? "请稍候" : "送问"}</button>`}
                </div>
              </div>
              <small class="composer-hint">Enter 发送 · Shift+Enter 换行</small>
            </form>`}
            ${state.cloud && liveSupported ? voiceConversationPanel(state, stage, intakeReview) : ""}
            ${state.busy && !state.transcribing ? `<button class="stop-response" type="button" data-action="cancel-response">停止回答</button>` : ""}
            ${state.canRetryResponse && !interactionLocked ? `<button type="button" data-action="retry-response">重试本次回答</button>` : ""}
            ${state.cloud ? `<details class="utility-drawer" data-drawer="voice" ${state.recording || state.recordingStarting || state.transcribing ? "open" : ""}><summary>语音设置与单次录音</summary>` : ""}
            <div class="voice-tools" aria-label="语音工具">
              ${state.cloud && !state.voiceConversationActive && (liveSupported || recorderSupported) ? state.transcribing
                ? `<button type="button" data-action="cancel-transcription">取消转写</button>`
                : state.recordingStarting
                  ? `<button type="button" data-action="cancel-record">等待麦克风授权 · 取消</button>`
                  : `<button type="button" data-action="${state.recording ? "stop-record" : "record"}" ${((stage === "ready" || intakeReview || state.busy || state.recorderPermissionPending) && !state.recording) ? "disabled" : ""}>${state.recording ? state.recordingMode === "live" ? "停止并采用文字" : "停止并转文字" : state.recorderPermissionPending ? "正在关闭麦克风授权" : state.incrementalTranscriberSupported ? "实时语音输入" : "按下说话"}</button>` : ""}
              ${state.cloud && !state.voiceConversationActive ? `<button type="button" data-action="voice" aria-pressed="${Boolean(state.voiceReplies)}">${escapeHtml(state.voiceButtonLabel)}</button>` : ""}
              ${state.cloud && state.voiceReplies && state.fastVoiceSupported && !state.voiceConversationActive ? `<button type="button" data-action="voice-mode" aria-label="切换语音模式">${escapeHtml(state.voiceModeButtonLabel)}</button>` : ""}
            </div>
            ${voicePerformanceHtml(state.voicePerformanceSummary)}
            ${state.cloud ? "</details>" : ""}
            ${state.cloud && state.voiceInputNotice ? `<p class="voice-input-notice" role="status">${escapeHtml(state.voiceInputNotice)}</p>` : ""}
            ${state.cloud ? `<p class="voice-notice" data-voice-notice role="status" ${state.voiceError ? "" : "hidden"}>${state.voiceError ? `语音暂不可用：${escapeHtml(state.voiceError)}。文字回答仍可继续。` : ""}</p>` : ""}
            <details class="memory-drawer" data-drawer="memory"><summary>记录与隐私 <span>仅存本机</span></summary><div class="memory-tools"><small>最近 ${PERSISTED_MEMORY_MESSAGES} 条已完成对话与当前卦象保存在此浏览器；刷新或重启服务不会清除。</small><div>${state.cloud ? `<button type="button" data-action="export-memory" ${interactionLocked ? "disabled" : ""}>导出本机会话</button><button type="button" data-action="import-memory" ${interactionLocked ? "disabled" : ""}>导入本机会话</button>` : ""}<button type="button" data-action="clear-memory" ${interactionLocked ? "disabled" : ""}>清空记录并重新开始</button></div></div></details>${state.cloud ? `<input type="file" accept="application/json,.json" data-session-import hidden>` : ""}
            ${stage !== "question" ? `<button class="text-button" type="button" data-action="reset" ${interactionLocked ? "disabled" : ""}>另起一问（保留记录）</button>` : !state.cloud ? `<div class="quick"><button type="button" data-quick="我不会问，请给一个例子">我不会问</button><button type="button" data-quick="边界是什么">哪些不能问</button></div>` : ""}
          </section>
        </div>
      </div>

      <footer><span>一问一念，一念一明。</span><small>传统文化体验 · 卦象仅供参考</small></footer>
    </main>`;
}

function voiceConversationPanel(state, stage, intakeReview) {
  const active = Boolean(state.voiceConversationActive);
  const conversationState = String(state.voiceConversationState ?? "off");
  const disabled = !active && (state.busy || state.recording || state.recordingStarting || state.transcribing || stage === "ready" || intakeReview);
  const labels = {
    listening: "正在听，请自然说完",
    heard: "已经听清，准备送问",
    thinking: "墨衡正在回答；此时不会收音",
    speaking: "墨衡正在说；此时不会收音",
    interrupted: "旧回答已停，正在重新听",
    error: "语音输入暂不可用，文字输入仍可继续",
  };
  const interruptible = active && ["thinking", "speaking"].includes(conversationState);
  const transcript = String(state.voiceConversationTranscript ?? "").trim();
  const error = String(state.voiceConversationError ?? "").trim();
  return `<section class="voice-conversation" data-conversation-state="${escapeHtml(conversationState)}" aria-label="自动语音对话">
    <div class="voice-conversation-copy"><strong>${active ? "此刻，听你说" : "也可以，直接说给我听"}</strong><small>${active ? "说完停顿自动发送，朗读结束后继续听。" : state.streamingSttAvailable ? "实时显示文字 · 停顿自动发送" : "停顿后自动发送 · 实时转写取决于浏览器支持"}</small></div>
    <div class="voice-conversation-actions">
      <button class="${active ? "" : "primary"}" type="button" data-action="voice-conversation" ${disabled ? "disabled" : ""}>${active ? "结束语音对话" : "开始语音对话（自动发送）"}</button>
      ${interruptible ? `<button class="interrupt" type="button" data-action="voice-interrupt">打断并说话</button>` : ""}
      ${active && conversationState === "error" ? `<button type="button" data-action="voice-conversation-retry">重新听</button>` : ""}
    </div>
    ${active ? `<p class="voice-conversation-status" role="status"><b>${escapeHtml(labels[conversationState] ?? "语音对话已开启")}</b><span data-voice-transcript ${transcript ? "" : "hidden"}>${transcript ? `“${escapeHtml(transcript)}”` : ""}</span>${error ? `<span>${escapeHtml(error)}</span>` : ""}</p>${latencyHtml(state.voiceConversationMetrics)}` : ""}
  </section>`;
}

function latencyHtml(metrics = {}) {
  const items = [
    ["ASR 定稿", metrics.asrFinalMs],
    ["首字", metrics.firstTokenMs],
    ["首声", metrics.firstAudioMs],
  ].filter(([, value]) => Number.isFinite(value));
  if (!items.length) return "";
  return `<dl class="voice-latency" aria-label="本轮语音延迟">${items.map(([label, value]) => `<div><dt>${label}</dt><dd>${formatLatency(value)}</dd></div>`).join("")}</dl>`;
}

function voicePerformanceHtml(summary = {}) {
  const turns = Number(summary.turns) || 0;
  if (!turns) return "";
  const metrics = [
    ["ASR", summary.asrFinalMs],
    ["首字", summary.firstTokenMs],
    ["首声", summary.firstAudioMs],
  ];
  return `<section class="voice-performance" aria-label="本机语音性能汇总"><div><strong>本机验收 · ${turns} 轮</strong><small>${turns < 10 ? "建议至少完成 10 轮再看 P95" : "已达到基础样本数"}</small></div><dl>${metrics.map(([label, metric]) => `<div><dt>${label} P50 / P95</dt><dd>${formatLatency(metric?.p50)} / ${formatLatency(metric?.p95)} · n=${Number(metric?.samples) || 0}</dd></div>`).join("")}</dl><div class="voice-performance-actions"><button type="button" data-action="export-voice-metrics">导出延迟报告</button><button type="button" data-action="clear-voice-metrics">清空指标</button></div><small>只记录毫秒数，不保存录音或转写内容。</small></section>`;
}

function formatLatency(value) {
  if (!Number.isFinite(value)) return "—";
  const milliseconds = Math.max(0, Number(value) || 0);
  return milliseconds < 1_000 ? `${Math.round(milliseconds)} ms` : `${(milliseconds / 1_000).toFixed(1)} s`;
}

function intakePanel(intake, summaryDraft, locked) {
  if (!intake || !Array.isArray(intake.questions)) return `<p class="intake-card">访谈状态不可用，请点“另起一问”重新开始。</p>`;
  if (intake.status === "review") {
    return `<section class="intake-card" aria-label="确认问卦摘要">
      <small>确认这次所问</small>
      <label for="intake-summary">请检查并按真实情况修改</label>
      <textarea id="intake-summary" data-intake-summary maxlength="500" ${locked ? "disabled" : ""}>${escapeHtml(summaryDraft || intake.summary)}</textarea>
      <p>摘要只用于后续解释，不参与随机排卦；不需要填写生辰八字。</p>
      <button class="primary" type="button" data-action="intake-confirm" ${locked ? "disabled" : ""}>确认摘要，准备起卦</button>
    </section>`;
  }
  const total = intake.questions.length;
  const current = Math.min(Number(intake.cursor) + 1, total);
  return `<section class="intake-card" aria-label="起卦前情境访谈">
    <small>起卦前理问 · ${current} / ${total}</small>
    <p>只补充会影响解读的现实信息；你可以跳过，也可以现在就整理摘要。</p>
    <div class="intake-actions"><button type="button" data-action="intake-skip" ${locked ? "disabled" : ""}>暂不回答这一项</button><button type="button" data-action="intake-review" ${locked ? "disabled" : ""}>信息已足够，直接整理</button></div>
  </section>`;
}

function confirmedIntakeCard(summary) {
  return `<section class="intake-card confirmed" aria-label="已确认问卦摘要"><small>这次所问 · 已确认</small><p>${escapeHtml(summary)}</p><p>文字只用于解释上下文，不会改变六爻结果。</p></section>`;
}

function composerLabel(stage, state) {
  if (stage === "question") return state.cloud ? "想问墨衡什么" : "留下一件具体的事";
  if (stage === "intake") return state.intake?.questions?.[state.intake.cursor]?.prompt ?? "补充这一项";
  if (stage === "ready") return "原问已固定";
  return "继续问墨衡";
}

function composerPlaceholder(stage, state) {
  if (stage === "reading") return "直接追问，也可以随时换回普通聊天";
  if (stage === "intake") return "只说你愿意提供且能确认的信息；也可以点击跳过";
  return state.cloud ? "生意、感情、健康、学业或任何困惑，都可以直接说" : "例如：未来三天，我该先验证哪一步？";
}

function avatarStage(avatar, phase, motion) {
  return `<section class="avatar-stage" data-avatar-state="${avatar.key}" data-avatar-motion="${motion.key}" data-mouth-state="closed" style="--voice-level:0" aria-label="墨衡虚拟人，当前状态：${escapeHtml(avatar.label)}">
    <div class="oracle-halo" aria-hidden="true"><span>乾</span><span>兑</span><span>离</span><span>震</span><span>巽</span><span>坎</span><span>艮</span><span>坤</span></div>
    <div class="attention-rings" aria-hidden="true"><i></i><i></i></div>
    <div class="avatar-reading-token" aria-hidden="true"><span>易</span><i>观象</i></div>
    <div class="portrait-stack" aria-hidden="true">
      <img class="avatar-neutral" src="${escapeHtml(AVATAR_NEUTRAL)}" width="560" height="700" alt="" draggable="false">
      <img class="avatar-speaking" src="${escapeHtml(AVATAR_SPEAKING)}" width="560" height="700" alt="" draggable="false">
      <span class="avatar-eyelids"><i></i><i></i></span>
      <span class="avatar-breath"></span>
    </div>
    <div class="avatar-panel">
      <div class="avatar-state-line"><span class="state-dot"></span><b data-avatar-label>${escapeHtml(avatar.label)}</b><span>·</span><span>${escapeHtml(phase)}</span></div>
      <p data-avatar-detail>${escapeHtml(avatar.detail)}</p>
      <div class="voice-meter" aria-hidden="true">${Array.from({ length: 9 }, (_, index) => `<i style="--bar:${index};--amp:${6 + (index % 4) * 4}px"></i>`).join("")}</div>
    </div>
  </section>`;
}

function messageHtml(message, index, length) {
  const role = message?.role === "user" ? "user" : "master";
  const label = role === "master" ? `墨衡${message?.evidence?.length ? " · RAG" : message?.cloud ? " · 云端" : ""}` : "你";
  return `<article class="message ${role} ${message?.error ? "error" : ""} ${message?.streaming ? "streaming" : ""}" data-message-index="${index}" ${index === length - 1 ? 'tabindex="-1" data-latest' : ""}>
    <b>${label}</b><p>${escapeHtml(message?.text)}</p>${evidenceDetails(message?.evidence)}
  </article>`;
}

function readingCard(reading, question) {
  const lines = Array.isArray(reading.lines) ? [...reading.lines].reverse().map((value, visualIndex) => {
    const position = 6 - visualIndex;
    const definition = LINE_DEFINITIONS[value];
    if (!definition) return "";
    return `<li class="line ${definition.moving ? "moving" : ""}"><span>${definition.polarity === "阳" ? "━━━━━━" : "━━  ━━"}</span><small>第${position}爻 · ${definition.label}${definition.moving ? "，动" : ""}</small></li>`;
  }).join("") : "";
  return `<section class="reading" aria-label="本次卦象">
    <p class="question">原问：“${escapeHtml(question)}”</p>
    <div class="reading-title"><span>${escapeHtml(reading.primary?.symbol)}</span><div><small>第 ${Number(reading.primary?.number) || 0} 卦</small><h2>${escapeHtml(reading.primary?.fullName)}</h2></div></div>
    <div class="reading-explanation"><strong>这卦对原问的白话提醒</strong><p>${escapeHtml(plainReading(reading, question))}</p></div>
    <details class="hexagram-detail" data-drawer="hexagram"><summary>展开六爻与卦象结构</summary><ol aria-label="六爻，自上而下显示">${lines}</ol>
    <dl><div><dt>下卦</dt><dd>${escapeHtml(reading.primary?.lower?.symbol)}${escapeHtml(reading.primary?.lower?.name)} · ${escapeHtml(reading.primary?.lower?.image)}</dd></div><div><dt>上卦</dt><dd>${escapeHtml(reading.primary?.upper?.symbol)}${escapeHtml(reading.primary?.upper?.name)} · ${escapeHtml(reading.primary?.upper?.image)}</dd></div><div><dt>之卦</dt><dd>${escapeHtml(reading.changed?.fullName ?? "无")}</dd></div></dl>
    </details><p class="reading-disclaimer">卦象仅供传统文化体验与自我反思参考，不作为现实决定的唯一依据。</p>
  </section>`;
}

export function plainReading(reading, question) {
  const ask = String(question ?? "").trim().slice(0, 80);
  const reality = /搬家|迁居|搬迁/u.test(ask)
    ? "就搬家而言：如果新住处交付、搬运安排和费用都落实了，可以按现实计划推进；若有关键缺口，先补齐再决定。"
    : "就你问的这件事而言：如果关键条件已核实，可以按现实计划推进；还有重要缺口，就先补齐再决定。";
  const actions = {
    乾: "列出最重要的事项和顺序", 兑: "把没说清的条件问明白", 离: "核对事实与期待是否一致",
    震: "先试一个能撤回的小步骤", 巽: "逐步试探并看反馈", 坎: "检查风险和缺口",
    艮: "先停下来划清边界", 坤: "从眼前能做的事开始",
  };
  const lower = actions[reading.primary?.lower?.name] ?? "确认自己的准备";
  const upper = actions[reading.primary?.upper?.name] ?? "核对外部条件";
  const movingLines = Array.isArray(reading.movingLines) ? reading.movingLines : [];
  const change = movingLines.length
    ? `第${movingLines.join("、")}爻有变化；“${reading.changed?.fullName ?? "变卦"}”只提醒换个角度看后续，不预示结果。`
    : "没有动爻，先看眼前的条件。";
  const reflection = lower === upper ? `这卦提醒你：${lower}，选一件能落实的小事先做。` : `这卦提醒你：先${lower}，再${upper}。`;
  return `${reality}\n\n${reflection}\n\n${change}`;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function evidenceDetails(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) return "";
  return `<details class="rag-evidence"><summary>本答检索依据 · ${evidence.length} 条</summary><ol>${evidence.map((item) => `<li><a href="${safeUrl(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a><small>${escapeHtml(item.id)} · ${escapeHtml(item.layer)}</small><blockquote>${escapeHtml(item.excerpt)}</blockquote></li>`).join("")}</ol></details>`;
}

function safeUrl(value) {
  const url = String(value ?? "");
  return /^https:\/\//u.test(url) ? escapeHtml(url) : "#";
}
