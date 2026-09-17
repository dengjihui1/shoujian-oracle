const RULES = Object.freeze([
  { code: "immediate-harm", level: "blocked", label: "人身安危", pattern: /自杀|轻生|自残|杀人|伤害自己|伤害他人|下毒|纵火|绑架|报复/u, reply: "现实安全不能交给卦象决定；若有人正处于危险，请立即联系当地紧急服务或可信任的人。" },
  { code: "medical", level: "blocked", label: "医疗决定", pattern: /癌症|怀孕|流产|手术|吃药|停药|换药|诊断|病情|症状|治疗|医生|医院/u, reply: "卦象不能替代诊断或治疗，请把事实记录交给合格医疗人员。" },
  { code: "financial", level: "blocked", label: "投资博彩", pattern: /股票|基金|期货|虚拟币|彩票|赌博|下注|贷款|投资|买币|卖币|暴富/u, reply: "卦象不能承担资金损失或收益承诺，请先核对风险资料和损失上限。" },
  { code: "legal", level: "blocked", label: "法律结论", pattern: /诉讼|官司|判刑|定罪|起诉|仲裁|离婚判决|移民审批|签证能否/u, reply: "卦象不能替代法律意见或行政结果判断，请保留文件并咨询有资格的专业人员。" },
  { code: "privacy", level: "rewrite", label: "替人窥心", pattern: /(?:他|她|对方|前任|同事|老板|伴侣).{0,8}(?:想什么|爱不爱|出轨|秘密|骗我|真心)/u, reply: "他人的内心不能由卦象代为作证。请改问你自己能观察或采取的行动。" },
  { code: "unbounded", level: "rewrite", label: "问得无界", pattern: /一生命运|命运如何|一辈子|永远|注定|未来如何|以后会怎样|吉还是凶|吉凶/u, reply: "此问没有期限和可观察结果。请缩成一件具体、可行动的小事。" },
  { code: "compound", level: "rewrite", label: "一卦多问", pattern: /还是|以及|同时还|另外还|又想问|[?？].+[?？]/u, reply: "一张签里混了多件事。请每次只留下一个动作和一个问题。" }
]);

export function assessQuestion(question) {
  const normalized = question.normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
  const issues = RULES.filter((rule) => rule.pattern.test(normalized)).map(({ pattern: _pattern, ...issue }) => issue);
  const level = issues.some((issue) => issue.level === "blocked") ? "blocked" : issues.length ? "rewrite" : "clear";
  return Object.freeze({ level, issues: Object.freeze(issues), decisionRule: "公开字符规则；不联网、不调用模型、不推断隐藏意图。" });
}

