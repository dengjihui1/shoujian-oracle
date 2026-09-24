import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const STATUS = {
  cloud: true,
  knowledge: { hexagrams: 64, trigrams: 8, fragments: 456 },
  serverTime: "2026年9月23日 12:00:00（Asia/Shanghai）",
};

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript(() => {
    if (!sessionStorage.getItem("shoujian-e2e-initialized")) {
      localStorage.clear();
      sessionStorage.setItem("shoujian-e2e-initialized", "1");
    }
    class FakeUtterance {
      constructor(text) { this.text = text; }
    }
    class FakeRecognition {
      start() {
        globalThis.__shoujianRecognition = this;
        globalThis.__shoujianRecognitionStarts = (globalThis.__shoujianRecognitionStarts ?? 0) + 1;
      }
      stop() { this.onend?.(); }
      abort() { this.onerror?.({ error: "aborted" }); }
    }
    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", { configurable: true, value: FakeUtterance });
    Object.defineProperty(globalThis, "SpeechRecognition", { configurable: true, value: FakeRecognition });
    Object.defineProperty(globalThis, "speechSynthesis", {
      configurable: true,
      value: { speak() {}, cancel() {}, getVoices() { return []; } },
    });
  });
  await page.route("**/api/status", (route) => route.fulfill({ json: STATUS }));
});

test("重新挂载组件后，旧状态请求不能覆盖新状态", async ({ page }) => {
  let releaseOld;
  let firstSeen;
  let calls = 0;
  const oldGate = new Promise((resolve) => { releaseOld = resolve; });
  const firstRequest = new Promise((resolve) => { firstSeen = resolve; });
  await page.unroute("**/api/status");
  await page.route("**/api/status", async (route) => {
    if (++calls === 1) {
      firstSeen();
      await oldGate;
      try { await route.fulfill({ json: { ...STATUS, cloud: false } }); } catch { /* old request may be cancelled */ }
    } else {
      await route.fulfill({ json: STATUS });
    }
  });
  await page.goto("/");
  await firstRequest;
  await page.evaluate(() => {
    const oracle = document.querySelector("shoujian-oracle");
    oracle.remove();
    document.body.append(oracle);
  });
  await expect(page.locator(".system-state .status")).toContainText("已连接");
  releaseOld();
  await page.waitForTimeout(200);
  await expect(page.locator(".system-state .status")).toContainText("已连接");
});

test("连续三轮文字对话都能用 Enter 发送并恢复输入", async ({ page }) => {
  let turn = 0;
  await mockChatStream(page, () => `第 ${++turn} 轮回答完成。`);
  await page.goto("/");

  for (const prompt of ["你是谁", "你能做什么", "今天适合聊什么"]) {
    await sendWithEnter(page, prompt);
    await expect(page.locator(".message.user p", { hasText: prompt })).toBeVisible();
    await expect(page.locator(".message.master p", { hasText: `第 ${turn} 轮回答完成。` })).toBeVisible();
    await expect(composer(page)).toBeEnabled();
  }

  await expect(page.locator(".message.user")).toHaveCount(3);
});

test("停止长回答后仍可继续下一轮", async ({ page }) => {
  let turn = 0;
  await mockChatStream(page, async () => {
    if (++turn === 1) {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      return "这段回答应该已经被取消。";
    }
    return "停止以后仍然可以继续回答。";
  });
  await page.goto("/");

  await sendWithEnter(page, "先给我一个很长的回答", { waitForReply: false });
  await page.locator('[data-action="cancel-response"]').click();
  await expect(page.locator(".message.master p", { hasText: "已停止" })).toBeVisible();
  await expect(composer(page)).toBeEnabled();

  await sendWithEnter(page, "停止后再问一轮");
  await expect(page.locator(".message.master p", { hasText: "停止以后仍然可以继续回答。" })).toBeVisible();
  await expect(composer(page)).toBeEnabled();
});

test("起卦必须经过访谈、摘要确认，再由程序排卦", async ({ page }) => {
  await mockChatStream(page, () => "我只依据程序给出的卦象作参考解读。卦象不替你决定。" );
  await page.goto("/");

  await composer(page).fill("未来三个月，我已经投入半年且预算有限，这个项目要不要继续？");
  await page.locator('[data-submit-mode="divination"]').click();
  await expect(page.locator(".intake-card")).toContainText("1 / 2");
  await expect(page.locator('[data-action="cast"]')).toHaveCount(0);

  await answerIntake(page, "我最看重能否稳定回款");
  await answerIntake(page, "最大疑点是两个月后现金流");
  const summary = page.locator("[data-intake-summary]");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("稳定回款");
  await expect(page.locator('[data-action="cast"]')).toHaveCount(0);

  await page.locator('[data-action="intake-confirm"]').click();
  await expect(page.locator('[data-action="cast"]')).toBeVisible();
  await page.locator('[data-action="cast"]').click();
  await expect(page.locator(".reading")).toBeVisible();
  await expect(page.locator(".reading .question")).toContainText("稳定回款");
  await expect(page.locator(".message.master p", { hasText: "卦象不替你决定" })).toBeVisible();
  await expect(composer(page)).toBeEnabled();
});

test("云端 TTS 失败只降级语音，不锁死文字输入", async ({ page }) => {
  await page.route("**/api/speech", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "tts_unavailable", message: "测试中的语音服务不可用" }),
  }));
  await mockChatStream(page, () => "第一句用于触发语音。第二句确认文字回答完整。" );
  await page.goto("/");

  await page.locator('[data-action="voice"]').click();
  await page.locator('[data-action="voice-mode"]').click();
  await expect(page.locator('[data-action="voice"]')).toContainText("云端");
  await sendWithEnter(page, "请朗读这一轮");

  await expect(page.locator("[data-voice-notice]")).toContainText("测试中的语音服务不可用");
  await expect(page.locator(".message.master p", { hasText: "文字回答完整" })).toBeVisible();
  await expect(composer(page)).toBeEnabled();
  await composer(page).fill("语音失败后仍能输入");
  await expect(composer(page)).toHaveValue("语音失败后仍能输入");
});

test("本机会话可导出、清除并从文件恢复", async ({ page }) => {
  await mockChatStream(page, () => "这轮会话会被保存在导出文件里。" );
  await page.goto("/");
  await sendWithEnter(page, "请保存这一轮");

  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-action="export-memory"]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^shoujian-session-\d{4}-\d{2}-\d{2}\.json$/u);
  const path = await download.path();
  const exported = JSON.parse(await readFile(path, "utf8"));
  expect(exported.schema).toBe("shoujian.oracle-session");
  expect(exported.session.messages.some(({ text }) => text === "请保存这一轮")).toBe(true);

  await page.locator('[data-action="clear-memory"]').click();
  await expect(page.locator(".message.user")).toHaveCount(0);
  await page.locator("[data-session-import]").setInputFiles(path);
  await expect(page.locator(".message.user p", { hasText: "请保存这一轮" })).toBeVisible();
  await expect(page.locator(".message.master p", { hasText: "本机会话已导入" })).toBeVisible();
  await expect(composer(page)).toBeEnabled();
});

test("导入异常来源记录后页面仍可用，刷新也不会被污染", async ({ page }) => {
  await page.goto("/");
  const file = {
    name: "shoujian-session.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      schema: "shoujian.oracle-session",
      version: 1,
      session: { messages: [
        { role: "user", text: "测试导入" },
        { role: "master", text: "保留回答", evidence: [null, { id: "ZY-01-LINE-1", title: "乾", sourceUrl: "https://example.com/source" }] },
      ] },
    })),
  };
  await page.locator("[data-session-import]").setInputFiles(file);
  await expect(page.locator(".message.master p", { hasText: "保留回答" })).toBeVisible();
  await expect(page.locator('a[href="https://example.com/source"]')).toHaveCount(0);
  await expect(composer(page)).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem("shoujian-oracle:conversation:v1"))).toContain("保留回答");
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem("shoujian-oracle:conversation:v1"))).toContain("保留回答");
  expect(await page.locator("shoujian-oracle").evaluate((host) => host.memory.loadSession().messages.map((message) => message.text))).toContain("保留回答");
  await expect(page.locator(".message.master p", { hasText: "保留回答" })).toBeVisible();
  await expect(composer(page)).toBeEnabled();
});

test("语音验收报告只导出延迟，不包含转写内容", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("墨衡云端 · 周易 RAG 已连接")).toBeVisible();
  const injected = await page.locator("shoujian-oracle").evaluate((host) => {
    host.voicePerformance.record({ listeningAt: 10, submittedAt: 20, asrFinalMs: 80, firstTokenMs: 620, firstAudioMs: 980, turnComplete: true, transcript: "不应导出" });
    host.render();
    return host.voicePerformance.summary;
  });
  expect(injected.turns).toBe(1);
  await expect(page.getByText("本机验收 · 1 轮")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-action="export-voice-metrics"]').click();
  const download = await downloadPromise;
  const path = await download.path();
  const reportText = await readFile(path, "utf8");
  const report = JSON.parse(reportText);
  expect(report.schema).toBe("shoujian.voice-performance");
  expect(report.samples).toEqual([{ asrFinalMs: 80, firstTokenMs: 620, firstAudioMs: 980 }]);
  expect(reportText).not.toContain("不应导出");
});

test("连续语音遇到安静结束后会重新倾听并完成下一轮", async ({ page }) => {
  await mockChatStream(page, () => "我是墨衡。" );
  await page.goto("/");
  await page.evaluate(() => {
    speechSynthesis.speak = (utterance) => {
      utterance.onstart?.();
      utterance.onend?.();
    };
  });
  await page.locator('[data-action="voice-conversation"]').click();
  await page.waitForFunction(() => globalThis.__shoujianRecognitionStarts === 1);
  await page.evaluate(() => globalThis.__shoujianRecognition.onerror({ error: "no-speech" }));
  await page.waitForFunction(() => globalThis.__shoujianRecognitionStarts >= 2);
  await page.evaluate(() => {
    const result = [{ transcript: "你是谁" }];
    result.isFinal = true;
    globalThis.__shoujianRecognition.onresult({ resultIndex: 0, results: [result] });
  });
  await expect(page.locator(".message.user p", { hasText: "你是谁" })).toBeVisible();
  await expect(page.locator(".message.master p", { hasText: "我是墨衡。" })).toBeVisible();
  await page.waitForFunction(() => globalThis.__shoujianRecognitionStarts >= 3);
  await expect(page.locator('[data-action="voice-conversation"]')).toContainText("结束");
});

test("连续语音重报累计识别结果时只送问一次且不重复文字", async ({ page }) => {
  await mockChatStream(page, () => "听到了。" );
  await page.goto("/");
  await page.evaluate(() => {
    speechSynthesis.speak = (utterance) => { utterance.onstart?.(); utterance.onend?.(); };
  });
  await page.locator('[data-action="voice-conversation"]').click();
  await page.evaluate(() => {
    const segment = (transcript, isFinal) => Object.assign([{ transcript }], { isFinal });
    const recognition = globalThis.__shoujianRecognition;
    recognition.onresult({ resultIndex: 0, results: [segment("我想", true), segment("问天气", false)] });
    recognition.onresult({ resultIndex: 1, results: [segment("我想", true), segment("问天气", true)] });
    recognition.onresult({ resultIndex: 0, results: [segment("我想", true), segment("问天气", true)] });
  });
  await expect(page.locator(".message.user p", { hasText: "我想 问天气" })).toHaveText("我想 问天气");
  await expect(page.locator(".message.user")).toHaveCount(1);
  await expect(page.locator(".message.master p", { hasText: "听到了。" })).toBeVisible();
});

test("浏览器实时识别网络失败后切到录音转文字", async ({ page }) => {
  await page.route("**/api/transcribe", (route) => route.fulfill({ json: { text: "录音转写成功" } }));
  await page.goto("/");
  await page.locator("shoujian-oracle").evaluate((host) => {
    host.recorder = {
      supported: true,
      starting: false,
      async start() {},
      async stop() { return new Blob(["test-audio"], { type: "audio/webm" }); },
      async cancel() {},
    };
  });
  await page.locator('[data-action="voice-conversation"]').click();
  await page.evaluate(() => globalThis.__shoujianRecognition.onerror({ error: "network" }));
  await expect(page.locator('[data-action="voice-conversation"]')).toHaveCount(0);
  await expect(page.locator('[data-action="voice"]')).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("已切换为录音转文字", { exact: false })).toBeVisible();
  await page.locator('[data-action="record"]').click();
  await expect(page.locator('[data-action="stop-record"]')).toContainText("停止并转文字");
  await page.locator('[data-action="stop-record"]').click();
  await expect(page.locator("textarea#say")).toHaveValue("录音转写成功");
});

test("单次语音输入网络失败后也能改用录音", async ({ page }) => {
  await page.route("**/api/transcribe", (route) => route.fulfill({ json: { text: "单次录音成功" } }));
  await page.goto("/");
  await page.locator("shoujian-oracle").evaluate((host) => {
    host.recorder = {
      supported: true,
      starting: false,
      async start() {},
      async stop() { return new Blob(["test-audio"], { type: "audio/webm" }); },
      async cancel() {},
    };
  });
  await page.locator('[data-action="record"]').click();
  await page.evaluate(() => globalThis.__shoujianRecognition.onerror({ error: "network" }));
  await expect(page.getByText("已切换为录音转文字", { exact: false })).toBeVisible();
  await expect(page.locator('[data-action="record"]')).toContainText("按下说话");
  await page.locator('[data-action="record"]').click();
  await page.locator('[data-action="stop-record"]').click();
  await expect(page.locator("textarea#say")).toHaveValue("单次录音成功");
});

test("浏览器识别和录音都不可用时保留文字入口", async ({ page }) => {
  await page.goto("/");
  await page.locator("shoujian-oracle").evaluate((host) => {
    host.recorder = { supported: false, cancel() {} };
  });
  await page.locator('[data-action="voice-conversation"]').click();
  await page.evaluate(() => globalThis.__shoujianRecognition.onerror({ error: "network" }));
  await expect(page.getByText("当前浏览器也不支持录音转文字", { exact: false })).toBeVisible();
  await expect(page.locator('[data-action="record"]')).toHaveCount(0);
  await expect(page.locator("textarea#say")).toBeEnabled();
});

test("识别网络失败后真实 MediaRecorder 能录制并释放合成麦克风流", async ({ page }) => {
  let uploaded = null;
  await page.route("**/api/transcribe", async (route) => {
    uploaded = route.request().postDataJSON();
    await route.fulfill({ json: { text: "合成音频已转写" } });
  });
  await page.addInitScript(() => {
    if (!navigator.mediaDevices || typeof AudioContext !== "function") return;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const output = context.createMediaStreamDestination();
        oscillator.connect(output);
        oscillator.start();
        globalThis.__syntheticMicrophone = { context, oscillator, stream: output.stream };
        return output.stream;
      },
    });
  });
  await page.goto("/");
  const nativeCapture = await page.evaluate(() => typeof MediaRecorder === "function" && typeof AudioContext === "function" && typeof navigator.mediaDevices?.getUserMedia === "function");
  await page.locator('[data-action="record"]').click();
  await page.evaluate(() => globalThis.__shoujianRecognition.onerror({ error: "network" }));
  if (!nativeCapture) {
    await expect(page.getByText("当前浏览器也不支持录音转文字", { exact: false })).toBeVisible();
    await expect(page.locator("textarea#say")).toBeEnabled();
    return;
  }
  await page.locator('[data-action="record"]').click();
  await expect(page.locator('[data-action="stop-record"]')).toContainText("停止并转文字");
  await page.waitForTimeout(250);
  await page.locator('[data-action="stop-record"]').click();
  await expect(page.locator("textarea#say")).toHaveValue("合成音频已转写");
  expect(uploaded.mimeType).toMatch(/^audio\//u);
  expect(uploaded.data.length).toBeGreaterThan(500);
  const trackStates = await page.evaluate(() => globalThis.__syntheticMicrophone.stream.getTracks().map((track) => track.readyState));
  expect(trackStates).toEqual(["ended"]);
});

test("录音器自行停止后页面自动转写并恢复输入", async ({ page }) => {
  await page.route("**/api/transcribe", (route) => route.fulfill({ json: { text: "自动停止的录音" } }));
  await page.goto("/");
  await page.locator('[data-action="record"]').click();
  await page.evaluate(() => globalThis.__shoujianRecognition.onerror({ error: "network" }));
  await page.locator("shoujian-oracle").evaluate((host) => {
    host.recorder = {
      supported: true,
      starting: false,
      async start() {
        this.result = new Promise((resolve) => { globalThis.__finishRecordedAudio = () => resolve(new Blob(["recorded-audio"], { type: "audio/webm" })); });
      },
      stop() { return this.result; },
      cancel() {},
    };
    host.render();
  });
  await page.locator('[data-action="record"]').click();
  await expect(page.locator('[data-action="stop-record"]')).toBeVisible();
  await page.evaluate(() => globalThis.__finishRecordedAudio());
  await expect(page.locator("textarea#say")).toHaveValue("自动停止的录音");
  await expect(page.locator("textarea#say")).toBeEnabled();
});

test("录音器中途报错后页面解除占用并保留文字输入", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-action="record"]').click();
  await page.evaluate(() => globalThis.__shoujianRecognition.onerror({ error: "network" }));
  await page.locator("shoujian-oracle").evaluate((host) => {
    host.recorder = {
      supported: true,
      starting: false,
      async start() {
        this.result = new Promise((resolve, reject) => { globalThis.__failRecordedAudio = () => reject(new Error("录音设备已断开")); });
      },
      stop() { return this.result; },
      cancel() {},
    };
    host.render();
  });
  await page.locator('[data-action="record"]').click();
  await page.evaluate(() => globalThis.__failRecordedAudio());
  await expect(page.locator(".message.master p", { hasText: "录音设备已断开" })).toBeVisible();
  await expect(page.locator("textarea#say")).toBeEnabled();
  await expect(page.locator('[data-action="record"]')).toBeVisible();
});

test("旧实时识别的迟到结果不会结束新一轮录音", async ({ page }) => {
  await page.goto("/");
  const state = await page.locator("shoujian-oracle").evaluate(async (host) => {
    const finish = [];
    const interim = [];
    host.liveTranscriber = {
      supported: true,
      start({ onText }) { interim.push(onText); return new Promise((resolve) => finish.push(resolve)); },
      abort() {},
      stop() {},
    };
    await host.startRecording();
    host.cancelRecording();
    await host.startRecording();
    interim[0]("上一轮迟到的临时文字");
    finish[0]("上一轮迟到的文字");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const oldIgnored = host.recording && host.draft === "";
    finish[1]("本轮文字");
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { oldIgnored, recording: host.recording, draft: host.draft };
  });
  expect(state).toEqual({ oldIgnored: true, recording: false, draft: "本轮文字" });
});

test("录音授权未返回时重复启动只发起一次，离开页面后释放录音", async ({ page }) => {
  await page.goto("/");
  const state = await page.locator("shoujian-oracle").evaluate(async (host) => {
    let grant;
    let starts = 0;
    let stops = 0;
    host.liveTranscriber = { supported: false, abort() {} };
    host.recorder = {
      start() { starts += 1; return new Promise((resolve) => { grant = resolve; }); },
      cancel() { if (!this.cancelled) stops += 1; this.cancelled = true; return Promise.resolve(); },
    };
    const first = host.startRecording();
    await host.startRecording();
    host.remove();
    grant();
    await first;
    return { starts, stops, recording: host.recording, starting: host.recordingStarting };
  });
  expect(state).toEqual({ starts: 1, stops: 1, recording: false, starting: false });
});

test("等待录音授权时可取消并恢复文字输入，迟到的授权不会启动录音", async ({ page }) => {
  await page.goto("/");
  const state = await page.locator("shoujian-oracle").evaluate(async (host) => {
    let grant;
    let cancellations = 0;
    host.liveTranscriber = { supported: false, abort() {} };
    host.recorder = {
      supported: true,
      starting: false,
      start() { this.starting = true; return new Promise((resolve) => { grant = () => { this.starting = false; resolve(); }; }); },
      cancel() { cancellations += 1; return Promise.resolve(); },
    };
    const first = host.startRecording();
    const pendingButton = host.shadowRoot.querySelector('[data-action="cancel-record"]');
    const locked = host.shadowRoot.querySelector("textarea#say").disabled;
    pendingButton.click();
    const unlocked = !host.shadowRoot.querySelector("textarea#say").disabled;
    grant();
    await first;
    return {
      pendingLabel: pendingButton.textContent,
      locked,
      unlocked,
      cancellations,
      recording: host.recording,
      starting: host.recordingStarting,
      errors: host.messages.filter((message) => message.error).length,
    };
  });
  expect(state).toEqual({
    pendingLabel: "等待麦克风授权 · 取消",
    locked: true,
    unlocked: true,
    cancellations: 2,
    recording: false,
    starting: false,
    errors: 0,
  });
});

function composer(page) {
  return page.locator("textarea#say");
}

async function sendWithEnter(page, text, { waitForReply = true } = {}) {
  const field = composer(page);
  await expect(field).toBeEnabled();
  await field.fill(text);
  await field.press("Enter");
  if (waitForReply) await expect(page.locator(".message.streaming")).toHaveCount(0);
}

async function answerIntake(page, text) {
  const field = composer(page);
  await field.fill(text);
  await field.press("Enter");
}

async function mockChatStream(page, answer) {
  await page.route("**/api/chat/stream", async (route) => {
    const payload = route.request().postDataJSON();
    const text = await answer(payload);
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      headers: { "cache-control": "no-store", "x-accel-buffering": "no" },
      body: [
        event("meta", { evidence: [], grounded: false, purpose: payload.purpose ?? "chat" }),
        event("delta", { text }),
        event("done", { text, evidence: [], grounded: false, purpose: payload.purpose ?? "chat" }),
      ].join(""),
    });
  });
}

function event(name, data) {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}
