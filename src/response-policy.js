import { assessQuestion } from "./question-boundary.js";

const READING_FOLLOW_UP = /本卦|此卦|这卦|卦象|卦辞|爻辞|动爻|变爻|之卦|变卦|上卦|下卦|彖传|象传|说卦|起卦|排卦|解卦|占断|原问|刚才的(?:卦|结果)|这个(?:卦|结果)|它.{0,8}(?:怎么理解|什么意思|和.{0,6}关系)/u;
export const DIVINATION_DISCLAIMER = "卦象仅供传统文化体验与自我反思参考，不作为投资、医疗、法律或其他现实决定的唯一依据。";

export function crisisSupportReply() {
  return [
    "这件事先不谈起卦。若当事人正面临立即危险，先远离可能造成伤害的物品或地点，去有其他人在场的安全处；在中国大陆请立即拨打 110 或 120，或直接前往最近的急诊。",
    "不要让当事人独处，尽快联系一位能马上到场的可信任的人。现在先确认两件事：是否已经有具体计划、工具或正在实施，以及身边是否有人能立刻陪同。若有任何一项是“有”，请马上呼叫紧急援助。",
  ].join("\n\n");
}

export function divinationBoundaryReply(assessment) {
  const immediateDanger = assessment.issues.some(({ code }) => code === "immediate-harm");
  if (immediateDanger) return `人身安全不能交给卦象决定。\n\n${crisisSupportReply()}`;
  const notes = assessment.issues.map(({ reply }) => reply).join(" ");
  return ["此问可以起卦。问题文字不会改变卦象；确认后再掷三钱六次。", assessment.level === "advisory" ? DIVINATION_DISCLAIMER : "", notes].filter(Boolean).join(" ");
}

export function resolveResponsePolicy({ message, purpose = "chat", stage = "question", assessment = assessQuestion(message) }) {
  const divinationMode = stage === "ready" || purpose === "divination";
  const immediateDanger = assessment.issues.some(({ code }) => code === "immediate-harm");

  if (!divinationMode && immediateDanger) {
    return Object.freeze({
      action: "respond",
      kind: "crisis-support",
      purpose: "chat",
      response: Object.freeze({ text: crisisSupportReply(), handled: true, safety: "crisis-support" }),
    });
  }

  if (divinationMode && assessment.level === "blocked") {
    return Object.freeze({
      action: "respond",
      kind: "divination-boundary",
      purpose: "divination",
      response: Object.freeze({ text: divinationBoundaryReply(assessment), blocked: true, safety: "divination-boundary" }),
    });
  }

  return Object.freeze({
    action: "allow",
    kind: divinationMode ? "divination" : "chat",
    purpose: divinationMode ? "divination" : "chat",
    response: null,
  });
}

export function withDivinationDisclaimer(text, purpose) {
  const clean = String(text ?? "").trim();
  if (purpose !== "divination" || !clean || /仅供.{0,20}参考/u.test(clean)) return clean;
  return `${clean}\n\n${DIVINATION_DISCLAIMER}`;
}

export function inferConversationPurpose(message, stage = "question") {
  if (stage === "ready") return "divination";
  if (stage !== "reading") return "chat";
  return READING_FOLLOW_UP.test(String(message).normalize("NFKC")) ? "divination" : "chat";
}
