class PcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pcm = new Int16Array(2048);
    this.offset = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let index = 0; index < channel.length; index += 1) {
      const value = Math.max(-1, Math.min(1, channel[index]));
      this.pcm[this.offset++] = value < 0 ? value * 32768 : value * 32767;
      if (this.offset === this.pcm.length) {
        this.port.postMessage(this.pcm.buffer, [this.pcm.buffer]);
        this.pcm = new Int16Array(2048);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("shoujian-pcm", PcmWorklet);
