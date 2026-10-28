const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../../netlify/functions/lib/backup-logic");
const { makeFakeStore } = require("./helpers/fake-store");

const T1 = Date.UTC(2026, 9, 27, 15, 0, 0);

test("dayKeySP uses the Sao Paulo calendar day (UTC-3)", function () {
  assert.equal(B.dayKeySP(Date.UTC(2026, 9, 28, 2, 30)), "2026-10-27");
  assert.equal(B.dayKeySP(Date.UTC(2026, 9, 28, 3, 30)), "2026-10-28");
  assert.equal(B.dayKeySP(T1), "2026-10-27");
});

test("keysToPrune keeps the newest daily snapshots and never touches other keys", function () {
  const keys = ["backup-2026-10-01", "backup-2026-10-02", "backup-2026-10-03", "backup-prerestore-2026-10-01T00-00-00-000Z", "entries", "users"];
  assert.deepEqual(B.keysToPrune(keys, 2), ["backup-2026-10-01"]);
  assert.deepEqual(B.keysToPrune(keys, 5), []);
});

test("buildExport has entries, weeks and a timestamp, and nothing about users", function () {
  const out = B.buildExport([{ id: "a" }], { "2026-10-25": { pedro: "t" } }, T1);
  assert.deepEqual(Object.keys(out).sort(), ["entries", "exportedAt", "weeks"]);
  assert.equal(out.exportedAt, "2026-10-27T15:00:00.000Z");
});

test("ensureDailySnapshot snapshots once per day and prunes old ones", async function () {
  const store = makeFakeStore([{ id: "a" }], { weeks: { "2026-10-25": { pedro: "t" } } });
  assert.equal(await B.ensureDailySnapshot(store, T1, 2), true);
  assert.deepEqual(store.data["backup-2026-10-27"], { createdAt: "2026-10-27T15:00:00.000Z", entries: [{ id: "a" }], weeks: { "2026-10-25": { pedro: "t" } } });
  assert.equal(await B.ensureDailySnapshot(store, T1 + 1000, 2), false);
  await B.ensureDailySnapshot(store, T1 + 86400000, 2);
  await B.ensureDailySnapshot(store, T1 + 2 * 86400000, 2);
  const daily = Object.keys(store.data).filter(function (k) { return /^backup-\d/.test(k); }).sort();
  assert.deepEqual(daily, ["backup-2026-10-28", "backup-2026-10-29"]);
});

test("listBackups returns newest first with a readable kind and label", async function () {
  const store = makeFakeStore([], { "backup-2026-10-26": {}, "backup-2026-10-27": {}, "backup-prerestore-2026-10-27T15-00-00-000Z": {}, users: {} });
  const list = await B.listBackups(store);
  assert.deepEqual(list.map(function (b) { return b.id; }), ["backup-prerestore-2026-10-27T15-00-00-000Z", "backup-2026-10-27", "backup-2026-10-26"]);
  assert.deepEqual(list.map(function (b) { return b.kind; }), ["prerestore", "daily", "daily"]);
  assert.match(list[1].label, /27\/10\/2026/);
});

test("restoreSnapshot restores entries and weeks after saving a pre-restore snapshot", async function () {
  const store = makeFakeStore([{ id: "atual" }], {
    weeks: { "2026-11-01": { jean: "t" } },
    "backup-2026-10-26": { createdAt: "x", entries: [{ id: "antigo" }], weeks: {} }
  });
  const res = await B.restoreSnapshot(store, "backup-2026-10-26", T1);
  assert.deepEqual(res, { ok: true });
  assert.deepEqual(store.data.entries, [{ id: "antigo" }]);
  assert.deepEqual(store.data.weeks, {});
  const pre = store.data["backup-prerestore-2026-10-27T15-00-00-000Z"];
  assert.deepEqual(pre.entries, [{ id: "atual" }]);
  assert.deepEqual(pre.weeks, { "2026-11-01": { jean: "t" } });
});

test("restoreSnapshot refuses ids that are not snapshots and snapshots that do not exist", async function () {
  const store = makeFakeStore([{ id: "atual" }], { users: { pedro: {} } });
  assert.equal((await B.restoreSnapshot(store, "users", T1)).status, 400);
  assert.equal((await B.restoreSnapshot(store, "../entries", T1)).status, 400);
  assert.equal((await B.restoreSnapshot(store, "backup-2020-01-01", T1)).status, 404);
  assert.deepEqual(store.data.entries, [{ id: "atual" }]);
});
