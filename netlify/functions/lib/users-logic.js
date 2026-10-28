"use strict";

const { hashPassword, verifyPassword } = require("./passwords");

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
const MIN_LENGTH = 8;
const INVALID = "usuário ou senha inválidos";

let dummyRecord = null;
function dummy() {
  if (!dummyRecord) dummyRecord = hashPassword("dummy-password-for-timing");
  return dummyRecord;
}

function seedUsers(initialPassword, people, adminIds) {
  const users = {};
  people.forEach(function (p) {
    const h = hashPassword(initialPassword);
    users[p.id] = {
      id: p.id, name: p.name, role: adminIds.indexOf(p.id) >= 0 ? "admin" : "user",
      salt: h.salt, hash: h.hash, mustChange: true, pv: 1, failed: 0, lockedUntil: 0
    };
  });
  return users;
}

function publicUser(rec) {
  return { id: rec.id, name: rec.name, role: rec.role, mustChange: !!rec.mustChange };
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
    salt: h.salt, hash: h.hash, mustChange: false, pv: rec.pv + 1, failed: 0, lockedUntil: 0
  });
  return { ok: true, users: withUser(users, updated), user: updated };
}

function resetPassword(users, id, initialPassword) {
  const rec = users[id];
  if (!rec) return { ok: false, status: 404, error: "usuário não encontrado" };
  const h = hashPassword(initialPassword);
  const updated = Object.assign({}, rec, {
    salt: h.salt, hash: h.hash, mustChange: true, pv: rec.pv + 1, failed: 0, lockedUntil: 0
  });
  return { ok: true, users: withUser(users, updated), user: updated };
}

module.exports = { MAX_FAILED, LOCK_MS, MIN_LENGTH, seedUsers, publicUser, authenticate, changePassword, resetPassword };
