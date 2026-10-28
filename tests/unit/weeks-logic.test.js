const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../../netlify/functions/lib/weeks-logic");

test("isSunday accepts only real Sundays", function () {
  assert.equal(W.isSunday("2026-10-25"), true);
  assert.equal(W.isSunday("2026-10-26"), false);
  assert.equal(W.isSunday("2026-02-30"), false);
  assert.equal(W.isSunday("nope"), false);
});

test("weekKeyOf returns the Sunday that starts the week, across month boundaries", function () {
  assert.equal(W.weekKeyOf("2026-10-27"), "2026-10-25");
  assert.equal(W.weekKeyOf("2026-10-25"), "2026-10-25");
  assert.equal(W.weekKeyOf("2026-10-31"), "2026-10-25");
  assert.equal(W.weekKeyOf("2026-10-01"), "2026-09-27");
  assert.equal(W.weekKeyOf("2027-01-02"), "2026-12-27");
});

test("validateWeekOp checks the Sunday and the person", function () {
  assert.deepEqual(W.validateWeekOp({ week: "2026-10-25", person: "pedro" }), { ok: true });
  assert.equal(W.validateWeekOp({ week: "2026-10-26", person: "pedro" }).ok, false);
  assert.equal(W.validateWeekOp({ week: "2026-10-25", person: "ninguem" }).ok, false);
});

test("confirmWeek records the person and does not mutate; confirming twice is a no-op", function () {
  const empty = {};
  const one = W.confirmWeek(empty, "2026-10-25", "pedro", "2026-10-27T12:00:00.000Z");
  assert.deepEqual(one, { "2026-10-25": { pedro: "2026-10-27T12:00:00.000Z" } });
  assert.deepEqual(empty, {});
  assert.equal(W.confirmWeek(one, "2026-10-25", "pedro", "later"), one);
  const two = W.confirmWeek(one, "2026-10-25", "jean", "t2");
  assert.deepEqual(Object.keys(two["2026-10-25"]).sort(), ["jean", "pedro"]);
});

test("unconfirmWeek removes the person, drops empty weeks and is a no-op when absent", function () {
  const weeks = { "2026-10-25": { pedro: "t1", jean: "t2" } };
  const afterOne = W.unconfirmWeek(weeks, "2026-10-25", "pedro");
  assert.deepEqual(afterOne, { "2026-10-25": { jean: "t2" } });
  assert.deepEqual(W.unconfirmWeek(afterOne, "2026-10-25", "jean"), {});
  assert.equal(W.unconfirmWeek(weeks, "2026-10-25", "bruna"), weeks);
  assert.equal(W.unconfirmWeek(weeks, "2026-11-01", "pedro"), weeks);
  assert.deepEqual(weeks, { "2026-10-25": { pedro: "t1", jean: "t2" } });
});

test("reopenForEntries reopens the week of each affected person and only theirs", function () {
  const weeks = { "2026-10-25": { pedro: "t1", jean: "t2" }, "2026-11-01": { pedro: "t3" } };
  const result = W.reopenForEntries(weeks, [{ person: "pedro", date: "2026-10-28" }]);
  assert.deepEqual(result, { "2026-10-25": { jean: "t2" }, "2026-11-01": { pedro: "t3" } });
  assert.equal(W.reopenForEntries(weeks, []), weeks);
  assert.equal(W.reopenForEntries(weeks, [{ person: "bruna", date: "2026-10-28" }]), weeks);
});
