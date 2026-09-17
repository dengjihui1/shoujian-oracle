export const LINE_DEFINITIONS = Object.freeze({
  6: { label: "老阴", polarity: "阴", moving: true },
  7: { label: "少阳", polarity: "阳", moving: false },
  8: { label: "少阴", polarity: "阴", moving: false },
  9: { label: "老阳", polarity: "阳", moving: true }
});

export const TRIGRAMS = Object.freeze({
  "111": { key: "111", name: "乾", symbol: "☰", image: "天", cue: "先辨主次，再落第一步" },
  "110": { key: "110", name: "兑", symbol: "☱", image: "泽", cue: "把难言之处说清楚" },
  "101": { key: "101", name: "离", symbol: "☲", image: "火", cue: "照见条件，不只看愿望" },
  "100": { key: "100", name: "震", symbol: "☳", image: "雷", cue: "先做一个能撤回的小动作" },
  "011": { key: "011", name: "巽", symbol: "☴", image: "风", cue: "缓入其间，观察反馈" },
  "010": { key: "010", name: "坎", symbol: "☵", image: "水", cue: "先补缺口，再涉险处" },
  "001": { key: "001", name: "艮", symbol: "☶", image: "山", cue: "该停处先停，留出边界" },
  "000": { key: "000", name: "坤", symbol: "☷", image: "地", cue: "承认现实，从可做处开始" }
});

const TRIGRAM_ORDER = ["111", "110", "101", "100", "011", "010", "001", "000"];
const KING_WEN_MATRIX = Object.freeze([
  [1, 43, 14, 34, 9, 5, 26, 11], [10, 58, 38, 54, 61, 60, 41, 19],
  [13, 49, 30, 55, 37, 63, 22, 36], [25, 17, 21, 51, 42, 3, 27, 24],
  [44, 28, 50, 32, 57, 48, 18, 46], [6, 47, 64, 40, 59, 29, 4, 7],
  [33, 31, 56, 62, 53, 39, 52, 15], [12, 45, 35, 16, 20, 8, 23, 2]
]);
const HEXAGRAM_NAMES = Object.freeze([
  "", "乾", "坤", "屯", "蒙", "需", "讼", "师", "比", "小畜", "履", "泰", "否",
  "同人", "大有", "谦", "豫", "随", "蛊", "临", "观", "噬嗑", "贲", "剥", "复",
  "无妄", "大畜", "颐", "大过", "坎", "离", "咸", "恒", "遯", "大壮", "晋",
  "明夷", "家人", "睽", "蹇", "解", "损", "益", "夬", "姤", "萃", "升", "困",
  "井", "革", "鼎", "震", "艮", "渐", "归妹", "丰", "旅", "巽", "兑", "涣",
  "节", "中孚", "小过", "既济", "未济"
]);

export function coinsToLine(coins) {
  if (!Array.isArray(coins) || coins.length !== 3 || coins.some((coin) => coin !== 2 && coin !== 3)) {
    throw new TypeError("coins must contain exactly three values of 2 or 3");
  }
  return coins.reduce((sum, coin) => sum + coin, 0);
}

export function castWithCoins(randomBit = defaultRandomBit) {
  return castHexagram(Array.from({ length: 6 }, () => (
    coinsToLine(Array.from({ length: 3 }, () => (randomBit() ? 3 : 2)))
  )));
}

export function castHexagram(lines) {
  if (!Array.isArray(lines) || lines.length !== 6 || lines.some((line) => !LINE_DEFINITIONS[line])) {
    throw new TypeError("a reading requires six values of 6, 7, 8, or 9 ordered bottom to top");
  }
  const primaryBits = lines.map((line) => line === 7 || line === 9);
  const changedBits = lines.map((line, index) => LINE_DEFINITIONS[line].moving ? !primaryBits[index] : primaryBits[index]);
  const movingLines = lines.map((line, index) => LINE_DEFINITIONS[line].moving ? index + 1 : null).filter(Boolean);
  const primary = makeHexagram(primaryBits);
  const changed = movingLines.length ? makeHexagram(changedBits) : null;
  return Object.freeze({
    lines: Object.freeze([...lines]), primary, changed, movingLines: Object.freeze(movingLines),
    auditTrail: Object.freeze([
      `六爻自下而上：${lines.join("、")}`,
      `本卦下卦 ${primary.lower.symbol}${primary.lower.name}，上卦 ${primary.upper.symbol}${primary.upper.name}`,
      movingLines.length ? `动爻：${movingLines.join("、")}` : "无动爻，不另立变卦"
    ])
  });
}

function makeHexagram(bits) {
  const lowerKey = bits.slice(0, 3).map(Number).join("");
  const upperKey = bits.slice(3, 6).map(Number).join("");
  const lower = TRIGRAMS[lowerKey];
  const upper = TRIGRAMS[upperKey];
  const number = KING_WEN_MATRIX[TRIGRAM_ORDER.indexOf(lowerKey)][TRIGRAM_ORDER.indexOf(upperKey)];
  return Object.freeze({
    number, name: HEXAGRAM_NAMES[number], fullName: fullName(number, upper, lower),
    symbol: String.fromCodePoint(0x4dc0 + number - 1), lower, upper
  });
}

function fullName(number, upper, lower) {
  const pure = { 1: "乾为天", 2: "坤为地", 29: "坎为水", 30: "离为火", 51: "震为雷", 52: "艮为山", 57: "巽为风", 58: "兑为泽" };
  return pure[number] ?? `${upper.image}${lower.image}${HEXAGRAM_NAMES[number]}`;
}

function defaultRandomBit() {
  const value = new Uint8Array(1);
  globalThis.crypto.getRandomValues(value);
  return (value[0] & 1) === 1;
}

