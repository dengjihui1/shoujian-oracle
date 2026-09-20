export class StreamingTextRevealer {
  constructor({ onText, reducedMotion = false, waitFn = wait } = {}) {
    if (typeof onText !== "function") throw new TypeError("onText callback is required");
    this.onText = onText;
    this.reducedMotion = reducedMotion;
    this.waitFn = waitFn;
    this.queue = [];
    this.text = "";
    this.cancelled = false;
    this.draining = null;
  }

  enqueue(value) {
    if (this.cancelled) return;
    const characters = [...String(value ?? "")];
    if (!characters.length) return;
    if (this.reducedMotion) {
      this.text += characters.join("");
      this.onText(this.text);
      return;
    }
    this.queue.push(...characters);
    if (!this.draining) this.draining = this.#drain();
  }

  async finish() {
    while (this.draining) await this.draining;
    return this.text;
  }

  cancel() {
    this.cancelled = true;
    this.queue.length = 0;
  }

  async #drain() {
    while (this.queue.length && !this.cancelled) {
      const character = this.queue.shift();
      this.text += character;
      this.onText(this.text);
      await this.waitFn(characterDelay(character, this.queue.length));
    }
    this.draining = null;
  }
}

export function characterDelay(character, backlog = 0) {
  if (backlog > 160) return 1;
  if (backlog > 80) return 3;
  return /[。！？!?\n]/u.test(character) ? 36 : /[，、；：,.]/u.test(character) ? 20 : 9;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

