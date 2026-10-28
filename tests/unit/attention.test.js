const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../../public/lib/attention");

const OBRAS = ["almada", "porto", "montebello", "tulipas"];
const PEOPLE = ["pedro", "jean", "haniel", "bruna"];
const TODAY = "2026-10-27";

function e(person, obra, date) { return { id: person + obra + date, person: person, obra: obra, date: date }; }
function build(entries, overrides) {
  return A.buildAttention(Object.assign({
    entries: entries, today: TODAY, periodStart: "2026-10-01", obraOrder: OBRAS, personOrder: PEOPLE
  }, overrides || {}));
}
function row(result, obra) { return result.rows.filter(function (r) { return r.obra === obra; })[0]; }

test("daysBetween counts whole days across month and year changes", function () {
  assert.equal(A.daysBetween("2026-10-27", "2026-10-27"), 0);
  assert.equal(A.daysBetween("2026-09-20", "2026-10-27"), 37);
  assert.equal(A.daysBetween("2025-12-30", "2026-01-02"), 3);
  assert.equal(A.daysBetween("2026-10-30", "2026-10-27"), -3);
});

test("periodStartFor: month starts on day 1; N days include today", function () {
  assert.equal(A.periodStartFor("2026-10-27", "month"), "2026-10-01");
  assert.equal(A.periodStartFor("2026-10-27", 30), "2026-09-28");
  assert.equal(A.periodStartFor("2026-10-27", 60), "2026-08-29");
  assert.equal(A.periodStartFor("2026-10-27", 90), "2026-07-30");
  assert.equal(A.periodStartFor("2026-01-10", 30), "2025-12-12");
});

test("rows follow obraOrder and start with zeros for everyone", function () {
  const result = build([]);
  assert.deepEqual(result.rows.map(function (r) { return r.obra; }), OBRAS);
  assert.deepEqual(row(result, "almada").byPerson.jean, { done: 0, planned: 0 });
  assert.deepEqual(result.personTotals.pedro, { done: 0, planned: 0 });
});

test("today counts as done; future dates count as planned with no period limit", function () {
  const result = build([
    e("jean", "almada", "2026-10-05"),
    e("jean", "almada", "2026-10-27"),
    e("pedro", "almada", "2026-10-28"),
    e("pedro", "almada", "2027-03-01")
  ]);
  const r = row(result, "almada");
  assert.deepEqual(r.byPerson.jean, { done: 2, planned: 0 });
  assert.deepEqual(r.byPerson.pedro, { done: 0, planned: 2 });
  assert.equal(r.done, 2);
  assert.equal(r.planned, 2);
  assert.equal(r.nextVisit, "2026-10-28");
  assert.deepEqual(result.personTotals.jean, { done: 2, planned: 0 });
});

test("the period only filters done; last visit ignores the period", function () {
  const result = build([e("haniel", "porto", "2026-09-20")]);
  const r = row(result, "porto");
  assert.equal(r.done, 0);
  assert.equal(r.lastVisit, "2026-09-20");
  assert.equal(r.daysSinceLast, 37);
  const wide = build([e("haniel", "porto", "2026-09-20")], { periodStart: "2026-09-01" });
  assert.equal(row(wide, "porto").done, 1);
});

test("a never-visited obra has no last visit and is stale", function () {
  const r = row(build([]), "montebello");
  assert.equal(r.lastVisit, null);
  assert.equal(r.daysSinceLast, null);
  assert.equal(r.stale, true);
  assert.equal(r.noPlan, true);
  assert.equal(r.nextVisit, null);
});

test("stale means more than 14 days; exactly 14 is not stale", function () {
  const fourteen = row(build([e("pedro", "almada", "2026-10-13")]), "almada");
  assert.equal(fourteen.daysSinceLast, 14);
  assert.equal(fourteen.stale, false);
  const fifteen = row(build([e("pedro", "almada", "2026-10-12")]), "almada");
  assert.equal(fifteen.daysSinceLast, 15);
  assert.equal(fifteen.stale, true);
  const custom = row(build([e("pedro", "almada", "2026-10-20")], { staleDays: 5 }), "almada");
  assert.equal(custom.stale, true);
});

test("noPlan is true only when nothing is planned for the obra", function () {
  const r = row(build([e("bruna", "tulipas", "2026-11-02")]), "tulipas");
  assert.equal(r.noPlan, false);
  assert.equal(r.stale, true);
  assert.equal(r.nextVisit, "2026-11-02");
  assert.equal(row(build([e("bruna", "tulipas", "2026-10-20")]), "tulipas").noPlan, true);
});

test("unknown people and obras are ignored", function () {
  const result = build([e("ninguem", "almada", "2026-10-05"), e("pedro", "inventada", "2026-10-05"), e("pedro", "porto", "2026-10-05")]);
  assert.equal(row(result, "almada").done, 0);
  assert.equal(row(result, "porto").done, 1);
  assert.equal(result.rows.length, 4);
});

test("works across a year boundary", function () {
  const result = build([e("pedro", "almada", "2025-12-30"), e("pedro", "almada", "2026-01-05")], {
    today: "2026-01-02", periodStart: A.periodStartFor("2026-01-02", 30)
  });
  const r = row(result, "almada");
  assert.equal(r.done, 1);
  assert.equal(r.planned, 1);
  assert.equal(r.lastVisit, "2025-12-30");
  assert.equal(r.daysSinceLast, 3);
});
