"use strict";

// Simulated backend for the Playwright specs: /api/entries, /api/auth and /api/admin.
// It mirrors the real permission rules closely enough for the UI to be exercised.
const path = require("path");
const fs = require("fs");

const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");
const NOW_ISO = "2026-10-27T12:00:00-03:00";
const SERVER_NOW = "2026-10-27T15:00:00.000Z";
const PEOPLE = { pedro: "Pedro", jean: "Jean", haniel: "Haniel", gustavo: "Gustavo", bruna: "Bruna" };
const INITIAL_PASSWORD = "Mudar@123";

function weekKeyOf(dateKey) {
  const p = dateKey.split("-").map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

function json(route, status, body) {
  return route.fulfill({ status: status, contentType: "application/json", body: JSON.stringify(body) });
}

function userRecord(state, id) {
  return { id: id, name: PEOPLE[id], role: id === "pedro" ? "admin" : "user", mustChange: state.mustChange.indexOf(id) >= 0 };
}

function mayAct(state, person) {
  const me = state.me;
  return !!me && !me.mustChange && (me.role === "admin" || me.id === person);
}

function reopen(state, person, date) {
  const week = weekKeyOf(date);
  if (state.confirmations[week] && state.confirmations[week][person]) {
    delete state.confirmations[week][person];
    if (!Object.keys(state.confirmations[week]).length) delete state.confirmations[week];
  }
}

// Returns true when something changed (new slot, new comment or new meeting).
function upsertEntry(state, item) {
  const comment = typeof item.comment === "string" ? item.comment.trim() : "";
  const existing = state.entries.filter(function (e) {
    return e.person === item.person && e.obra === item.obra && e.date === item.date;
  })[0];
  if (existing) {
    let changed = false;
    if (comment && comment !== existing.comment) { existing.comment = comment; changed = true; }
    if (item.meeting && JSON.stringify(item.meeting) !== JSON.stringify(existing.meeting)) { existing.meeting = item.meeting; changed = true; }
    if (changed) reopen(state, item.person, item.date);
    return changed;
  }
  const entry = { id: "n" + (++state.seq), date: item.date, person: item.person, obra: item.obra, createdAt: SERVER_NOW };
  if (comment) entry.comment = comment;
  if (item.meeting) entry.meeting = item.meeting;
  state.entries.push(entry);
  reopen(state, item.person, item.date);
  return true;
}

async function stubApi(page, opts) {
  opts = opts || {};
  const state = {
    entries: JSON.parse(JSON.stringify(opts.entries || [])),
    confirmations: JSON.parse(JSON.stringify(opts.confirmations || {})),
    me: null,
    passwords: {},
    mustChange: (opts.mustChange || []).slice(),
    backups: JSON.parse(JSON.stringify(opts.backups || [])),
    requests: [],
    resetUsers: [],
    restored: null,
    seq: 0,
    failNext: null
  };
  if (opts.me) state.me = userRecord(state, opts.me);

  await page.route(/fonts\.(googleapis|gstatic)\.com/, function (route) { return route.abort(); });

  await page.route("**/api/entries", async function (route) {
    const req = route.request();
    if (req.method() === "GET") return json(route, 200, { entries: state.entries, confirmations: state.confirmations });
    const p = req.postDataJSON();
    state.requests.push({ path: "/api/entries", body: p });
    if (state.failNext) { const f = state.failNext; state.failNext = null; return json(route, f.status, { error: f.error || "erro simulado" }); }
    if (!state.me) return json(route, 401, { error: "faça login para alterar a agenda" });
    if (state.me.mustChange) return json(route, 403, { error: "troque a senha antes de alterar a agenda" });
    const deny = function () { return json(route, 403, { error: "você só pode alterar as suas próprias marcações" }); };
    const ok = function () { return json(route, 200, { entries: state.entries, confirmations: state.confirmations }); };

    if (p.op === "add") {
      if (!mayAct(state, p.person)) return deny();
      upsertEntry(state, p);
      return ok();
    }
    if (p.op === "addMany") {
      if (!Array.isArray(p.items) || !p.items.length) return json(route, 400, { error: "items obrigatório" });
      if (!p.items.every(function (it) { return mayAct(state, it.person); })) return deny();
      p.items.forEach(function (it) { upsertEntry(state, it); });
      return ok();
    }
    if (p.op === "update" || p.op === "remove") {
      const entry = state.entries.filter(function (e) { return e.id === p.id; })[0];
      if (!entry) return p.op === "remove" ? ok() : json(route, 404, { error: "marcação não encontrada" });
      if (!mayAct(state, entry.person)) return deny();
      if (p.op === "remove") {
        state.entries = state.entries.filter(function (e) { return e.id !== p.id; });
      } else {
        if ("comment" in p) { if (p.comment) entry.comment = p.comment; else delete entry.comment; }
        if ("meeting" in p) { if (p.meeting) entry.meeting = p.meeting; else delete entry.meeting; }
      }
      reopen(state, entry.person, entry.date);
      return ok();
    }
    if (p.op === "confirmWeek" || p.op === "unconfirmWeek") {
      if (!mayAct(state, p.person)) return deny();
      if (p.op === "confirmWeek") {
        state.confirmations[p.week] = state.confirmations[p.week] || {};
        state.confirmations[p.week][p.person] = SERVER_NOW;
      } else if (state.confirmations[p.week]) {
        delete state.confirmations[p.week][p.person];
        if (!Object.keys(state.confirmations[p.week]).length) delete state.confirmations[p.week];
      }
      return ok();
    }
    return json(route, 400, { error: "op inválida" });
  });

  await page.route("**/api/auth", async function (route) {
    const req = route.request();
    if (req.method() === "GET") return json(route, 200, { user: state.me });
    const p = req.postDataJSON();
    state.requests.push({ path: "/api/auth", body: p });
    if (p.op === "login") {
      const id = String(p.user || "").trim().toLowerCase();
      const expected = state.passwords[id] || INITIAL_PASSWORD;
      if (!PEOPLE[id] || p.password !== expected) return json(route, 401, { error: "usuário ou senha inválidos" });
      state.me = userRecord(state, id);
      return json(route, 200, { user: state.me });
    }
    if (p.op === "logout") { state.me = null; return json(route, 200, { ok: true }); }
    if (p.op === "changePassword") {
      if (!state.me) return json(route, 401, { error: "faça login primeiro" });
      const current = state.passwords[state.me.id] || INITIAL_PASSWORD;
      if (p.current !== current) return json(route, 401, { error: "senha atual incorreta" });
      if (typeof p.next !== "string" || p.next.length < 8) return json(route, 400, { error: "a nova senha precisa ter pelo menos 8 caracteres" });
      if (p.next === INITIAL_PASSWORD || p.next === current) return json(route, 400, { error: "escolha uma senha diferente da atual e da senha inicial" });
      state.passwords[state.me.id] = p.next;
      state.mustChange = state.mustChange.filter(function (id) { return id !== state.me.id; });
      state.me = userRecord(state, state.me.id);
      return json(route, 200, { user: state.me });
    }
    return json(route, 400, { error: "op inválida" });
  });

  await page.route("**/api/admin", async function (route) {
    const p = route.request().postDataJSON();
    state.requests.push({ path: "/api/admin", body: p });
    if (!state.me) return json(route, 401, { error: "faça login" });
    if (state.me.role !== "admin") return json(route, 403, { error: "apenas o administrador" });
    if (p.op === "resetPassword") {
      state.resetUsers.push(p.user);
      state.passwords[p.user] = INITIAL_PASSWORD;
      if (state.mustChange.indexOf(p.user) < 0) state.mustChange.push(p.user);
      return json(route, 200, { user: { id: p.user, name: PEOPLE[p.user], role: "user", mustChange: true } });
    }
    if (p.op === "listBackups") {
      return json(route, 200, { backups: state.backups.map(function (b) { return { id: b.id, kind: b.kind, label: b.label }; }) });
    }
    if (p.op === "downloadBackup") {
      return json(route, 200, { export: { exportedAt: SERVER_NOW, entries: state.entries, weeks: state.confirmations } });
    }
    if (p.op === "restoreBackup") {
      const backup = state.backups.filter(function (b) { return b.id === p.id; })[0];
      if (!backup) return json(route, 404, { error: "backup não encontrado" });
      state.entries = JSON.parse(JSON.stringify(backup.entries || []));
      state.confirmations = JSON.parse(JSON.stringify(backup.weeks || {}));
      state.restored = p.id;
      return json(route, 200, { ok: true });
    }
    return json(route, 400, { error: "op inválida" });
  });

  return state;
}

// Serves public/ at `origin` (the page needs a real http(s) origin so fetch() can be intercepted;
// file:// pages cannot call the stubbed /api routes). localhost:8888 makes the page believe it runs locally.
async function serveSite(page, origin) {
  await page.route(origin + "/**", async function (route) {
    const url = new URL(route.request().url());
    const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const file = path.join(PUBLIC_DIR, rel);
    if (file.indexOf(PUBLIC_DIR) !== 0 || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return route.fulfill({ status: 404, body: "not found" });
    }
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png" };
    return route.fulfill({ path: file, contentType: types[path.extname(file)] || "application/octet-stream" });
  });
}

async function openApp(page, opts) {
  opts = opts || {};
  await page.clock.install({ time: new Date(NOW_ISO) });
  // The initial menu (landing) would cover the page in every test; opts.landing keeps it.
  await page.addInitScript(function (skip) {
    if (skip) { try { localStorage.setItem("agenda-obras-visitor", "1"); } catch (e) { /* ignora */ } }
  }, !opts.landing);
  const origin = opts.local ? "http://localhost:8888" : "https://agenda.test";
  await serveSite(page, origin);
  const state = await stubApi(page, opts);
  const url = origin + "/";
  const loaded = page.waitForResponse(function (r) { return r.url().indexOf("/api/entries") >= 0 && r.request().method() === "GET"; });
  await page.goto(url);
  await loaded;
  await page.waitForSelector("#calendarArea .day-card, #calendarArea .month-cell, #calendarArea .att-table");
  return state;
}

module.exports = { openApp, stubApi, NOW_ISO };
