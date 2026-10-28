const test = require("node:test");
const assert = require("node:assert/strict");
const U = require("../../netlify/functions/lib/users-logic");
const { PEOPLE, ADMIN_IDS } = require("../../netlify/functions/lib/people");
const { verifyPassword } = require("../../netlify/functions/lib/passwords");

const INITIAL = "Mudar@123";
const NOW = 1000000000000;
const SEEDED = U.seedUsers(INITIAL, PEOPLE, ADMIN_IDS);
function fresh() { return JSON.parse(JSON.stringify(SEEDED)); }

test("seedUsers creates the five people with the initial password, pedro as admin, all must change it", function () {
  const users = fresh();
  assert.deepEqual(Object.keys(users), ["pedro", "jean", "haniel", "gustavo", "bruna"]);
  assert.equal(users.pedro.role, "admin");
  assert.equal(users.jean.role, "user");
  Object.keys(users).forEach(function (id) {
    assert.equal(users[id].mustChange, true);
    assert.equal(users[id].pv, 1);
    assert.equal(verifyPassword(INITIAL, users[id]), true);
  });
  assert.notEqual(users.pedro.hash, users.jean.hash);
});

test("publicUser exposes only id, name, role and mustChange", function () {
  assert.deepEqual(U.publicUser(fresh().pedro), { id: "pedro", name: "Pedro", role: "admin", mustChange: true });
});

test("authenticate succeeds with the right password and clears the failure counter", function () {
  const users = fresh();
  users.jean.failed = 3;
  const res = U.authenticate(users, "jean", INITIAL, NOW);
  assert.equal(res.ok, true);
  assert.equal(res.user.id, "jean");
  assert.equal(res.users.jean.failed, 0);
  assert.equal(users.jean.failed, 3);
});

test("authenticate gives the same generic error for a wrong password and an unknown user", function () {
  const users = fresh();
  const wrong = U.authenticate(users, "jean", "errada", NOW);
  const unknown = U.authenticate(users, "ninguem", "errada", NOW);
  assert.equal(wrong.ok, false);
  assert.equal(wrong.status, 401);
  assert.equal(wrong.error, unknown.error);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.users.jean.failed, 1);
});

test("five wrong passwords lock the user for 15 minutes, even for the right password, then it unlocks", function () {
  let users = fresh();
  for (let i = 0; i < 5; i++) {
    const res = U.authenticate(users, "jean", "errada", NOW + i);
    assert.equal(res.status, 401);
    users = res.users;
  }
  const locked = U.authenticate(users, "jean", INITIAL, NOW + 10);
  assert.equal(locked.ok, false);
  assert.equal(locked.status, 429);
  const still = U.authenticate(users, "jean", INITIAL, NOW + 4 + 15 * 60 * 1000 - 1);
  assert.equal(still.status, 429);
  const later = U.authenticate(users, "jean", INITIAL, NOW + 4 + 15 * 60 * 1000 + 1);
  assert.equal(later.ok, true);
});

test("changePassword enforces the rules, clears mustChange and bumps the session version", function () {
  const users = fresh();
  assert.equal(U.changePassword(users, "jean", "errada", "NovaSenha1", INITIAL).status, 401);
  assert.equal(U.changePassword(users, "jean", INITIAL, "curta", INITIAL).status, 400);
  assert.equal(U.changePassword(users, "jean", INITIAL, INITIAL, INITIAL).status, 400);
  const ok = U.changePassword(users, "jean", INITIAL, "NovaSenha1", INITIAL);
  assert.equal(ok.ok, true);
  assert.equal(ok.user.mustChange, false);
  assert.equal(ok.user.pv, 2);
  assert.equal(verifyPassword("NovaSenha1", ok.users.jean), true);
  assert.equal(verifyPassword(INITIAL, ok.users.jean), false);
  assert.equal(users.jean.mustChange, true);
});

test("resetPassword puts the initial password back, forces a change, bumps pv and clears the lock", function () {
  const changed = U.changePassword(fresh(), "jean", INITIAL, "NovaSenha1", INITIAL).users;
  changed.jean.lockedUntil = NOW + 999999;
  changed.jean.failed = 4;
  const res = U.resetPassword(changed, "jean", INITIAL);
  assert.equal(res.ok, true);
  assert.equal(res.user.mustChange, true);
  assert.equal(res.user.pv, 3);
  assert.equal(res.user.lockedUntil, 0);
  assert.equal(res.user.failed, 0);
  assert.equal(verifyPassword(INITIAL, res.users.jean), true);
  assert.equal(U.resetPassword(changed, "ninguem", INITIAL).status, 404);
});
