import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function checkProductionEnvironment(env) {
  const findings = [];
  const check = (ok, message) => { if (!ok) findings.push(message); };
  const real = (value) => typeof value === "string" && value.trim() && !/replace|example|your[-_ ]|填写/iu.test(value);
  check(env.NODE_ENV === "production", "生产部署需要 NODE_ENV=production。");
  check(real(env.GEMINI_API_KEY), "填写真实 GEMINI_API_KEY；只在本机或服务器秘密配置中填写。");
  check(real(env.PUBLIC_CONTACT), "填写 PUBLIC_CONTACT（公开联系邮箱或方式）。");
  check(real(env.DOMAIN) && !/[/:\s]/u.test(env.DOMAIN ?? ""), "填写正式 DOMAIN，不含协议、端口和路径。");
  for (const key of ["LOG_HASH_SALT", "RATE_LIMIT_HASH_SALT"]) check(real(env[key]) && env[key].length >= 32, `${key} 需要至少 32 字符的随机值。`);
  check(env.LOG_HASH_SALT !== env.RATE_LIMIT_HASH_SALT, "两组盐值必须不同。");
  check(/^rediss?:\/\//u.test(env.REDIS_URL ?? ""), "生产用量保护需要私网 REDIS_URL 和持久卷。");
  check(/^\d+$/u.test(env.MONTHLY_BUDGET_UNITS ?? "") && Number(env.MONTHLY_BUDGET_UNITS) > 0, "MONTHLY_BUDGET_UNITS 必须为正数；0 会关闭保护。");
  check(Number(env.MAX_CONCURRENT_UPSTREAM) >= 1 && Number(env.MAX_CONCURRENT_UPSTREAM) <= 4, "300 元试用方案建议 MAX_CONCURRENT_UPSTREAM 为 1–4。");
  check(env.STRUCTURED_LOGS === "true", "开启 STRUCTURED_LOGS=true 便于去内容化排障。");
  check(env.TRUST_PROXY === "true", "Compose 部署需要 TRUST_PROXY=true，且不得公开 Node/Redis 端口。");
  check(env.PAID_AUDIO_ENABLED === "false", "受控试用先设 PAID_AUDIO_ENABLED=false；开启前另行完成音频预算与真机验收。");
  return findings;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = checkProductionEnvironment(process.env);
  console.log("上线配置预检查（不显示配置值、不调用付费 API）");
  if (findings.length) {
    for (const item of findings) console.log(`待完成：${item}`);
    process.exitCode = 1;
  } else {
    console.log("配置检查通过。域名证书、邀请认证、Redis 持久性、实际 API 和真机仍按 docs/LAUNCH_CHECKLIST.md 验收。");
  }
}
