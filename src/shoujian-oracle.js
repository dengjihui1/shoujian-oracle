import { castHexagram } from "./oracle-engine.js";

const lineText = Object.freeze({
  6: "老阴，动",
  7: "少阳",
  8: "少阴",
  9: "老阳，动"
});

export class ShoujianOracle extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.renderIdle();
  }

  connectedCallback() {
    this.shadowRoot.addEventListener("click", this.handleClick);
  }

  disconnectedCallback() {
    this.shadowRoot.removeEventListener("click", this.handleClick);
  }

  handleClick = (event) => {
    if (event.target.closest("[data-cast]")) this.cast();
    if (event.target.closest("[data-reset]")) this.renderIdle();
  };

  cast() {
    const question = this.shadowRoot.querySelector("textarea").value.trim();
    const reading = castHexagram();
    this.renderReading(reading, question);
    this.shadowRoot.querySelector("[data-result]")?.focus();
  }

  renderIdle() {
    this.shadowRoot.innerHTML = `${styles}
      <main class="shell">
        <section class="master" aria-label="虚拟卦师守简">
          <div class="portrait" aria-hidden="true">
            <span class="hat"></span><span class="face">守</span><span class="beard"></span>
          </div>
          <div>
            <p class="eyebrow">一问一掷 · 本机完成</p>
            <h1>守简</h1>
            <p>话不必说满，先把心里那一问放在案上。</p>
          </div>
        </section>
        <label for="question">此刻所问</label>
        <textarea id="question" maxlength="120" placeholder="例如：我该从哪一步开始？"></textarea>
        <button class="primary" type="button" data-cast>掷三钱六次</button>
        <p class="boundary">问题只留在当前页面，不上传、不保存。结果用于传统文化体验与自我整理，不替代医疗、法律、投资或现实决策。</p>
      </main>`;
  }

  renderReading(reading, question) {
    const lines = [...reading.lines].reverse().map((line, visualIndex) => {
      const originalIndex = 5 - visualIndex;
      const glyph = line.yang ? "━━━━━━" : "━━  ━━";
      return `<li class="line ${line.moving ? "moving" : ""}"><span>${glyph}</span><small>第${originalIndex + 1}爻 · ${lineText[line.value]}</small></li>`;
    }).join("");

    this.shadowRoot.innerHTML = `${styles}
      <main class="shell result" tabindex="-1" data-result>
        <section class="master compact" aria-label="虚拟卦师守简">
          <div class="portrait" aria-hidden="true"><span class="hat"></span><span class="face">守</span><span class="beard"></span></div>
          <div><p class="eyebrow">守简落签</p><h1>${escapeHtml(reading.primary.label)}</h1></div>
        </section>
        ${question ? `<blockquote>“${escapeHtml(question)}”</blockquote>` : ""}
        <ol class="hexagram" aria-label="六爻，自上而下显示">${lines}</ol>
        <p class="spoken">${escapeHtml(reading.prompt)}</p>
        <dl>
          <div><dt>下卦</dt><dd>${reading.primary.lower.name} · ${reading.primary.lower.image}</dd></div>
          <div><dt>上卦</dt><dd>${reading.primary.upper.name} · ${reading.primary.upper.image}</dd></div>
          <div><dt>动爻</dt><dd>${reading.movingLines.length ? reading.movingLines.join("、") : "无"}</dd></div>
        </dl>
        <button class="secondary" type="button" data-reset>收签再问</button>
        <p class="boundary">这是轻量娱乐性提示，不声称预测未来，也不建议据此作高风险决定。</p>
      </main>`;
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

const styles = `<style>
  :host { color-scheme: dark; display: block; font-family: "Noto Serif SC", "Songti SC", serif; }
  * { box-sizing: border-box; }
  .shell { width: min(100%, 540px); margin: auto; padding: 28px; color: #efe5cd; background: radial-gradient(circle at top right, #493525 0, #1b1816 44%, #11100f 100%); border: 1px solid #766044; border-radius: 24px; box-shadow: 0 24px 70px #0008; }
  .master { display: grid; grid-template-columns: 112px 1fr; gap: 20px; align-items: center; margin-bottom: 24px; }
  .master.compact { grid-template-columns: 78px 1fr; margin-bottom: 18px; }
  .portrait { position: relative; width: 104px; height: 118px; margin: auto; display: grid; place-items: center; }
  .compact .portrait { width: 74px; height: 84px; }
  .face { z-index: 2; display: grid; place-items: center; width: 72%; aspect-ratio: 1; border-radius: 48% 48% 45% 45%; color: #6b271d; background: #cfb083; border: 2px solid #8e6c49; font-weight: 800; }
  .hat { position: absolute; z-index: 3; top: 8%; width: 84%; height: 24%; background: #191919; border-radius: 50% 50% 12% 12%; border-bottom: 3px solid #9f3430; }
  .hat::after { content: ""; position: absolute; left: 12%; right: 12%; bottom: -7px; height: 7px; border-radius: 50%; background: #090909; }
  .beard { position: absolute; z-index: 1; bottom: 6%; width: 48%; height: 42%; background: linear-gradient(90deg, #bbb, #fff, #aaa); clip-path: polygon(16% 0, 84% 0, 100% 18%, 60% 100%, 42% 100%, 0 18%); }
  .eyebrow { margin: 0 0 5px; color: #bd9362; font: 600 12px/1.4 system-ui, sans-serif; letter-spacing: .18em; text-transform: uppercase; }
  h1 { margin: 0 0 8px; font-size: clamp(28px, 7vw, 42px); font-weight: 650; }
  p { line-height: 1.75; }
  label { display: block; margin-bottom: 8px; color: #d9bd91; font-weight: 700; }
  textarea { width: 100%; min-height: 110px; resize: vertical; padding: 14px 16px; color: #f3ead8; background: #0e0d0caa; border: 1px solid #6c5942; border-radius: 14px; font: inherit; line-height: 1.65; }
  textarea:focus, button:focus-visible, .result:focus { outline: 3px solid #d2a15b; outline-offset: 3px; }
  button { width: 100%; min-height: 48px; margin-top: 16px; border: 0; border-radius: 999px; font: 700 16px/1 system-ui, sans-serif; cursor: pointer; }
  .primary { color: #fff8e8; background: #8e332a; }
  .secondary { color: #2c2017; background: #d3b27f; }
  .boundary { margin: 16px 2px 0; color: #aa9d8d; font: 13px/1.7 system-ui, sans-serif; }
  blockquote { margin: 0 0 18px; padding: 12px 16px; color: #d9c39e; background: #ffffff09; border-left: 3px solid #913a30; }
  .hexagram { display: flex; flex-direction: column; gap: 6px; padding: 16px; margin: 0; list-style: none; background: #09080770; border-radius: 15px; }
  .line { display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: center; min-height: 30px; }
  .line span { color: #d2b782; font: 800 22px/1 monospace; letter-spacing: .03em; }
  .line small { color: #928778; font: 12px/1.4 system-ui, sans-serif; }
  .line.moving span, .line.moving small { color: #e5705e; }
  .spoken { padding: 18px; margin: 18px 0; color: #f6e8cc; background: linear-gradient(100deg, #782b231f, transparent); border: 1px solid #6e4c38; border-radius: 15px; font-size: 17px; }
  dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0; }
  dl div { padding: 10px; text-align: center; background: #ffffff08; border-radius: 10px; }
  dt { color: #9f917e; font: 12px/1.4 system-ui, sans-serif; }
  dd { margin: 4px 0 0; }
  @media (max-width: 440px) { .shell { padding: 20px; border-radius: 18px; } .master { grid-template-columns: 82px 1fr; } .portrait { width: 80px; height: 92px; } .line { grid-template-columns: 1fr; gap: 2px; } dl { grid-template-columns: 1fr; } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; } }
</style>`;

if (!customElements.get("shoujian-oracle")) {
  customElements.define("shoujian-oracle", ShoujianOracle);
}

