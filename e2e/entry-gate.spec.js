import { expect, test } from "@playwright/test";

test("first visit opens the gate without clearing the conversation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "entry animation smoke runs once in Chromium");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const gate = page.locator(".entry-gate");
  await expect(gate).toBeVisible();
  await expect(gate.getByRole("button", { name: "推门入境" })).toBeVisible();
  await gate.getByRole("button", { name: "推门入境" }).click();
  await expect(gate).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "借一卦，照眼前的路。" })).toBeVisible();
  await page.reload();
  await expect(page.locator(".entry-gate")).toHaveCount(0);
});

test("gate opens automatically after the brief welcome", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "entry animation smoke runs once in Chromium");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator(".entry-gate")).toBeVisible();
  await expect(page.locator(".entry-gate")).toHaveCount(0, { timeout: 5_000 });
  await expect(page.locator('shoujian-oracle textarea#say')).toBeVisible();
});

test("reduced motion enters directly", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "reduced-motion smoke runs once in Chromium");
  await page.goto("/");
  await expect(page.locator(".entry-gate")).toHaveCount(0);
  await expect(page.locator('shoujian-oracle textarea#say')).toBeVisible();
});
