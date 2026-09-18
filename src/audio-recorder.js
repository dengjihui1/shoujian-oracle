export class AudioRecorder {
  constructor({ mediaDevices = globalThis.navigator?.mediaDevices, MediaRecorderClass = globalThis.MediaRecorder, maxDurationMs = 45_000 } = {}) {
    this.mediaDevices = mediaDevices;
    this.MediaRecorderClass = MediaRecorderClass;
    this.maxDurationMs = maxDurationMs;
  }

  get supported() { return Boolean(this.mediaDevices?.getUserMedia && this.MediaRecorderClass); }

  async start() {
    if (!this.supported) throw new Error("当前浏览器不支持麦克风录音");
    this.stream = await this.mediaDevices.getUserMedia({ audio: true });
    const preferred = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => this.MediaRecorderClass.isTypeSupported?.(type));
    this.chunks = [];
    this.recorder = preferred ? new this.MediaRecorderClass(this.stream, { mimeType: preferred }) : new this.MediaRecorderClass(this.stream);
    this.recorder.addEventListener("dataavailable", (event) => { if (event.data?.size) this.chunks.push(event.data); });
    this.result = new Promise((resolve, reject) => {
      this.recorder.addEventListener("stop", () => {
        clearTimeout(this.timer);
        this.stream?.getTracks().forEach((track) => track.stop());
        const blob = new Blob(this.chunks, { type: this.recorder.mimeType || "audio/webm" });
        blob.size ? resolve(blob) : reject(new Error("没有录到声音，请重试"));
      }, { once: true });
      this.recorder.addEventListener("error", () => reject(new Error("录音失败，请检查麦克风权限")), { once: true });
    });
    this.recorder.start();
    this.timer = setTimeout(() => this.stop(), this.maxDurationMs);
  }

  async stop() {
    if (!this.recorder || this.recorder.state === "inactive") return this.result;
    this.recorder.stop();
    return this.result;
  }
}

export async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
