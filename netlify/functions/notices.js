"use strict";

const A = require("./lib/auth-core");
const U = require("./lib/users-logic");
const N = require("./lib/notices-logic");
const { PEOPLE } = require("./lib/people");
const { resolveStore } = require("./lib/store");

const NOTICES_KEY = "notices";

function makeHandler(store, opts) {
  const settings = A.readSettings(opts);

  return async function handler(event) {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return A.json(405, { error: "método não suportado" });

    const problem = A.configProblem(settings);
    if (problem) return A.json(500, { error: problem });

    const users = await A.loadUsers(store, settings);
    const me = A.currentUser(event, users, settings);
    if (!me) return A.json(401, { error: "faça login" });
    if (me.mustChange) return A.json(403, { error: "troque a senha antes de continuar" });

    const role = U.effectiveRole(me, settings.now());
    const canSend = role === "admin" || role === "manager";
    const list = (await store.get(NOTICES_KEY, { type: "json" })) || [];

    if (event.httpMethod === "GET") {
      return A.json(200, { inbox: N.inboxFor(list, me.id), sent: N.sentBy(list, me.id), canSend: canSend });
    }

    const body = A.readJsonBody(event);
    if (!body.ok) return A.json(body.status, { error: body.error });
    const payload = body.payload;

    if (payload.op === "send") {
      if (!canSend) {
        return A.json(403, {
          error: me.role === "admin"
            ? "ligue o modo administrador para enviar notificações"
            : "apenas o gestor e o administrador enviam notificações"
        });
      }
      const check = N.validateSend(payload, me.id, PEOPLE);
      if (!check.ok) return A.json(check.status, { error: check.error });
      const created = N.buildNotices(me.id, check.to, check.text, new Date(settings.now()).toISOString());
      await store.setJSON(NOTICES_KEY, N.addNotices(list, created, settings.now()));
      return A.json(200, { ok: true, sent: created.length });
    }

    if (payload.op === "markRead") {
      const res = N.markRead(list, payload.id, me.id, new Date(settings.now()).toISOString());
      if (!res.ok) return A.json(res.status, { error: res.error });
      if (res.changed) await store.setJSON(NOTICES_KEY, res.list);
      return A.json(200, { ok: true });
    }

    return A.json(400, { error: "op inválida (esperado 'send' ou 'markRead')" });
  };
}

exports.handler = async function (event, context) {
  return makeHandler(resolveStore(process.env))(event, context);
};
exports.makeHandler = makeHandler;
