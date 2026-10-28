const { test, expect } = require("@playwright/test");
const { openApp } = require("./helpers/stub-api");

test.use({ timezoneId: "America/Sao_Paulo", locale: "pt-BR" });

const ENTRIES = [{ id: "a1", date: "2026-10-27", person: "jean", obra: "almada", createdAt: "x" }];

async function loginAs(page, user, password) {
  await page.locator('.top-actions [data-action="open-login"]').click();
  await page.locator('#loginForm select[name="user"]').selectOption(user);
  await page.locator('#loginForm input[name="password"]').fill(password);
  await page.locator("#authSubmit").click();
}

// ---- Aparência ------------------------------------------------------------------------------

test("the tab icon is the Blendi symbol", async ({ page }) => {
  await openApp(page, {});
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "assets/favicon.png");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "assets/apple-touch-icon.png");
});

for (const scheme of ["light", "dark"]) {
  test("the close button of the notice panel looks like the other modals in " + scheme + " mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openApp(page, { me: "jean" });
    await page.locator("#noticeBtn").click();
    const x = page.locator("#noticePanel .close-x");
    await expect(x).toHaveCSS("border-radius", "50%");
    await expect(x).toHaveCSS("width", "28px");
    const bg = await x.evaluate(function (el) { return getComputedStyle(el).backgroundColor; });
    const surface2 = await page.evaluate(function () {
      const probe = document.createElement("div");
      probe.style.background = "var(--surface-2)";
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return c;
    });
    expect(bg).toBe(surface2);
  });
}

// ---- Gestor --------------------------------------------------------------------------------

test("Leonardo is in the login list, and the filters/week strip still list only the five", async ({ page }) => {
  await openApp(page, { entries: ENTRIES });
  await page.locator('.top-actions [data-action="open-login"]').click();
  await expect(page.locator('#loginForm select[name="user"] option')).toHaveCount(6);
  await expect(page.locator('#loginForm select[name="user"] option[value="leonardo"]')).toHaveText("Leonardo");
});

test("Leonardo logs in and sees everything in read-only mode", async ({ page }) => {
  const state = await openApp(page, { entries: ENTRIES, confirmations: {} });
  await loginAs(page, "leonardo", "Mudar@123");
  await expect(page.locator("#userBtn")).toContainText("Leonardo");
  // semana ainda não liberada, mas o gestor vê (visitante não veria)
  await expect(page.locator(".visitor-lock")).toHaveCount(0);
  await expect(page.locator('[data-view="attention"]')).toBeVisible();
  await expect(page.locator("#waBtn")).toBeVisible();
  // faixa de semana: 5 botões desativados
  await expect(page.locator(".wk-btn")).toHaveCount(5);
  await expect(page.locator(".wk-btn").first()).toBeDisabled();
  // dia: sem formulário de marcação
  await page.locator('[data-action="open-day"][data-date="2026-10-27"]').first().click();
  await expect(page.locator("#modal")).toContainText("modo leitura");
  await expect(page.locator("#addForm")).toHaveCount(0);
  expect(state.requests.filter(function (r) { return r.path === "/api/entries"; })).toHaveLength(0);
});

test("the manager's menu has no admin mode, and the login shows his name on the landing", async ({ page }) => {
  await openApp(page, { me: "leonardo" });
  await page.locator("#userBtn").click();
  await expect(page.locator('#userMenu [data-action="elevate"]')).toHaveCount(0);
  await expect(page.locator('#userMenu [data-action="open-admin"]')).toHaveCount(0);
  await expect(page.locator('#userMenu [data-action="open-change"]')).toBeVisible();
});

// ---- Modo administrador --------------------------------------------------------------------

test("Pedro starts as a regular person: only himself, no Administração", async ({ page }) => {
  await openApp(page, { me: "pedro", common: true, entries: ENTRIES });
  await expect(page.locator("#adminBar")).toBeHidden();
  await page.locator("#userBtn").click();
  await expect(page.locator('#userMenu [data-action="open-admin"]')).toHaveCount(0);
  await expect(page.locator('#userMenu [data-action="elevate"]')).toHaveText("Modo administrador");
  await page.locator("#userBtn").click();
  await page.locator('[data-action="open-day"][data-date="2026-10-27"]').first().click();
  await expect(page.locator("#actAs")).toHaveCount(0);
  await expect(page.locator(".acting-as")).toContainText("Pedro");
});

test("Modo administrador turns on with a red bar and the deadline, and unlocks everything", async ({ page }) => {
  const state = await openApp(page, { me: "pedro", common: true, entries: ENTRIES });
  await page.locator("#userBtn").click();
  await page.locator('#userMenu [data-action="elevate"]').click();
  await expect(page.locator("#adminBar")).toBeVisible();
  await expect(page.locator("#adminBar")).toContainText("MODO ADMINISTRADOR");
  await expect(page.locator("#adminBar")).toContainText("12:15");
  await expect(page.locator("#toast")).toContainText("ligado por 15 minutos");
  expect(state.requests.some(function (r) { return r.body.op === "elevate"; })).toBe(true);

  await page.locator("#userBtn").click();
  await expect(page.locator('#userMenu [data-action="open-admin"]')).toBeVisible();
  await expect(page.locator('#userMenu [data-action="unelevate"]')).toHaveText("Desligar modo administrador");
  await page.locator("#userBtn").click();
  await page.locator('[data-action="open-day"][data-date="2026-10-27"]').first().click();
  await expect(page.locator("#actAs")).toHaveCount(1);
});

test("Desligar on the bar goes back to regular mode", async ({ page }) => {
  await openApp(page, { me: "pedro", entries: ENTRIES });
  await expect(page.locator("#adminBar")).toBeVisible();
  await page.locator('#adminBar [data-action="unelevate"]').click();
  await expect(page.locator("#adminBar")).toBeHidden();
  await expect(page.locator("#toast")).toContainText("Modo administrador desligado");
  await page.locator("#userBtn").click();
  await expect(page.locator('#userMenu [data-action="open-admin"]')).toHaveCount(0);
});

test("when the 15 minutes pass the screen returns to regular mode and warns, closing the admin panel", async ({ page }) => {
  const state = await openApp(page, { me: "pedro", common: true, entries: ENTRIES });
  await page.locator("#userBtn").click();
  await page.locator('#userMenu [data-action="elevate"]').click();
  await expect(page.locator("#adminBar")).toBeVisible();
  await page.locator("#userBtn").click();
  await page.locator('#userMenu [data-action="open-admin"]').click();
  await expect(page.locator("#adminPanel")).toBeVisible();

  state.serverNow += 16 * 60 * 1000;
  await page.clock.fastForward(16 * 60 * 1000);
  await expect(page.locator("#adminBar")).toBeHidden();
  await expect(page.locator("#toast")).toContainText("Modo administrador desligado");
  await expect(page.locator("#adminPanel")).toHaveCount(0);
});

// ---- Notificações --------------------------------------------------------------------------

const FROM_LEO = [
  { id: "n1", from: "leonardo", to: "jean", text: "Revisar a obra do Porto", createdAt: "2026-10-27T14:00:00.000Z", readAt: null },
  { id: "n2", from: "leonardo", to: "bruna", text: "Só para a Bruna", createdAt: "2026-10-27T14:00:00.000Z", readAt: null }
];

test("a person sees the bell with only his own notice, marks Li and can show the read ones", async ({ page }) => {
  const state = await openApp(page, { me: "jean", notices: FROM_LEO });
  await expect(page.locator("#noticeBtn .bell-badge")).toHaveText("1");
  await expect(page.locator("#toast")).toContainText("1 aviso novo");
  await page.locator("#noticeBtn").click();
  await expect(page.locator("#noticePanel")).toBeVisible();
  await expect(page.locator(".notice-item")).toHaveCount(1);
  await expect(page.locator(".notice-item")).toContainText("Revisar a obra do Porto");
  await expect(page.locator(".notice-item")).toContainText("De Leonardo");
  await expect(page.locator('[data-action="notice-tab"][data-tab="write"]')).toHaveCount(0);

  await page.locator('[data-action="notice-read"]').click();
  await expect(page.locator(".notice-item")).toHaveCount(0);
  await expect(page.locator("#noticeBtn .bell-badge")).toHaveCount(0);
  expect(state.notices[0].readAt).not.toBeNull();
  await page.locator('[data-action="notice-toggle-read"]').click();
  await expect(page.locator(".notice-item")).toHaveCount(1);
});

test("Leonardo writes to two people and sees Não lido, then Lido em after they read", async ({ page }) => {
  const state = await openApp(page, { me: "leonardo" });
  await page.locator("#noticeBtn").click();
  await expect(page.locator('[data-action="notice-tab"][data-tab="inbox"]')).toHaveCount(0);
  await page.locator('[data-action="notice-to"][data-id="jean"]').click();
  await page.locator('[data-action="notice-to"][data-id="bruna"]').click();
  await page.locator("#noticeText").fill("Passar na obra do Almada");
  await expect(page.locator("#noticeCount")).toHaveText("24 / 500");
  await page.locator('[data-action="notice-send"]').click();

  await expect(page.locator(".notice-item")).toHaveCount(2);
  await expect(page.locator(".notice-item").first()).toContainText("Não lido");
  const sent = state.requests.filter(function (r) { return r.path === "/api/notices"; })[0].body;
  expect(sent).toEqual({ op: "send", to: ["jean", "bruna"], text: "Passar na obra do Almada" });

  state.notices[0].readAt = new Date(state.serverNow).toISOString();
  await page.clock.fastForward(26000);
  await expect(page.locator(".notice-panel")).toContainText("Lido em 27/10 às 12:00");
});

test("sending without recipient or text shows a message and sends nothing", async ({ page }) => {
  const state = await openApp(page, { me: "leonardo" });
  await page.locator("#noticeBtn").click();
  await page.locator('[data-action="notice-send"]').click();
  await expect(page.locator("#noticeError")).toHaveText("Escolha pelo menos uma pessoa.");
  await page.locator('[data-action="notice-to"][data-id="jean"]').click();
  await page.locator('[data-action="notice-send"]').click();
  await expect(page.locator("#noticeError")).toHaveText("Escreva o aviso.");
  expect(state.notices).toHaveLength(0);
});

test("Todos picks everybody except the sender", async ({ page }) => {
  await openApp(page, { me: "pedro" });
  await page.locator("#noticeBtn").click();
  await page.locator('[data-action="notice-tab"][data-tab="write"]').click();
  await expect(page.locator('[data-action="notice-to"][data-id="pedro"]')).toHaveCount(0);
  await page.locator('[data-action="notice-to-all"]').click();
  await expect(page.locator(".notice-chip.on")).toHaveCount(5); // Todos + 4 pessoas
  await page.locator('[data-action="notice-to-all"]').click();
  await expect(page.locator(".notice-chip.on")).toHaveCount(0);
});

test("Pedro in regular mode can read but has no Escrever tab; visitors have no bell", async ({ page }) => {
  await openApp(page, { me: "pedro", common: true });
  await page.locator("#noticeBtn").click();
  await expect(page.locator('[data-action="notice-tab"][data-tab="write"]')).toHaveCount(0);
  await expect(page.locator("#noticePanel")).toContainText("Nenhum aviso novo");

  const visitor = await page.context().newPage();
  await openApp(visitor, {});
  await expect(visitor.locator("#noticeBtn")).toHaveCount(0);
});
