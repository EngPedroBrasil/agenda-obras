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

// ---- Tarefa 21: aba Atenção ----------------------------------------------------------------

const ATT = [
  { id: "a1", date: "2026-10-05", person: "jean", obra: "almada", createdAt: "x" },
  { id: "a2", date: "2026-10-27", person: "jean", obra: "almada", createdAt: "x" },
  { id: "a3", date: "2026-10-28", person: "pedro", obra: "almada", createdAt: "x" },
  { id: "a4", date: "2026-09-20", person: "haniel", obra: "porto", createdAt: "x" },
  { id: "a5", date: "2026-11-02", person: "bruna", obra: "tulipas", createdAt: "x" }
];

async function openAttention(page) {
  const state = await openApp(page, { entries: ATT });
  await page.locator('[data-view="attention"]').click();
  await expect(page.locator(".att-table")).toBeVisible();
  return state;
}

test("Atenção counts realized / planned per person and obra, today counting as done", async ({ page }) => {
  await openAttention(page);
  const almada = page.locator('tr[data-obra="almada"]');
  await expect(almada.locator('td[data-person="jean"]')).toHaveText("2 / 0");
  await expect(almada.locator('td[data-person="pedro"]')).toHaveText("0 / 1");
  await expect(almada.locator("td.att-total")).toHaveText("2 / 1");
  await expect(almada.locator('td[data-col="last"]')).toContainText("hoje");
  await expect(almada.locator('td[data-col="next"]')).toContainText("28/10");
  await expect(almada).not.toHaveClass(/att-alert/);
  await expect(page.locator("tr.att-sum td[data-person=\"jean\"]")).toHaveText("2 / 0");
});

test("Atenção highlights stale and unplanned obras", async ({ page }) => {
  await openAttention(page);
  const porto = page.locator('tr[data-obra="porto"]');
  await expect(porto).toHaveClass(/att-alert/);
  await expect(porto.locator('td[data-col="last"]')).toContainText("há 37 dias");
  await expect(porto.locator('td[data-col="next"]')).toHaveText("Nada planejado");
  const montebello = page.locator('tr[data-obra="montebello"]');
  await expect(montebello).toHaveClass(/att-alert/);
  await expect(montebello.locator('td[data-col="last"]')).toHaveText("—");
  const tulipas = page.locator('tr[data-obra="tulipas"]');
  await expect(tulipas).toHaveClass(/att-alert/);
  await expect(tulipas.locator('td[data-col="next"]')).toContainText("02/11");
});

test("the period filter changes only the realized count", async ({ page }) => {
  await openAttention(page);
  const haniel = page.locator('tr[data-obra="porto"] td[data-person="haniel"]');
  await expect(haniel).toHaveText("0 / 0");
  await page.locator('[data-action="set-att-period"][data-period="90"]').click();
  await expect(haniel).toHaveText("1 / 0");
  await expect(page.locator('[data-action="set-att-period"][data-period="90"]')).toHaveClass(/active/);
  await expect(page.locator('tr[data-obra="porto"] td[data-col="last"]')).toContainText("há 37 dias");
});

test("the obra filter narrows the table", async ({ page }) => {
  await openAttention(page);
  await expect(page.locator("tbody tr[data-obra]")).toHaveCount(6);
  await page.locator('[data-action="toggle-obra"][data-id="porto"]').click();
  await expect(page.locator("tbody tr[data-obra]")).toHaveCount(1);
});

test("the header keeps its place and the label reads Atenção por obra", async ({ page }) => {
  await openApp(page, { entries: ATT });
  const ids = ["#viewSeg", "#periodLabel", "#themeToggle"];
  const before = {};
  for (const id of ids) before[id] = await page.locator(id).boundingBox();
  await page.locator('[data-view="attention"]').click();
  for (const id of ids) expect(await page.locator(id).boundingBox(), id).toEqual(before[id]);
  await expect(page.locator("#periodLabel")).toHaveText("Atenção por obra");
  await expect(page.locator("#arrowsBox")).toHaveCSS("visibility", "hidden");
  await expect(page.locator("#waBtn")).toHaveCSS("visibility", "hidden");
});
