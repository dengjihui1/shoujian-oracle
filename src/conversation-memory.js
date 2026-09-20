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
    if (!this.storage) return [];
    try {
      const stored = JSON.parse(this.storage.getItem(this.key) ?? "null");
      if (!Array.isArray(stored?.messages)) return [];
      return sanitizeMessages(stored.messages, this.limit);
    } catch {
      return [];
    }
  }

  save(messages) {
    const sanitized = sanitizeMessages(messages, this.limit, { persistentOnly: true });
    if (!this.storage) return sanitized;
    try { this.storage.setItem(this.key, JSON.stringify({ version: 1, messages: sanitized })); } catch { /* current-page state remains usable */ }
    return sanitized;
  }

  clear() {
    try { this.storage?.removeItem(this.key); } catch { /* unavailable storage is already effectively clear */ }
  }
}

export function recentConversation(messages, limit = REQUEST_CONTEXT_MESSAGES) {
  return sanitizeMessages(messages, limit, { persistentOnly: true });
}

function sanitizeMessages(messages, limit, { persistentOnly = false } = {}) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => !persistentOnly || (message?.text && !message.streaming && !message.error && !message.cancelled))
    .slice(-limit)
    .map((message) => ({
      role: message?.role === "user" ? "user" : "master",
      text: String(message?.text ?? "").slice(0, 2_000),
      cloud: Boolean(message?.cloud),
      evidence: Array.isArray(message?.evidence) ? message.evidence.slice(0, 8) : [],
    }))
    .filter(({ text }) => text);
}

function safeLocalStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

