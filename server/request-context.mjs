import { isIP } from "node:net";

export function resolveClientAddress(request, { trustProxy = false } = {}) {
  const socketAddress = normalizeAddress(request?.socket?.remoteAddress);
  if (!trustProxy) return socketAddress;
  const forwarded = String(request?.headers?.["x-forwarded-for"] ?? "").split(",", 1)[0].trim();
  const forwardedAddress = normalizeAddress(forwarded);
  return forwardedAddress === "unknown" ? socketAddress : forwardedAddress;
}

export function normalizeAddress(value) {
  const address = String(value ?? "").trim().replace(/^::ffff:/u, "");
  return isIP(address) ? address : "unknown";
}

export function enabledByEnvironment(value) {
  return /^(?:1|true|yes|on)$/iu.test(String(value ?? "").trim());
}
