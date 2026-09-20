import { assessQuestion } from "./question-boundary.js";

const DIVINATION_ALTERNATIVES = Object.freeze({
  financial: {
    direct: "你仍可直接问我：该从哪些维度核对这项资金决策的风险？",
    reframe: "若想继续起卦，可改问：未来三天，我该先核对这项决策中的哪类风险信息？",
  },
  medical: {
    direct: "你仍可直接问我：就诊前该整理哪些症状、用药和检查信息？",
    reframe: "若想继续起卦，可改问：这三天，我该先整理哪项信息去和医生沟通？",
  },
  legal: {
    direct: "你仍可直接问我：咨询专业人士前，该整理哪些文件、时间线和问题？",
    reframe: "若想继续起卦，可改问：这三天，我该先补齐哪项可核实的材料？",
  },
  privacy: {
    direct: "你可以直接和我梳理已经发生、能够核实的事实。",
    reframe: "若想继续起卦，可改问：未来七天，我该观察什么事实来判断这段关系是否值得继续投入？",
  },
  unbounded: {
    direct: "你也可以先告诉我眼下最困扰你的那一件事，我会陪你拆小。",
    reframe: "可改成：未来七天，我该先验证哪一件具体的事？",
  },
  compound: {
    direct: "你也可以把几个选项直接列出来，我先帮你拆分比较维度。",
    reframe: "若想继续起卦，请只保留一个动作、一个短期限和一个可观察问题。",
  },
});

const READING_FOLLOW_UP = /本卦|此卦|这卦|卦象|卦辞|爻辞|动爻|变爻|之卦|变卦|上卦|下卦|彖传|象传|说卦|起卦|排卦|解卦|占断|原问|刚才的(?:卦|结果)|这个(?:卦|结果)|它.{0,8}(?:怎么理解|什么意思|和.{0,6}关系)/u;

export function crisisSupportReply() {
  return [
    "这件事先不谈起卦。若当事人正面临立即危险，先远离可能造成伤害的物品或地点，去有其他人在场的安全处；在中国大陆请立即拨打 110 或 120，或直接前往最近的急诊。",
    "不要让当事人独处，尽快联系一位能马上到场的可信任的人。现在先确认两件事：是否已经有具体计划、工具或正在实施，以及身边是否有人能立刻陪同。若有任何一项是“有”，请马上呼叫紧急援助。",
  ].join("\n\n");
}

export function divinationBoundaryReply(assessment) {
  if (assessment.level === "clear") return "此问可收。问题文字不会改变卦象；确认后再掷三钱六次。";

  const immediateDanger = assessment.issues.some(({ code }) => code === "immediate-harm");
  if (immediateDanger) return `人身安全不能交给卦象决定。\n\n${crisisSupportReply()}`;

  const prefix = assessment.level === "blocked"
    ? "这一问不能由卦象替你作现实决定。"
    : "这一问可以继续，但要先收窄。";
  const reasons = assessment.issues.map(({ reply }) => reply).join(" ");
  const alternatives = unique(assessment.issues.flatMap(({ code }) => {
    const option = DIVINATION_ALTERNATIVES[code];
    return option ? [option.direct, option.reframe] : [];
  })).join(" ");

  return [prefix, reasons, alternatives].filter(Boolean).join(" ");
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

  if (divinationMode && assessment.level !== "clear") {
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

export function inferConversationPurpose(message, stage = "question") {
  if (stage === "ready") return "divination";
  if (stage !== "reading") return "chat";
  return READING_FOLLOW_UP.test(String(message).normalize("NFKC")) ? "divination" : "chat";
}

function unique(values) {
  return [...new Set(values)];
}
