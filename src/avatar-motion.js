const MOTIONS = Object.freeze({
  idle: Object.freeze({ key: "idle-breath", mouth: "closed", gesture: "breathe-blink" }),
  listening: Object.freeze({ key: "listen-lean", mouth: "closed", gesture: "lean-and-focus" }),
  transcribing: Object.freeze({ key: "listen-hold", mouth: "closed", gesture: "hold-focus" }),
  heard: Object.freeze({ key: "acknowledge", mouth: "closed", gesture: "single-nod" }),
  thinking: Object.freeze({ key: "ponder", mouth: "closed", gesture: "slow-gaze" }),
  preparing: Object.freeze({ key: "prepare-speech", mouth: "closed", gesture: "inhale" }),
  speaking: Object.freeze({ key: "speak", mouth: "audio", gesture: "audio-led" }),
  interrupted: Object.freeze({ key: "interrupt-recover", mouth: "closed", gesture: "recoil-and-listen" }),
  error: Object.freeze({ key: "recoverable-error", mouth: "closed", gesture: "settle" }),
  intake: Object.freeze({ key: "invite-detail", mouth: "closed", gesture: "attentive" }),
  casting: Object.freeze({ key: "await-cast", mouth: "closed", gesture: "still-center" }),
  reading: Object.freeze({ key: "present-reading", mouth: "closed", gesture: "reveal-symbol" }),
});

export function deriveAvatarMotion(presentationKey) {
  return MOTIONS[presentationKey] ?? MOTIONS.idle;
}

export function mouthStateForLevel(presentationKey, level, threshold = 0.08) {
  const motion = deriveAvatarMotion(presentationKey);
  const normalized = Math.max(0, Math.min(1, Number(level) || 0));
  return motion.mouth === "audio" && normalized >= threshold ? "audio" : "closed";
}
