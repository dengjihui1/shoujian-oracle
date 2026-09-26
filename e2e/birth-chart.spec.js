import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("shoujian:entry-gate:v1", "seen"));
  await page.route("**/api/status", (route) => route.fulfill({ json: { cloud: true, paidAudioEnabled: false } }));
});

test("生辰本机排盘按需加载，授权前不上传，刷新不保留原始生辰", async ({ page }) => {
  const requests = [];
  const calendars = [];
  page.on("request", (request) => { if (request.url().includes("lunar-vendor")) calendars.push(request.url()); });
  await page.route("**/api/chat/stream", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ contentType: "text/event-stream", body: 'event: done\ndata: {"text":"可以，我们从眼前的条件开始聊。"}\n\n' });
  });
  await page.goto("/");
  expect(calendars).toHaveLength(0);
  await page.locator('[data-drawer="birth"]>summary').click();
  await page.locator("#birth-date").fill("2005-12-23");
  await page.locator("#birth-time").fill("08:37");
  await page.getByRole("button", { name: "在本机排盘" }).click();
  await expect(page.locator(".pillars")).toContainText("乙酉");
  await expect(page.locator(".pillars")).toContainText("壬辰");
  expect(calendars).toHaveLength(1);
  await page.locator("#say").fill("先正常聊聊");
  await page.locator('[data-submit-mode="chat"]').click();
  await expect(page.locator("#say")).toBeEnabled();
  expect(requests[0]).not.toHaveProperty("birthContext");
  expect(JSON.stringify(requests)).not.toContain("2005-12-23");
  await page.locator("#birth-consent").check();
  await page.locator("#say").fill("结合生辰参照解释一下日主这个词");
  await page.locator('[data-submit-mode="chat"]').click();
  await expect(page.locator("#say")).toBeEnabled();
  expect(requests[1].birthConsent).toBe(true);
  expect(requests[1].birthContext.pillars).toEqual(["乙酉", "戊子", "辛巳", "壬辰"]);
  expect(JSON.stringify(requests)).not.toContain("08:37");
  await page.locator("#birth-consent").uncheck();
  await page.locator("#say").fill("再聊聊");
  await page.locator('[data-submit-mode="chat"]').click();
  await expect(page.locator("#say")).toBeEnabled();
  expect(requests[2]).not.toHaveProperty("birthContext");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("2005-12-23");
  await page.reload();
  await page.locator('[data-drawer="birth"]>summary').click();
  await expect(page.locator("#birth-date")).toHaveValue("");
  await expect(page.locator(".birth-result")).toHaveCount(0);
});

test("农历闰月可排盘，修改日期立即撤回旧结果与授权", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-drawer="birth"]>summary').click();
  await page.locator("#birth-calendar").selectOption("lunar");
  await page.locator("#birth-date").fill("2023-02-01");
  await page.locator('[data-birth-field="leapMonth"]').check();
  await page.getByRole("button", { name: "在本机排盘" }).click();
  await expect(page.locator(".birth-result")).toContainText("2023-03-22");
  await expect(page.locator(".pillars dd").last()).toHaveText("待定");
  await page.locator("#birth-consent").check();
  await page.locator("#birth-date").fill("2024-02-01");
  await expect(page.locator(".birth-result")).toHaveCount(0);
  await page.getByRole("button", { name: "在本机排盘" }).click();
  await expect(page.locator(".birth-error")).toContainText("不存在");
  await expect(page.locator(".birth-result")).toHaveCount(0);
});

test("节省预算模式隐藏云端音色选项并保留文字输入", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-drawer="voice"]>summary').click();
  await expect(page.locator('[data-action="voice-mode"]')).toHaveCount(0);
  await expect(page.getByText("本站未开启付费录音转写和云端朗读", { exact: false })).toBeVisible();
  await expect(page.locator("#say")).toBeEnabled();
});

test("付费语音关闭且识别断网时只提示文字，不引导到已禁用录音", async ({ page }) => {
  let paidRequests = 0;
  page.on("request", (request) => { if (/\/api\/(transcribe|speech)(?:\?|$)/u.test(request.url())) paidRequests += 1; });
  await page.addInitScript(() => {
    class Recognition {
      start() { globalThis.__birthBudgetRecognition = this; this.onstart?.(); }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    }
    globalThis.SpeechRecognition = Recognition;
    globalThis.webkitSpeechRecognition = Recognition;
  });
  await page.goto("/");
  await page.locator('[data-drawer="voice"]>summary').click();
  await page.locator('[data-action="record"]').click();
  await page.evaluate(() => globalThis.__birthBudgetRecognition.onerror({ error: "network" }));
  await expect(page.getByText("本站未开启付费录音转写；请继续使用文字输入。", { exact: false })).toBeVisible();
  await expect(page.locator('[data-action="record"]')).toHaveCount(0);
  await expect(page.locator("#say")).toBeEnabled();
  expect(paidRequests).toBe(0);
});
