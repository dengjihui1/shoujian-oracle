const EXPLICIT_ZHOUYI_QUERY = /周易|易经|易傳|易传|说卦|繫辭|系辞|彖傳|彖传|象傳|象传|卦辞|爻辞|六十四卦|八卦|本卦|此卦|这卦|卦象|动爻|變爻|变爻|之卦|變卦|变卦|上卦|下卦|占卦|起卦|解卦|[初上][六九]|[六九][二三四五]/u;
const STRONG_MATCH_REASONS = new Set(["本卦", "动爻", "之卦", "上下卦", "明示爻位", "明示卦义", "说卦取象", "明示名词"]);
const MIN_STRONG_LEXICAL_SCORE = 24;

export function isExplicitZhouyiQuery(message) {
  return EXPLICIT_ZHOUYI_QUERY.test(String(message ?? "").normalize("NFKC"));
}

export function decideKnowledgeRoute({ message = "", purpose = "chat", evidence = [] } = {}) {
  const candidates = Array.isArray(evidence) ? evidence : [];
  const strongest = candidates.reduce((maximum, item) => Math.max(maximum, Number(item?.matchScore) || 0), 0);
  const strongReason = candidates.some((item) => item?.matchedBy?.some((reason) => STRONG_MATCH_REASONS.has(reason)));
  const groundingRequested = purpose === "divination"
    || isExplicitZhouyiQuery(message)
    || strongReason
    || strongest >= MIN_STRONG_LEXICAL_SCORE;
  return Object.freeze({
    groundingRequested,
    evidence: groundingRequested ? candidates : [],
    reason: purpose === "divination" ? "divination" : isExplicitZhouyiQuery(message) ? "explicit-zhouyi" : strongReason || strongest >= MIN_STRONG_LEXICAL_SCORE ? "strong-retrieval" : "ordinary-chat",
  });
}

export function citationRepairInstruction(evidence) {
  const allowed = evidence.map(({ id }) => `【${id}】`).join("、");
  return [
    "上一次草稿没有满足引用约束，请重新完整回答，不要解释修复过程。",
    `凡涉及经传原文、卦爻含义或取象的判断，必须在相应句末标注本轮允许的证据编号：${allowed}。`,
    "不得使用列表之外的编号；无法由证据支持的具体古籍结论应明确省略。",
  ].join("\n");
}

export function groundedUnavailableReply(purpose = "chat") {
  const base = "这轮我没能把经传依据核对完整，先不拿没有出处的话搪塞你。可以换一种问法，或稍后再试一次。";
  return purpose === "divination"
    ? `${base}\n\n卦象仅供传统文化体验与自我反思参考，不作为现实决定的唯一依据。`
    : base;
}
