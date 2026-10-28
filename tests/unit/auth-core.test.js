const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../../netlify/functions/lib/auth-core");
const H = require("./helpers/auth-helpers");

test("configProblem flags a missing or short SESSION_SECRET and a missing INITIAL_PASSWORD", function () {
  const ok = A.readSettings({ env: { SESSION_SECRET: "x".repeat(32), INITIAL_PASSWORD: "Mudar@123" } });
  assert.equal(A.configProblem(ok), null);
  assert.match(A.configProblem(A.readSettings({ env: { INITIAL_PASSWORD: "a" } })), /SESSION_SECRET/);
  assert.match(A.configProblem(A.readSettings({ env: { SESSION_SECRET: "curto", INITIAL_PASSWORD: "a" } })), /SESSION_SECRET/);
  assert.match(A.configProblem(A.readSettings({ env: { SESSION_SECRET: "x".repeat(32) } })), /INITIAL_PASSWORD/);
});

test("readSettings: the cookie is Secure except in a local environment", function () {
  assert.equal(A.readSettings({ env: {} }).secure, true);
  assert.equal(A.readSettings({ env: { NETLIFY_DEV: "true" } }).secure, false);
  assert.equal(A.readSettings({ env: { AGENDA_LOCAL: "1" } }).secure, false);
});

test("header finds names regardless of case", function () {
  assert.equal(A.header({ headers: { "Content-Type": "application/json" } }, "content-type"), "application/json");
  assert.equal(A.header({}, "cookie"), "");
});

test("readJsonBody requires a JSON content type (415), valid JSON (400) and an object (400)", function () {
  const ok = A.readJsonBody({ headers: { "content-type": "application/json; charset=utf-8" }, body: '{"a":1}' });
  assert.deepEqual(ok, { ok: true, payload: { a: 1 } });
  assert.equal(A.readJsonBody({ headers: { "content-type": "text/plain" }, body: "{}" }).status, 415);
  assert.equal(A.readJsonBody({ headers: {}, body: "{}" }).status, 415);
  assert.equal(A.readJsonBody({ headers: { "content-type": "application/json" }, body: "{nope" }).status, 400);
  assert.equal(A.readJsonBody({ headers: { "content-type": "application/json" }, body: "[1]" }).status, 400);
  assert.equal(A.readJsonBody({ headers: { "content-type": "application/json" }, body: "null" }).status, 400);
});

test("resolveUserId accepts ids and names in any case, nothing else", function () {
  assert.equal(A.resolveUserId(" Pedro "), "pedro");
  assert.equal(A.resolveUserId("BRUNA"), "bruna");
  assert.equal(A.resolveUserId("__proto__"), null);
  assert.equal(A.resolveUserId("ninguem"), null);
  assert.equal(A.resolveUserId(undefined), null);
  assert.equal(A.resolveUserId({}), null);
});

test("currentUser accepts a valid cookie and rejects tampering, expiry and a stale password version", function () {
  const users = H.readyUsers();
  const settings = A.readSettings(H.OPTS);
  const good = { headers: { cookie: H.cookieFor(users, "jean") } };
  assert.equal(A.currentUser(good, users, settings).id, "jean");
  assert.equal(A.currentUser({ headers: {} }, users, settings), null);
  assert.equal(A.currentUser({ headers: { cookie: H.cookieFor(users, "jean") + "x" } }, users, settings), null);
  const later = A.readSettings({ env: H.OPTS.env, now: function () { return H.NOW + 120000; } });
  assert.equal(A.currentUser(good, users, later), null);
  const bumped = JSON.parse(JSON.stringify(users));
  bumped.jean.pv = 2;
  assert.equal(A.currentUser(good, bumped, settings), null);
  const gone = JSON.parse(JSON.stringify(users));
  delete gone.jean;
  assert.equal(A.currentUser(good, gone, settings), null);
});

test("loadUsers seeds the five people and the manager on the first call and reuses them afterwards", async function () {
  const { makeFakeStore } = require("./helpers/fake-store");
  const store = makeFakeStore([], {});
  const settings = A.readSettings(H.OPTS);
  assert.equal(await A.readUsers(store), null);
  const first = await A.loadUsers(store, settings);
  assert.deepEqual(Object.keys(first), ["pedro", "jean", "haniel", "gustavo", "bruna", "leonardo"]);
  assert.deepEqual(store.data.users, first);
  const second = await A.loadUsers(store, settings);
  assert.deepEqual(second, first);
});
