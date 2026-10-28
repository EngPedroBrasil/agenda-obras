"use strict";

const { hashPassword, verifyPassword } = require("./passwords");

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
const ELEVATION_MS = 15 * 60 * 1000;
const MIN_LENGTH = 8;
const INVALID = "usuário ou senha inválidos";

let dummyRecord = null;
function dummy() {
  if (!dummyRecord) dummyRecord = hashPassword("dummy-password-for-timing");
  return dummyRecord;
}

function newRecord(p, role, initialPassword) {
  const h = hashPassword(initialPassword);
  return {
    id: p.id, name: p.name, role: role,
    salt: h.salt, hash: h.hash, mustChange: true, pv: 1, failed: 0, lockedUntil: 0
  };
}

function seedUsers(initialPassword, people, adminIds, managers) {
  const users = {};
  people.forEach(function (p) {
    users[p.id] = newRecord(p, adminIds.indexOf(p.id) >= 0 ? "admin" : "user", initialPassword);
  });
  (managers || []).forEach(function (m) {
    users[m.id] = newRecord(m, "manager", initialPassword);
  });
  return users;
}

// Completa um cadastro antigo com os gestores que faltam; devolve o MESMO objeto se nada falta.
function ensureManagers(users, initialPassword, managers) {
  let next = users;
  (managers || []).forEach(function (m) {
    if (Object.prototype.hasOwnProperty.call(next, m.id)) return;
    if (next === users) next = Object.assign({}, users);
    next[m.id] = newRecord(m, "manager", initialPassword);
  });
  return next;
}

// O administrador só age como administrador enquanto o modo administrador estiver ligado.
function effectiveRole(rec, nowMs) {
  if (rec.role === "admin") return rec.elevatedUntil > nowMs ? "admin" : "user";
  return rec.role;
}

function publicUser(rec, nowMs) {
  const now = nowMs === undefined ? Date.now() : nowMs;
  const out = { id: rec.id, name: rec.name, role: effectiveRole(rec, now), mustChange: !!rec.mustChange };
  if (rec.role === "admin") {
    out.canElevate = true;
    out.elevatedUntil = rec.elevatedUntil > now ? rec.elevatedUntil : 0;
  }
  return out;
}

function withUser(users, rec) {
  const next = Object.assign({}, users);
  next[rec.id] = rec;
  return next;
}

function authenticate(users, id, password, nowMs) {
  const rec = users[id];
  if (!rec) {
    verifyPassword(password, dummy());
    return { ok: false, status: 401, error: INVALID, users: users };
  }
  if (rec.lockedUntil && rec.lockedUntil > nowMs) {
    return { ok: false, status: 429, error: "muitas tentativas; tente de novo em alguns minutos", users: users };
  }
  const updated = Object.assign({}, rec);
  if (verifyPassword(password, rec)) {
    updated.failed = 0;
    updated.lockedUntil = 0;
    return { ok: true, users: withUser(users, updated), user: updated };
  }
  updated.failed = (rec.failed || 0) + 1;
  if (updated.failed >= MAX_FAILED) {
    updated.failed = 0;
    updated.lockedUntil = nowMs + LOCK_MS;
  }
  return { ok: false, status: 401, error: INVALID, users: withUser(users, updated) };
}

function changePassword(users, id, current, next, initialPassword) {
  const rec = users[id];
  if (!rec || !verifyPassword(current, rec)) {
    return { ok: false, status: 401, error: "senha atual incorreta" };
  }
  if (typeof next !== "string" || next.length < MIN_LENGTH) {
    return { ok: false, status: 400, error: "a nova senha precisa ter pelo menos " + MIN_LENGTH + " caracteres" };
  }
  if (next === initialPassword || next === current) {
    return { ok: false, status: 400, error: "escolha uma senha diferente da atual e da senha inicial" };
  }
  const h = hashPassword(next);
  const updated = Object.assign({}, rec, {
    salt: h.salt, hash: h.hash, mustChange: false, pv: rec.pv + 1, failed: 0, lockedUntil: 0, elevatedUntil: 0
  });
  return { ok: true, users: withUser(users, updated), user: updated };
}

function resetPassword(users, id, initialPassword) {
  const rec = users[id];
  if (!rec) return { ok: false, status: 404, error: "usuário não encontrado" };
  const h = hashPassword(initialPassword);
  const updated = Object.assign({}, rec, {
    salt: h.salt, hash: h.hash, mustChange: true, pv: rec.pv + 1, failed: 0, lockedUntil: 0, elevatedUntil: 0
  });
  return { ok: true, users: withUser(users, updated), user: updated };
}

function elevate(users, id, nowMs) {
  const rec = users[id];
  if (!rec || rec.role !== "admin") {
    return { ok: false, status: 403, error: "apenas o administrador pode ligar o modo administrador" };
  }
  if (rec.mustChange) return { ok: false, status: 403, error: "troque a senha antes de continuar" };
  const updated = Object.assign({}, rec, { elevatedUntil: nowMs + ELEVATION_MS });
  return { ok: true, users: withUser(users, updated), user: updated };
}

function unelevate(users, id) {
  const rec = users[id];
  if (!rec || !rec.elevatedUntil) return { ok: true, users: users, user: rec };
  const updated = Object.assign({}, rec, { elevatedUntil: 0 });
  return { ok: true, users: withUser(users, updated), user: updated };
}

module.exports = {
  MAX_FAILED, LOCK_MS, MIN_LENGTH, ELEVATION_MS,
  seedUsers, ensureManagers, effectiveRole, publicUser, authenticate, changePassword, resetPassword, elevate, unelevate
};
