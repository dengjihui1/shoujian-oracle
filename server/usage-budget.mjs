// Admission units bound request volume, not currency charges. Failed requests,
// cached speech and local replies consume their reservation; no unsafe refunds.
export const BUDGET_MESSAGE = "本月体验额度已用完，暂时无法生成新的云端回答，请下个月再来。";
export const BUDGET_UNAVAILABLE_MESSAGE = "云端用量保护暂时不可用，请稍后再试。";
const KEY = "shoujian:usage:monthly";
const SCRIPT = `
local clock = redis.call("TIME")
local now = tonumber(clock[1])
local start = tonumber(ARGV[3])
local finish = tonumber(ARGV[4])
if now < start or now >= finish then return -1 end
local period = redis.call("HGET", KEYS[1], "period")
local used = 0
if period == ARGV[3] then
  used = tonumber(redis.call("HGET", KEYS[1], "used") or "0")
elseif period and tonumber(period) > start then
  return -1
end
local weight = tonumber(ARGV[2])
if used + weight > tonumber(ARGV[1]) then return 0 end
redis.call("HSET", KEYS[1], "period", ARGV[3], "used", used + weight)
redis.call("EXPIREAT", KEYS[1], finish + 86400)
return 1
`;

export function monthWindow(now) {
  const shifted = new Date(now + 8 * 3600_000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  return [Date.UTC(year, month, 1) / 1000 - 8 * 3600, Date.UTC(year, month + 1, 1) / 1000 - 8 * 3600];
}

export class MonthlyUsageBudget {
  constructor({ limit = 0, textUnits = 1, audioUnits = 5, client = null, now = Date.now, timeoutMs = 2000, key = KEY } = {}) {
    this.limit = integer(limit, "MONTHLY_BUDGET_UNITS", 0);
    this.textUnits = integer(textUnits, "BUDGET_TEXT_UNITS", 1);
    this.audioUnits = integer(audioUnits, "BUDGET_AUDIO_UNITS", 1);
    this.client = client;
    // Constructor-only override isolates integration tests. Production env cannot change its key.
    if (typeof key !== "string" || !/^[a-z0-9:_-]{1,128}$/iu.test(key)) throw new TypeError("Invalid usage budget key");
    this.key = key;
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.period = null;
    this.used = 0;
  }

  async reserve(kind) {
    if (this.limit === 0) return { allowed: true };
    if (!["text", "audio"].includes(kind)) throw new TypeError("Unknown budget category");
    const weight = kind === "audio" ? this.audioUnits : this.textUnits;
    const [start, finish] = monthWindow(this.now());
    if (this.client) {
      let timer;
      try {
        const result = await Promise.race([
          this.client.eval(SCRIPT, { keys: [this.key], arguments: [this.limit, weight, start, finish].map(String) }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("budget timeout")), this.timeoutMs); }),
        ]);
        if (Number(result) === 1) return { allowed: true };
        return { allowed: false, unavailable: Number(result) !== 0 };
      } catch {
        return { allowed: false, unavailable: true };
      } finally { clearTimeout(timer); }
    }
    // Synchronous read/update before yielding: concurrent local requests cannot overspend.
    if (this.period !== start) { this.period = start; this.used = 0; }
    if (this.used + weight > this.limit) return { allowed: false };
    this.used += weight;
    return { allowed: true };
  }
}

export function usageBudgetFromEnv(env = process.env, { client = null, now = Date.now } = {}) {
  const budget = new MonthlyUsageBudget({
    limit: env.MONTHLY_BUDGET_UNITS ?? 0,
    textUnits: env.BUDGET_TEXT_UNITS ?? 1,
    audioUnits: env.BUDGET_AUDIO_UNITS ?? 5,
    client,
    now,
  });
  if (budget.limit && !client && (env.NODE_ENV === "production" || env.REDIS_URL)) {
    throw new TypeError("生产月度用量保护需要共享 Redis，禁止退回内存计数。");
  }
  return budget;
}

function integer(value, name, minimum) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > 1_000_000_000 || String(value).trim() === "") {
    throw new TypeError(`${name} 必须是 ${minimum} 到 1000000000 的整数`);
  }
  return result;
}
