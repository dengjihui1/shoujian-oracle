const STEMS = "甲乙丙丁戊己庚辛壬癸";
const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const CYCLE = new Set(Array.from({ length: 60 }, (_, index) => STEMS[index % 10] + BRANCHES[index % 12]));

export function sanitizeBirthContext(body) {
  if (body?.birthConsent !== true || body?.birthContext == null) return null;
  const value = body.birthContext;
  if (value.version !== 1 || value.convention !== "beijing-midnight-v1" || !Array.isArray(value.pillars) || value.pillars.length !== 4
    || value.pillars.some((pillar) => pillar !== null && !CYCLE.has(pillar)) || !value.pillars[2]) {
    throw Object.assign(new Error("生辰参照格式无效，请在本机重新排盘。"), { status: 400, code: "invalid_birth_context", expose: true });
  }
  return Object.freeze({ pillars: Object.freeze([...value.pillars]), convention: "beijing-midnight-v1" });
}

export function birthContextInstruction(context) {
  if (!context) return "";
  return `用户主动同意附加的本机生辰参照：${context.pillars.map((pillar, index) => `${["年", "月", "日", "时"][index]}柱${pillar ?? "待定"}`).join("，")}。使用北京时间、立春换年、节气换月、午夜换日口径，未校正真太阳时或历史夏令时。未知项不得补造。仅在用户询问生辰，或明确结合生辰解读时使用。四柱来自客户端历法计算，未由服务端核验原始生日；它独立于三钱卦象，不能改变排卦或预测个人性格、健康、婚姻、财富。当前没有八字古籍检索库，只能解释四柱记法、术语和局限，不得冒称八字经典出处、算喜用神或从五行计数断吉凶。日常对话不要主动复述这些私人信息。`;
}
