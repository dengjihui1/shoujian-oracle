import { createHmac, randomUUID } from "node:crypto";

const SENSITIVE_KEY = /authorization|cookie|api.?key|secret|token|password|prompt|message|text|body|audio/iu;

export function createJsonLogger({ write = (line) => process.stdout.write(line), now = Date.now } = {}) {
  return Object.freeze({
    info(event, details = {}) {
      const record = {
        timestamp: new Date(now()).toISOString(),
        level: "info",
        event: String(event ?? "event").slice(0, 64),
        ...redactLogDetails(details),
      };
      write(`${JSON.stringify(record)}\n`);
    },
  });
}

export function redactLogDetails(value, key = "") {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redactLogDetails(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 40).map(([childKey, childValue]) => [childKey, redactLogDetails(childValue, childKey)]));
  }
  if (typeof value === "string") return value.slice(0, 256);
  return value;
}

export function clientFingerprint(address, salt) {
  if (!salt) return null;
  return createHmac("sha256", salt).update(String(address ?? "unknown")).digest("hex").slice(0, 16);
}

export function requestId() {
  return randomUUID();
}
