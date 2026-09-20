const PRESENTATIONS = Object.freeze({
  idle: { key: "idle", label: "静候", detail: "墨衡在灯下候问" },
  listening: { key: "listening", label: "倾听", detail: "正在听你把话说完" },
  transcribing: { key: "transcribing", label: "辨音", detail: "正把语音辨成可编辑文字" },
  thinking: { key: "thinking", label: "推演", detail: "正在检索经传并组织回答" },
  preparing: { key: "preparing", label: "润声", detail: "首句语音正在生成" },
  speaking: { key: "speaking", label: "开口", detail: "墨衡正在以语音回答" },
  error: { key: "error", label: "失声", detail: "语音服务暂不可用，文字回答不受影响" },
  casting: { key: "casting", label: "问已收", detail: "原问已定，待掷三钱" },
  reading: { key: "reading", label: "照卦", detail: "可继续追问本卦与经传依据" },
});

export function deriveAvatarPresentation(state = {}) {
  if (state.recording) return PRESENTATIONS.listening;
  if (state.transcribing) return PRESENTATIONS.transcribing;
  if (state.voiceState === "playing") return PRESENTATIONS.speaking;
  if (state.voiceState === "generating") return PRESENTATIONS.preparing;
  if (state.voiceError) return PRESENTATIONS.error;
  if (state.busy) return PRESENTATIONS.thinking;
  if (state.stage === "ready") return PRESENTATIONS.casting;
  if (state.stage === "reading") return PRESENTATIONS.reading;
  return PRESENTATIONS.idle;
}
