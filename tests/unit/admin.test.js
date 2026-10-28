const test = require("node:test");
const assert = require("node:assert/strict");
const { makeHandler } = require("../../netlify/functions/admin");
const { verifyPassword } = require("../../netlify/functions/lib/passwords");
const H = require("./helpers/auth-helpers");

function setup(entries, extra) {
  const store = H.storeWith(entries, extra);
  return { store: store, handler: makeHandler(store, H.OPTS), as: function (id) { return H.cookieFor(store.data.users, id); } };
}

test("admin endpoints reject anonymous (401), regular users (403) and an admin who must change the password (403)", async function () {
  const { handler, as, store } = setup([]);
  assert.equal((await H.call(handler, { op: "listBackups" })).status, 401);
  assert.equal((await H.call(handler, { op: "listBackups" }, as("jean"))).status, 403);
  store.data.users.pedro.mustChange = true;
  assert.equal((await H.call(handler, { op: "listBackups" }, as("pedro"))).status, 403);
});

test("only POST with JSON is accepted", async function () {
  const { handler, as } = setup([]);
  assert.equal((await handler({ httpMethod: "GET", headers: { cookie: as("pedro") } })).statusCode, 405);
  assert.equal((await handler({ httpMethod: "POST", headers: { "content-type": "text/plain", cookie: as("pedro") }, body: "{}" })).statusCode, 415);
});

test("resetPassword puts the initial password back, forces a change and invalidates the old session", async function () {
  const { handler, as, store } = setup([]);
  const jeanCookie = as("jean");
  const res = await H.call(handler, { op: "resetPassword", user: "jean" }, as("pedro"));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.user, { id: "jean", name: "Jean", role: "user", mustChange: true });
  assert.equal(verifyPassword(H.INITIAL, store.data.users.jean), true);
  assert.equal(store.data.users.jean.pv, 2);
  const stale = await H.call(handler, { op: "listBackups" }, jeanCookie);
  assert.equal(stale.status, 401);
});

test("resetPassword rejects unknown users (404) and the admin's own account (400)", async function () {
  const { handler, as } = setup([]);
  assert.equal((await H.call(handler, { op: "resetPassword", user: "ninguem" }, as("pedro"))).status, 404);
  assert.equal((await H.call(handler, { op: "resetPassword", user: "pedro" }, as("pedro"))).status, 400);
  assert.equal((await H.call(handler, { op: "resetPassword" }, as("pedro"))).status, 400);
});

test("downloadBackup returns the current entries and weeks and no user data", async function () {
  const entries = [{ id: "a1", date: "2026-10-27", person: "jean", obra: "almada", createdAt: "x" }];
  const { handler, as } = setup(entries, { weeks: { "2026-10-25": { jean: "t" } } });
  const res = await H.call(handler, { op: "downloadBackup" }, as("pedro"));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.export, { exportedAt: "2026-10-27T15:00:00.000Z", entries: entries, weeks: { "2026-10-25": { jean: "t" } } });
  assert.ok(!JSON.stringify(res.body).includes("hash"));
});

test("listBackups and restoreBackup bring the data back, saving a pre-restore snapshot", async function () {
  const { handler, as, store } = setup([{ id: "atual" }], {
    "backup-2026-10-26": { createdAt: "x", entries: [{ id: "antigo" }], weeks: {} }
  });
  const list = await H.call(handler, { op: "listBackups" }, as("pedro"));
  assert.deepEqual(list.body.backups.map(function (b) { return b.id; }), ["backup-2026-10-26"]);
  const res = await H.call(handler, { op: "restoreBackup", id: "backup-2026-10-26" }, as("pedro"));
  assert.deepEqual(res.body, { ok: true });
  assert.deepEqual(store.data.entries, [{ id: "antigo" }]);
  assert.ok(store.data["backup-prerestore-2026-10-27T15-00-00-000Z"]);
  assert.equal((await H.call(handler, { op: "restoreBackup", id: "users" }, as("pedro"))).status, 400);
  assert.equal((await H.call(handler, { op: "restoreBackup", id: "backup-2020-01-01" }, as("pedro"))).status, 404);
});

test("unknown op returns 400", async function () {
  const { handler, as } = setup([]);
  assert.equal((await H.call(handler, { op: "nope" }, as("pedro"))).status, 400);
});
