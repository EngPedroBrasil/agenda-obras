"use strict";

const A = require("./lib/auth-core");
const U = require("./lib/users-logic");
const B = require("./lib/backup-logic");
const { resolveStore } = require("./lib/store");

function makeHandler(store, opts) {
  const settings = A.readSettings(opts);

  return async function handler(event) {
    if (event.httpMethod !== "POST") return A.json(405, { error: "método não suportado" });

    const body = A.readJsonBody(event);
    if (!body.ok) return A.json(body.status, { error: body.error });
    const payload = body.payload;

    const problem = A.configProblem(settings);
    if (problem) return A.json(500, { error: problem });

    const users = await A.loadUsers(store, settings);
    const me = A.currentUser(event, users, settings);
    if (!me) return A.json(401, { error: "faça login" });
    if (me.mustChange) return A.json(403, { error: "troque a senha antes de continuar" });
    if (me.role !== "admin") return A.json(403, { error: "apenas o administrador" });

    if (payload.op === "resetPassword") {
      const id = A.resolveUserId(payload.user);
      if (typeof payload.user !== "string" || !payload.user.trim()) return A.json(400, { error: "user obrigatório" });
      if (!id) return A.json(404, { error: "usuário não encontrado" });
      if (id === me.id) return A.json(400, { error: "para trocar a sua própria senha use Minha conta" });
      const res = U.resetPassword(users, id, settings.initialPassword);
      if (!res.ok) return A.json(res.status, { error: res.error });
      await store.setJSON(A.USERS_KEY, res.users);
      return A.json(200, { user: U.publicUser(res.user) });
    }

    if (payload.op === "listBackups") {
      return A.json(200, { backups: await B.listBackups(store) });
    }

    if (payload.op === "downloadBackup") {
      const state = await B.readState(store);
      return A.json(200, { export: B.buildExport(state.entries, state.weeks, settings.now()) });
    }

    if (payload.op === "restoreBackup") {
      const res = await B.restoreSnapshot(store, payload.id, settings.now());
      if (!res.ok) return A.json(res.status, { error: res.error });
      return A.json(200, { ok: true });
    }

    return A.json(400, { error: "op inválida" });
  };
}

exports.handler = async function (event, context) {
  return makeHandler(resolveStore(process.env))(event, context);
};
exports.makeHandler = makeHandler;
