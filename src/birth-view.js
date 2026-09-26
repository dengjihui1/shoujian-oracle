import { escapeHtml } from "./html.js";

export function birthPanel(state, locked) {
  const draft = state.birthDraft ?? {};
  const chart = state.birthChart;
  return `<details class="birth-drawer" data-drawer="birth"><summary><span>生辰参照</span><small>${chart ? "已排盘 · 点击查看" : "可选 · 不填也能问卦"}</small></summary>
    <div class="birth-intro"><h2>把来时的时光，放进参照。</h2><p>生辰四柱与三钱起卦分别计算。先在本机排盘，你决定是否带入之后的解读。</p></div>
    <form data-birth-form>
      <div class="birth-fields"><label for="birth-calendar">历法<select id="birth-calendar" data-birth-field="calendar" ${locked ? "disabled" : ""}><option value="solar" ${draft.calendar !== "lunar" ? "selected" : ""}>公历（阳历）</option><option value="lunar" ${draft.calendar === "lunar" ? "selected" : ""}>农历（阴历）</option></select></label>
      <label for="birth-date">出生日期<input id="birth-date" data-birth-field="date" type="${draft.calendar === "lunar" ? "text" : "date"}" placeholder="如 1990-06-15" value="${escapeHtml(draft.date)}" required ${locked ? "disabled" : ""}></label>
      <label for="birth-time">出生时刻 · 可留空<input id="birth-time" data-birth-field="time" type="time" value="${escapeHtml(draft.time)}" ${locked ? "disabled" : ""}></label></div>
      ${draft.calendar === "lunar" ? `<label class="check-label"><input type="checkbox" data-birth-field="leapMonth" ${draft.leapMonth ? "checked" : ""} ${locked ? "disabled" : ""}>这是闰月（请以出生记录为准）</label>` : ""}
      <p class="birth-note">仅支持按北京时间（UTC+8）填写，1900 年起；境外时间须先换算。未校正真太阳时或历史夏令时，交界时刻请核对。原始生日仅留在本页内存，刷新后清除。</p>
      <button type="submit" class="primary" ${locked || state.birthCalculating ? "disabled" : ""}>${state.birthCalculating ? "正在排盘…" : "在本机排盘"}</button>
    </form>
    ${state.birthError ? `<p class="birth-error" role="alert">${escapeHtml(state.birthError)}</p>` : ""}
    ${chart ? `<section class="birth-result" aria-label="生辰四柱结果"><div class="birth-result-heading"><strong>四柱参照</strong><small>${escapeHtml(chart.solarDate)} · ${escapeHtml(chart.lunarDate)}</small></div>
      <dl class="pillars">${chart.pillars.map((pillar, index) => `<div><dt>${["年柱", "月柱", "日柱", "时柱"][index]}</dt><dd>${pillar ? escapeHtml(pillar) : "待定"}</dd></div>`).join("")}</dl>
      <p>把四柱理解为出生时刻的一种传统历法记法：年、月、日、时各用两个字表示。${chart.dayMaster ? `日柱的第一个字是“${escapeHtml(chart.dayMaster)}”，传统称“日主”。` : ""}它不证明你的性格或命运。</p>
      <div class="element-counts" aria-label="已知干支的表层五行计数">${Object.entries(chart.counts).map(([name, count]) => `<span>${name}<b>${count}</b></span>`).join("")}</div>
      <small>只数已知干支表层五行，未计藏干、季节和强弱。零次不等于“缺”，不能据此判断喜忌、健康或运势。</small>
      ${chart.warnings.map((warning) => `<p class="birth-note">${escapeHtml(warning)}</p>`).join("")}
      <p class="birth-note">${escapeHtml(chart.convention)}</p>
      <label class="check-label consent-label"><input id="birth-consent" type="checkbox" data-birth-consent ${state.birthShare ? "checked" : ""} ${locked ? "disabled" : ""}>同意把四柱符号用于后续 AI 解读（不发送原始生日和时刻）。</label><small>可随时关闭。四柱仍属于个人信息；已生成的解说会进入本机聊天记录。未经你开启，不发送四柱。</small>
      <button type="button" class="text-button" data-action="clear-birth" ${locked ? "disabled" : ""}>清除生辰参照</button>
    </section>` : ""}
  </details>`;
}
