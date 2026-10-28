"use strict";

const { signSession } = require("../../../netlify/functions/lib/session");
const { seedUsers } = require("../../../netlify/functions/lib/users-logic");
const { PEOPLE, ADMIN_IDS } = require("../../../netlify/functions/lib/people");
const { makeFakeStore } = require("./fake-store");

const SECRET = "s".repeat(32);
const INITIAL = "Mudar@123";
const NOW = Date.UTC(2026, 9, 27, 15, 0, 0);
const OPTS = { env: { SESSION_SECRET: SECRET, INITIAL_PASSWORD: INITIAL }, now: function () { return NOW; } };

let seeded = null;
function seededUsers() {
  if (!seeded) seeded = seedUsers(INITIAL, PEOPLE, ADMIN_IDS);
  return JSON.parse(JSON.stringify(seeded));
}

// Everybody already changed the initial password (mustChange false): the common case in tests.
function readyUsers() {
  const users = seededUsers();
  Object.keys(users).forEach(function (id) { users[id].mustChange = false; });
  return users;
}

function cookieFor(users, id) {
  return "agenda_session=" + signSession({ u: id, pv: users[id].pv, exp: NOW + 60000 }, SECRET);
}

function event(method, body, cookie) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return { httpMethod: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body) };
}

async function call(handler, body, cookie) {
  const res = await handler(event("POST", body, cookie));
  return { status: res.statusCode, body: JSON.parse(res.body), headers: res.headers };
}

function storeWith(entries, extra) {
  return makeFakeStore(entries, Object.assign({ users: readyUsers() }, extra || {}));
}

function cookieOf(res) {
  return res.headers["set-cookie"].split(";")[0];
}

module.exports = { SECRET, INITIAL, NOW, OPTS, seededUsers, readyUsers, cookieFor, event, call, storeWith, cookieOf };
