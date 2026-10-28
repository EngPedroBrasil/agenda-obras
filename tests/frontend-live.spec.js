const { test, expect } = require("@playwright/test");

// Roda contra um servidor de verdade (por padrão `netlify dev` em localhost:8888).
// Defina AGENDA_USER (ex.: "gustavo") e AGENDA_PASSWORD (a senha atual dessa conta; ela não pode estar
// com troca de senha pendente). Use um servidor local ou uma conta de teste: o teste cria e remove
// uma marcação de Porto no dia de hoje para esse usuário.
const BASE = process.env.AGENDA_BASE_URL || "http://localhost:8888";
const USER = (process.env.AGENDA_USER || "").toLowerCase();
const PASSWORD = process.env.AGENDA_PASSWORD || "";

test.skip(!USER || !PASSWORD, "defina AGENDA_USER e AGENDA_PASSWORD para rodar contra o servidor real");

function todayKey() {
  const d = new Date();
  const pad = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

async function login(page) {
  await page.goto(BASE);
  await page.locator('[data-action="open-login"]').first().click();
  await page.locator('#loginForm select[name="user"]').selectOption(USER);
  await page.locator('#loginForm input[name="password"]').fill(PASSWORD);
  await page.locator("#authSubmit").click();
  await expect(page.locator("#userBtn")).toBeVisible();
  await expect(page.locator("#changeForm")).toHaveCount(0);
}

test("login, add through the form, see it after reload, remove", async ({ page }) => {
  const day = todayKey();
  await login(page);

  await page.locator('[data-action="open-day"][data-date="' + day + '"]').first().click();
  await page.locator('input[name="modal-obra"][value="porto"]').check();
  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toContainText("marcação adicionada");

  await page.reload();
  await expect(page.locator("#userBtn")).toBeVisible();
  const list = await page.request.get(BASE + "/api/entries");
  const mine = (await list.json()).entries.filter(function (en) {
    return en.date === day && en.person === USER && en.obra === "porto";
  })[0];
  expect(mine).toBeTruthy();

  await page.locator('[data-action="open-day"][data-date="' + day + '"]').first().click();
  await page.locator('#modal .rm[data-id="' + mine.id + '"]').click();
  await expect(page.locator("#toast")).toContainText("removida");

  const after = await (await page.request.get(BASE + "/api/entries")).json();
  expect(after.entries.some(function (en) { return en.id === mine.id; })).toBe(false);
});

test("anonymous writes are rejected by the real API", async ({ request }) => {
  const res = await request.post(BASE + "/api/entries", {
    data: { op: "add", date: todayKey(), person: USER, obra: "porto" }
  });
  expect(res.status()).toBe(401);
});
