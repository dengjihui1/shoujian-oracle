import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("shoujian:entry-gate:v1", "seen"));
  await page.route("**/api/status", (route) => route.fulfill({ json: { cloud: true } }));
});

test("问题灵感只填写草稿；小屏无横向溢出且输入在首屏", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const input = page.locator("#say");
  await expect(input).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "事业进退 ↗" }).click();
  await expect(input).toHaveValue("最近在工作上遇到一个选择，想聊聊该怎样理清思路。");
  await expect(input).toBeFocused();
  await expect(page.locator(".message.user")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 360, height: 740 });
  await expect(input).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("设置、草稿光标和六爻折叠状态在重渲染后保留", async ({ page }) => {
  await page.goto("/");
  const drawer = page.locator('[data-drawer="voice"]');
  await expect(drawer).not.toHaveAttribute("open");
  await drawer.locator("summary").click();
  const input = page.locator("#say");
  await input.fill("这一段还没有说完");
  const result = await input.evaluate((field) => {
    field.setSelectionRange(2, 5);
    const host = document.querySelector("shoujian-oracle");
    host.render();
    const next = host.shadowRoot.getElementById("say");
    return { focused: host.shadowRoot.activeElement === next, start: next.selectionStart, end: next.selectionEnd };
  });
  expect(result).toEqual({ focused: true, start: 2, end: 5 });
  await expect(drawer).toHaveAttribute("open", "");
  await expect(input).toHaveValue("这一段还没有说完");
});

test("本地普通发送不隐式起卦；明确选择后完成简短起卦路径", async ({ page }) => {
  await page.route("**/api/status", (route) => route.fulfill({ json: { cloud: false } }));
  await page.goto("/");
  const input = page.locator("#say");
  await input.fill("我想聊聊");
  await input.press("Enter");
  await expect(page.locator(".intake-card")).toHaveCount(0);
  await expect(page.locator(".message.master").last()).toContainText("现在是本地体验");
  await input.fill("未来一周我如何安排学习进度？");
  await page.locator('[data-submit-mode="divination"]').click();
  await page.locator('[data-action="intake-review"]').click();
  await page.locator('[data-action="intake-confirm"]').click();
  await expect(page.locator("#say")).toHaveCount(0);
  await page.locator('[data-action="cast"]').click();
  await expect(page.locator(".reading-explanation")).toBeVisible();
  await expect(page.locator('[data-drawer="hexagram"]')).not.toHaveAttribute("open");
  await page.getByText("展开六爻与卦象结构").click();
  await expect(page.locator(".line")).toHaveCount(6);
  await page.locator("shoujian-oracle").evaluate((host) => host.render());
  await expect(page.locator('[data-drawer="hexagram"]')).toHaveAttribute("open", "");
  await expect(input).toBeEnabled();
});
