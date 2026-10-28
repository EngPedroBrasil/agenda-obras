const { test, expect } = require("@playwright/test");
const { openApp } = require("./helpers/stub-api");

test.use({ timezoneId: "America/Sao_Paulo", locale: "pt-BR" });

// ---- Tarefa 19: cabeçalho estável e rótulos -------------------------------------------

test("header controls keep their place when switching between Semana and Mês", async ({ page }) => {
  await openApp(page);
  const ids = ["#viewSeg", "#periodLabel", "#themeToggle", "#waBtn", "#groupSeg"];
  async function boxes() {
    const out = {};
    for (const id of ids) out[id] = await page.locator(id).boundingBox();
    return out;
  }
  const week = await boxes();
  await page.locator('[data-view="month"]').click();
  const month = await boxes();
  for (const id of ids) expect(month[id], id).toEqual(week[id]);
  await expect(page.locator("#waBtn")).toHaveCSS("visibility", "hidden");
  await expect(page.locator("#groupSeg")).toHaveCSS("visibility", "hidden");
  await page.locator('[data-view="week"]').click();
  await expect(page.locator("#waBtn")).toHaveCSS("visibility", "visible");
  await expect(page.locator("#groupSeg")).toHaveCSS("visibility", "visible");
});

test("period labels keep small words in lowercase and only the first letter capitalised", async ({ page }) => {
  await openApp(page);
  await expect(page.locator("#periodLabel")).toHaveText("25–31 de outubro de 2026");
  await page.locator('[data-view="month"]').click();
  await expect(page.locator("#periodLabel")).toHaveText("Outubro de 2026");
  await page.locator('[data-view="week"]').click();
  await page.locator('[data-action="open-day"][data-date="2026-10-27"]').first().click();
  await expect(page.locator("#modal h2")).toHaveText("Terça-feira, 27 de outubro");
});
