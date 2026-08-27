const test = require("node:test");
const assert = require("node:assert/strict");
const { validateEntry, addEntry, removeEntry, PEOPLE_IDS, OBRA_IDS } = require("../../netlify/functions/lib/entries-logic");

test("validateEntry accepts a valid entry", function () {
  const result = validateEntry({ date: "2026-08-27", person: "pedro", obra: "almada" });
  assert.deepEqual(result, { ok: true });
});

test("validateEntry rejects bad date format", function () {
  const result = validateEntry({ date: "27/08/2026", person: "pedro", obra: "almada" });
  assert.equal(result.ok, false);
});

test("validateEntry rejects unknown person", function () {
  const result = validateEntry({ date: "2026-08-27", person: "ze", obra: "almada" });
  assert.equal(result.ok, false);
});

test("validateEntry rejects unknown obra", function () {
  const result = validateEntry({ date: "2026-08-27", person: "pedro", obra: "inventada" });
  assert.equal(result.ok, false);
});

test("addEntry appends a new entry", function () {
  const entries = [];
  const result = addEntry(entries, { id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "2026-08-27T12:00:00.000Z" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "a1");
});

test("addEntry does not duplicate same date+person+obra", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x" }];
  const result = addEntry(existing, { id: "a2", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "y" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "a1");
});

test("addEntry allows same person+obra on a different date", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x" }];
  const result = addEntry(existing, { id: "a2", date: "2026-08-28", person: "pedro", obra: "almada", createdAt: "y" });
  assert.equal(result.length, 2);
});

test("removeEntry removes by id", function () {
  const existing = [
    { id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x" },
    { id: "a2", date: "2026-08-27", person: "jean", obra: "montebello", createdAt: "y" }
  ];
  const result = removeEntry(existing, "a1");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "a2");
});

test("removeEntry is a no-op for an unknown id", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x" }];
  const result = removeEntry(existing, "does-not-exist");
  assert.equal(result.length, 1);
});

test("PEOPLE_IDS and OBRA_IDS have the expected fixed values", function () {
  assert.deepEqual(PEOPLE_IDS, ["pedro", "jean", "haniel", "gustavo", "bruna"]);
  assert.deepEqual(OBRA_IDS, ["almada", "montebello", "miraggio", "palmeiras", "tulipas", "porto"]);
});
