import test from "node:test";
import assert from "node:assert/strict";
import { checkProductionEnvironment } from "../scripts/preflight.mjs";

test("production preflight rejects incomplete settings without printing secrets", () => {
  const findings = checkProductionEnvironment({ GEMINI_API_KEY: "secret-marker", LOG_HASH_SALT: "secret-salt" });
  assert.ok(findings.length >= 8);
  assert.doesNotMatch(findings.join("\n"), /secret-marker|secret-salt/u);
});

test("production preflight accepts bounded invited-pilot settings", () => {
  const env = { GEMINI_API_KEY: "test-not-real", PUBLIC_CONTACT: "support@pilot.invalid", DOMAIN: "pilot.invalid", LOG_HASH_SALT: "a".repeat(40), RATE_LIMIT_HASH_SALT: "b".repeat(40), REDIS_URL: "redis://redis:6379", MONTHLY_BUDGET_UNITS: "1000", MAX_CONCURRENT_UPSTREAM: "4", STRUCTURED_LOGS: "true", TRUST_PROXY: "true", PAID_AUDIO_ENABLED: "false" };
  assert.ok(checkProductionEnvironment(env).some((item) => item.includes("NODE_ENV")));
  env.NODE_ENV = "production";
  assert.deepEqual(checkProductionEnvironment(env), []);
  assert.ok(checkProductionEnvironment({ ...env, MONTHLY_BUDGET_UNITS: "0" }).some((item) => item.includes("关闭保护")));
});
