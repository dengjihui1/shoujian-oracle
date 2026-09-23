import { buildChatInput, buildSystemInstruction, formatShanghaiDateTime } from "./prompt.mjs";
import { decideKnowledgeRoute, groundedUnavailableReply, isExplicitZhouyiQuery } from "./knowledge-routing.mjs";
import { assessQuestion } from "../src/question-boundary.js";
import { inferConversationPurpose, resolveResponsePolicy } from "../src/response-policy.js";
import { castHexagram } from "../src/oracle-engine.js";

const CHAT_STAGES = new Set(["question", "ready", "reading"]);
const CHAT_PURPOSES = new Set(["chat", "divination"]);

export function prepareChat(body, knowledgeBase, now = Date.now) {
  const message = cleanRequiredText(body?.message, 2_000, "对话内容");
  if (typeof knowledgeBase?.retrieve !== "function") throw new TypeError("knowledgeBase.retrieve is required");
  if (typeof now !== "function") throw new TypeError("now must be a function");

  const stage = CHAT_STAGES.has(body?.stage) ? body.stage : "question";
  const assessment = assessQuestion(message);
  const requestedPurpose = CHAT_PURPOSES.has(body?.purpose)
    ? body.purpose
    : inferConversationPurpose(message, stage);
  const policy = resolveResponsePolicy({ message, purpose: requestedPurpose, stage, assessment });
  const serverTime = formatShanghaiDateTime(now());
  if (policy.action === "respond") {
    return Object.freeze({
      response: policy.response,
      evidence: Object.freeze([]),
      purpose: policy.purpose,
      serverTime,
    });
  }

  const question = typeof body?.question === "string" ? body.question.slice(0, 500) : "";
  const reading = sanitizeReading(body?.reading);
  const history = sanitizeHistory(body?.history);
  const useReadingEvidence = policy.purpose === "divination";
  const candidates = knowledgeBase.retrieve({
    query: [message, useReadingEvidence ? question : ""].filter(Boolean).join("\n"),
    reading: useReadingEvidence ? reading : null,
    limit: 8,
  });
  const knowledgeRoute = decideKnowledgeRoute({ message, purpose: policy.purpose, evidence: candidates });
  const evidence = knowledgeRoute.evidence;
  if (!evidence.length && (isExplicitZhouyiQuery(message) || (useReadingEvidence && reading))) {
    return Object.freeze({
      response: Object.freeze({
        text: groundedUnavailableReply(policy.purpose),
        evidence: Object.freeze([]),
        grounded: false,
        groundingUnavailable: true,
        purpose: policy.purpose,
      }),
      evidence: Object.freeze([]),
      purpose: policy.purpose,
      serverTime,
    });
  }
  const route = knowledgeRoute.groundingRequested ? "grounded" : "fast";
  return Object.freeze({
    evidence,
    purpose: policy.purpose,
    serverTime,
    route,
    knowledgeReason: knowledgeRoute.reason,
    input: buildChatInput(message, history, { fixedQuestion: useReadingEvidence ? question : "" }),
    systemInstruction: buildSystemInstruction({
      stage,
      reading: useReadingEvidence ? reading : null,
      evidence,
      currentDateTime: serverTime,
    }),
  });
}

function sanitizeHistory(value) {
  return Array.isArray(value) ? value.slice(-16).map((item) => ({
    role: item?.role === "user" ? "user" : "master",
    text: String(item?.text ?? "").slice(0, 1_000),
  })) : [];
}

function sanitizeReading(value) {
  if (value == null) return null;
  try {
    return castHexagram(value.lines);
  } catch {
    throw requestError(400, "invalid_reading", "卦象数据无效，请重新起卦。");
  }
}

function cleanRequiredText(value, maxLength, label) {
  if (typeof value !== "string" || !value.trim()) throw requestError(400, "invalid_text", `${label}不能为空。`);
  const text = value.trim();
  if (text.length > maxLength) throw requestError(413, "text_too_long", `${label}过长。`);
  return text;
}

function requestError(status, code, message) {
  return Object.assign(new Error(message), { status, code, expose: true });
}
