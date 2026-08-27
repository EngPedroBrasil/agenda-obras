const { test, expect } = require("@playwright/test");

const BASE = process.env.AGENDA_BASE_URL || "http://localhost:8888";

test("full add/remove cycle persists through the real API", async ({ page }) => {
  await page.goto(BASE);
  await page.waitForTimeout(500);

  await page.locator('[data-action="open-day"][data-date="2026-08-27"]').first().click();
  await page.waitForTimeout(200);
  await page.locator('input[name="modal-person"][value="gustavo"]').check();
  await page.locator('input[name="modal-obra"][value="porto"]').check();
  await page.locator("#addBtn").click();
  await page.waitForTimeout(500);

  await expect(page.locator(".current-list")).toContainText("Gustavo");

  await page.reload();
  await page.waitForTimeout(500);
  await page.locator('[data-action="open-day"][data-date="2026-08-27"]').first().click();
  await page.waitForTimeout(200);
  await expect(page.locator(".current-list")).toContainText("Gustavo");

  const rmButton = page.locator('#modal .rm[data-id]').first();
  const idToRemove = await rmButton.getAttribute("data-id");
  await rmButton.click();
  await page.waitForTimeout(500);

  const res = await page.request.get(BASE + "/api/entries");
  const body = await res.json();
  const stillThere = body.entries.some((en) => en.id === idToRemove);
  expect(stillThere).toBe(false);
});
