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

// ---- Tarefa 24: semana programada ------------------------------------------------------------

const WEEK = "2026-10-25"; // domingo da semana de 27/10/2026
const CLOSED_AT = "2026-10-27T15:00:00.000Z"; // 12:00 em São Paulo

test("the strip shows who already closed the week, with the closing time", async ({ page }) => {
  await openApp(page, { confirmations: { [WEEK]: { jean: CLOSED_AT } } });
  await expect(page.locator(".week-strip .wk-btn")).toHaveCount(5);
  await expect(page.locator(".wk-count")).toHaveText("1 de 5 programadas");
  const jean = page.locator('.wk-btn[data-person="jean"]');
  await expect(jean).toHaveClass(/done/);
  await expect(jean).toContainText("✓");
  await expect(jean).toHaveAttribute("title", "Fechada em 27/10 às 12:00");
  const haniel = page.locator('.wk-btn[data-person="haniel"]');
  await expect(haniel).not.toHaveClass(/done/);
  await expect(haniel).toContainText("?");
});

test("the strip only exists in the week view", async ({ page }) => {
  await openApp(page);
  await page.locator('[data-view="month"]').click();
  await expect(page.locator(".week-strip")).toHaveCount(0);
  await page.locator('[data-view="week"]').click();
  await expect(page.locator(".week-strip")).toHaveCount(1);
});

test("a person closes and reopens their own week", async ({ page }) => {
  const state = await openApp(page, { me: "jean" });
  await page.locator('.wk-btn[data-person="jean"]').click();
  await expect(page.locator("#toast")).toHaveText("Semana de Jean fechada.");
  await expect(page.locator(".wk-count")).toHaveText("1 de 5 programadas");
  expect(state.requests.filter(function (r) { return r.body.op === "confirmWeek"; })[0].body).toEqual({ op: "confirmWeek", week: WEEK, person: "jean" });
  await page.locator('.wk-btn[data-person="jean"]').click();
  await expect(page.locator("#toast")).toHaveText("Semana de Jean reaberta.");
  await expect(page.locator(".wk-count")).toHaveText("0 de 5 programadas");
  expect(state.requests.filter(function (r) { return r.body.op === "unconfirmWeek"; })).toHaveLength(1);
});

test("a regular user cannot close someone else's week", async ({ page }) => {
  const state = await openApp(page, { me: "jean" });
  await page.locator('.wk-btn[data-person="haniel"]').click();
  await expect(page.locator("#toast")).toHaveText("Você só pode fechar a sua própria semana.");
  expect(state.requests.filter(function (r) { return r.body.op === "confirmWeek"; })).toHaveLength(0);
});

test("the administrator closes the week of anyone", async ({ page }) => {
  const state = await openApp(page, { me: "pedro" });
  await page.locator('.wk-btn[data-person="haniel"]').click();
  await expect(page.locator("#toast")).toHaveText("Semana de Haniel fechada.");
  expect(state.confirmations[WEEK].haniel).toBeTruthy();
});

test("anonymous visitors are asked to sign in instead", async ({ page }) => {
  const state = await openApp(page);
  await page.locator('.wk-btn[data-person="jean"]').click();
  await expect(page.locator("#loginForm")).toBeVisible();
  expect(state.requests.filter(function (r) { return r.body.op === "confirmWeek"; })).toHaveLength(0);
});

test("changing a marking reopens the closed week and the toast says so", async ({ page }) => {
  await openApp(page, { me: "jean", confirmations: { [WEEK]: { jean: CLOSED_AT, haniel: CLOSED_AT } } });
  await openDay(page);
  await page.locator('input[name="modal-obra"][value="porto"]').check();
  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toHaveText("1 marcação adicionada. Semana de Jean reaberta, feche de novo quando terminar.");
  await expect(page.locator(".wk-count")).toHaveText("1 de 5 programadas");
  await expect(page.locator('.wk-btn[data-person="jean"]')).not.toHaveClass(/done/);
  await expect(page.locator('.wk-btn[data-person="haniel"]')).toHaveClass(/done/);
});

test("removing a marking reopens the week too", async ({ page }) => {
  await openApp(page, { me: "jean", entries: MIX, confirmations: { [WEEK]: { jean: CLOSED_AT } } });
  await openDay(page);
  await page.locator('#modal .rm[data-id="m1"]').click();
  await expect(page.locator("#toast")).toHaveText("Presença removida. Semana de Jean reaberta, feche de novo quando terminar.");
});

test("the message modal warns who is missing, without putting it in the message", async ({ page }) => {
  await openApp(page, { confirmations: { [WEEK]: { jean: CLOSED_AT } } });
  await page.locator("#waBtn").click();
  await expect(page.locator("#waBanner")).toHaveClass(/warn/);
  await expect(page.locator("#waBanner")).toHaveText("Faltam: Pedro, Haniel, Gustavo, Bruna.");
  await expect(page.locator("#waText")).not.toHaveValue(/Faltam|programaram/);
});

test("the banner turns green when everybody closed the week, and follows background refreshes", async ({ page }) => {
  const state = await openApp(page);
  await page.locator("#waBtn").click();
  await expect(page.locator("#waBanner")).toHaveText("Faltam: Pedro, Jean, Haniel, Gustavo, Bruna.");
  state.confirmations[WEEK] = { pedro: CLOSED_AT, jean: CLOSED_AT, haniel: CLOSED_AT, gustavo: CLOSED_AT, bruna: CLOSED_AT };
  await page.clock.fastForward(26000);
  await expect(page.locator("#waBanner")).toHaveClass(/ok/);
  await expect(page.locator("#waBanner")).toContainText("Todos programaram a semana");
  await expect(page.locator("#waText")).not.toHaveValue(/programaram/);
});

// ---- Tarefa 25: administração -------------------------------------------------------------------

const BACKUPS = [
  {
    id: "backup-2026-10-26", kind: "daily", label: "Diário de 26/10/2026",
    entries: [{ id: "old1", date: DAY, person: "gustavo", obra: "tulipas", createdAt: "x" }], weeks: {}
  },
  { id: "backup-prerestore-2026-10-20T15-00-00-000Z", kind: "prerestore", label: "Antes de restaurar (20/10/2026 12:00)", entries: [], weeks: {} }
];

test("only the administrator sees the Administração item", async ({ page }) => {
  await openApp(page, { me: "jean" });
  await page.locator("#userBtn").click();
  await expect(page.locator("#userMenu")).toBeVisible();
  await expect(page.locator('#userMenu [data-action="open-admin"]')).toHaveCount(0);

  const admin = await page.context().newPage();
  await openApp(admin, { me: "pedro" });
  await admin.locator("#userBtn").click();
  await expect(admin.locator('#userMenu [data-action="open-admin"]')).toBeVisible();
});

test("the panel lists the people (no reset for yourself) and the backups", async ({ page }) => {
  await openApp(page, { me: "pedro", backups: BACKUPS });
  await page.locator("#userBtn").click();
  await page.locator('[data-action="open-admin"]').click();
  await expect(page.locator("#adminPanel")).toBeVisible();
  await expect(page.locator(".admin-user")).toHaveCount(5);
  await expect(page.locator('.admin-user[data-user="pedro"] [data-action="admin-reset"]')).toHaveCount(0);
  await expect(page.locator('.admin-user[data-user="jean"] [data-action="admin-reset"]')).toHaveCount(1);
  await expect(page.locator(".admin-backup")).toHaveCount(2);
  await expect(page.locator('.admin-backup[data-id="backup-2026-10-26"]')).toContainText("Diário de 26/10/2026");
});

test("resetting a password needs a second click and never shows the initial password", async ({ page }) => {
  const state = await openApp(page, { me: "pedro" });
  await page.locator("#userBtn").click();
  await page.locator('[data-action="open-admin"]').click();
  await page.locator('.admin-user[data-user="jean"] [data-action="admin-reset"]').click();
  await expect(page.locator('.admin-user[data-user="jean"]')).toContainText("Zerar a senha de Jean?");
  expect(state.resetUsers).toEqual([]);

  await page.locator('[data-action="admin-cancel"]').click();
  await expect(page.locator('.admin-user[data-user="jean"] [data-action="admin-reset"]')).toHaveCount(1);
  expect(state.resetUsers).toEqual([]);

  await page.locator('.admin-user[data-user="jean"] [data-action="admin-reset"]').click();
  await page.locator('[data-action="admin-reset-yes"]').click();
  await expect(page.locator("#toast")).toContainText("Senha de Jean zerada");
  await expect(page.locator("#toast")).not.toContainText("Mudar");
  expect(state.resetUsers).toEqual(["jean"]);
  await expect(page.locator('.admin-user[data-user="jean"] [data-action="admin-reset"]')).toHaveCount(1);
});

test("downloading the backup saves a dated JSON with entries and weeks, without users", async ({ page }) => {
  await openApp(page, { me: "pedro", entries: MIX, confirmations: { "2026-10-25": { jean: "2026-10-27T15:00:00.000Z" } } });
  await page.locator("#userBtn").click();
  await page.locator('[data-action="open-admin"]').click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator('[data-action="admin-download"]').click()
  ]);
  expect(download.suggestedFilename()).toBe("agenda-obras-backup-2026-10-27.json");
  const body = JSON.parse(require("fs").readFileSync(await download.path(), "utf8"));
  expect(body.entries).toHaveLength(2);
  expect(body.weeks["2026-10-25"].jean).toBeTruthy();
  expect(body.users).toBeUndefined();
});

test("restoring a backup asks first, then reloads the calendar", async ({ page }) => {
  const state = await openApp(page, { me: "pedro", entries: MIX, backups: BACKUPS });
  await page.locator("#userBtn").click();
  await page.locator('[data-action="open-admin"]').click();
  await page.locator('.admin-backup[data-id="backup-2026-10-26"] [data-action="admin-restore"]').click();
  await expect(page.locator('.admin-backup[data-id="backup-2026-10-26"]')).toContainText("substituídos");
  expect(state.restored).toBe(null);

  await page.locator('[data-action="admin-restore-yes"]').click();
  await expect(page.locator("#toast")).toHaveText("Backup restaurado.");
  expect(state.restored).toBe("backup-2026-10-26");

  await page.locator('#authModal [data-action="close-auth"]').click();
  await expect(page.locator("#authOverlay")).not.toHaveClass(/show/);
  const chips = page.locator('.day-card[data-date="' + DAY + '"] .entry-chip');
  await expect(chips).toHaveCount(1);
  await expect(chips.first()).toContainText("Gustavo");
});

test("a failed restore shows the server message and keeps the data", async ({ page }) => {
  const state = await openApp(page, { me: "pedro", entries: MIX, backups: BACKUPS });
  await page.locator("#userBtn").click();
  await page.locator('[data-action="open-admin"]').click();
  await page.locator('.admin-backup[data-id="backup-2026-10-26"] [data-action="admin-restore"]').click();
  state.backups = [];
  await page.locator('[data-action="admin-restore-yes"]').click();
  await expect(page.locator("#toast")).toHaveText("backup não encontrado");
  await expect(page.locator('.day-card[data-date="' + DAY + '"] .entry-chip')).toHaveCount(2);
});

// ---- Ajustes pós-teste: tela inicial, comentário da reunião, modal da mensagem ---------------------

test("the initial menu offers sign in or visitor access", async ({ page }) => {
  await openApp(page, { landing: true });
  await expect(page.locator("#landingOverlay")).toHaveClass(/show/);
  await expect(page.locator('[data-action="landing-login"]')).toBeVisible();
  await expect(page.locator('[data-action="landing-visitor"]')).toBeVisible();
});

test("choosing visitor closes the menu and is remembered on this device", async ({ page }) => {
  await openApp(page, { landing: true });
  await page.locator('[data-action="landing-visitor"]').click();
  await expect(page.locator("#landingOverlay")).not.toHaveClass(/show/);
  await expect(page.locator(".day-card").first()).toBeVisible();
  await page.reload();
  await page.waitForSelector("#calendarArea .day-card");
  await page.waitForTimeout(300);
  await expect(page.locator("#landingOverlay")).not.toHaveClass(/show/);
});

test("choosing Entrar opens the login form", async ({ page }) => {
  await openApp(page, { landing: true });
  await page.locator('[data-action="landing-login"]').click();
  await expect(page.locator("#landingOverlay")).not.toHaveClass(/show/);
  await expect(page.locator("#loginForm")).toBeVisible();
});

test("the direct visitor link skips the menu", async ({ page }) => {
  await openApp(page, { landing: true });
  await page.goto("https://agenda.test/?visitante=1");
  await page.waitForSelector("#calendarArea .day-card");
  await page.waitForTimeout(300);
  await expect(page.locator("#landingOverlay")).not.toHaveClass(/show/);
});

test("a signed-in person does not see the menu, and signing out brings it back", async ({ page }) => {
  await openApp(page, { me: "jean", landing: true });
  await page.waitForTimeout(300);
  await expect(page.locator("#landingOverlay")).not.toHaveClass(/show/);
  await page.locator("#userBtn").click();
  await page.locator('#userMenu [data-action="logout"]').click();
  await expect(page.locator("#landingOverlay")).toHaveClass(/show/);
});

test("a meeting has its own comment, separate from the visit comment", async ({ page }) => {
  const state = await openApp(page, { me: "jean", entries: [] });
  await openDay(page);
  await page.locator('input[name="modal-obra"][value="porto"]').check();
  const box = page.locator('.obra-extra[data-obra="porto"]');
  await box.locator(".obra-comment").fill("vistoria");
  await box.locator(".meet-on").check();
  await box.locator(".meet-start").fill("14:00");
  await box.locator(".meet-note").fill("alinhar cronograma");
  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toHaveText("1 marcação adicionada.");
  const item = state.requests.filter(function (r) { return r.body.op === "addMany"; })[0].body.items[0];
  expect(item.comment).toBe("vistoria");
  expect(item.meeting).toEqual({ start: "14:00", end: "15:00", note: "alinhar cronograma" });
  const chip = page.locator("#modal .entry-chip", { hasText: "Jean" });
  await expect(chip).toContainText("Reunião 14:00–15:00: alinhar cronograma");
  await expect(chip).toContainText("vistoria");
});

test("editing keeps the meeting note and can clear it", async ({ page }) => {
  const entries = [{ id: "n1", date: DAY, person: "jean", obra: "almada", createdAt: "x", meeting: { start: "14:00", end: "15:00", note: "pauta" } }];
  const state = await openApp(page, { me: "jean", entries: entries });
  await openDay(page);
  await page.locator('#modal .edit[data-id="n1"]').click();
  await expect(page.locator(".comment-edit .meet-note")).toHaveValue("pauta");
  await page.locator(".comment-edit .meet-note").fill("");
  await page.locator('.comment-edit button[type="submit"]').click();
  await expect(page.locator("#toast")).toHaveText("Comentário salvo.");
  const call = state.requests.filter(function (r) { return r.body.op === "update"; })[0];
  expect(call.body.meeting).toEqual({ start: "14:00", end: "15:00" });
});

test("the message modal offers copy and share only: no download, no WhatsApp link", async ({ page }) => {
  await openApp(page);
  await page.locator("#waBtn").click();
  await expect(page.locator('[data-action="copy-wa-message"]')).toBeVisible();
  await expect(page.locator('[data-action="copy-wa-image"]')).toBeVisible();
  await expect(page.locator("#waImageDownload")).toHaveCount(0);
  await expect(page.locator('#waModal a[href*="wa.me"]')).toHaveCount(0);
  await expect(page.locator('#waModal a[download]')).toHaveCount(0);
});
