const test = require("node:test");
const assert = require("node:assert/strict");
const { makeHandler } = require("../../netlify/functions/entries");
const H = require("./helpers/auth-helpers");

const E = function (id, person, date, obra, extra) {
  return Object.assign({ id: id, date: date, person: person, obra: obra, createdAt: "x" }, extra || {});
};

function setup(entries, extra) {
  const store = H.storeWith(entries, extra);
  const writes = [];
  const original = store.setJSON;
  store.setJSON = async function (key, value) { writes.push(key); return original(key, value); };
  const handler = makeHandler(store, H.OPTS);
  const as = function (id) { return H.cookieFor(store.data.users, id); };
  return { store: store, handler: handler, as: as, writes: writes };
}

// --- leitura ---------------------------------------------------------------

test("GET is public, works without any secret and returns entries and confirmations", async function () {
  const store = H.storeWith([E("a1", "pedro", "2026-10-27", "almada")], { weeks: { "2026-10-25": { jean: "t" } } });
  const handler = makeHandler(store, { env: {}, now: H.OPTS.now });
  const res = await handler({ httpMethod: "GET", headers: {} });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { entries: [E("a1", "pedro", "2026-10-27", "almada")], confirmations: { "2026-10-25": { jean: "t" } } });
});

test("GET on an empty store returns empty entries and confirmations", async function () {
  const { handler } = setup(null);
  const res = await handler({ httpMethod: "GET", headers: {} });
  assert.deepEqual(JSON.parse(res.body), { entries: [], confirmations: {} });
});

test("unsupported method returns 405", async function () {
  const { handler } = setup([]);
  assert.equal((await handler({ httpMethod: "DELETE", headers: {} })).statusCode, 405);
});

// --- porta de entrada --------------------------------------------------------

test("POST needs JSON content type, valid JSON and a configured server", async function () {
  const { handler, as } = setup([]);
  const wrongType = await handler({ httpMethod: "POST", headers: { "content-type": "text/plain", cookie: as("jean") }, body: "{}" });
  assert.equal(wrongType.statusCode, 415);
  const badJson = await handler({ httpMethod: "POST", headers: { "content-type": "application/json", cookie: as("jean") }, body: "{not json" });
  assert.equal(badJson.statusCode, 400);
  const noSecret = makeHandler(H.storeWith([]), { env: { INITIAL_PASSWORD: "x" }, now: H.OPTS.now });
  const res = await H.call(noSecret, { op: "add", date: "2026-10-27", person: "jean", obra: "almada" });
  assert.equal(res.status, 500);
});

test("anonymous POST is 401 and nothing is written", async function () {
  const { handler, store, writes } = setup([]);
  const res = await H.call(handler, { op: "add", date: "2026-10-27", person: "jean", obra: "almada" });
  assert.equal(res.status, 401);
  assert.deepEqual(store.data.entries, []);
  assert.equal(writes.length, 0);
});

test("a user who still must change the password cannot write (403)", async function () {
  const { handler, store } = setup([]);
  store.data.users.jean.mustChange = true;
  const res = await H.call(handler, { op: "add", date: "2026-10-27", person: "jean", obra: "almada" }, H.cookieFor(store.data.users, "jean"));
  assert.equal(res.status, 403);
});

test("a session issued before a password change is rejected (401)", async function () {
  const { handler, store } = setup([]);
  const cookie = H.cookieFor(store.data.users, "jean");
  store.data.users.jean.pv = 2;
  const res = await H.call(handler, { op: "add", date: "2026-10-27", person: "jean", obra: "almada" }, cookie);
  assert.equal(res.status, 401);
});

test("unknown op returns 400 for a logged user", async function () {
  const { handler, as } = setup([]);
  assert.equal((await H.call(handler, { op: "nope" }, as("jean"))).status, 400);
});

// --- add -------------------------------------------------------------------------

test("add: a user marks their own name and gets id and createdAt", async function () {
  const { handler, as } = setup([]);
  const res = await H.call(handler, { op: "add", date: "2026-10-27", person: "jean", obra: "almada" }, as("jean"));
  assert.equal(res.status, 200);
  assert.equal(res.body.entries.length, 1);
  assert.equal(res.body.entries[0].person, "jean");
  assert.ok(res.body.entries[0].id);
  assert.equal(res.body.entries[0].createdAt, "2026-10-27T15:00:00.000Z");
  assert.deepEqual(res.body.confirmations, {});
});

test("add: a user cannot mark someone else (403) but the admin can", async function () {
  const { handler, as } = setup([]);
  const denied = await H.call(handler, { op: "add", date: "2026-10-27", person: "haniel", obra: "almada" }, as("jean"));
  assert.equal(denied.status, 403);
  const allowed = await H.call(handler, { op: "add", date: "2026-10-27", person: "haniel", obra: "almada" }, as("pedro"));
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.entries[0].person, "haniel");
});

test("add rejects bad formats and impossible dates", async function () {
  const { handler, as } = setup([]);
  assert.equal((await H.call(handler, { op: "add", date: "27/10/2026", person: "jean", obra: "almada" }, as("jean"))).status, 400);
  assert.equal((await H.call(handler, { op: "add", date: "2026-02-30", person: "jean", obra: "almada" }, as("jean"))).status, 400);
  assert.equal((await H.call(handler, { op: "add", date: "2026-10-27", person: "jean", obra: "nao-existe" }, as("jean"))).status, 400);
});

test("add stores the trimmed comment, drops a blank one and rejects an over-long one", async function () {
  const { handler, as } = setup([]);
  const trimmed = await H.call(handler, { op: "add", date: "2026-10-27", person: "jean", obra: "almada", comment: "  concretagem  " }, as("jean"));
  assert.equal(trimmed.body.entries[0].comment, "concretagem");
  const blank = await H.call(handler, { op: "add", date: "2026-10-28", person: "jean", obra: "almada", comment: "   " }, as("jean"));
  assert.equal("comment" in blank.body.entries[1], false);
  const long = await H.call(handler, { op: "add", date: "2026-10-29", person: "jean", obra: "almada", comment: "a".repeat(141) }, as("jean"));
  assert.equal(long.status, 400);
});

test("add: the same person+obra+day with a new comment updates it, keeping id and createdAt", async function () {
  const { handler, as } = setup([E("a1", "jean", "2026-10-27", "almada", { comment: "velho" })]);
  const res = await H.call(handler, { op: "add", date: "2026-10-27", person: "jean", obra: "almada", comment: "novo" }, as("jean"));
  assert.equal(res.status, 200);
  assert.equal(res.body.entries.length, 1);
  assert.equal(res.body.entries[0].id, "a1");
  assert.equal(res.body.entries[0].createdAt, "x");
  assert.equal(res.body.entries[0].comment, "novo");
});

test("add: repeating exactly the same marking writes nothing", async function () {
  const { handler, as, writes } = setup([E("a1", "jean", "2026-10-27", "almada")]);
  const res = await H.call(handler, { op: "add", date: "2026-10-27", person: "jean", obra: "almada" }, as("jean"));
  assert.equal(res.status, 200);
  assert.equal(res.body.entries.length, 1);
  assert.equal(writes.length, 0);
});

test("add stores a valid meeting and rejects an invalid one", async function () {
  const { handler, as } = setup([]);
  const ok = await H.call(handler, { op: "add", date: "2026-10-27", person: "jean", obra: "almada", meeting: { start: "14:00", end: "15:30" } }, as("jean"));
  assert.deepEqual(ok.body.entries[0].meeting, { start: "14:00", end: "15:30" });
  const bad = await H.call(handler, { op: "add", date: "2026-10-28", person: "jean", obra: "almada", meeting: { start: "15:00", end: "14:00" } }, as("jean"));
  assert.equal(bad.status, 400);
});

// --- addMany -----------------------------------------------------------------------

test("addMany adds every day for the user's own name", async function () {
  const { handler, as } = setup([]);
  const items = ["2026-10-27", "2026-10-28", "2026-10-29"].map(function (d) { return { date: d, person: "jean", obra: "porto" }; });
  const res = await H.call(handler, { op: "addMany", items: items }, as("jean"));
  assert.equal(res.status, 200);
  assert.equal(res.body.entries.length, 3);
});

test("addMany is all-or-nothing and respects the limit", async function () {
  const { handler, as, store } = setup([]);
  const bad = await H.call(handler, { op: "addMany", items: [
    { date: "2026-10-27", person: "jean", obra: "porto" },
    { date: "2026-02-30", person: "jean", obra: "porto" }
  ] }, as("jean"));
  assert.equal(bad.status, 400);
  assert.deepEqual(store.data.entries, []);
  const many = [];
  for (let i = 0; i < 61; i++) many.push({ date: "2026-10-27", person: "jean", obra: "porto" });
  assert.equal((await H.call(handler, { op: "addMany", items: many }, as("jean"))).status, 400);
});

test("addMany: one foreign item makes a regular user's whole call 403; admin may mix people", async function () {
  const { handler, as } = setup([]);
  const mixed = { op: "addMany", items: [
    { date: "2026-10-27", person: "jean", obra: "porto" },
    { date: "2026-10-27", person: "haniel", obra: "porto" }
  ] };
  assert.equal((await H.call(handler, mixed, as("jean"))).status, 403);
  assert.equal((await H.call(handler, mixed, as("pedro"))).status, 200);
});

// --- update ------------------------------------------------------------------------

test("update replaces and clears the comment, and sets and clears the meeting", async function () {
  const { handler, as } = setup([E("a1", "jean", "2026-10-27", "almada", { comment: "antigo" })]);
  const c1 = await H.call(handler, { op: "update", id: "a1", comment: "novo" }, as("jean"));
  assert.equal(c1.body.entries[0].comment, "novo");
  const c2 = await H.call(handler, { op: "update", id: "a1", comment: "" }, as("jean"));
  assert.equal("comment" in c2.body.entries[0], false);
  const m1 = await H.call(handler, { op: "update", id: "a1", meeting: { start: "09:00", end: "10:00" } }, as("jean"));
  assert.deepEqual(m1.body.entries[0].meeting, { start: "09:00", end: "10:00" });
  const m2 = await H.call(handler, { op: "update", id: "a1", meeting: null }, as("jean"));
  assert.equal("meeting" in m2.body.entries[0], false);
});

test("update errors: no id, nothing to update, unknown id, bad comment, bad meeting", async function () {
  const { handler, as, store } = setup([E("a1", "jean", "2026-10-27", "almada", { comment: "original" })]);
  assert.equal((await H.call(handler, { op: "update", comment: "x" }, as("jean"))).status, 400);
  assert.equal((await H.call(handler, { op: "update", id: "a1" }, as("jean"))).status, 400);
  assert.equal((await H.call(handler, { op: "update", id: "nao-existe", comment: "x" }, as("jean"))).status, 404);
  assert.equal((await H.call(handler, { op: "update", id: "a1", comment: "a".repeat(141) }, as("jean"))).status, 400);
  assert.equal((await H.call(handler, { op: "update", id: "a1", meeting: { start: "25:00", end: "26:00" } }, as("jean"))).status, 400);
  assert.equal(store.data.entries[0].comment, "original");
});

test("update: only the owner or the admin", async function () {
  const { handler, as } = setup([E("a1", "haniel", "2026-10-27", "almada")]);
  assert.equal((await H.call(handler, { op: "update", id: "a1", comment: "x" }, as("jean"))).status, 403);
  assert.equal((await H.call(handler, { op: "update", id: "a1", comment: "x" }, as("pedro"))).status, 200);
});

// --- remove ------------------------------------------------------------------------

test("remove: owner and admin can, others cannot, unknown id changes nothing", async function () {
  const { handler, as, writes } = setup([E("a1", "haniel", "2026-10-27", "almada"), E("a2", "jean", "2026-10-27", "porto")]);
  assert.equal((await H.call(handler, { op: "remove", id: "a1" }, as("jean"))).status, 403);
  const own = await H.call(handler, { op: "remove", id: "a2" }, as("jean"));
  assert.deepEqual(own.body.entries.map(function (e) { return e.id; }), ["a1"]);
  const before = writes.length;
  const none = await H.call(handler, { op: "remove", id: "nao-existe" }, as("jean"));
  assert.equal(none.status, 200);
  assert.equal(writes.length, before);
  const admin = await H.call(handler, { op: "remove", id: "a1" }, as("pedro"));
  assert.equal(admin.body.entries.length, 0);
  assert.equal((await H.call(handler, { op: "remove" }, as("pedro"))).status, 400);
});

// --- semana programada -----------------------------------------------------------------

test("confirmWeek and unconfirmWeek: own name only, admin for anyone, Sunday required", async function () {
  const { handler, as } = setup([]);
  const ok = await H.call(handler, { op: "confirmWeek", week: "2026-10-25", person: "jean" }, as("jean"));
  assert.equal(ok.status, 200);
  assert.equal(ok.body.confirmations["2026-10-25"].jean, "2026-10-27T15:00:00.000Z");
  assert.equal((await H.call(handler, { op: "confirmWeek", week: "2026-10-25", person: "haniel" }, as("jean"))).status, 403);
  assert.equal((await H.call(handler, { op: "confirmWeek", week: "2026-10-26", person: "jean" }, as("jean"))).status, 400);
  const admin = await H.call(handler, { op: "confirmWeek", week: "2026-10-25", person: "haniel" }, as("pedro"));
  assert.ok(admin.body.confirmations["2026-10-25"].haniel);
  const undone = await H.call(handler, { op: "unconfirmWeek", week: "2026-10-25", person: "jean" }, as("jean"));
  assert.equal(undone.body.confirmations["2026-10-25"].jean, undefined);
  assert.ok(undone.body.confirmations["2026-10-25"].haniel);
});

test("a real change in a confirmed week reopens only that person's confirmation", async function () {
  const { handler, as } = setup([], { weeks: { "2026-10-25": { jean: "t", haniel: "t" } } });
  const res = await H.call(handler, { op: "add", date: "2026-10-28", person: "jean", obra: "almada" }, as("jean"));
  assert.equal(res.body.confirmations["2026-10-25"].jean, undefined);
  assert.equal(res.body.confirmations["2026-10-25"].haniel, "t");
});

test("a change in another week, or a no-op, keeps the confirmation", async function () {
  const { handler, as } = setup([E("a1", "jean", "2026-10-28", "almada")], { weeks: { "2026-10-25": { jean: "t" } } });
  const other = await H.call(handler, { op: "add", date: "2026-11-03", person: "jean", obra: "almada" }, as("jean"));
  assert.equal(other.body.confirmations["2026-10-25"].jean, "t");
  const same = await H.call(handler, { op: "add", date: "2026-10-28", person: "jean", obra: "almada" }, as("jean"));
  assert.equal(same.body.confirmations["2026-10-25"].jean, "t");
});

test("removing, editing and addMany in a confirmed week reopen it too", async function () {
  const weeks = function () { return { "2026-10-25": { jean: "t" } }; };
  const a = setup([E("a1", "jean", "2026-10-28", "almada")], { weeks: weeks() });
  assert.equal((await H.call(a.handler, { op: "remove", id: "a1" }, a.as("jean"))).body.confirmations["2026-10-25"], undefined);
  const b = setup([E("a1", "jean", "2026-10-28", "almada")], { weeks: weeks() });
  assert.equal((await H.call(b.handler, { op: "update", id: "a1", comment: "x" }, b.as("jean"))).body.confirmations["2026-10-25"], undefined);
  const c = setup([], { weeks: weeks() });
  const many = await H.call(c.handler, { op: "addMany", items: [{ date: "2026-10-29", person: "jean", obra: "porto" }] }, c.as("jean"));
  assert.equal(many.body.confirmations["2026-10-25"], undefined);
});

// --- snapshot diário ------------------------------------------------------------------------

test("the first write of the day takes a snapshot of the previous state; reads and no-ops do not", async function () {
  const { handler, as, store } = setup([E("a1", "jean", "2026-10-27", "almada")]);
  await handler({ httpMethod: "GET", headers: {} });
  await H.call(handler, { op: "add", date: "2026-10-27", person: "jean", obra: "almada" }, as("jean"));
  assert.equal(store.data["backup-2026-10-27"], undefined);
  await H.call(handler, { op: "add", date: "2026-10-28", person: "jean", obra: "almada" }, as("jean"));
  assert.deepEqual(store.data["backup-2026-10-27"].entries, [E("a1", "jean", "2026-10-27", "almada")]);
  await H.call(handler, { op: "add", date: "2026-10-29", person: "jean", obra: "almada" }, as("jean"));
  assert.equal(store.data["backup-2026-10-27"].entries.length, 1);
});
