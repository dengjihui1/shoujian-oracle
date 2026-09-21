import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSpeechText, SentenceSegmenter } from "../src/speech-segmenter.js";

test("streaming sentence segmentation waits for a complete Chinese sentence", () => {
  const segmenter = new SentenceSegmenter();
  assert.deepEqual(segmenter.push("第一句还没"), []);
  assert.deepEqual(segmenter.push("结束。第二句"), ["第一句还没结束。"]);
  assert.deepEqual(segmenter.push("也好了！尾巴"), ["第二句也好了！"]);
  assert.deepEqual(segmenter.flush(), ["尾巴"]);
});

test("speech normalization removes RAG markers, markdown, and URLs", () => {
  assert.equal(
    normalizeSpeechText("**乾卦**【ZY-01-GUA】见[原文](https://example.com) https://example.com/x"),
    "乾卦见原文"
  );
});

test("speech normalization skips the repeated visible divination disclaimer", () => {
  assert.equal(
    normalizeSpeechText("卦象仅供传统文化体验与自我反思参考，不作为投资、医疗、法律或其他现实决定的唯一依据。"),
    ""
  );
});

test("default segmenter starts an unpunctuated sentence at 72 characters", () => {
  const segmenter = new SentenceSegmenter();
  const [first] = segmenter.push("甲".repeat(76));
  assert.equal(first.length, 72);
});

test("overlong text prefers a nearby Chinese comma", () => {
  const segmenter = new SentenceSegmenter({ maxChars: 40, minSplitChars: 20 });
  const text = `前段${"甲".repeat(22)}，后段${"乙".repeat(22)}`;
  const [first] = segmenter.push(text);
  assert.match(first, /，$/u);
  assert.ok(first.length <= 40);
});
