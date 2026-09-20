import { LINE_DEFINITIONS } from "./oracle-engine.js";
import { PERSISTED_MEMORY_MESSAGES } from "./conversation-memory.js";
import { deriveAvatarPresentation } from "./avatar-state.js";

const AVATAR_NEUTRAL = new URL("../assets/avatar/moheng-neutral.webp", import.meta.url).href;
const AVATAR_SPEAKING = new URL("../assets/avatar/moheng-speaking.webp", import.meta.url).href;

export function renderOracleView(state) {
  const stage = ["question", "ready", "reading"].includes(state.stage) ? state.stage : "question";
  const phase = stage === "question" ? "候问" : stage === "ready" ? "问已收" : "照卦答";
  const cloudLabel = state.cloud ? "Gemini + 周易 RAG 已连接" : "本地有限对话";
  const knowledgeLabel = state.knowledge
    ? `${Number(state.knowledge.hexagrams) || 0} 卦 · ${Number(state.knowledge.trigrams) || 0} 八卦 · ${Number(state.knowledge.fragments) || 0} 条冻结片段`
    : "知识库状态未知";
  const messages = Array.isArray(state.messages) ? state.messages : [];
  const liveSupported = Boolean(state.liveTranscriberSupported);
  const recorderSupported = Boolean(state.recorderSupported);
  const interactionLocked = Boolean(state.busy || state.recording || state.transcribing);
  const composerLocked = stage === "ready" || interactionLocked;
  const avatar = deriveAvatarPresentation({ ...state, stage });

  return `${styles}
    <main class="shell">
      <header class="master-card stage-${stage}">
        <div><p class="eyebrow">守简 · 墨衡虚拟卦师</p><h1>面对面问墨衡</h1><p>能闲聊，也能有据解卦。只有你明确选择时，才会固定原问并起卦。</p></div>
        <div class="system-state"><span class="status ${state.cloud ? "online" : ""}">${cloudLabel}</span><small class="knowledge-status">${knowledgeLabel}</small></div>
      </header>

      <div class="experience">
        ${avatarStage(avatar, phase)}
        <div class="conversation-column">
          <section class="dialogue" aria-label="与墨衡的当前对话" aria-live="polite">
            ${messages.map((message, index) => messageHtml(message, index, messages.length)).join("")}
          </section>

          ${state.reading ? readingCard(state.reading, state.question) : ""}

          <section class="controls">
            ${stage === "ready" ? `<button class="primary" type="button" data-action="cast">掷三钱六次，依数排卦</button>` : ""}
            ${stage === "reading" && !state.cloud ? `<div class="quick" aria-label="本地可追问内容">
              <button type="button" data-quick="这个卦是什么意思">什么意思</button>
              <button type="button" data-quick="动爻怎么看">动爻怎么看</button>
              <button type="button" data-quick="你是怎么算的">怎么算的</button>
              <button type="button" data-quick="边界是什么">边界是什么</button>
            </div>` : ""}
            ${stage === "reading" && state.cloud ? `<p class="rag-invitation">现在可自由追问原文、动爻、上下卦关系、不同理解，或它如何映照你的原问。</p>` : ""}
            <form>
              <label for="say">${stage === "question" ? state.cloud ? "想问墨衡什么" : "留下一件具体的事" : stage === "ready" ? "原问已固定" : "继续问墨衡"}</label>
              <div class="input-row">
                <textarea id="say" maxlength="500" ${composerLocked ? "disabled" : ""} placeholder="${stage === "reading" ? "直接追问，不必套固定问法" : state.cloud ? "可闲聊、问基础问题，也可写下一件事起卦" : "例如：未来三天，我该先验证哪一步？"}">${escapeHtml(state.draft)}</textarea>
                <div class="submit-actions">
                  ${stage === "question" && state.cloud ? `<button type="submit" data-submit-mode="chat" ${interactionLocked ? "disabled" : ""}>直接问墨衡</button><button class="primary" type="submit" data-submit-mode="divination" ${interactionLocked ? "disabled" : ""}>以此问起卦</button>` : `<button type="submit" ${composerLocked ? "disabled" : ""}>${interactionLocked ? "请稍候" : "送问"}</button>`}
                </div>
              </div>
            </form>
            <div class="voice-tools" aria-label="语音工具">
              ${state.cloud && (liveSupported || recorderSupported) ? state.transcribing
                ? `<button type="button" data-action="cancel-transcription">取消转写</button>`
                : `<button type="button" data-action="${state.recording ? "stop-record" : "record"}" ${(stage === "ready" || state.busy) && !state.recording ? "disabled" : ""}>${state.recording ? state.recordingMode === "live" ? "停止并采用文字" : "停止并转文字" : liveSupported ? "实时语音输入" : "按下说话"}</button>` : ""}
              ${state.busy && !state.transcribing ? `<button type="button" data-action="cancel-response">停止回答</button>` : ""}
              ${state.cloud ? `<button type="button" data-action="voice" aria-pressed="${Boolean(state.voiceReplies)}">${escapeHtml(state.voiceButtonLabel)}</button>` : ""}
            </div>
            ${state.cloud ? `<div class="memory-tools"><small>本机保存最近 ${PERSISTED_MEMORY_MESSAGES} 条已完成对话与当前卦象。</small><button type="button" data-action="clear-memory" ${interactionLocked ? "disabled" : ""}>清除本机记忆</button></div>` : ""}
            ${stage !== "question" ? `<button class="text-button" type="button" data-action="reset" ${interactionLocked ? "disabled" : ""}>另起一问</button>` : !state.cloud ? `<div class="quick"><button type="button" data-quick="我不会问，请给一个例子">我不会问</button><button type="button" data-quick="边界是什么">哪些不能问</button></div>` : ""}
          </section>
        </div>
      </div>

      <footer>${state.cloud ? `云端对话会把你主动提交的文字、最近上下文和必要检索片段发送给 Google Gemini；${liveSupported ? "实时语音输入由浏览器语音服务处理" : "录音会发送给 Gemini 转写"}。记忆只保存在本机浏览器。` : "本地模式不上传问题，但只能回答固定意图。配置 Gemini 后可启用自由对话与语音。"} 这是传统文化体验，不替代医疗、法律、投资或现实安全判断。</footer>
    </main>`;
}

function avatarStage(avatar, phase) {
  return `<section class="avatar-stage" data-avatar-state="${avatar.key}" style="--voice-level:0" aria-label="墨衡虚拟人，当前状态：${escapeHtml(avatar.label)}">
    <div class="oracle-halo" aria-hidden="true"><span>乾</span><span>兑</span><span>离</span><span>震</span><span>巽</span><span>坎</span><span>艮</span><span>坤</span></div>
    <div class="portrait-stack" aria-hidden="true">
      <img class="avatar-neutral" src="${escapeHtml(AVATAR_NEUTRAL)}" width="560" height="700" alt="" draggable="false">
      <img class="avatar-speaking" src="${escapeHtml(AVATAR_SPEAKING)}" width="560" height="700" alt="" draggable="false">
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
    <ol aria-label="六爻，自上而下显示">${lines}</ol>
    <dl><div><dt>下卦</dt><dd>${escapeHtml(reading.primary?.lower?.symbol)}${escapeHtml(reading.primary?.lower?.name)} · ${escapeHtml(reading.primary?.lower?.image)}</dd></div><div><dt>上卦</dt><dd>${escapeHtml(reading.primary?.upper?.symbol)}${escapeHtml(reading.primary?.upper?.name)} · ${escapeHtml(reading.primary?.upper?.image)}</dd></div><div><dt>之卦</dt><dd>${escapeHtml(reading.changed?.fullName ?? "无")}</dd></div></dl>
  </section>`;
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

const styles = `<style>
  :host { color-scheme: dark; display: block; width: 100%; font-family: "Noto Serif SC", "Songti SC", serif; }
  * { box-sizing: border-box; } button, textarea { font: inherit; }
  .shell { width: min(1180px, 100%); margin: auto; padding: 24px; color: #efe5cd; background: radial-gradient(circle at 10% 10%, #3e251c 0, transparent 30%), radial-gradient(circle at 92% 4%, #392d20 0, transparent 28%), #11100f; border: 1px solid #72583c; border-radius: 28px; box-shadow: 0 28px 90px #000b; }
  .master-card { display: flex; justify-content: space-between; gap: 24px; align-items: end; padding: 0 4px 19px; border-bottom: 1px solid #71573a80; }
  .master-card > div:first-child { max-width: 690px; } .eyebrow { margin: 0 0 5px; color: #c09561; font: 700 12px/1.4 system-ui,sans-serif; letter-spacing: .18em; }
  h1 { margin: 0 0 7px; font-size: clamp(26px, 4vw, 42px); } .master-card p { margin: 0; color: #bdb09c; line-height: 1.65; }
  .system-state { flex: 0 0 auto; text-align: right; } .status { display: inline-block; padding: 5px 10px; color: #aaa092; background: #ffffff0b; border: 1px solid #5f5548; border-radius: 999px; font: 11px/1.4 system-ui,sans-serif; } .status.online { color: #e3d5a6; border-color: #84784e; background: #77702b22; }
  .knowledge-status { display: block; margin-top: 7px; color: #938674; font: 11px/1.5 system-ui,sans-serif; }
  .experience { display: grid; grid-template-columns: minmax(300px, .84fr) minmax(0, 1.28fr); gap: 22px; padding-top: 22px; }
  .avatar-stage { --voice-level: 0; --voice-level-px: 3px; position: sticky; top: 18px; align-self: start; min-height: 640px; overflow: hidden; isolation: isolate; display: grid; align-items: end; border: 1px solid #6f5739; border-radius: 22px; background: radial-gradient(circle at 50% 28%, #81552e55 0 12%, transparent 40%), linear-gradient(160deg,#251b16,#090909 68%); box-shadow: inset 0 0 70px #0008; }
  .avatar-stage::before { content: ""; position: absolute; inset: 0; z-index: -1; background: repeating-linear-gradient(90deg,transparent 0 41px,#c99c4b09 42px), repeating-linear-gradient(0deg,transparent 0 41px,#c99c4b08 42px); mask-image: linear-gradient(to bottom,#0008,transparent 70%); }
  .oracle-halo { position: absolute; z-index: -1; top: 7%; left: 50%; width: 78%; aspect-ratio: 1; translate: -50% 0; border: 1px solid #b58b4d66; border-radius: 50%; animation: halo-turn 42s linear infinite; }
  .oracle-halo::before,.oracle-halo::after { content: ""; position: absolute; inset: 10%; border: 1px solid #b58b4d30; border-radius: 50%; } .oracle-halo::after { inset: 31%; background: radial-gradient(circle,#d7a5542c,transparent 68%); }
  .oracle-halo span { position: absolute; left: 50%; top: 50%; width: 34px; height: 34px; margin: -17px; display: grid; place-items: center; color: #c9a162; background: #17120fdd; border: 1px solid #80623e; border-radius: 50%; font-size: 13px; transform: rotate(calc(var(--i,0) * 45deg)) translateY(-152px) rotate(calc(var(--i,0) * -45deg)); }
  .oracle-halo span:nth-child(1){--i:0}.oracle-halo span:nth-child(2){--i:1}.oracle-halo span:nth-child(3){--i:2}.oracle-halo span:nth-child(4){--i:3}.oracle-halo span:nth-child(5){--i:4}.oracle-halo span:nth-child(6){--i:5}.oracle-halo span:nth-child(7){--i:6}.oracle-halo span:nth-child(8){--i:7}
  .portrait-stack { position: absolute; inset: 18px 0 58px; transform-origin: 50% 100%; animation: breathe 5.2s ease-in-out infinite; }
  .portrait-stack img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: center bottom; user-select: none; filter: drop-shadow(0 20px 28px #000c); }
  .avatar-speaking { opacity: 0; clip-path: ellipse(11% 5.4% at 50% 28.7%); }
  [data-avatar-state="speaking"] .avatar-speaking { opacity: var(--voice-level); transition: opacity 55ms linear; }
  .avatar-breath { position: absolute; left: 50%; bottom: 12%; width: 54%; height: 12%; translate: -50%; border-radius: 50%; background: #b44b3038; filter: blur(24px); opacity: 0; }
  [data-avatar-state="thinking"] .oracle-halo,[data-avatar-state="preparing"] .oracle-halo { animation-duration: 9s; filter: drop-shadow(0 0 12px #c68a48); }
  [data-avatar-state="listening"] .avatar-breath,[data-avatar-state="speaking"] .avatar-breath { opacity: calc(.22 + var(--voice-level)); }
  .avatar-panel { position: relative; z-index: 3; margin: auto 14px 14px; padding: 12px 14px; color: #eee2cc; background: #0c0b0aeb; border: 1px solid #795f40; border-radius: 14px; backdrop-filter: blur(12px); }
  .avatar-state-line { display: flex; gap: 7px; align-items: center; font: 12px/1.4 system-ui,sans-serif; letter-spacing: .08em; } .state-dot { width: 8px; height: 8px; border-radius: 50%; background: #96816a; box-shadow: 0 0 0 4px #96816a18; }
  [data-avatar-state="listening"] .state-dot { background:#78b7a2; animation:pulse 1s infinite; } [data-avatar-state="thinking"] .state-dot,[data-avatar-state="preparing"] .state-dot { background:#d29a53; animation:pulse .8s infinite; } [data-avatar-state="speaking"] .state-dot { background:#dc6d59; animation:pulse .45s infinite; }
  .avatar-panel p { margin: 5px 0 0; color: #a99b87; font: 12px/1.5 system-ui,sans-serif; }
  .voice-meter { height: 22px; display: flex; gap: 3px; align-items: end; margin-top: 8px; } .voice-meter i { flex: 1; height: 3px; max-height: 20px; transform-origin: bottom; background: linear-gradient(#dcb26f,#7d3429); border-radius: 4px; opacity: .25; }
  [data-avatar-state="listening"] .voice-meter i { opacity: .8; animation: meter .7s calc(var(--bar) * -70ms) ease-in-out infinite alternate; }
  [data-avatar-state="speaking"] .voice-meter i { height: var(--voice-level-px); opacity: calc(.3 + var(--voice-level)); transition: height 55ms linear,opacity 55ms linear; } [data-avatar-state="speaking"] .voice-meter i:nth-child(3n+1){transform:scaleY(.62)} [data-avatar-state="speaking"] .voice-meter i:nth-child(3n+2){transform:scaleY(.82)}
  .conversation-column { min-width: 0; display: grid; gap: 14px; align-content: start; }
  .dialogue { display: grid; gap: 10px; min-height: 240px; max-height: 430px; overflow: auto; padding: 4px 6px 4px 2px; scroll-behavior: smooth; }
  .message { max-width: 88%; padding: 11px 14px; border-radius: 14px; background: #ffffff09; border: 1px solid #68533c; }
  .message.user { justify-self: end; background: #6d2d2729; border-color: #8e4a40; } .message b { color: #c9a46e; font-size: 13px; } .message p { margin: 5px 0 0; line-height: 1.7; white-space: pre-line; overflow-wrap: anywhere; }
  .message.error { border-color: #a85248; background: #7a2c2422; } .message.streaming p::after { content: "▍"; margin-left: 2px; color: #d2a15b; animation: cursor-blink .8s steps(1) infinite; }
  .rag-evidence { margin-top: 10px; border-top: 1px solid #66513b; padding-top: 8px; font: 12px/1.55 system-ui,sans-serif; } .rag-evidence summary { color: #d0ac76; cursor: pointer; } .rag-evidence ol { display: grid; gap: 10px; margin: 10px 0 0; padding-left: 20px; } .rag-evidence a { color: #e0be86; } .rag-evidence small { display: block; color: #918574; } .rag-evidence blockquote { margin: 5px 0 0; padding-left: 9px; color: #c8beae; border-left: 2px solid #71573a; white-space: pre-line; }
  .reading { padding: 16px; background: #09080772; border: 1px solid #604932; border-radius: 16px; } .question { margin: 0 0 12px; color: #bca889; } .reading-title { display: flex; gap: 14px; align-items: center; } .reading-title > span { font-size: 44px; color: #d2b782; } h2 { margin: 2px 0 0; font-size: 24px; }
  .reading ol { display: grid; gap: 5px; padding: 13px; list-style: none; background: #05050566; border-radius: 12px; } .line { display: grid; grid-template-columns: 1fr auto; gap: 12px; } .line span { color: #d2b782; font: 800 21px/1 monospace; } .line small { color: #918574; font: 12px/1.4 system-ui,sans-serif; } .line.moving span,.line.moving small { color: #e5705e; }
  dl { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin: 0; } dl div { padding: 9px; text-align: center; background: #ffffff08; border-radius: 9px; } dt { color: #9d8f7b; font: 12px system-ui,sans-serif; } dd { margin: 4px 0 0; }
  .controls { display: grid; gap: 12px; padding: 16px; background: #0a0908a8; border: 1px solid #4d4031; border-radius: 18px; } label { display: block; margin-bottom: 7px; color: #d9bd91; font-weight: 700; } .input-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
  textarea { min-height: 78px; resize: vertical; padding: 11px 13px; color: #f3ead8; background: #050505c9; border: 1px solid #6c5942; border-radius: 12px; } button { min-height: 44px; padding: 9px 16px; color: #f8ead0; background: #593a29; border: 1px solid #826244; border-radius: 999px; cursor: pointer; } button:hover:not(:disabled) { border-color:#c0925e; translate:0 -1px; } button:disabled { opacity: .48; cursor: not-allowed; } .primary { width: 100%; background: #8e332a; border-color: #bb6b5d; font-weight: 700; } .text-button { justify-self: center; background: transparent; border: 0; color: #c5aa7e; text-decoration: underline; }
  .submit-actions { display: grid; gap: 8px; align-content: start; } .submit-actions .primary { width: auto; } .quick { display: flex; flex-wrap: wrap; gap: 7px; } .quick button { min-height: 38px; padding: 7px 12px; font-size: 13px; } .rag-invitation { margin: 0; padding: 10px 12px; color: #d5c2a2; background: #88713b18; border: 1px solid #74623e; border-radius: 12px; font: 13px/1.65 system-ui,sans-serif; }
  .voice-tools { display: flex; flex-wrap: wrap; gap: 8px; } .voice-tools button { background: #25201b; } .memory-tools { display: flex; gap: 10px; align-items: center; justify-content: space-between; color: #938674; font: 11px/1.5 system-ui,sans-serif; } .memory-tools button { min-height: 32px; padding: 5px 10px; background: transparent; color: #bda987; font-size: 11px; }
  footer { margin-top: 18px; color: #8f8578; font: 11px/1.65 system-ui,sans-serif; } textarea:focus,button:focus-visible,[data-latest]:focus { outline: 3px solid #d2a15b; outline-offset: 3px; }
  @keyframes cursor-blink { 50% { opacity: 0; } } @keyframes halo-turn { to { rotate:360deg; } } @keyframes breathe { 50% { transform: translateY(-3px) scale(1.006); } } @keyframes pulse { 50% { opacity:.38; box-shadow:0 0 0 8px currentColor; } } @keyframes meter { to { height: var(--amp); } }
  @media(max-width:860px){ .master-card{align-items:start}.experience{grid-template-columns:1fr}.avatar-stage{position:relative;top:auto;min-height:470px}.portrait-stack{inset:-20px 0 54px}.oracle-halo{width:340px}.oracle-halo span{transform:rotate(calc(var(--i)*45deg)) translateY(-132px) rotate(calc(var(--i)*-45deg))}.dialogue{max-height:400px} }
  @media(max-width:560px){ .shell{padding:15px;border-radius:17px}.master-card{display:grid}.system-state{text-align:left}.avatar-stage{min-height:390px}.portrait-stack{inset:-5px -25px 54px}.avatar-panel{margin:0 9px 9px}.oracle-halo{top:4%;width:270px}.oracle-halo span{width:28px;height:28px;margin:-14px;transform:rotate(calc(var(--i)*45deg)) translateY(-105px) rotate(calc(var(--i)*-45deg))}.input-row{grid-template-columns:1fr}.line{grid-template-columns:1fr;gap:2px}dl{grid-template-columns:1fr}.message{max-width:96%}.memory-tools{align-items:flex-start} }
  @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}[data-avatar-state="speaking"] .avatar-speaking{opacity:var(--voice-level)}}
</style>`;
