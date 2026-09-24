const test = require("node:test");
const assert = require("node:assert/strict");
const { groupByObra } = require("../../public/lib/grouping");

const OBRAS = ["almada", "montebello", "miraggio", "palmeiras", "tulipas", "porto"];
const PEOPLE = ["pedro", "jean", "haniel", "gustavo", "bruna"];

test("groupByObra puts everyone at the same obra into one group", function () {
  const day = [
    { id: "1", person: "pedro", obra: "montebello" },
    { id: "2", person: "jean", obra: "montebello" }
  ];
  assert.deepEqual(groupByObra(day, OBRAS, PEOPLE), [
    { obra: "montebello", people: [{ person: "pedro" }, { person: "jean" }] }
  ]);
});

test("groupByObra orders groups by the obra list, not by entry order", function () {
  const day = [
    { id: "1", person: "pedro", obra: "porto" },
    { id: "2", person: "pedro", obra: "almada" }
  ];
  assert.deepEqual(groupByObra(day, OBRAS, PEOPLE).map(function (g) { return g.obra; }), ["almada", "porto"]);
});

test("groupByObra orders people by the team list, not by entry order", function () {
  const day = [
    { id: "1", person: "bruna", obra: "almada" },
    { id: "2", person: "jean", obra: "almada" },
    { id: "3", person: "pedro", obra: "almada" }
  ];
  const people = groupByObra(day, OBRAS, PEOPLE)[0].people.map(function (p) { return p.person; });
  assert.deepEqual(people, ["pedro", "jean", "bruna"]);
});

test("groupByObra returns no groups for a day nobody is marked", function () {
  assert.deepEqual(groupByObra([], OBRAS, PEOPLE), []);
});

test("groupByObra lists a person under every obra they are marked at", function () {
  const day = [
    { id: "1", person: "pedro", obra: "montebello" },
    { id: "2", person: "pedro", obra: "miraggio" }
  ];
  assert.deepEqual(groupByObra(day, OBRAS, PEOPLE), [
    { obra: "montebello", people: [{ person: "pedro" }] },
    { obra: "miraggio", people: [{ person: "pedro" }] }
  ]);
});

test("groupByObra keeps each person's own comment next to their name", function () {
  const day = [
    { id: "1", person: "jean", obra: "almada" },
    { id: "2", person: "pedro", obra: "almada", comment: "concretagem" }
  ];
  assert.deepEqual(groupByObra(day, OBRAS, PEOPLE)[0].people, [
    { person: "pedro", comment: "concretagem" },
    { person: "jean" }
  ]);
});

test("groupByObra skips entries whose obra or person is not in the lists", function () {
  const day = [
    { id: "1", person: "pedro", obra: "inventada" },
    { id: "2", person: "ninguem", obra: "almada" },
    { id: "3", person: "jean", obra: "almada" }
  ];
  assert.deepEqual(groupByObra(day, OBRAS, PEOPLE), [
    { obra: "almada", people: [{ person: "jean" }] }
  ]);
});

test("groupByObra lists a person once even if the same entry is stored twice", function () {
  const day = [
    { id: "1", person: "pedro", obra: "almada" },
    { id: "2", person: "pedro", obra: "almada" }
  ];
  assert.deepEqual(groupByObra(day, OBRAS, PEOPLE), [
    { obra: "almada", people: [{ person: "pedro" }] }
  ]);
});
