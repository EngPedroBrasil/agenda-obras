const test = require("node:test");
const assert = require("node:assert/strict");
const U = require("../../netlify/functions/lib/users-logic");
const { PEOPLE, ADMIN_IDS, MANAGERS } = require("../../netlify/functions/lib/people");
const { verifyPassword } = require("../../netlify/functions/lib/passwords");

const INITIAL = "Mudar@123";
const NOW = Date.UTC(2026, 9, 28, 13, 0, 0);

function ready() {
  const users = U.seedUsers(INITIAL, PEOPLE, ADMIN_IDS, MANAGERS);
  Object.keys(users).forEach(function (id) { users[id].mustChange = false; });
  return users;
}

test("MANAGERS lists Leonardo and PEOPLE stays with the five", function () {
  assert.deepEqual(MANAGERS.map(function (m) { return m.id; }), ["leonardo"]);
  assert.equal(PEOPLE.length, 5);
});

test("seedUsers gives the roles admin, user and manager", function () {
  const users = U.seedUsers(INITIAL, PEOPLE, ADMIN_IDS, MANAGERS);
  assert.equal(users.pedro.role, "admin");
  assert.equal(users.jean.role, "user");
  assert.equal(users.leonardo.role, "manager");
  assert.equal(users.leonardo.mustChange, true);
  assert.equal(verifyPassword(INITIAL, users.leonardo), true);
});

test("seedUsers still works with three arguments (no managers)", function () {
  const users = U.seedUsers(INITIAL, PEOPLE, ADMIN_IDS);
  assert.deepEqual(Object.keys(users).sort(), ["bruna", "gustavo", "haniel", "jean", "pedro"]);
});

test("ensureManagers adds only the missing manager and keeps the others untouched", function () {
  const old = U.seedUsers(INITIAL, PEOPLE, ADMIN_IDS);
  old.jean.pv = 7;
  const next = U.ensureManagers(old, INITIAL, MANAGERS);
  assert.notEqual(next, old);
  assert.equal(next.leonardo.role, "manager");
  assert.equal(next.leonardo.mustChange, true);
  assert.equal(next.jean, old.jean);
  assert.equal(next.jean.pv, 7);
});

test("ensureManagers returns the very same object when nobody is missing", function () {
  const users = ready();
  assert.equal(U.ensureManagers(users, INITIAL, MANAGERS), users);
});

test("effectiveRole: admin is a regular user until the admin mode is on", function () {
  const users = ready();
  assert.equal(U.effectiveRole(users.pedro, NOW), "user");
  assert.equal(U.effectiveRole(Object.assign({}, users.pedro, { elevatedUntil: NOW + 1000 }), NOW), "admin");
  assert.equal(U.effectiveRole(Object.assign({}, users.pedro, { elevatedUntil: NOW }), NOW), "user");
  assert.equal(U.effectiveRole(Object.assign({}, users.pedro, { elevatedUntil: NOW - 1 }), NOW), "user");
  assert.equal(U.effectiveRole(users.jean, NOW), "user");
  assert.equal(U.effectiveRole(users.leonardo, NOW), "manager");
});

test("publicUser exposes canElevate/elevatedUntil only for the admin", function () {
  const users = ready();
  assert.deepEqual(U.publicUser(users.jean, NOW), { id: "jean", name: "Jean", role: "user", mustChange: false });
  assert.deepEqual(U.publicUser(users.leonardo, NOW), { id: "leonardo", name: "Leonardo", role: "manager", mustChange: false });
  assert.deepEqual(U.publicUser(users.pedro, NOW), { id: "pedro", name: "Pedro", role: "user", mustChange: false, canElevate: true, elevatedUntil: 0 });
  const on = Object.assign({}, users.pedro, { elevatedUntil: NOW + 5000 });
  assert.deepEqual(U.publicUser(on, NOW), { id: "pedro", name: "Pedro", role: "admin", mustChange: false, canElevate: true, elevatedUntil: NOW + 5000 });
});

test("elevate gives 15 minutes to the admin only", function () {
  const users = ready();
  const res = U.elevate(users, "pedro", NOW);
  assert.equal(res.ok, true);
  assert.equal(res.user.elevatedUntil, NOW + U.ELEVATION_MS);
  assert.equal(res.users.pedro.elevatedUntil, NOW + 15 * 60 * 1000);
  assert.equal(U.elevate(users, "jean", NOW).status, 403);
  assert.equal(U.elevate(users, "leonardo", NOW).status, 403);
  assert.equal(U.elevate({ pedro: Object.assign({}, users.pedro, { mustChange: true }) }, "pedro", NOW).status, 403);
});

test("unelevate zeroes the deadline and is a no-op when already off", function () {
  const users = U.elevate(ready(), "pedro", NOW).users;
  const off = U.unelevate(users, "pedro");
  assert.equal(off.ok, true);
  assert.equal(off.users.pedro.elevatedUntil, 0);
  const again = U.unelevate(off.users, "pedro");
  assert.equal(again.users, off.users);
});

test("changing or resetting a password also turns the admin mode off", function () {
  const on = U.elevate(ready(), "pedro", NOW).users;
  const changed = U.changePassword(on, "pedro", INITIAL, "NovaSenha123", INITIAL);
  assert.equal(changed.ok, true);
  assert.equal(changed.user.elevatedUntil, 0);
  const reset = U.resetPassword(on, "pedro", INITIAL);
  assert.equal(reset.user.elevatedUntil, 0);
});
