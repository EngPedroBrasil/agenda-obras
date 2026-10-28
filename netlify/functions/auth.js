"use strict";

const A = require("./lib/auth-core");
const U = require("./lib/users-logic");
const S = require("./lib/session");
const { resolveStore } = require("./lib/store");

const GENERIC_UNKNOWN_ID = "__desconhecido__";

// Ao sair, o modo administrador desliga: a próxima entrada começa em modo comum.
async function dropElevation(store, event, settings) {
  try {
    if (A.configProblem(settings) || !A.header(event, "cookie")) return;
    const users = await A.readUsers(store);
    const rec = users ? A.currentUser(event, users, settings) : null;
    if (!rec || !rec.elevatedUntil) return;
    await store.setJSON(A.USERS_KEY, U.unelevate(users, rec.id).users);
  } catch (e) {
    // sair nunca deve falhar por causa disso
  }
}

function makeHandler(store, opts) {
  const settings = A.readSettings(opts);

  return async function handler(event) {
    if (event.httpMethod === "GET") {
      if (!A.header(event, "cookie") || A.configProblem(settings)) return A.json(200, { user: null });
      const users = await A.readUsers(store);
      const rec = users ? A.currentUser(event, users, settings) : null;
      return A.json(200, { user: rec ? U.publicUser(rec, settings.now()) : null });
    }

    if (event.httpMethod !== "POST") return A.json(405, { error: "método não suportado" });

    const body = A.readJsonBody(event);
    if (!body.ok) return A.json(body.status, { error: body.error });
    const payload = body.payload;

    if (payload.op === "logout") {
      await dropElevation(store, event, settings);
      return A.json(200, { ok: true }, { "set-cookie": S.clearCookie({ secure: settings.secure }) });
    }

    const problem = A.configProblem(settings);
    if (problem) return A.json(500, { error: problem });
    const users = await A.loadUsers(store, settings);

    if (payload.op === "login") {
      const id = A.resolveUserId(payload.user);
      const res = U.authenticate(users, id || GENERIC_UNKNOWN_ID, payload.password, settings.now());
      if (id && JSON.stringify(res.users[id]) !== JSON.stringify(users[id])) {
        await store.setJSON(A.USERS_KEY, res.users);
      }
      if (!res.ok) return A.json(res.status, { error: res.error });
      return A.json(200, { user: U.publicUser(res.user, settings.now()) }, { "set-cookie": A.sessionCookieFor(res.user, settings) });
    }

    if (payload.op === "changePassword") {
      const rec = A.currentUser(event, users, settings);
      if (!rec) return A.json(401, { error: "faça login primeiro" });
      const res = U.changePassword(users, rec.id, payload.current, payload.next, settings.initialPassword);
      if (!res.ok) return A.json(res.status, { error: res.error });
      await store.setJSON(A.USERS_KEY, res.users);
      return A.json(200, { user: U.publicUser(res.user, settings.now()) }, { "set-cookie": A.sessionCookieFor(res.user, settings) });
    }

    if (payload.op === "elevate" || payload.op === "unelevate") {
      const rec = A.currentUser(event, users, settings);
      if (!rec) return A.json(401, { error: "faça login primeiro" });
      const res = payload.op === "elevate" ? U.elevate(users, rec.id, settings.now()) : U.unelevate(users, rec.id);
      if (!res.ok) return A.json(res.status, { error: res.error });
      if (res.users !== users) await store.setJSON(A.USERS_KEY, res.users);
      return A.json(200, { user: U.publicUser(res.user, settings.now()) });
    }

    return A.json(400, { error: "op inválida (esperado 'login', 'logout' ou 'changePassword')" });
  };
}

exports.handler = async function (event, context) {
  return makeHandler(resolveStore(process.env))(event, context);
};
exports.makeHandler = makeHandler;
