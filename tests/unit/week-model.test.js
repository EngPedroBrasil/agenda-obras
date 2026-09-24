const test = require("node:test");
const assert = require("node:assert/strict");
const { buildWeekModel } = require("../../public/lib/week-model");

const OBRAS = ["almada", "montebello", "miraggio", "palmeiras", "tulipas", "porto"];
const PEOPLE = ["pedro", "jean", "haniel", "gustavo", "bruna"];
// 2026-09-20 is a Sunday.
const SUNDAY = new Date(2026, 8, 20);

function model(overrides) {
  return buildWeekModel(Object.assign({
    weekStart: SUNDAY,
    entries: [],
    groupBy: "person",
    obraOrder: OBRAS,
    personOrder: PEOPLE
  }, overrides));
}

test("buildWeekModel returns seven consecutive days starting at weekStart", function () {
  const days = model();
  assert.deepEqual(days.map(function (d) { return d.key; }), [
    "2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"
  ]);
  assert.deepEqual(days.map(function (d) { return d.weekday; }), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(days.map(function (d) { return d.dayOfMonth; }), [20, 21, 22, 23, 24, 25, 26]);
});

test("buildWeekModel crosses a month boundary correctly", function () {
  const days = model({ weekStart: new Date(2026, 8, 27) });
  assert.deepEqual(days.map(function (d) { return d.key; }), [
    "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"
  ]);
});

test("buildWeekModel flags only Sunday and Saturday as weekend", function () {
  assert.deepEqual(model().map(function (d) { return d.isWeekend; }), [true, false, false, false, false, false, true]);
});

test("person view orders items by team then obra order and carries the comment", function () {
  const days = model({
    entries: [
      { id: "1", date: "2026-09-24", person: "jean", obra: "almada" },
      { id: "2", date: "2026-09-24", person: "pedro", obra: "miraggio" },
      { id: "3", date: "2026-09-24", person: "pedro", obra: "almada", comment: "concretagem" }
    ]
  });
  assert.deepEqual(days[4].items, [
    { person: "pedro", obra: "almada", comment: "concretagem" },
    { person: "pedro", obra: "miraggio" },
    { person: "jean", obra: "almada" }
  ]);
});

test("person view skips entries with an unknown person or obra", function () {
  const days = model({
    entries: [
      { id: "1", date: "2026-09-24", person: "ninguem", obra: "almada" },
      { id: "2", date: "2026-09-24", person: "pedro", obra: "inventada" },
      { id: "3", date: "2026-09-24", person: "pedro", obra: "porto" }
    ]
  });
  assert.deepEqual(days[4].items, [{ person: "pedro", obra: "porto" }]);
});

test("obra view lists one group per obra with people in team order", function () {
  const days = model({
    groupBy: "obra",
    entries: [
      { id: "1", date: "2026-09-24", person: "jean", obra: "montebello" },
      { id: "2", date: "2026-09-24", person: "pedro", obra: "montebello", comment: "vistoria" }
    ]
  });
  assert.deepEqual(days[4].items, [
    { obra: "montebello", people: [{ person: "pedro", comment: "vistoria" }, { person: "jean" }] }
  ]);
});

test("entries outside the displayed week are left out", function () {
  const days = model({
    entries: [
      { id: "1", date: "2026-09-19", person: "pedro", obra: "almada" },
      { id: "2", date: "2026-09-27", person: "pedro", obra: "almada" }
    ]
  });
  days.forEach(function (d) { assert.deepEqual(d.items, []); });
});

test("holidays come from the injected lookup for each day's own date", function () {
  const days = model({
    holidaysFor: function (date) {
      return date.getDate() === 22 ? [{ type: "nat", label: "Feriado Teste" }] : [];
    }
  });
  assert.deepEqual(days[2].holidays, [{ type: "nat", label: "Feriado Teste" }]);
  assert.deepEqual(days[1].holidays, []);
  assert.deepEqual(days[3].holidays, []);
});

test("holidays default to an empty list when no lookup is given", function () {
  model().forEach(function (d) { assert.deepEqual(d.holidays, []); });
});
