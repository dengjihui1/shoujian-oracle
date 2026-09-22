import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultKnowledgePath = resolve(projectRoot, "knowledge/shoujian-rag.v1.json");
const traditionalToSimplified = new Map([..."貞訟師比畜謙隨蠱臨觀噬賁剝復無妄頤過離咸恆遯壯晉夷睽蹇損益夬姤萃升困井革鼎漸歸妹豐旅巽兌渙節孚濟傳為馬首圜君父玉金寒冰赤良老瘠駁果風澤雷山水火天地潛龍見飛終乾惕厲无咎"].map((character) => [character, character]));
for (const [traditional, simplified] of Object.entries({
  貞: "贞", 訟: "讼", 謙: "谦", 隨: "随", 蠱: "蛊", 臨: "临", 觀: "观", 賁: "贲", 剝: "剥", 復: "复", 無: "无", 頤: "颐", 離: "离", 恆: "恒", 遯: "遁", 壯: "壮", 晉: "晋", 夷: "夷", 睽: "睽", 蹇: "蹇", 損: "损", 益: "益", 夬: "夬", 姤: "姤", 萃: "萃", 升: "升", 困: "困", 井: "井", 革: "革", 鼎: "鼎", 漸: "渐", 歸: "归", 妹: "妹", 豐: "丰", 旅: "旅", 巽: "巽", 兌: "兑", 渙: "涣", 節: "节", 孚: "孚", 濟: "济", 傳: "传", 為: "为", 馬: "马", 首: "首", 圜: "圆", 風: "风", 澤: "泽", 雷: "雷", 山: "山", 水: "水", 火: "火", 天: "天", 地: "地", 潛: "潜", 龍: "龙", 見: "见", 飛: "飞", 終: "终", 乾: "乾", 惕: "惕", 厲: "厉", 无: "无", 咎: "咎",
})) traditionalToSimplified.set(traditional, simplified);

export async function loadKnowledgeBase(path = defaultKnowledgePath) {
  const data = JSON.parse(await readFile(path, "utf8"));
  validatePackage(data);
  return new OracleKnowledgeBase(data);
}

export class OracleKnowledgeBase {
  constructor(data) {
    this.schema = data.schema;
    this.version = data.version;
    this.boundary = data.boundary;
    this.sources = new Map(data.sources.map((source) => [source.id, Object.freeze({ ...source })]));
    this.hexagrams = new Map(data.hexagrams.map((record) => [record.number, record]));
    this.trigrams = new Map(data.trigrams.map((record) => [record.id, record]));
    this.fragments = Object.freeze(buildFragments(data, this.sources));
    this.summary = Object.freeze({
      schema: this.schema,
      version: this.version,
      hexagrams: this.hexagrams.size,
      trigrams: this.trigrams.size,
      fragments: this.fragments.length,
    });
  }

  retrieve({ query = "", reading = null, limit = 8 } = {}) {
    const boundedLimit = Math.max(1, Math.min(Number.isInteger(limit) ? limit : 8, 10));
    const normalizedQuery = normalize(query);
    const grams = queryGrams(normalizedQuery);
    const trigramIntent = /(?:说卦|取象|八卦|象征|为何.*为|为什么.*为)/u.test(normalizedQuery);
    const readingSignals = readReadingSignals(reading, this.hexagrams);
    const scored = [];

    for (const fragment of this.fragments) {
      let score = 0;
      const reasons = [];
      if (readingSignals.primary === fragment.hexagramNumber && fragment.kind === "overview") {
        score += 2_000; reasons.push("本卦");
      }
      if (readingSignals.primary === fragment.hexagramNumber && readingSignals.movingLines.has(fragment.lineNumber)) {
        score += 1_900; reasons.push("动爻");
      }
      if (readingSignals.changed === fragment.hexagramNumber && fragment.kind === "overview") {
        score += 1_500; reasons.push("之卦");
      }
      if (fragment.trigramId && readingSignals.trigrams.has(fragment.trigramId)) {
        score += 900; reasons.push("上下卦");
      }
      if (normalizedQuery) {
        if (fragment.kind === "trigram" && trigramIntent
          && fragment.aliases.some((alias) => alias.length >= 2 && normalizedQuery.includes(alias))) {
          score += 1_200; reasons.push("说卦取象");
        }
        for (const alias of fragment.aliases) {
          if (alias.length >= 2 && normalizedQuery.includes(alias)) { score += alias.length * 90; reasons.push("明示名词"); }
        }
        for (const gram of grams) {
          if (fragment.searchText.includes(gram)) score += gram.length * gram.length;
        }
      }
      if (score > 0) scored.push({ fragment, score, reasons: [...new Set(reasons)] });
    }

    const ranked = scored
      .sort((left, right) => right.score - left.score || left.fragment.order - right.fragment.order);
    const bestLexicalScore = ranked[0]?.score ?? 0;
    const relevant = readingSignals.primary
      ? ranked
      : ranked.filter(({ score }) => score >= Math.max(8, bestLexicalScore * 0.25));

    return relevant
      .slice(0, boundedLimit)
      .map(({ fragment, reasons }) => Object.freeze({
        id: fragment.id,
        layer: fragment.layer,
        title: fragment.title,
        excerpt: fragment.excerpt,
        sourceTitle: fragment.source.title,
        sourceUrl: fragment.source.url,
        license: fragment.source.license,
        matchedBy: reasons,
      }));
  }
}

export function formatEvidenceForPrompt(evidence) {
  if (!evidence.length) return "本轮没有检索到经传片段。普通闲聊、身份、能力、使用方式和一般基础概念可以自然回答且不需要装饰性引用；若用户索要具体卦爻原文、经传出处或古人定论，则必须明确说本轮资料不足，不得用模型记忆补造原文或出处。";
  return [
    "以下是本轮唯一允许引用的冻结知识片段。回答涉及古籍原文时必须标出对应的【证据编号】，不得引用列表外材料：",
    ...evidence.map((item) => `【${item.id}】${item.title}\n${item.excerpt}\n来源：${item.sourceTitle} ${item.sourceUrl}`),
  ].join("\n\n");
}

function buildFragments(data, sources) {
  const fragments = [];
  let order = 0;
  for (const hexagram of data.hexagrams) {
    const source = Object.freeze({ ...sources.get(hexagram.sourceId), url: hexagram.sourceUrl });
    const aliases = aliasesForHexagram(hexagram);
    fragments.push(makeFragment({
      id: `ZY-${String(hexagram.number).padStart(2, "0")}-OVERVIEW`,
      kind: "overview",
      layer: "经传",
      title: `第${hexagram.number}卦 ${hexagram.fullName}`,
      excerpt: boundedText(`卦辞：${hexagram.judgment}\n《彖》：${hexagram.tuan}\n《象》：${hexagram.greatImage}`),
      source,
      hexagramNumber: hexagram.number,
      aliases,
      order: order++,
    }));
    for (const line of hexagram.lines) {
      fragments.push(makeFragment({
        id: `ZY-${String(hexagram.number).padStart(2, "0")}-LINE-${line.number}`,
        kind: "line",
        layer: "经传",
        title: `第${hexagram.number}卦 ${hexagram.shortName} · ${line.label}`,
        excerpt: boundedText(`爻辞：${line.text}\n《小象》：${line.image}`),
        source,
        hexagramNumber: hexagram.number,
        lineNumber: line.number,
        aliases: [...aliases, normalize(line.label), `第${line.number}爻`],
        order: order++,
      }));
    }
  }
  for (const trigram of data.trigrams) {
    const source = sources.get(trigram.sourceId);
    fragments.push(makeFragment({
      id: `SG-${trigram.id.toUpperCase()}`,
      kind: "trigram",
      layer: "易传",
      title: `《说卦》${trigram.name}卦取象`,
      excerpt: boundedText(trigram.chapters.filter(Boolean).join("\n")),
      source,
      trigramId: trigram.id,
      aliases: [
        normalize(`${trigram.name}卦`),
        normalize(trigram.id),
        ...trigram.terms.flatMap(({ term }) => [
          normalize(term),
          normalize(`${trigram.name}为${term}`),
          normalize(`${trigram.name}${term}`),
        ]),
      ],
      order: order++,
    }));
  }
  return fragments;
}

function makeFragment(fragment) {
  const aliases = [...new Set(fragment.aliases.filter(Boolean))];
  return Object.freeze({
    ...fragment,
    aliases,
    searchText: normalize([fragment.title, fragment.excerpt, ...aliases].join(" ")),
  });
}

function aliasesForHexagram(hexagram) {
  return [...new Set([
    normalize(hexagram.shortName),
    normalize(`${hexagram.shortName}卦`),
    normalize(hexagram.fullName),
    `第${hexagram.number}卦`,
    normalize(hexagram.symbol),
  ])];
}

function readReadingSignals(reading, hexagrams) {
  const primary = reading?.primary?.number;
  const changedByNumber = reading?.changed?.number;
  const changedByName = reading?.changed?.fullName
    ? [...hexagrams.values()].find((record) => normalize(record.fullName) === normalize(reading.changed.fullName))?.number
    : null;
  const primaryRecord = hexagrams.get(primary);
  const changedRecord = hexagrams.get(changedByNumber ?? changedByName);
  return {
    primary: Number.isInteger(primary) ? primary : null,
    changed: changedRecord?.number ?? null,
    movingLines: new Set(Array.isArray(reading?.movingLines) ? reading.movingLines : []),
    trigrams: new Set([
      primaryRecord?.upperTrigramId,
      primaryRecord?.lowerTrigramId,
      changedRecord?.upperTrigramId,
      changedRecord?.lowerTrigramId,
    ].filter(Boolean)),
  };
}

function queryGrams(query) {
  const compact = query.replace(/[^\p{Script=Han}a-z0-9]/gu, "");
  const grams = new Set();
  for (const width of [4, 3, 2]) {
    for (let index = 0; index + width <= compact.length; index += 1) grams.add(compact.slice(index, index + width));
  }
  return [...grams];
}

function normalize(value) {
  return [...String(value ?? "").toLowerCase().normalize("NFKC")]
    .map((character) => traditionalToSimplified.get(character) ?? character)
    .join("")
    .replace(/\s+/gu, "");
}

function boundedText(value, maxLength = 800) {
  const text = String(value ?? "").trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function validatePackage(data) {
  if (data?.schema !== "shoujian.oracle-rag.v1") throw new Error("knowledge schema mismatch");
  if (!Array.isArray(data.sources) || data.sources.length < 2) throw new Error("knowledge sources are incomplete");
  if (!Array.isArray(data.hexagrams) || data.hexagrams.length !== 64) throw new Error("knowledge must contain 64 hexagrams");
  if (!Array.isArray(data.trigrams) || data.trigrams.length !== 8) throw new Error("knowledge must contain 8 trigrams");
  const numbers = new Set(data.hexagrams.map(({ number }) => number));
  if (numbers.size !== 64 || Math.min(...numbers) !== 1 || Math.max(...numbers) !== 64) throw new Error("hexagram numbering is incomplete");
  for (const record of data.hexagrams) {
    if (!Array.isArray(record.lines) || record.lines.length !== 6) throw new Error(`hexagram ${record.number} must contain 6 lines`);
    if (!record.sourceUrl || !record.judgment || !record.greatImage) throw new Error(`hexagram ${record.number} is missing source text`);
  }
}
