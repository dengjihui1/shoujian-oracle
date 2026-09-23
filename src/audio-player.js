let sharedAudioContext = null;

export function primeAudioPlayback() {
  const context = getAudioContext();
  if (!context) return false;
  if (context.state === "suspended") void context.resume().catch(() => {});
  return true;
}

export async function playPcmBase64(data, { sampleRate = 24_000, onLevel = () => {}, onStart = () => {} } = {}) {
  const pcm = base64ToBytes(data);
  const context = getAudioContext();
  if (!context) return playWithAudioElement(pcm, { sampleRate, onLevel, onStart });
  try {
    if (context.state === "suspended") await context.resume();
    return playWithAudioContext(context, pcm, { sampleRate, onLevel, onStart });
  } catch {
    return playWithAudioElement(pcm, { sampleRate, onLevel, onStart });
  }
}

export function pcm16BytesToFloat32(pcm) {
  const bytes = pcm instanceof Uint8Array ? pcm : new Uint8Array(pcm);
  const samples = new Float32Array(Math.floor(bytes.byteLength / 2));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < samples.length; index += 1) {
    const value = view.getInt16(index * 2, true);
    samples[index] = value < 0 ? value / 32768 : value / 32767;
  }
  return samples;
}

export function calculateVoiceLevel(samples) {
  if (!samples?.length) return 0;
  let squareSum = 0;
  for (const sample of samples) squareSum += sample * sample;
  const rms = Math.sqrt(squareSum / samples.length);
  return Math.max(0, Math.min(1, (rms - 0.012) * 4.2));
}

function playWithAudioContext(context, pcm, { sampleRate, onLevel, onStart }) {
  const samples = pcm16BytesToFloat32(pcm);
  const buffer = context.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(samples, 0);
  const source = context.createBufferSource();
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.58;
  source.buffer = buffer;
  source.connect(analyser);
  analyser.connect(context.destination);

  const frame = new Float32Array(analyser.fftSize);
  const requestFrame = globalThis.requestAnimationFrame?.bind(globalThis)
    ?? ((callback) => setTimeout(callback, 33));
  const cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis) ?? clearTimeout;
  let frameId = null;
  let stopped = false;
  let finish;
  const ended = new Promise((resolve) => { finish = resolve; });
  const sampleLevel = () => {
    if (stopped) return;
    analyser.getFloatTimeDomainData(frame);
    onLevel(calculateVoiceLevel(frame));
    frameId = requestFrame(sampleLevel);
  };
  const release = () => {
    if (stopped) return;
    stopped = true;
    if (frameId !== null) cancelFrame(frameId);
    onLevel(0);
    source.disconnect();
    analyser.disconnect();
    finish();
  };
  source.addEventListener("ended", release, { once: true });
  onLevel(0);
  source.start();
  onStart();
  frameId = requestFrame(sampleLevel);
  return {
    ended,
    stop() {
      if (stopped) return;
      try { source.stop(); } catch { /* source already ended */ }
      release();
    }
  };
}

async function playWithAudioElement(pcm, { sampleRate, onLevel, onStart }) {
  const wav = pcmToWav(pcm, sampleRate);
  const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
  const audio = new Audio(url);
  let revoked = false;
  let finish;
  const ended = new Promise((resolve) => { finish = resolve; });
  const release = () => {
    if (revoked) return;
    revoked = true;
    onLevel(0);
    URL.revokeObjectURL(url);
    finish();
  };
  audio.addEventListener("ended", release, { once: true });
  audio.addEventListener("error", release, { once: true });
  audio.addEventListener("playing", () => {
    if (!revoked) {
      onStart();
      onLevel(0.46);
    }
  }, { once: true });
  try {
    await audio.play();
  } catch (error) {
    release();
    throw error;
  }
  return {
    ended,
    stop() {
      audio.pause();
      audio.removeAttribute("src");
      release();
    }
  };
}

export function pcmToWav(pcm, sampleRate = 24_000) {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  writeAscii(view, 0, "RIFF"); view.setUint32(4, 36 + pcm.byteLength, true); writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeAscii(view, 36, "data"); view.setUint32(40, pcm.byteLength, true);
  const wav = new Uint8Array(44 + pcm.byteLength); wav.set(new Uint8Array(header)); wav.set(pcm, 44); return wav;
}

function getAudioContext() {
  if (sharedAudioContext && sharedAudioContext.state !== "closed") return sharedAudioContext;
  const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    sharedAudioContext = new AudioContextClass({ latencyHint: "interactive" });
    return sharedAudioContext;
  } catch {
    return null;
  }
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function writeAscii(view, offset, text) {
  [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
}
