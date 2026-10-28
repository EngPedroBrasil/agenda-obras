const { test, expect } = require("@playwright/test");
const { openApp } = require("./helpers/stub-api");

test.use({ timezoneId: "America/Sao_Paulo", locale: "pt-BR" });

const SEED = [{ id: "seed1", date: "2026-10-27", person: "jean", obra: "almada", createdAt: "x" }];

test("calendar loads the entries from the API", async ({ page }) => {
  await openApp(page, { entries: SEED });
  await expect(page.locator('.day-card[data-date="2026-10-27"] .entry-chip')).toHaveCount(1);
});

test("adding through the form posts one addMany and shows the new chip (administrator)", async ({ page }) => {
  const state = await openApp(page, { entries: SEED, me: "pedro" });
  await page.locator('[data-action="open-day"][data-date="2026-10-27"]').first().click();
  await page.locator('input[name="modal-obra"][value="montebello"]').check();
  await page.locator("#addBtn").click();
  await expect(page.locator('.day-card[data-date="2026-10-27"] .entry-chip')).toHaveCount(2);
  const add = state.requests.filter(function (r) { return r.body.op === "addMany"; })[0];
  expect(add.body.items).toEqual([{ date: "2026-10-27", person: "pedro", obra: "montebello" }]);
});

test("removing posts op remove and the chip disappears", async ({ page }) => {
  const state = await openApp(page, { entries: SEED, me: "pedro" });
  await page.locator('[data-action="open-day"][data-date="2026-10-27"]').first().click();
  await page.locator("#modal .rm").first().click();
  await expect(page.locator('.day-card[data-date="2026-10-27"] .entry-chip')).toHaveCount(0);
  expect(state.requests.some(function (r) { return r.body.op === "remove" && r.body.id === "seed1"; })).toBe(true);
});

test("a 401 answer shows the session-expired message", async ({ page }) => {
  const state = await openApp(page, { entries: SEED, me: "pedro" });
  await page.locator('[data-action="open-day"][data-date="2026-10-27"]').first().click();
  state.me = null;
  await page.locator('input[name="modal-obra"][value="montebello"]').check();
  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toContainText("Sua sessão expirou");
});
