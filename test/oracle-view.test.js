import assert from "node:assert/strict";
import test from "node:test";
import { plainReading, renderOracleView } from "../src/oracle-view.js";
import { castHexagram } from "../src/oracle-engine.js";

function render(overrides = {}) {
  return renderOracleView({
    stage: "question",
    cloud: true,
    messages: [],
    busy: false,
    recording: false,
    transcribing: false,
    recorderSupported: true,
    liveTranscriberSupported: true,
    draft: "",
    voiceReplies: false,
    voiceState: "idle",
    voiceButtonLabel: "语音回答：关",
    voiceModeButtonLabel: "切换到云端音色",
    fastVoiceSupported: true,
    voiceConversationActive: false,
    voiceConversationState: "off",
    voiceConversationTranscript: "",
    voiceConversationError: "",
    voiceConversationMetrics: {},
    ...overrides,
  });
}

test("view escapes messages and composer drafts", () => {
  const html = render({
    messages: [{ role: "master", text: '<img src=x onerror="alert(1)">' }],
    draft: "</textarea><script>alert(2)</script>",
  });
  assert.doesNotMatch(html, /<img src=x/u);
  assert.doesNotMatch(html, /<script>alert/u);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/u);
  assert.match(html, /&lt;\/textarea&gt;&lt;script&gt;alert\(2\)&lt;\/script&gt;/u);
});

test("view rejects non-HTTPS evidence links and keeps trusted HTTPS links", () => {
  const html = render({ messages: [{
    role: "master",
    text: "有据可查",
    evidence: [
      { id: "bad", title: "危险", layer: "test", excerpt: "x", sourceUrl: "javascript:alert(1)" },
      { id: "good", title: "可信", layer: "test", excerpt: "y", sourceUrl: "https://example.com/source?a=1&b=2" },
    ],
  }] });
  assert.match(html, /href="#"/u);
  assert.match(html, /href="https:\/\/example\.com\/source\?a=1&amp;b=2"/u);
  assert.doesNotMatch(html, /href="javascript:/u);
});

test("unknown stages fall back to the question state", () => {
  const html = render({ stage: "unexpected" });
  assert.match(html, /master-card stage-question/u);
  assert.match(html, /data-avatar-state="idle"/u);
  assert.match(html, /候问/u);
});

test("view renders the dedicated two-frame virtual diviner stage", () => {
  const html = render({ voiceState: "playing" });
  assert.match(html, /class="avatar-stage" data-avatar-state="speaking"/u);
  assert.match(html, /data-avatar-motion="speak" data-mouth-state="closed"/u);
  assert.match(html, /moheng-neutral\.webp/u);
  assert.match(html, /moheng-speaking\.webp/u);
  assert.match(html, /data-avatar-label>开口</u);
  assert.match(html, /class="avatar-eyelids"/u);
});

test("avatar choreography exposes listening, acknowledgement and reading motions", () => {
  assert.match(render({ voiceConversationState: "listening" }), /data-avatar-motion="listen-lean"/u);
  assert.match(render({ voiceConversationState: "heard" }), /data-avatar-motion="acknowledge"/u);
  assert.match(render({ stage: "reading" }), /data-avatar-motion="present-reading"/u);
  assert.match(render({ stage: "reading" }), /class="avatar-reading-token"/u);
  assert.match(render(), /@media\(prefers-reduced-motion:reduce\)/u);
});

test("view makes a speech failure visible without disabling text chat", () => {
  const html = render({ voiceReplies: true, voiceError: "当前额度不足", voiceButtonLabel: "语音暂不可用 · 文字仍可用" });
  assert.match(html, /data-avatar-state="error"/u);
  assert.match(html, /语音暂不可用：当前额度不足/u);
  assert.doesNotMatch(html, /data-submit-mode="chat" disabled/u);
});

test("enabled voice exposes an explicit fast or cloud mode switch", () => {
  const html = render({ voiceReplies: true, voiceButtonLabel: "语音回答：极速" });
  assert.match(html, /data-action="voice-mode"/u);
  assert.match(html, /切换到云端音色/u);
});

test("busy state disables the composer while keeping cancellation available", () => {
  const html = render({ busy: true });
  assert.match(html, /<textarea[^>]*disabled/u);
  assert.match(html, /data-submit-mode="chat" disabled/u);
  assert.match(html, /data-action="cancel-response"/u);
});

test("streaming messages expose the progressive cursor class", () => {
  const html = render({ messages: [{ role: "master", text: "正在回答", streaming: true }] });
  assert.match(html, /message master\s+streaming/u);
  assert.match(html, /\.message\.streaming p::after/u);
  assert.match(html, /content:\s*"▍"/u);
});

test("recording locks text submission but leaves the stop-recording action available", () => {
  const html = render({ recording: true, recordingMode: "live" });
  assert.match(html, /<textarea[^>]*disabled/u);
  assert.match(html, /data-submit-mode="chat" disabled/u);
  assert.match(html, /data-action="stop-record"/u);
  assert.doesNotMatch(html, /data-action="stop-record" disabled/u);
});

test("pending microphone permission exposes cancellation and locks other send paths", () => {
  const html = render({ recordingStarting: true, recorderPermissionPending: true });
  assert.match(html, /data-action="cancel-record"/u);
  assert.match(html, /data-action="voice-conversation" disabled/u);
  assert.match(html, /data-action="clear-memory" disabled/u);
  assert.match(html, /<textarea id="say" maxlength="500" disabled/u);
});

test("ready stage prevents voice input that cannot be submitted", () => {
  const html = render({ stage: "ready" });
  assert.match(html, /data-action="record" disabled/u);
});

test("visible footer stays concise while the reading card carries the reference note", () => {
  const reading = {
    lines: [7, 8, 7, 8, 7, 8],
    primary: { number: 1, symbol: "䷀", fullName: "乾为天", lower: { symbol: "☰", name: "乾", image: "天" }, upper: { symbol: "☰", name: "乾", image: "天" } },
    changed: null,
  };
  const html = render({ stage: "reading", question: "这门生意如何？", reading });
  assert.match(html, /传统文化体验 · 卦象仅供参考/u);
  assert.match(html, /class="reading-disclaimer"/u);
  assert.doesNotMatch(html, /文字、最近上下文/u);
  assert.doesNotMatch(html, /发送给 Google Gemini/u);
});

test("a moving question gets a conditional plain-language decision check", () => {
  const reading = castHexagram([7, 7, 7, 8, 9, 8]);
  const reply = plainReading(reading, "给我起卦，搬家合不合适？");
  assert.match(reply, /新住处交付、搬运安排和费用/u);
  assert.match(reply, /先列出最重要的事项和顺序，再检查风险和缺口/u);
  assert.match(reply, /地天泰/u);
  assert.doesNotMatch(reply, /会顺利|一定合适/u);
});

test("matching trigrams produce one clear action without pretending facts are verified", () => {
  const reply = plainReading(castHexagram([7, 7, 7, 7, 7, 7]), "如何安排阅读？");
  assert.match(reply, /如果关键条件已核实/u);
  assert.equal(reply.match(/列出最重要的事项和顺序/gu)?.length, 1);
});

test("plain reading avoids duplicated sequencing words for thunder and mountain", () => {
  for (const lines of [[7, 8, 8, 8, 7, 8], [8, 8, 7, 8, 7, 8]]) {
    const reply = plainReading(castHexagram(lines), "这件事如何准备？");
    assert.doesNotMatch(reply, /先先|再先/u);
    assert.match(reply, /这卦提醒你/u);
  }
});

test("replaying the entrance cannot hide active microphone or cancellation controls", () => {
  for (const state of [{ recording: true }, { recordingStarting: true }, { voiceConversationActive: true }, { busy: true }, { transcribing: true }]) {
    assert.match(render(state), /data-action="replay-entry" disabled/u);
  }
});

test("cloud UI uses Moheng branding and presents divination as broadly available", () => {
  const html = render();
  assert.match(html, /墨衡已连接/u);
  assert.match(html, /借一卦，/u);
  assert.match(html, /生意、感情、健康、学业或任何困惑/u);
  assert.match(html, /以此问起卦/u);
});

test("a failed cloud turn exposes a user-triggered retry without locking chat", () => {
  const html = render({
    canRetryResponse: true,
    messages: [{ role: "master", text: "本次回答没有完成", error: true }],
  });
  assert.match(html, /data-action="retry-response">重试本次回答/u);
  assert.doesNotMatch(html, /<textarea[^>]*disabled/u);
});

test("view exposes keyboard guidance and only shows jump-to-latest when unread", () => {
  const current = render({ showJumpToLatest: true });
  assert.match(current, /Enter 发送 · Shift\+Enter 换行/u);
  assert.match(current, /data-action="jump-latest" >回到最新消息 ↓/u);
  const followed = render({ showJumpToLatest: false });
  assert.match(followed, /data-action="jump-latest" hidden/u);
});

test("intake stage asks one bounded question and allows skip or early review", () => {
  const html = render({
    stage: "intake",
    intake: {
      status: "collecting",
      cursor: 0,
      questions: [{ id: "timeframe", label: "观察时间", prompt: "希望观察到什么时候？" }, { id: "constraint", label: "关键约束", prompt: "关键约束是什么？" }],
    },
  });
  assert.match(html, /起卦前理问 · 1 \/ 2/u);
  assert.match(html, /希望观察到什么时候/u);
  assert.match(html, /data-action="intake-skip"/u);
  assert.match(html, /data-action="intake-review"/u);
  assert.doesNotMatch(html, /data-action="cast"/u);
});

test("intake review is editable and must be confirmed before casting", () => {
  const review = render({
    stage: "intake",
    intake: { status: "review", summary: "所问：是否继续项目", questions: [], cursor: 0 },
    intakeSummaryDraft: "所问：未来三个月是否继续项目",
  });
  assert.match(review, /data-intake-summary/u);
  assert.match(review, /未来三个月是否继续项目/u);
  assert.match(review, /data-action="intake-confirm"/u);
  assert.doesNotMatch(review, /data-action="cast"/u);

  const ready = render({
    stage: "ready",
    intake: { status: "confirmed", summary: "所问：未来三个月是否继续项目" },
  });
  assert.match(ready, /这次所问 · 已确认/u);
  assert.match(ready, /data-action="cast"/u);
});

test("supported browsers expose explicit automatic voice conversation", () => {
  const html = render();
  assert.match(html, /自动语音对话/u);
  assert.match(html, /开始语音对话（自动发送）/u);
  assert.match(html, /实时转写取决于浏览器支持/u);
});

test("active voice conversation reports transcript, latency and interruption", () => {
  const html = render({
    voiceReplies: true,
    voiceConversationActive: true,
    voiceConversationState: "speaking",
    voiceConversationTranscript: "我想换个角度问",
    voiceConversationMetrics: { asrFinalMs: 612, firstTokenMs: 840, firstAudioMs: 1_420 },
  });
  assert.match(html, /结束语音对话/u);
  assert.match(html, /打断并说话/u);
  assert.match(html, /我想换个角度问/u);
  assert.match(html, /ASR 定稿/u);
  assert.match(html, /612 ms/u);
  assert.match(html, /1\.4 s/u);
  assert.doesNotMatch(html, /data-action="record"/u);
  assert.doesNotMatch(html, /data-action="voice"/u);
});

test("voice conversation failure keeps text composer enabled and offers retry", () => {
  const html = render({
    voiceConversationActive: true,
    voiceConversationState: "error",
    voiceConversationError: "麦克风权限未开启",
  });
  assert.match(html, /麦克风权限未开启/u);
  assert.match(html, /data-action="voice-conversation-retry"/u);
  assert.doesNotMatch(html, /<textarea[^>]*disabled/u);
});

test("voice performance summary exposes P50 P95 and privacy-safe export", () => {
  const html = render({
    voicePerformanceSummary: {
      turns: 12,
      asrFinalMs: { samples: 12, p50: 480, p95: 920 },
      firstTokenMs: { samples: 12, p50: 760, p95: 1_450 },
      firstAudioMs: { samples: 10, p50: 1_100, p95: 2_200 },
    },
  });
  assert.match(html, /本机验收 · 12 轮/u);
  assert.match(html, /P50 \/ P95/u);
  assert.match(html, /data-action="export-voice-metrics"/u);
  assert.match(html, /不保存录音或转写内容/u);
});
