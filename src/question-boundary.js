const RULES = Object.freeze([
  { code: "immediate-harm", level: "blocked", label: "人身安危", pattern: /自杀|轻生|自残|杀人|伤害自己|伤害他人|下毒|纵火|绑架|报复/u, reply: "现实安全不能交给卦象决定；若有人正处于危险，请立即联系当地紧急服务或可信任的人。" },
  { code: "medical", level: "advisory", label: "健康医疗", pattern: /癌症|怀孕|流产|手术|吃药|停药|换药|诊断|病情|症状|治疗|医生|医院/u, reply: "可以照常起卦；卦象只作文化参考，诊疗和用药仍以合格医疗人员意见为准。" },
  { code: "financial", level: "advisory", label: "投资资金", pattern: /股票|基金|期货|虚拟币|彩票|赌博|下注|贷款|投资|买币|卖币|暴富/u, reply: "可以照常起卦；卦象不承诺涨跌或收益，现实决定仍需核对风险资料与损失上限。" },
  { code: "business", level: "advisory", label: "生意经营", pattern: /生意|创业|开店|经营|客户|订单|报价|合伙|合作|合同|项目回款|现金流/u, reply: "可以照常起卦；解释只提供观察角度，经营结果仍要结合市场、合同、现金流和可验证信息。" },
  { code: "legal", level: "advisory", label: "法律事务", pattern: /诉讼|官司|判刑|定罪|起诉|仲裁|离婚判决|移民审批|签证能否/u, reply: "可以照常起卦；卦象不代替法律意见或行政结论，重要行动仍应核对文件并咨询合格专业人员。" },
  { code: "privacy", level: "advisory", label: "他人内心", pattern: /(?:他|她|对方|前任|同事|老板|伴侣).{0,8}(?:想什么|爱不爱|出轨|秘密|骗我|真心)/u, reply: "可以照常起卦；解释只映照你的观察与选择，不把卦象当成对方真实内心的证据。" },
  { code: "unbounded", level: "advisory", label: "长期宽问", pattern: /一生命运|命运如何|一辈子|永远|注定|未来如何|以后会怎样|吉还是凶|吉凶/u, reply: "可以照常起卦；问题跨度较大时，解释会保持概括，不宣称确定命运或应期。" },
  { code: "compound", level: "advisory", label: "一卦多问", pattern: /还是|以及|同时还|另外还|又想问|[?？].+[?？]/u, reply: "可以照常起卦；多个问题会分别对照卦象，不强行合成一个确定结论。" }
]);

export function assessQuestion(question) {
  const normalized = question.normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
  const issues = RULES.filter((rule) => rule.pattern.test(normalized)).map(({ pattern: _pattern, ...issue }) => issue);
  const level = issues.some((issue) => issue.level === "blocked") ? "blocked" : issues.length ? "advisory" : "clear";
  return Object.freeze({ level, issues: Object.freeze(issues), decisionRule: "公开字符规则；只对即时人身危险停止起卦，其余主题仅添加参考提示。" });
}
