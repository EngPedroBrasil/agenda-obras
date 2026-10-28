const test = require("node:test");
const assert = require("node:assert/strict");
const { makeHandler } = require("../../netlify/functions/auth");
const H = require("./helpers/auth-helpers");
const { makeFakeStore } = require("./helpers/fake-store");
const U = require("../../netlify/functions/lib/users-logic");
const { PEOPLE, ADMIN_IDS } = require("../../netlify/functions/lib/people");

const QUARTER = 15 * 60 * 1000;

function commonSetup() {
  const users = H.readyUsers();
  users.pedro.elevatedUntil = 0;
  const store = H.storeWith([], { users: users });
  const handler = makeHandler(store, H.OPTS);
  const as = function (id) { return H.cookieFor(store.data.users, id); };
  return { store: store, handler: handler, as: as };
}

async function me(s, id) {
  const res = await s.handler(H.event("GET", undefined, s.as(id)));
  return JSON.parse(res.body).user;
}

test("Leonardo logs in with the initial password and is forced to change it", async function () {
  const store = makeFakeStore([], {});
  const handler = makeHandler(store, H.OPTS);
  const res = await H.call(handler, { op: "login", user: "leonardo", password: H.INITIAL });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.user, { id: "leonardo", name: "Leonardo", role: "manager", mustChange: true });
});

test("an old users record without Leonardo gets him added (once) at the next login", async function () {
  const old = U.seedUsers(H.INITIAL, PEOPLE, ADMIN_IDS);
  const store = makeFakeStore([], { users: old });
  const handler = makeHandler(store, H.OPTS);
  const res = await H.call(handler, { op: "login", user: "leonardo", password: H.INITIAL });
  assert.equal(res.status, 200);
  assert.equal(store.data.users.leonardo.role, "manager");
  assert.equal(store.data.users.jean.hash, old.jean.hash);
});

test("Pedro starts as a regular user and can elevate", async function () {
  const s = commonSetup();
  assert.deepEqual(await me(s, "pedro"), { id: "pedro", name: "Pedro", role: "user", mustChange: false, canElevate: true, elevatedUntil: 0 });
  const res = await H.call(s.handler, { op: "elevate" }, s.as("pedro"));
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, "admin");
  assert.equal(res.body.user.elevatedUntil, H.NOW + QUARTER);
  assert.equal(s.store.data.users.pedro.elevatedUntil, H.NOW + QUARTER);
  assert.equal((await me(s, "pedro")).role, "admin");
});

test("elevate is for the administrator only and needs a session", async function () {
  const s = commonSetup();
  assert.equal((await H.call(s.handler, { op: "elevate" }, s.as("jean"))).status, 403);
  assert.equal((await H.call(s.handler, { op: "elevate" }, s.as("leonardo"))).status, 403);
  assert.equal((await H.call(s.handler, { op: "elevate" })).status, 401);
  assert.equal((await H.call(s.handler, { op: "unelevate" })).status, 401);
});

test("unelevate turns the mode off right away", async function () {
  const s = commonSetup();
  await H.call(s.handler, { op: "elevate" }, s.as("pedro"));
  const res = await H.call(s.handler, { op: "unelevate" }, s.as("pedro"));
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, "user");
  assert.equal(res.body.user.elevatedUntil, 0);
  assert.equal(s.store.data.users.pedro.elevatedUntil, 0);
});

test("an expired deadline means regular user again", async function () {
  const s = commonSetup();
  s.store.data.users.pedro.elevatedUntil = H.NOW - 1;
  const u = await me(s, "pedro");
  assert.equal(u.role, "user");
  assert.equal(u.elevatedUntil, 0);
});

test("logout and password change turn the admin mode off", async function () {
  const s = commonSetup();
  await H.call(s.handler, { op: "elevate" }, s.as("pedro"));
  const out = await H.call(s.handler, { op: "logout" }, s.as("pedro"));
  assert.equal(out.status, 200);
  assert.equal(s.store.data.users.pedro.elevatedUntil, 0);

  const s2 = commonSetup();
  await H.call(s2.handler, { op: "elevate" }, s2.as("pedro"));
  const ch = await H.call(s2.handler, { op: "changePassword", current: H.INITIAL, next: "OutraSenha123" }, s2.as("pedro"));
  assert.equal(ch.status, 200);
  assert.equal(s2.store.data.users.pedro.elevatedUntil, 0);
});
