import { Solar, Lunar } from "./lunar-vendor.js";

export const CALENDAR_CONVENTION = "公历北京时间（UTC+8），立春换年、节气换月、午夜换日；未校正真太阳时或历史夏令时。";
const ELEMENTS = { 甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土", 己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水", 子: "水", 丑: "土", 寅: "木", 卯: "木", 辰: "土", 巳: "火", 午: "火", 未: "土", 申: "金", 酉: "金", 戌: "土", 亥: "水" };

export function calculateBirthChart({ date, time = "", calendar = "solar", leapMonth = false } = {}) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new Error("请填写完整出生日期。");
  if (!["solar", "lunar"].includes(calendar)) throw new Error("请选择公历或农历。");
  const [year, month, day] = date.split("-").map(Number);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) throw new Error("支持 1900–2100 年的有效日期。");
  const knownTime = time !== "";
  if (knownTime && (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(time))) throw new Error("时间请用 00:00–23:59；不清楚时可以留空。");
  const [hour, minute] = knownTime ? time.split(":").map(Number) : [12, 0];
  let solar;
  try {
    if (calendar === "lunar") {
      solar = Lunar.fromYmdHms(year, leapMonth ? -month : month, day, hour, minute, 0).getSolar();
    } else {
      const check = new Date(Date.UTC(year, month - 1, day));
      if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) throw new Error("invalid date");
      solar = Solar.fromYmdHms(year, month, day, hour, minute, 0);
    }
  } catch { throw new Error("这一天不存在，请核对日期、历法和闰月选项。"); }
  const localDate = solar.toYmd();
  const currentDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date());
  if (localDate > currentDate) throw new Error("出生日期不能晚于今天。");
  const eight = solar.getLunar().getEightChar();
  eight.setSect(2);
  const pillars = [eight.getYear(), eight.getMonth(), eight.getDay(), knownTime ? eight.getTime() : null];
  const warnings = [];
  if (!knownTime) {
    const at = (hour, minute) => {
      const value = Solar.fromYmdHms(solar.getYear(), solar.getMonth(), solar.getDay(), hour, minute, 0).getLunar().getEightChar();
      value.setSect(2);
      return [value.getYear(), value.getMonth(), value.getDay()];
    };
    const early = at(0, 0), late = at(23, 59);
    for (let index = 0; index < 3; index += 1) if (early[index] !== late[index]) pillars[index] = null;
    warnings.push("时刻未填写，时柱不推算；遇节气交界，年柱或月柱也可能待定。");
  }
  const counts = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  for (const pillar of pillars.filter(Boolean)) for (const character of pillar) counts[ELEMENTS[character]] += 1;
  return Object.freeze({ solarDate: localDate, lunarDate: solar.getLunar().toString(), pillars, counts,
    dayMaster: pillars[2]?.[0] ?? null, knownTime, warnings, convention: CALENDAR_CONVENTION });
}

// Only the computed symbols leave the browser after a separate, explicit opt-in.
export function shareableBirthContext(chart) {
  return chart ? { version: 1, pillars: [...chart.pillars], convention: "beijing-midnight-v1" } : null;
}
