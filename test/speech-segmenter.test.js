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

test("overlong text prefers a nearby Chinese comma", () => {
  const segmenter = new SentenceSegmenter({ maxChars: 40, minSplitChars: 20 });
  const text = `前段${"甲".repeat(22)}，后段${"乙".repeat(22)}`;
  const [first] = segmenter.push(text);
  assert.match(first, /，$/u);
  assert.ok(first.length <= 40);
});
