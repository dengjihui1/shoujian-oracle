import { castHexagram } from "./oracle-engine.js";

export const PERSISTED_MEMORY_MESSAGES = 24;
export const REQUEST_CONTEXT_MESSAGES = 16;
export const CONVERSATION_MEMORY_KEY = "shoujian-oracle:conversation:v1";

export class ConversationMemory {
  constructor({ storage = safeLocalStorage(), key = CONVERSATION_MEMORY_KEY, limit = PERSISTED_MEMORY_MESSAGES } = {}) {
    this.storage = storage;
    this.key = key;
    this.limit = limit;
  }

  load() {
    return this.loadSession().messages;
  }

  loadSession() {
    if (!this.storage) return emptySession();
    try {
      const stored = JSON.parse(this.storage.getItem(this.key) ?? "null");
      if (!Array.isArray(stored?.messages)) return emptySession();
      return {
        messages: sanitizeMessages(stored.messages, this.limit),
        ...restoreSession(stored.session),
      };
    } catch {
      return emptySession();
    }
  }

  save(messages) {
    return this.saveSession({ messages }).messages;
  }

  saveSession({ messages, stage = "question", question = "", reading = null } = {}) {
    const snapshot = {
      version: 2,
      messages: sanitizeMessages(messages, this.limit, { persistentOnly: true }),
      session: serializeSession({ stage, question, reading }),
    };
    if (this.storage) {
      try { this.storage.setItem(this.key, JSON.stringify(snapshot)); } catch { /* current-page state remains usable */ }
    }
    return { messages: snapshot.messages, ...restoreSession(snapshot.session) };
  }

  clear() {
    try { this.storage?.removeItem(this.key); } catch { /* unavailable storage is already effectively clear */ }
  }
}

function emptySession() {
  return { messages: [], stage: "question", question: "", reading: null };
}

function serializeSession({ stage, question, reading }) {
  const cleanQuestion = String(question ?? "").trim().slice(0, 500);
  const lines = Array.isArray(reading?.lines) && reading.lines.length === 6
    && reading.lines.every((line) => [6, 7, 8, 9].includes(line))
    ? [...reading.lines]
    : null;
  if (stage === "reading" && cleanQuestion && lines) return { stage, question: cleanQuestion, lines };
  if (stage === "ready" && cleanQuestion) return { stage, question: cleanQuestion, lines: null };
  return { stage: "question", question: "", lines: null };
}

function restoreSession(value) {
  const serialized = serializeSession({
    stage: value?.stage,
    question: value?.question,
    reading: value?.lines ? { lines: value.lines } : null,
  });
  if (serialized.stage !== "reading") return { stage: serialized.stage, question: serialized.question, reading: null };
  try {
    return { stage: "reading", question: serialized.question, reading: castHexagram(serialized.lines) };
  } catch {
    return { stage: "question", question: "", reading: null };
  }
}

export function recentConversation(messages, limit = REQUEST_CONTEXT_MESSAGES) {
  return sanitizeMessages(messages, limit, { persistentOnly: true });
}

function sanitizeMessages(messages, limit, { persistentOnly = false } = {}) {
  if (!Array.isArray(messages)) return [];
  const normalized = messages.map((message) => ({
      role: message?.role === "user" ? "user" : "master",
      text: String(message?.text ?? "").slice(0, 2_000),
      cloud: Boolean(message?.cloud),
      evidence: Array.isArray(message?.evidence) ? message.evidence.slice(0, 8) : [],
      incomplete: Boolean(message?.streaming || message?.error || message?.cancelled),
    }));
  const selected = persistentOnly ? completedMessages(normalized) : normalized.filter(({ text }) => text);
  return selected.slice(-limit).map(({ incomplete: _incomplete, ...message }) => message);
}

function completedMessages(messages) {
  const completed = [];
  let pendingUser = null;
  for (const message of messages) {
    if (!message.text || message.incomplete) continue;
    if (message.role === "user") {
      pendingUser = message;
      continue;
    }
    if (pendingUser) {
      completed.push(pendingUser);
      pendingUser = null;
    }
    completed.push(message);
  }
  return completed;
}

function safeLocalStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
