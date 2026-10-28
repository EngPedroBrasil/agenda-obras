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

// ---- Tarefa 22: login, conta, troca obrigatória, ambiente local ------------------------------

async function loginAs(page, user, password) {
  await page.locator('[data-action="open-login"]').click();
  await page.locator('#loginForm select[name="user"]').selectOption(user);
  await page.locator('#loginForm input[name="password"]').fill(password);
  await page.locator('#loginForm button[type="submit"]').click();
}

test("logged-out visitors see Entrar and no user menu", async ({ page }) => {
  await openApp(page);
  await expect(page.locator('[data-action="open-login"]')).toBeVisible();
  await expect(page.locator("#userBtn")).toHaveCount(0);
});

test("a wrong password shows the generic error and keeps the visitor logged out", async ({ page }) => {
  await openApp(page);
  await loginAs(page, "jean", "errada");
  await expect(page.locator("#authError")).toHaveText("usuário ou senha inválidos");
  await expect(page.locator("#loginForm")).toBeVisible();
});

test("a correct login shows the name; the menu offers Trocar senha and Sair", async ({ page }) => {
  await openApp(page, { passwords: {} });
  await loginAs(page, "jean", "Mudar@123");
  await expect(page.locator("#userBtn")).toContainText("Jean");
  await expect(page.locator("#authModal #loginForm")).toHaveCount(0);
  await page.locator("#userBtn").click();
  await expect(page.locator('#userMenu [data-action="open-change"]')).toBeVisible();
  await expect(page.locator('#userMenu [data-action="logout"]')).toBeVisible();
});

test("an existing session is recognised on load", async ({ page }) => {
  await openApp(page, { me: "jean" });
  await expect(page.locator("#userBtn")).toContainText("Jean");
});

test("first access forces a new password; the modal cannot be dismissed", async ({ page }) => {
  const state = await openApp(page, { mustChange: ["jean"] });
  await loginAs(page, "jean", "Mudar@123");
  await expect(page.locator("#authModal h2")).toHaveText("Defina a sua senha");
  await page.keyboard.press("Escape");
  await expect(page.locator("#changeForm")).toBeVisible();
  await expect(page.locator('#authModal [data-action="close-auth"]')).toHaveCount(0);

  await page.locator('#changeForm input[name="current"]').fill("Mudar@123");
  await page.locator('#changeForm input[name="next"]').fill("curta");
  await page.locator('#changeForm input[name="confirm"]').fill("curta");
  await page.locator('#changeForm button[type="submit"]').click();
  await expect(page.locator("#authError")).toContainText("pelo menos 8");

  await page.locator('#changeForm input[name="next"]').fill("NovaSenha1");
  await page.locator('#changeForm input[name="confirm"]').fill("Outra1234");
  await page.locator('#changeForm button[type="submit"]').click();
  await expect(page.locator("#authError")).toContainText("não confere");

  await page.locator('#changeForm input[name="confirm"]').fill("NovaSenha1");
  await page.locator('#changeForm button[type="submit"]').click();
  await expect(page.locator("#changeForm")).toHaveCount(0);
  await expect(page.locator("#userBtn")).toContainText("Jean");
  expect(state.passwords.jean).toBe("NovaSenha1");
});

test("a voluntary password change can be cancelled and reports a wrong current password", async ({ page }) => {
  await openApp(page, { me: "jean" });
  await page.locator("#userBtn").click();
  await page.locator('#userMenu [data-action="open-change"]').click();
  await expect(page.locator("#authModal h2")).toHaveText("Trocar senha");
  await page.locator('#changeForm input[name="current"]').fill("errada");
  await page.locator('#changeForm input[name="next"]').fill("NovaSenha1");
  await page.locator('#changeForm input[name="confirm"]').fill("NovaSenha1");
  await page.locator('#changeForm button[type="submit"]').click();
  await expect(page.locator("#authError")).toHaveText("senha atual incorreta");
  await page.locator('#authModal [data-action="close-auth"]').click();
  await expect(page.locator("#changeForm")).toHaveCount(0);
});

test("Sair returns to the logged-out state", async ({ page }) => {
  const state = await openApp(page, { me: "jean" });
  await page.locator("#userBtn").click();
  await page.locator('#userMenu [data-action="logout"]').click();
  await expect(page.locator('[data-action="open-login"]')).toBeVisible();
  expect(state.me).toBe(null);
});

test("the local-test banner shows on localhost and not elsewhere", async ({ page }) => {
  await openApp(page, { local: true });
  await expect(page.locator("#localBanner")).toBeVisible();
  await expect(page.locator("#localBanner")).toContainText("AMBIENTE LOCAL DE TESTE");
});

test("the local-test banner is hidden when the page is not local", async ({ page }) => {
  await openApp(page);
  await expect(page.locator("#localBanner")).toBeHidden();
});

// ---- Tarefa 23: modal do dia ---------------------------------------------------------------

const DAY = "2026-10-27";
const MIX = [
  { id: "m1", date: DAY, person: "jean", obra: "almada", createdAt: "x", comment: "vistoria", meeting: { start: "14:00", end: "15:30" } },
  { id: "m2", date: DAY, person: "haniel", obra: "porto", createdAt: "x" }
];

async function openDay(page, key) {
  await page.locator('[data-action="open-day"][data-date="' + (key || DAY) + '"]').first().click();
  await expect(page.locator("#modal")).toBeVisible();
}

test("anonymous visitors see the day but cannot edit anything", async ({ page }) => {
  await openApp(page, { entries: MIX });
  await expect(page.locator(".entry-chip .rm")).toHaveCount(0);
  await openDay(page);
  await expect(page.locator("#modal .rm, #modal .edit")).toHaveCount(0);
  await expect(page.locator("#addForm")).toHaveCount(0);
  await page.locator('#modal [data-action="open-login"]').click();
  await expect(page.locator("#loginForm")).toBeVisible();
});

test("a user who must change the password is asked to do so in the day modal", async ({ page }) => {
  await openApp(page, { me: "jean", mustChange: ["jean"] });
  await expect(page.locator("#changeForm")).toBeVisible();
});

test("a regular user marks only as themselves: no person list, just the obras", async ({ page }) => {
  const state = await openApp(page, { me: "jean", entries: [] });
  await openDay(page);
  await expect(page.locator(".acting-as")).toContainText("Marcando como Jean");
  await expect(page.locator('input[name="modal-person"]')).toHaveCount(0);
  await expect(page.locator("#actAs")).toHaveCount(0);
  await expect(page.locator('input[name="modal-obra"]')).toHaveCount(6);
  await expect(page.locator("#addBtn")).toBeDisabled();
  await page.locator('input[name="modal-obra"][value="almada"]').check();
  await expect(page.locator("#addBtn")).toBeEnabled();
  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toHaveText("1 marcação adicionada.");
  const call = state.requests.filter(function (r) { return r.body.op === "addMany"; })[0];
  expect(call.body.items).toEqual([{ date: DAY, person: "jean", obra: "almada" }]);
  await expect(page.locator('.day-card[data-date="' + DAY + '"] .entry-chip')).toHaveCount(1);
});

test("× and ✎ only appear for the owner; the administrator sees them everywhere", async ({ page }) => {
  await openApp(page, { me: "jean", entries: MIX });
  await openDay(page);
  const jean = page.locator("#modal .entry-chip", { hasText: "Jean" });
  const haniel = page.locator("#modal .entry-chip", { hasText: "Haniel" });
  await expect(jean.locator(".rm")).toHaveCount(1);
  await expect(jean.locator(".edit")).toHaveCount(1);
  await expect(haniel.locator(".rm")).toHaveCount(0);
  await expect(haniel.locator(".edit")).toHaveCount(0);
  await expect(page.locator('.day-card[data-date="' + DAY + '"] .entry-chip .rm')).toHaveCount(1);
});

test("the administrator picks who to mark as", async ({ page }) => {
  const state = await openApp(page, { me: "pedro", entries: [] });
  await openDay(page);
  await expect(page.locator("#actAs option")).toHaveCount(5);
  await expect(page.locator("#actAs")).toHaveValue("pedro");
  await page.locator("#actAs").selectOption("haniel");
  await page.locator('input[name="modal-obra"][value="tulipas"]').check();
  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toHaveText("1 marcação adicionada.");
  const call = state.requests.filter(function (r) { return r.body.op === "addMany"; })[0];
  expect(call.body.items[0]).toMatchObject({ person: "haniel", obra: "tulipas" });
});

test("several days at once go in a single addMany; the picker keeps the selection across weeks", async ({ page }) => {
  const state = await openApp(page, { me: "jean", entries: [] });
  await openDay(page);
  await expect(page.locator("#daysCount")).toHaveText("1 dia selecionado");
  await expect(page.locator('.day-chip[data-date="2026-10-27"]')).toHaveClass(/on/);
  await page.locator('.day-chip[data-date="2026-10-28"]').click();
  await page.locator('.day-chip[data-date="2026-10-29"]').click();
  await expect(page.locator("#daysCount")).toHaveText("3 dias selecionados");

  await page.locator('[data-action="mday-next"]').click();
  await expect(page.locator(".days-range")).toHaveText("01/11 a 07/11");
  await page.locator('.day-chip[data-date="2026-11-03"]').click();
  await expect(page.locator("#daysCount")).toHaveText("4 dias selecionados");
  await page.locator('[data-action="mday-prev"]').click();
  await expect(page.locator(".days-range")).toHaveText("25/10 a 31/10");
  await expect(page.locator("#daysCount")).toHaveText("4 dias selecionados");
  await page.locator('.day-chip[data-date="2026-10-29"]').click();
  await expect(page.locator("#daysCount")).toHaveText("3 dias selecionados");

  await page.locator('input[name="modal-obra"][value="porto"]').check();
  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toHaveText("3 marcações adicionadas.");
  const calls = state.requests.filter(function (r) { return r.body.op === "addMany"; });
  expect(calls).toHaveLength(1);
  expect(calls[0].body.items.map(function (i) { return i.date; })).toEqual(["2026-10-27", "2026-10-28", "2026-11-03"]);
  await expect(page.locator('.day-card[data-date="2026-10-28"] .entry-chip')).toHaveCount(1);
});

test("a meeting needs start and end; the end is prefilled with start + 1 hour", async ({ page }) => {
  const state = await openApp(page, { me: "jean", entries: [] });
  await openDay(page);
  await page.locator('input[name="modal-obra"][value="almada"]').check();
  const box = page.locator('.obra-extra[data-obra="almada"]');
  await expect(box.locator(".meet-times")).toBeHidden();
  await box.locator(".meet-on").check();
  await expect(box.locator(".meet-times")).toBeVisible();

  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toContainText("início e o fim");
  expect(state.requests.filter(function (r) { return r.body.op === "addMany"; })).toHaveLength(0);

  await box.locator(".meet-start").fill("14:00");
  await expect(box.locator(".meet-end")).toHaveValue("15:00");
  await box.locator(".meet-end").fill("13:00");
  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toContainText("início e o fim");

  await box.locator(".meet-end").fill("15:30");
  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toHaveText("1 marcação adicionada.");
  const call = state.requests.filter(function (r) { return r.body.op === "addMany"; })[0];
  expect(call.body.items[0].meeting).toEqual({ start: "14:00", end: "15:30" });
  await expect(page.locator('.day-card[data-date="' + DAY + '"] .chip-meeting')).toHaveText("14:00–15:30");
});

test("the same meeting applies to every selected day", async ({ page }) => {
  const state = await openApp(page, { me: "jean", entries: [] });
  await openDay(page);
  await page.locator('.day-chip[data-date="2026-10-28"]').click();
  await page.locator('input[name="modal-obra"][value="porto"]').check();
  const box = page.locator('.obra-extra[data-obra="porto"]');
  await box.locator(".meet-on").check();
  await box.locator(".meet-start").fill("09:00");
  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toHaveText("2 marcações adicionadas.");
  const items = state.requests.filter(function (r) { return r.body.op === "addMany"; })[0].body.items;
  expect(items.map(function (i) { return i.meeting; })).toEqual([{ start: "09:00", end: "10:00" }, { start: "09:00", end: "10:00" }]);
});

test("the day detail shows the meeting, and editing changes comment and meeting", async ({ page }) => {
  const state = await openApp(page, { me: "jean", entries: MIX });
  await openDay(page);
  await expect(page.locator("#modal .entry-chip", { hasText: "Jean" })).toContainText("Reunião 14:00–15:30");
  await page.locator('#modal .edit[data-id="m1"]').click();
  const form = page.locator(".comment-edit");
  await expect(form.locator('input[name="comment"]')).toHaveValue("vistoria");
  await expect(form.locator(".meet-on")).toBeChecked();
  await expect(form.locator(".meet-start")).toHaveValue("14:00");
  await form.locator('input[name="comment"]').fill("pauta nova");
  await form.locator(".meet-end").fill("16:00");
  await form.locator('button[type="submit"]').click();
  await expect(page.locator("#toast")).toHaveText("Comentário salvo.");
  const call = state.requests.filter(function (r) { return r.body.op === "update"; })[0];
  expect(call.body).toEqual({ op: "update", id: "m1", comment: "pauta nova", meeting: { start: "14:00", end: "16:00" } });
  await expect(page.locator("#modal .entry-chip", { hasText: "Jean" })).toContainText("14:00–16:00");
});

test("unchecking the meeting while editing removes it", async ({ page }) => {
  const state = await openApp(page, { me: "jean", entries: MIX });
  await openDay(page);
  await page.locator('#modal .edit[data-id="m1"]').click();
  await page.locator(".comment-edit .meet-on").uncheck();
  await page.locator('.comment-edit button[type="submit"]').click();
  await expect(page.locator("#toast")).toHaveText("Comentário salvo.");
  const call = state.requests.filter(function (r) { return r.body.op === "update"; })[0];
  expect(call.body.meeting).toBe(null);
  expect(state.entries[0].meeting).toBeUndefined();
});

test("the meeting time sits next to the name in the Por obra view", async ({ page }) => {
  await openApp(page, { entries: MIX });
  await page.locator('[data-group="obra"]').click();
  await expect(page.locator('.day-card[data-date="' + DAY + '"] .obra-card .chip-meeting')).toHaveText("14:00–15:30");
});

test("background refresh keeps what the person is typing in the add form", async ({ page }) => {
  const state = await openApp(page, { me: "jean", entries: [] });
  await openDay(page);
  await page.locator('input[name="modal-obra"][value="porto"]').check();
  await page.locator('.obra-comment[data-obra="porto"]').fill("pauta da reunião");
  state.entries.push({ id: "x1", date: DAY, person: "haniel", obra: "almada", createdAt: "y" });
  await page.clock.fastForward(26000);
  await expect(page.locator("#modal .current-list")).toContainText("Haniel");
  await expect(page.locator('input[name="modal-obra"][value="porto"]')).toBeChecked();
  await expect(page.locator('.obra-comment[data-obra="porto"]')).toHaveValue("pauta da reunião");
});

test("background refresh does not touch an open edit form", async ({ page }) => {
  const state = await openApp(page, { me: "jean", entries: MIX });
  await openDay(page);
  await page.locator('#modal .edit[data-id="m1"]').click();
  await page.locator('.comment-edit input[name="comment"]').fill("rascunho");
  state.entries.push({ id: "x2", date: DAY, person: "bruna", obra: "tulipas", createdAt: "y" });
  await page.clock.fastForward(26000);
  await expect(page.locator('.day-card[data-date="' + DAY + '"] .entry-chip')).toHaveCount(3);
  await expect(page.locator('.comment-edit input[name="comment"]')).toHaveValue("rascunho");
});
