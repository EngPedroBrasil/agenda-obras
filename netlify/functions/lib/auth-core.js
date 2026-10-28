"use strict";

const { PEOPLE, ADMIN_IDS } = require("./people");
const { seedUsers } = require("./users-logic");
const S = require("./session");
const { isLocalEnv } = require("./store");

const USERS_KEY = "users";
const MIN_SECRET_LENGTH = 32;

function readSettings(opts) {
  const env = (opts && opts.env) || process.env;
  const now = (opts && opts.now) || Date.now;
  return {
    env: env,
    now: now,
    secret: env.SESSION_SECRET || "",
    initialPassword: env.INITIAL_PASSWORD || "",
    secure: !isLocalEnv(env)
  };
}

function configProblem(settings) {
  if (settings.secret.length < MIN_SECRET_LENGTH) {
    return "SESSION_SECRET ausente ou curta demais (mínimo " + MIN_SECRET_LENGTH + " caracteres) nas variáveis de ambiente";
  }
  if (!settings.initialPassword) {
    return "INITIAL_PASSWORD ausente nas variáveis de ambiente";
  }
  return null;
}

function header(event, name) {
  const headers = (event && event.headers) || {};
  const wanted = name.toLowerCase();
  const keys = Object.keys(headers);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === wanted) return String(headers[keys[i]]);
  }
  return "";
}

function readJsonBody(event) {
  if (!/application\/json/i.test(header(event, "content-type"))) {
    return { ok: false, status: 415, error: "content-type deve ser application/json" };
  }
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { ok: false, status: 400, error: "JSON inválido" };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, status: 400, error: "corpo deve ser um objeto JSON" };
  }
  return { ok: true, payload: payload };
}

function json(status, body, extraHeaders) {
  return {
    statusCode: status,
    headers: Object.assign({ "content-type": "application/json", "cache-control": "no-store" }, extraHeaders || {}),
    body: JSON.stringify(body)
  };
}

function resolveUserId(input) {
  if (typeof input !== "string") return null;
  const id = input.trim().toLowerCase();
  return PEOPLE.some(function (p) { return p.id === id; }) ? id : null;
}

async function readUsers(store) {
  return (await store.get(USERS_KEY, { type: "json" })) || null;
}

async function loadUsers(store, settings) {
  let users = await readUsers(store);
  if (!users) {
    users = seedUsers(settings.initialPassword, PEOPLE, ADMIN_IDS);
    await store.setJSON(USERS_KEY, users);
  }
  return users;
}

function currentUser(event, users, settings) {
  const token = S.parseCookies(header(event, "cookie"))[S.COOKIE_NAME];
  const payload = S.verifySession(token, settings.secret, settings.now());
  if (!payload || !Object.prototype.hasOwnProperty.call(users, payload.u)) return null;
  const rec = users[payload.u];
  return rec.pv === payload.pv ? rec : null;
}

function sessionCookieFor(rec, settings) {
  const token = S.signSession({ u: rec.id, pv: rec.pv, exp: settings.now() + S.MAX_AGE_SECONDS * 1000 }, settings.secret);
  return S.buildCookie(token, { secure: settings.secure });
}

module.exports = {
  USERS_KEY, readSettings, configProblem, header, readJsonBody, json,
  resolveUserId, readUsers, loadUsers, currentUser, sessionCookieFor
};
