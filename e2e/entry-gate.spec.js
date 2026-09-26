import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/status", (route) => route.fulfill({ json: { cloud: false } }));
});

test("first visit waits for explicit entry and restores the composer", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const gate = page.locator(".entry-gate");
  const enter = gate.locator("[data-enter-gate]");
  await expect(gate).toBeVisible();
  await expect(enter).toBeFocused();
  await expect(page.locator("shoujian-oracle")).toHaveJSProperty("inert", true);
  // Regression: the previous entrance opened itself after 1.7 seconds.
  await page.waitForTimeout(1900);
  await expect(gate).toBeVisible();
  await enter.click();
  await expect(gate).toHaveCount(0);
  await expect(page.locator("shoujian-oracle")).toHaveJSProperty("inert", false);
  await expect(page.locator("shoujian-oracle textarea#say")).toBeFocused();
  await page.reload();
  await expect(page.locator(".entry-gate")).toHaveCount(0);
});

test("keyboard stays inside the entrance, and Escape or skip enters directly", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const enter = page.locator("[data-enter-gate]");
  const skip = page.locator("[data-skip-gate]");
  await expect(enter).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(skip).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(enter).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".entry-gate")).toHaveCount(0);
  await expect(page.locator("shoujian-oracle textarea#say")).toBeFocused();
  await replay(page);
  await page.locator("[data-skip-gate]").click();
  await expect(page.locator(".entry-gate")).toHaveCount(0);
  await expect(page.locator("shoujian-oracle")).toHaveJSProperty("inert", false);
});

test("replay preserves conversation and draft, restores focus after a render, and does not duplicate gates", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page.locator("[data-skip-gate]").click();
  await page.locator("shoujian-oracle").evaluate((host) => {
    host.appendMessage({ role: "user", text: "重播开场也要保留的对话" });
    host.persistMemory();
    host.render();
  });
  const composer = page.locator("shoujian-oracle textarea#say");
  await composer.fill("尚未发送的问题");
  await replay(page);
  await replay(page);
  await expect(page.locator(".entry-gate")).toHaveCount(1);
  await page.locator("shoujian-oracle").evaluate((host) => host.render());
  await page.keyboard.press("Escape");
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue("尚未发送的问题");
  await expect(page.locator(".message.user")).toContainText("重播开场也要保留的对话");
  await replay(page);
  await page.locator("[data-skip-gate]").click();
  await expect(composer).toBeFocused();
  await expect(page.locator(".message.user")).toHaveCount(1);
});

test("replay restores the prior button and preserves previously inert content", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page.locator("[data-skip-gate]").click();
  await page.evaluate(() => {
    const button = document.createElement("button");
    button.id = "replay-test-button";
    button.textContent = "重看开场";
    document.body.append(button);
    const inert = document.createElement("div");
    inert.id = "already-inert";
    inert.inert = true;
    document.body.append(inert);
    button.focus();
  });
  await replay(page);
  await expect(page.locator("#replay-test-button")).toHaveJSProperty("inert", true);
  await page.keyboard.press("Escape");
  await expect(page.locator("#replay-test-button")).toBeFocused();
  await expect(page.locator("#already-inert")).toHaveJSProperty("inert", true);
});

test("reduced motion enters directly and replay leaves the app usable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".entry-gate")).toHaveCount(0);
  const composer = page.locator("shoujian-oracle textarea#say");
  await composer.fill("减少动画也可以继续输入");
  await replay(page);
  await expect(page.locator(".entry-gate")).toHaveCount(0);
  await expect(page.locator("shoujian-oracle")).toHaveJSProperty("inert", false);
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue("减少动画也可以继续输入");
});

test("enabling reduced motion dismisses an already open entrance", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator(".entry-gate")).toBeVisible();
  await expect(page.locator("shoujian-oracle")).toHaveJSProperty("inert", true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".entry-gate")).toHaveCount(0);
  await expect(page.locator("shoujian-oracle")).toHaveJSProperty("inert", false);
  await expect(page.locator("shoujian-oracle textarea#say")).toBeFocused();
});

test("reduced motion releases the modal even when the media change event is lost", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const result = nativeMatchMedia(query);
      if (query === "(prefers-reduced-motion: reduce)") {
        const nativeAddEventListener = result.addEventListener.bind(result);
        result.addEventListener = (type, ...args) => {
          if (type !== "change") nativeAddEventListener(type, ...args);
        };
      }
      return result;
    };
  });
  await page.goto("/");
  await expect(page.locator(".entry-gate")).toBeVisible();
  await expect(page.locator("shoujian-oracle")).toHaveJSProperty("inert", true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".entry-gate")).toHaveCount(0);
  await expect(page.locator("shoujian-oracle")).toHaveJSProperty("inert", false);
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await expect(page.locator("shoujian-oracle textarea#say")).toBeFocused();
});

async function replay(page) {
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("shoujian:replay-entry")));
}
