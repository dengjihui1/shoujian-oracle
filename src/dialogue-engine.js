import { divinationBoundaryReply } from "./response-policy.js";

const INTENTS = Object.freeze([
  { id: "restart", pattern: /再问|重来|重新|换一个问题/u }, { id: "moving", pattern: /动爻|哪一爻|变化/u },
  { id: "method", pattern: /怎么算|怎么起|依据|来源|随机/u }, { id: "boundary", pattern: /边界|不能问|风险|注意什么/u },
  { id: "meaning", pattern: /什么意思|怎么看|怎么理解|解释|然后呢/u }, { id: "help", pattern: /怎么问|不会问|例子|帮助/u }
]);

export function detectIntent(text) {
  return INTENTS.find((intent) => intent.pattern.test(text))?.id ?? "unknown";
}

export const welcomeReply = () => "先随意坐。你可以问我是谁、会做什么，也可以聊《周易》和日常困惑；真想起卦时，再把一件具体的事交给我。";

export function boundaryReply(assessment) {
  return divinationBoundaryReply(assessment);
}

export function readingReply(reading) {
  const change = reading.changed ? `，${reading.movingLines.join("、")}爻动，之卦为${reading.changed.fullName}` : "，此卦无动爻";
  return `本卦第${reading.primary.number}卦：${reading.primary.fullName}${change}。先取下卦之意：${reading.primary.lower.cue}。卦象仅供传统文化体验与自我反思参考，不替你决定现实行动。`;
}

export function followUpReply(text, reading) {
  const intent = detectIntent(text);
  if (intent === "restart") return { action: "restart", text: "旧签到此收起。请另留一件具体的小事。" };
  if (intent === "moving") return { action: "reply", text: reading.movingLines.length ? `动爻在第 ${reading.movingLines.join("、")} 爻。这里只把它视为结构中的变化位置，不推成具体吉凶或应期。` : "此卦没有动爻，所以不另立变卦；先观察本卦上下两层的关系。" };
  if (intent === "method") return { action: "reply", text: `浏览器用本机密码学随机源模拟三钱六掷，再按固定表机械排卦。${reading.auditTrail.join("；")}。问题文字不参与计算。` };
  if (intent === "boundary") return { action: "reply", text: "我只谈结构、变化位置和可撤回的小行动；不替你做医疗、法律、投资、人身安全或他人隐私判断，也不保证预测未来。" };
  if (intent === "meaning") return { action: "reply", text: `上卦${reading.primary.upper.name}为${reading.primary.upper.image}，下卦${reading.primary.lower.name}为${reading.primary.lower.image}。可先问自己：${reading.primary.upper.cue}；再做一件事：${reading.primary.lower.cue}。` };
  if (intent === "help") return { action: "reply", text: "问法尽量包含：你自己、一个动作、一个短期限。例如：‘未来三天，我该先验证方案中的哪一处？’" };
  return { action: "reply", text: "这句我没有可靠的固定答法。你可以问我：‘什么意思’、‘动爻怎么看’、‘怎么算的’或‘边界是什么’。" };
}
