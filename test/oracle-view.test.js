import assert from "node:assert/strict";
import test from "node:test";
import { renderOracleView } from "../src/oracle-view.js";

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
  assert.match(html, /moheng-neutral\.webp/u);
  assert.match(html, /moheng-speaking\.webp/u);
  assert.match(html, /data-avatar-label>开口</u);
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
  assert.match(html, /content: "▍"/u);
});

test("recording locks text submission but leaves the stop-recording action available", () => {
  const html = render({ recording: true, recordingMode: "live" });
  assert.match(html, /<textarea[^>]*disabled/u);
  assert.match(html, /data-submit-mode="chat" disabled/u);
  assert.match(html, /data-action="stop-record"/u);
  assert.doesNotMatch(html, /data-action="stop-record" disabled/u);
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
  assert.match(html, /守简问卦 · 传统文化体验 · 卦象仅供参考/u);
  assert.match(html, /class="reading-disclaimer"/u);
  assert.doesNotMatch(html, /文字、最近上下文/u);
  assert.doesNotMatch(html, /发送给 Google Gemini/u);
});

test("cloud UI uses Moheng branding and presents divination as broadly available", () => {
  const html = render();
  assert.match(html, /墨衡云端 · 周易 RAG 已连接/u);
  assert.match(html, /任何主题都可问卦/u);
  assert.match(html, /生意、感情、健康、学业或任何困惑/u);
  assert.match(html, /以此问起卦 · 仅供参考/u);
});

test("a failed cloud turn exposes a user-triggered retry without locking chat", () => {
  const html = render({
    canRetryResponse: true,
    messages: [{ role: "master", text: "本次回答没有完成", error: true }],
  });
  assert.match(html, /data-action="retry-response">重试本次回答/u);
  assert.doesNotMatch(html, /<textarea[^>]*disabled/u);
});
