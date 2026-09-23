import test from "node:test";
import assert from "node:assert/strict";
import { clientFingerprint, createJsonLogger, redactLogDetails } from "../server/observability.mjs";

test("structured logs redact user content and credentials recursively", () => {
  const redacted = redactLogDetails({
    requestId: "req-1",
    message: "private question",
    nested: { apiKey: "secret", status: 200 },
  });
  assert.deepEqual(redacted, {
    requestId: "req-1",
    message: "[REDACTED]",
    nested: { apiKey: "[REDACTED]", status: 200 },
  });
});

test("JSON logger writes bounded machine-readable records", () => {
  let line = "";
  const logger = createJsonLogger({ write: (value) => { line += value; }, now: () => Date.parse("2026-09-23T04:00:00.000Z") });
  logger.info("http_request", { path: "/api/chat", body: "private", status: 200 });
  assert.deepEqual(JSON.parse(line), {
    timestamp: "2026-09-23T04:00:00.000Z",
    level: "info",
    event: "http_request",
    path: "/api/chat",
    body: "[REDACTED]",
    status: 200,
  });
});

test("client fingerprints are stable only when a deployment salt is configured", () => {
  assert.equal(clientFingerprint("203.0.113.8", ""), null);
  assert.equal(clientFingerprint("203.0.113.8", "deployment-secret"), clientFingerprint("203.0.113.8", "deployment-secret"));
  assert.notEqual(clientFingerprint("203.0.113.8", "deployment-secret"), clientFingerprint("203.0.113.9", "deployment-secret"));
});
