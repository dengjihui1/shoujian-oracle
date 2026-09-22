export const MAX_INTAKE_QUESTIONS = 4;

const SIGNALS = Object.freeze({
  timeframe: /今天|明天|后天|本周|下周|本月|下月|今年|明年|未来|接下来|近期|短期|长期|\d+\s*(?:天|周|个?月|年)|[一二两三四五六七八九十]+(?:天|周|个?月|年)/u,
  options: /要不要|是否|该不该|能不能|可不可以|还是|继续|暂停|停止|放弃|接受|拒绝|留下|离开|辞职|入职|两个|二选一|offer/u,
  context: /已经|目前|现在|现状|进展|持续|投入|发生|拿到|收到|正在|尚未|没有|有了|卡在/u,
  constraint: /预算|资金|现金流|期限|时间不够|合同|家人|健康|风险|损失|不能|必须|担心|顾虑|限制|底线/u,
});

const CORE_QUESTION_BANK = Object.freeze([
  Object.freeze({ id: "timeframe", label: "观察时间", prompt: "你希望这一卦主要观察到什么时候？例如未来 7 天、3 个月，或某个明确节点。" }),
  Object.freeze({ id: "options", label: "当前选项", prompt: "你现在真正能选的路径有哪些？没有明确选项，也可以说“只看当前趋势”。" }),
  Object.freeze({ id: "context", label: "已知事实", prompt: "这件事目前已经发生了什么？只说你能确认的事实，不用猜别人心里怎么想。" }),
  Object.freeze({ id: "constraint", label: "关键约束", prompt: "眼下最不能忽略的现实约束是什么？例如时间、钱、关系、健康或退出成本。" }),
]);
const SUPPLEMENTAL_QUESTIONS = Object.freeze([
  Object.freeze({ id: "priority", label: "判断标准", prompt: "这次你最想看清的判断标准是什么？例如风险、成长、关系稳定或是否值得继续投入。" }),
  Object.freeze({ id: "uncertainty", label: "最大疑点", prompt: "即使已知条件不少，现在仍让你最拿不准的一点是什么？" }),
]);
const QUESTION_BANK = Object.freeze([...CORE_QUESTION_BANK, ...SUPPLEMENTAL_QUESTIONS]);

export function createDivinationIntake(question) {
  const originalQuestion = clean(question, 500);
  if (!originalQuestion) throw new TypeError("问卦原问不能为空");
  let questions = CORE_QUESTION_BANK.filter(({ id }) => !SIGNALS[id].test(originalQuestion));
  if (questions.length < 2) {
    questions = [...questions, ...SUPPLEMENTAL_QUESTIONS].slice(0, 2);
  }
  return freezeIntake({
    version: 1,
    originalQuestion,
    questions: questions.slice(0, MAX_INTAKE_QUESTIONS),
    answers: {},
    skipped: [],
    cursor: 0,
    status: "collecting",
    summary: "",
  });
}

export function currentIntakeQuestion(intake) {
  const restored = restoreDivinationIntake(intake);
  return restored?.status === "collecting" ? restored.questions[restored.cursor] ?? null : null;
}

export function answerIntakeQuestion(intake, answer) {
  const restored = requiredIntake(intake, "collecting");
  const question = restored.questions[restored.cursor];
  const text = clean(answer, 180);
  if (!question || !text) return restored;
  return advance(restored, {
    answers: { ...restored.answers, [question.id]: text },
    skipped: restored.skipped.filter((id) => id !== question.id),
  });
}

export function skipIntakeQuestion(intake) {
  const restored = requiredIntake(intake, "collecting");
  const question = restored.questions[restored.cursor];
  if (!question) return prepareIntakeReview(restored);
  return advance(restored, { skipped: [...new Set([...restored.skipped, question.id])] });
}

export function prepareIntakeReview(intake) {
  const restored = requiredIntake(intake);
  return freezeIntake({ ...restored, status: "review", summary: buildIntakeSummary(restored) });
}

export function confirmIntakeSummary(intake, editedSummary) {
  const restored = requiredIntake(intake, "review");
  const summary = clean(editedSummary || restored.summary, 500);
  if (!summary) throw new TypeError("问卦摘要不能为空");
  return freezeIntake({ ...restored, status: "confirmed", summary });
}

export function buildIntakeSummary(intake) {
  const restored = requiredIntake(intake);
  const lines = [`所问：${restored.originalQuestion}`];
  for (const question of restored.questions) {
    lines.push(`${question.label}：${restored.answers[question.id] || "未补充（解读保持概括）"}`);
  }
  return clean(lines.join("\n"), 500);
}

export function serializeDivinationIntake(intake) {
  const restored = restoreDivinationIntake(intake);
  if (!restored) return null;
  return {
    version: 1,
    originalQuestion: restored.originalQuestion,
    questions: restored.questions.map(({ id, label, prompt }) => ({ id, label, prompt })),
    answers: { ...restored.answers },
    skipped: [...restored.skipped],
    cursor: restored.cursor,
    status: restored.status,
    summary: restored.summary,
  };
}

export function restoreDivinationIntake(value) {
  if (!value || typeof value !== "object") return null;
  const originalQuestion = clean(value.originalQuestion, 500);
  const questions = Array.isArray(value.questions)
    ? value.questions.slice(0, MAX_INTAKE_QUESTIONS).map((item) => ({
      id: QUESTION_BANK.some(({ id }) => id === item?.id) ? item.id : "",
      label: clean(item?.label, 24),
      prompt: clean(item?.prompt, 180),
    })).filter(({ id, label, prompt }) => id && label && prompt)
    : [];
  if (!originalQuestion || questions.length === 0) return null;
  const answers = Object.fromEntries(questions.flatMap(({ id }) => {
    const answer = clean(value.answers?.[id], 180);
    return answer ? [[id, answer]] : [];
  }));
  const skipped = Array.isArray(value.skipped)
    ? [...new Set(value.skipped.filter((id) => questions.some((question) => question.id === id)))]
    : [];
  const status = ["collecting", "review", "confirmed"].includes(value.status) ? value.status : "collecting";
  const cursor = Math.max(0, Math.min(Number.isInteger(value.cursor) ? value.cursor : 0, questions.length));
  const summary = status === "collecting" ? "" : clean(value.summary, 500);
  return freezeIntake({ version: 1, originalQuestion, questions, answers, skipped, cursor, status, summary });
}

function advance(intake, changes) {
  const cursor = intake.cursor + 1;
  const next = freezeIntake({ ...intake, ...changes, cursor });
  return cursor >= next.questions.length ? prepareIntakeReview(next) : next;
}

function requiredIntake(value, expectedStatus = null) {
  const restored = restoreDivinationIntake(value);
  if (!restored) throw new TypeError("问卦访谈状态无效");
  if (expectedStatus && restored.status !== expectedStatus) throw new TypeError(`问卦访谈必须处于 ${expectedStatus} 状态`);
  return restored;
}

function freezeIntake(value) {
  return Object.freeze({
    ...value,
    questions: Object.freeze(value.questions.map((question) => Object.freeze({ ...question }))),
    answers: Object.freeze({ ...value.answers }),
    skipped: Object.freeze([...value.skipped]),
  });
}

function clean(value, maxLength) {
  return String(value ?? "").trim().replace(/\r\n?/gu, "\n").slice(0, maxLength);
}
