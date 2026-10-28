"use strict";

const L = require("./lib/entries-logic");
const W = require("./lib/weeks-logic");
const A = require("./lib/auth-core");
const { authorize } = require("./lib/access");
const { ensureDailySnapshot, readState } = require("./lib/backup-logic");
const { resolveStore } = require("./lib/store");

const ENTRIES_KEY = "entries";
const WEEKS_KEY = "weeks";

function fail(status, error) {
  return { ok: false, status: status, error: error };
}

function done(state, entries, affected) {
  return { ok: true, entries: entries, weeks: W.reopenForEntries(state.weeks, affected) };
}

// Pure: turns one request into the next state, or an error. Nothing is written here.
function applyOp(payload, state, iso) {
  const entries = state.entries;
  const weeks = state.weeks;

  switch (payload.op) {
    case "add": {
      const check = L.validateEntry(payload);
      if (!check.ok) return fail(400, check.error);
      const next = L.addEntry(entries, L.buildEntry(payload, L.newId(), iso));
      return done(state, next, next === entries ? [] : [{ person: payload.person, date: payload.date }]);
    }

    case "addMany": {
      const result = L.addManyEntries(entries, payload.items, function (item) {
        return L.buildEntry(item, L.newId(), iso);
      });
      if (!result.ok) return fail(400, result.error);
      return done(state, result.entries, result.affected);
    }

    case "update": {
      if (typeof payload.id !== "string" || !payload.id) return fail(400, "id obrigatório para atualizar");
      const patch = {};
      if ("comment" in payload) {
        const c = L.validateComment(payload.comment);
        if (!c.ok) return fail(400, c.error);
        patch.comment = payload.comment;
      }
      if ("meeting" in payload) {
        if (payload.meeting !== null) {
          const m = L.validateMeeting(payload.meeting);
          if (!m.ok) return fail(400, m.error);
        }
        patch.meeting = payload.meeting;
      }
      if (!("comment" in patch) && !("meeting" in patch)) return fail(400, "nada para atualizar (envie comment e/ou meeting)");
      const next = L.updateEntry(entries, payload.id, patch);
      if (!next) return fail(404, "marcação não encontrada");
      const entry = entries.filter(function (e) { return e.id === payload.id; })[0];
      const changed = JSON.stringify(next) !== JSON.stringify(entries);
      return done(state, next, changed ? [{ person: entry.person, date: entry.date }] : []);
    }

    case "remove": {
      if (typeof payload.id !== "string" || !payload.id) return fail(400, "id obrigatório para remover");
      const entry = entries.filter(function (e) { return e.id === payload.id; })[0];
      if (!entry) return done(state, entries, []);
      return done(state, L.removeEntry(entries, payload.id), [{ person: entry.person, date: entry.date }]);
    }

    case "confirmWeek":
    case "unconfirmWeek": {
      const check = W.validateWeekOp(payload);
      if (!check.ok) return fail(400, check.error);
      const next = payload.op === "confirmWeek"
        ? W.confirmWeek(weeks, payload.week, payload.person, iso)
        : W.unconfirmWeek(weeks, payload.week, payload.person);
      return { ok: true, entries: entries, weeks: next };
    }

    default:
      return fail(400, "op inválida (esperado add, addMany, update, remove, confirmWeek ou unconfirmWeek)");
  }
}

// Reading never fails because of login problems: anything unclear means "anonymous".
async function isSignedIn(event, store, settings) {
  try {
    if (A.configProblem(settings)) return false;
    const users = await A.readUsers(store);
    return !!(users && A.currentUser(event, users, settings));
  } catch (e) {
    return false;
  }
}

function differs(a, b) {
  return a !== b && JSON.stringify(a) !== JSON.stringify(b);
}

function makeHandler(store, opts) {
  const settings = A.readSettings(opts);

  return async function handler(event) {
    if (event.httpMethod === "GET") {
      const state = await readState(store);
      if (await isSignedIn(event, store, settings)) {
        return A.json(200, { entries: state.entries, confirmations: state.weeks });
      }
      // Anonymous visitors (the people at the obras) only get the weeks the five released.
      const view = W.visitorView(state.entries, state.weeks);
      return A.json(200, { entries: view.entries, confirmations: view.confirmations, restricted: true });
    }

    if (event.httpMethod !== "POST") return A.json(405, { error: "método não suportado" });

    const body = A.readJsonBody(event);
    if (!body.ok) return A.json(body.status, { error: body.error });
    const payload = body.payload;

    const problem = A.configProblem(settings);
    if (problem) return A.json(500, { error: problem });

    const users = await A.loadUsers(store, settings);
    const user = A.actingUser(event, users, settings);
    const state = await readState(store);

    const allowed = authorize(user, payload, state.entries);
    if (!allowed.ok) return A.json(allowed.status, { error: allowed.error });

    const out = applyOp(payload, state, new Date(settings.now()).toISOString());
    if (!out.ok) return A.json(out.status, { error: out.error });

    const entriesChanged = differs(out.entries, state.entries);
    const weeksChanged = differs(out.weeks, state.weeks);
    if (entriesChanged || weeksChanged) {
      await ensureDailySnapshot(store, settings.now());
      if (entriesChanged) await store.setJSON(ENTRIES_KEY, out.entries);
      if (weeksChanged) await store.setJSON(WEEKS_KEY, out.weeks);
    }
    return A.json(200, { entries: out.entries, confirmations: out.weeks });
  };
}

exports.handler = async function (event, context) {
  return makeHandler(resolveStore(process.env))(event, context);
};
exports.makeHandler = makeHandler;
