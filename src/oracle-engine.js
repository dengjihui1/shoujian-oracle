export const TRIGRAMS = Object.freeze({
  "111": { name: "乾", image: "天", cue: "先辨主次，再落第一步" },
  "110": { name: "兑", image: "泽", cue: "把难言之处说清楚" },
  "101": { name: "离", image: "火", cue: "照见条件，不只看愿望" },
  "100": { name: "震", image: "雷", cue: "先做一个能撤回的小动作" },
  "011": { name: "巽", image: "风", cue: "缓入其间，观察反馈" },
  "010": { name: "坎", image: "水", cue: "先补缺口，再涉险处" },
  "001": { name: "艮", image: "山", cue: "该停处先停，留出边界" },
  "000": { name: "坤", image: "地", cue: "承认现实，从可做处开始" }
});

export function coinsToLine(coins) {
  if (!Array.isArray(coins) || coins.length !== 3 || coins.some((coin) => coin !== 2 && coin !== 3)) {
    throw new TypeError("coins must contain exactly three values of 2 or 3");
  }

  const value = coins.reduce((sum, coin) => sum + coin, 0);
  return Object.freeze({
    value,
    yang: value === 7 || value === 9,
    moving: value === 6 || value === 9
  });
}

export function castHexagram(randomBit = defaultRandomBit) {
  const lines = Array.from({ length: 6 }, () => {
    const coins = Array.from({ length: 3 }, () => (randomBit() ? 3 : 2));
    return coinsToLine(coins);
  });
  return buildReading(lines);
}

export function buildReading(lines) {
  if (!Array.isArray(lines) || lines.length !== 6) {
    throw new TypeError("a reading requires six lines ordered from bottom to top");
  }

  const normalized = lines.map((line) => coinsToLine(line.coins ?? coinsForValue(line.value)));
  const primary = describePair(normalized.map((line) => line.yang));
  const changed = describePair(normalized.map((line) => (line.moving ? !line.yang : line.yang)));
  const movingLines = normalized
    .map((line, index) => (line.moving ? index + 1 : null))
    .filter(Boolean);

  return Object.freeze({
    lines: Object.freeze(normalized),
    primary,
    changed,
    movingLines: Object.freeze(movingLines),
    prompt: makePrompt(primary, changed, movingLines)
  });
}

function describePair(bits) {
  const lower = TRIGRAMS[bits.slice(0, 3).map(Number).join("")];
  const upper = TRIGRAMS[bits.slice(3, 6).map(Number).join("")];
  return Object.freeze({ lower, upper, label: `${upper.image}${lower.image} · ${upper.name}上${lower.name}下` });
}

function makePrompt(primary, changed, movingLines) {
  if (movingLines.length === 0) {
    return `此刻无动爻。先看“${primary.upper.cue}”，再问自己：哪一条事实尚未确认？`;
  }

  const positions = movingLines.join("、");
  const changeNote = primary.label === changed.label ? "变化尚未改其大势" : `变化后呈“${changed.label}”`;
  return `第${positions}爻有变，${changeNote}。今日只取一问：${changed.lower.cue}。`;
}

function coinsForValue(value) {
  const lookup = {
    6: [2, 2, 2],
    7: [3, 2, 2],
    8: [3, 3, 2],
    9: [3, 3, 3]
  };
  if (!lookup[value]) throw new TypeError("line value must be 6, 7, 8, or 9");
  return lookup[value];
}

function defaultRandomBit() {
  const value = new Uint8Array(1);
  globalThis.crypto.getRandomValues(value);
  return (value[0] & 1) === 1;
}

