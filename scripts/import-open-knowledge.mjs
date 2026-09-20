import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const zhouyiPath = option("--zhouyi");
const shuoguaPath = option("--shuogua");
const outputPath = resolve(projectRoot, option("--output") ?? "knowledge/shoujian-rag.v1.json");

if (!zhouyiPath || !shuoguaPath) {
  console.error("usage: node scripts/import-open-knowledge.mjs --zhouyi <zhouyi.v1.json> --shuogua <shuogua.v1.json> [--output <path>]");
  process.exit(2);
}

const zhouyi = JSON.parse(await readFile(resolve(projectRoot, zhouyiPath), "utf8"));
const shuogua = JSON.parse(await readFile(resolve(projectRoot, shuoguaPath), "utf8"));
if (!Array.isArray(zhouyi.hexagrams) || zhouyi.hexagrams.length !== 64) throw new Error("source must contain 64 hexagrams");
if (!Array.isArray(shuogua.trigrams) || shuogua.trigrams.length !== 8) throw new Error("source must contain 8 trigrams");

const packageData = {
  schema: "shoujian.oracle-rag.v1",
  version: "1.0.0",
  generatedOn: "2026-09-20",
  boundary: "冻结知识只提供《周易》经文与《彖》《象》《说卦》检索证据；不把古籍原句改写成现实保证、医疗法律投资建议、应期或超自然事实。",
  sources: [zhouyi.evidenceSources, shuogua.evidenceSources].flat().map((source) => ({
    id: source.source_id,
    title: source.title,
    url: source.url,
    version: source.version_or_commit,
    license: source.license,
    retrievedOn: source.retrieved_on,
  })),
  hexagrams: zhouyi.hexagrams.map((record) => ({
    number: record.hexagram_number,
    shortName: record.short_name,
    fullName: record.full_name,
    symbol: record.symbol,
    upperTrigramId: record.upper_trigram_id,
    upperTrigram: record.upper_trigram,
    lowerTrigramId: record.lower_trigram_id,
    lowerTrigram: record.lower_trigram,
    sourceId: record.source_id,
    sourceUrl: record.source_url,
    sourcePageId: record.source_page_id,
    sourceRevisionId: record.source_revision_id,
    sourceRevisionTimestamp: record.source_revision_timestamp,
    sourceWikitextSha256: record.source_wikitext_sha256,
    reviewStatus: record.commentary_review_status,
    judgment: record.judgment_text,
    tuan: record.tuan_text,
    greatImage: record.great_image_text,
    lines: record.line_texts.map((line) => ({
      number: line.line_number,
      label: line.line_label,
      text: line.line_text,
      image: line.image_text,
      reviewStatus: line.review_status,
    })),
    specialLine: record.special_line_text ? {
      label: record.special_line_text.line_label,
      text: record.special_line_text.line_text,
      image: record.special_line_text.image_text,
      reviewStatus: record.special_line_text.review_status,
    } : null,
  })),
  trigrams: shuogua.trigrams.map((record) => ({
    id: record.trigram_id,
    name: record.hanzi,
    symbol: record.symbol,
    sourceId: record.source_id,
    sourcePageId: record.source_page_id,
    sourceRevisionId: record.source_revision_id,
    sourceRevisionTimestamp: record.source_revision_timestamp,
    sourceWikitextSha256: record.source_wikitext_sha256,
    reviewStatus: record.review_status,
    chapters: [record.chapter_7_text, record.chapter_8_text, record.chapter_9_text, record.chapter_10_text, record.chapter_11_text],
    terms: record.terms.map(({ category, image_term: term }) => ({ category, term })),
  })),
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(packageData, null, 2)}\n`, "utf8");
console.log(`knowledge package built: ${packageData.hexagrams.length} hexagrams + ${packageData.trigrams.length} trigrams -> ${outputPath}`);
