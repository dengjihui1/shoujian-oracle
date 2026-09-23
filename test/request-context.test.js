import test from "node:test";
import assert from "node:assert/strict";
import { enabledByEnvironment, normalizeAddress, resolveClientAddress } from "../server/request-context.mjs";

test("proxy headers are ignored unless the deployment explicitly trusts its proxy", () => {
  const request = { socket: { remoteAddress: "::ffff:127.0.0.1" }, headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.2" } };
  assert.equal(resolveClientAddress(request), "127.0.0.1");
  assert.equal(resolveClientAddress(request, { trustProxy: true }), "203.0.113.8");
});

test("invalid forwarded addresses fail back to the socket address", () => {
  const request = { socket: { remoteAddress: "10.0.0.4" }, headers: { "x-forwarded-for": "attacker.example" } };
  assert.equal(resolveClientAddress(request, { trustProxy: true }), "10.0.0.4");
  assert.equal(normalizeAddress("not-an-ip"), "unknown");
});

test("deployment flags require explicit truthy values", () => {
  assert.equal(enabledByEnvironment("true"), true);
  assert.equal(enabledByEnvironment("ON"), true);
  assert.equal(enabledByEnvironment("false"), false);
  assert.equal(enabledByEnvironment(undefined), false);
});
