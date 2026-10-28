const test = require("node:test");
const assert = require("node:assert/strict");
const entries = require("../../netlify/functions/entries");
const admin = require("../../netlify/functions/admin");
const { authorize } = require("../../netlify/functions/lib/access");
const H = require("./helpers/auth-helpers");

function setup(elevated) {
  const users = H.readyUsers();
  if (!elevated) users.pedro.elevatedUntil = 0;
  const store = H.storeWith([], { users: users });
  return {
    store: store,
    entries: entries.makeHandler(store, H.OPTS),
    admin: admin.makeHandler(store, H.OPTS),
    as: function (id) { return H.cookieFor(store.data.users, id); }
  };
}

const CONFIRM_JEAN = { op: "confirmWeek", person: "jean", week: "2026-10-25" };

test("manager is denied every write, even on his own name", function () {
  const mgr = { id: "leonardo", role: "manager", mustChange: false };
  ["add", "addMany", "update", "remove", "confirmWeek", "unconfirmWeek"].forEach(function (op) {
    const res = authorize(mgr, { op: op, person: "leonardo", items: [] }, []);
    assert.equal(res.ok, false, op);
    assert.equal(res.status, 403, op);
    assert.match(res.error, /gestor acompanha/);
  });
});

test("manager can read everything: signed-in view, not the visitor view", async function () {
  const s = setup(false);
  const res = await s.entries(H.event("GET", undefined, s.as("leonardo")));
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).restricted, undefined);
});

test("manager POST through the handler gets 403", async function () {
  const s = setup(false);
  const res = await H.call(s.entries, CONFIRM_JEAN, s.as("leonardo"));
  assert.equal(res.status, 403);
});

test("Pedro in common mode only acts as himself", async function () {
  const s = setup(false);
  const other = await H.call(s.entries, CONFIRM_JEAN, s.as("pedro"));
  assert.equal(other.status, 403);
  assert.match(other.body.error, /suas próprias marcações/);
  const own = await H.call(s.entries, { op: "confirmWeek", person: "pedro", week: "2026-10-25" }, s.as("pedro"));
  assert.equal(own.status, 200);
});

test("Pedro in admin mode can act for anybody", async function () {
  const s = setup(true);
  const res = await H.call(s.entries, CONFIRM_JEAN, s.as("pedro"));
  assert.equal(res.status, 200);
});

test("admin functions need the admin mode ON", async function () {
  const off = setup(false);
  const denied = await H.call(off.admin, { op: "listBackups" }, off.as("pedro"));
  assert.equal(denied.status, 403);
  assert.match(denied.body.error, /ligue o modo administrador/);

  const on = setup(true);
  assert.equal((await H.call(on.admin, { op: "listBackups" }, on.as("pedro"))).status, 200);

  const jean = await H.call(on.admin, { op: "listBackups" }, on.as("jean"));
  assert.equal(jean.status, 403);
  assert.match(jean.body.error, /apenas o administrador/);
  assert.equal((await H.call(on.admin, { op: "listBackups" }, on.as("leonardo"))).status, 403);
});

test("admin mode can reset Leonardo's password", async function () {
  const s = setup(true);
  const res = await H.call(s.admin, { op: "resetPassword", user: "leonardo" }, s.as("pedro"));
  assert.equal(res.status, 200);
  assert.equal(res.body.user.id, "leonardo");
  assert.equal(res.body.user.mustChange, true);
});
