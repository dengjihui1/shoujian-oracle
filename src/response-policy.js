import { assessQuestion } from "./question-boundary.js";

const READING_FOLLOW_UP = /本卦|此卦|这卦|当前.{0,4}卦|卦象|卦辞|爻辞|动爻|变爻|之卦|变卦|上卦|下卦|彖传|象传|起卦|排卦|解卦|占断|原问|刚才的(?:卦|结果)|这个(?:卦|结果)|它.{0,8}(?:怎么理解|什么意思|和.{0,6}关系)/u;
const EXPLICIT_GENERAL_KNOWLEDGE = /《?说卦》?|(?:乾|坤|屯|蒙|需|讼|師|师|比|小畜|履|泰|否|同人|大有|谦|豫|随|蛊|临|观|噬嗑|贲|剥|复|无妄|大畜|颐|大过|坎|离|咸|恒|遁|大壮|晋|明夷|家人|睽|蹇|解|损|益|夬|姤|萃|升|困|井|革|鼎|震|艮|渐|归妹|丰|旅|巽|兑|涣|节|中孚|小过|既济|未济)卦/u;
const DEICTIC_READING_REFERENCE = /(?:本|此|这|当前|刚才|刚刚).{0,5}(?:卦|结果)|原问/u;
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
  const labels = [...new Set(assessment.issues.map(({ label }) => label))].join("、");
  const advisory = assessment.level === "advisory" ? `这属于${labels}类问卦，我会照常解卦，但只给观察角度。 ${DIVINATION_DISCLAIMER}` : "";
  return ["此问可以起卦。问题文字不会改变卦象；确认后再掷三钱六次。", advisory, notes].filter(Boolean).join(" ");
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
  const normalized = String(message).normalize("NFKC");
  if (EXPLICIT_GENERAL_KNOWLEDGE.test(normalized) && !DEICTIC_READING_REFERENCE.test(normalized)) return "chat";
  return READING_FOLLOW_UP.test(normalized) ? "divination" : "chat";
}
