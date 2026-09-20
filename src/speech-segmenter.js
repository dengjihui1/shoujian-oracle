const TERMINAL_PUNCTUATION = /[。！？!?；;\n]/u;
const CLOSING_PUNCTUATION = /[”’」』】）)\]]/u;
const SOFT_PUNCTUATION = /[，,、：:]/u;

export class SentenceSegmenter {
  constructor({ maxChars = 96, minSplitChars = 36 } = {}) {
    this.maxChars = Math.max(40, Number(maxChars) || 96);
    this.minSplitChars = Math.min(this.maxChars - 8, Math.max(20, Number(minSplitChars) || 36));
    this.buffer = "";
  }

  push(value) {
    this.buffer += String(value ?? "");
    return this.#takeComplete(false);
  }

  flush() {
    const completed = this.#takeComplete(true);
    this.buffer = "";
    return completed;
  }

  reset() {
    this.buffer = "";
  }

  #takeComplete(flush) {
    const segments = [];
    while (this.buffer) {
      const sentenceEnd = findSentenceEnd(this.buffer);
      let cut = sentenceEnd;
      if (cut < 0 && this.buffer.length >= this.maxChars) {
        cut = findSoftBreak(this.buffer, this.minSplitChars, this.maxChars);
      }
      if (cut < 0) break;
      const segment = normalizeSpeechText(this.buffer.slice(0, cut));
      this.buffer = this.buffer.slice(cut);
      if (segment) segments.push(segment);
    }
    if (flush) {
      const tail = normalizeSpeechText(this.buffer);
      if (tail) segments.push(tail);
    }
    return segments;
  }
}

export function normalizeSpeechText(value) {
  return String(value ?? "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/giu, "$1")
    .replace(/【[A-Z][A-Z0-9_-]{1,48}】/giu, "")
    .replace(/https?:\/\/\S+/giu, "")
    .replace(/(?:^|\n)\s{0,3}(?:#{1,6}|[-*+]\s)/gu, " ")
    .replace(/[*_`~]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function findSentenceEnd(text) {
  for (let index = 0; index < text.length; index += 1) {
    if (!TERMINAL_PUNCTUATION.test(text[index])) continue;
    let end = index + 1;
    while (end < text.length && CLOSING_PUNCTUATION.test(text[end])) end += 1;
    return end;
  }
  return -1;
}

function findSoftBreak(text, minimum, maximum) {
  const limit = Math.min(maximum, text.length);
  for (let index = limit - 1; index >= minimum; index -= 1) {
    if (SOFT_PUNCTUATION.test(text[index])) return index + 1;
  }
  return limit;
}
