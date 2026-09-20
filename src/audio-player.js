export async function playPcmBase64(data, { sampleRate = 24_000 } = {}) {
  const pcm = base64ToBytes(data);
  const wav = pcmToWav(pcm, sampleRate);
  const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
  const audio = new Audio(url);
  let revoked = false;
  let finish;
  const ended = new Promise((resolve) => { finish = resolve; });
  const release = () => {
    if (revoked) return;
    revoked = true;
    URL.revokeObjectURL(url);
    finish();
  };
  audio.addEventListener("ended", release, { once: true });
  audio.addEventListener("error", release, { once: true });
  await audio.play();
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

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function writeAscii(view, offset, text) {
  [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
}
