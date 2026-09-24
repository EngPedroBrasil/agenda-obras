const test = require("node:test");
const assert = require("node:assert/strict");
const { validateEntry, validateComment, addEntry, removeEntry, updateEntryComment, PEOPLE_IDS, OBRA_IDS } = require("../../netlify/functions/lib/entries-logic");

// --- comments ---------------------------------------------------------

test("validateEntry accepts a comment of exactly 140 characters", function () {
  const result = validateEntry({ date: "2026-08-27", person: "pedro", obra: "almada", comment: "a".repeat(140) });
  assert.deepEqual(result, { ok: true });
});

test("validateEntry rejects a comment of 141 characters", function () {
  const result = validateEntry({ date: "2026-08-27", person: "pedro", obra: "almada", comment: "a".repeat(141) });
  assert.equal(result.ok, false);
});

test("validateEntry rejects a comment that is not a string", function () {
  const result = validateEntry({ date: "2026-08-27", person: "pedro", obra: "almada", comment: 123 });
  assert.equal(result.ok, false);
});

test("validateEntry accepts an empty comment, since the field is optional", function () {
  const result = validateEntry({ date: "2026-08-27", person: "pedro", obra: "almada", comment: "" });
  assert.deepEqual(result, { ok: true });
});

test("validateComment measures length after trimming surrounding spaces", function () {
  assert.deepEqual(validateComment("  " + "a".repeat(140) + "  "), { ok: true });
});

test("updateEntryComment sets the comment on the matching entry only", function () {
  const existing = [
    { id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x" },
    { id: "a2", date: "2026-08-27", person: "jean", obra: "montebello", createdAt: "y" }
  ];
  const result = updateEntryComment(existing, "a2", "vistoria");
  assert.equal(result[0].comment, undefined);
  assert.equal(result[1].comment, "vistoria");
});

test("updateEntryComment trims the comment before storing it", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x" }];
  const result = updateEntryComment(existing, "a1", "  concretagem  ");
  assert.equal(result[0].comment, "concretagem");
});

test("updateEntryComment with a blank comment removes the existing one", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x", comment: "antigo" }];
  const result = updateEntryComment(existing, "a1", "   ");
  assert.equal("comment" in result[0], false);
});

test("updateEntryComment returns null for an unknown id so callers can report it", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x" }];
  assert.equal(updateEntryComment(existing, "nao-existe", "texto"), null);
});

test("updateEntryComment does not mutate the array it was given", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x" }];
  updateEntryComment(existing, "a1", "texto");
  assert.equal(existing[0].comment, undefined);
});

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
