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

// --- datas reais do calendário -----------------------------------------

test("validateEntry rejects dates that do not exist on the calendar", function () {
  ["2026-99-99", "2026-02-30", "2026-13-01", "2026-00-10", "2026-04-31", "2026-02-29"].forEach(function (date) {
    assert.equal(validateEntry({ date: date, person: "pedro", obra: "almada" }).ok, false, date);
  });
});

test("validateEntry accepts 29 February in a leap year and the last day of a month", function () {
  assert.equal(validateEntry({ date: "2028-02-29", person: "pedro", obra: "almada" }).ok, true);
  assert.equal(validateEntry({ date: "2026-10-31", person: "pedro", obra: "almada" }).ok, true);
});

// --- remarcar o mesmo slot --------------------------------------------

test("addEntry replaces the comment when the same slot is added again with a different one", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x", comment: "antigo" }];
  const result = addEntry(existing, { id: "a2", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "y", comment: "novo" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "a1");
  assert.equal(result[0].createdAt, "x");
  assert.equal(result[0].comment, "novo");
  assert.equal(existing[0].comment, "antigo");
});

test("addEntry sets a comment on an existing entry that had none", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x" }];
  const result = addEntry(existing, { id: "a2", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "y", comment: "vistoria" });
  assert.equal(result[0].comment, "vistoria");
});

test("addEntry returns the very same array when the slot exists and nothing would change", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x", comment: "igual" }];
  assert.equal(addEntry(existing, { id: "a2", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "y", comment: "igual" }), existing);
  assert.equal(addEntry(existing, { id: "a3", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "z" }), existing);
});

// --- reunião com horário ------------------------------------------------

const logic = require("../../netlify/functions/lib/entries-logic");

test("validateMeeting accepts absent meeting and a valid range", function () {
  assert.deepEqual(logic.validateMeeting(undefined), { ok: true });
  assert.deepEqual(logic.validateMeeting(null), { ok: true });
  assert.deepEqual(logic.validateMeeting({ start: "14:00", end: "15:30" }), { ok: true });
  assert.deepEqual(logic.validateMeeting({ start: "00:00", end: "23:59" }), { ok: true });
});

test("validateMeeting rejects bad shapes, bad times and ranges that do not move forward", function () {
  [
    "14:00", [], 5,
    { start: "9:00", end: "10:00" },
    { start: "24:00", end: "23:59" },
    { start: "12:60", end: "13:00" },
    { start: "10:00" },
    { start: "10:00", end: "10:00" },
    { start: "11:00", end: "10:00" }
  ].forEach(function (value) {
    assert.equal(logic.validateMeeting(value).ok, false, JSON.stringify(value));
  });
});

test("validateEntry validates the optional meeting", function () {
  assert.equal(validateEntry({ date: "2026-08-27", person: "pedro", obra: "almada", meeting: { start: "14:00", end: "15:00" } }).ok, true);
  assert.equal(validateEntry({ date: "2026-08-27", person: "pedro", obra: "almada", meeting: { start: "15:00", end: "14:00" } }).ok, false);
});

test("addEntry updates a different meeting on an existing slot and keeps the comment", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x", comment: "vistoria", meeting: { start: "09:00", end: "10:00" } }];
  const result = addEntry(existing, { id: "a2", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "y", meeting: { start: "14:00", end: "15:00" } });
  assert.deepEqual(result[0].meeting, { start: "14:00", end: "15:00" });
  assert.equal(result[0].comment, "vistoria");
  assert.equal(addEntry(result, { id: "a3", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "z", meeting: { start: "14:00", end: "15:00" } }), result);
});

test("updateEntry changes only the keys present in the patch", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x", comment: "vistoria", meeting: { start: "09:00", end: "10:00" } }];
  const onlyMeeting = logic.updateEntry(existing, "a1", { meeting: { start: "14:00", end: "15:00", extra: 1 } });
  assert.equal(onlyMeeting[0].comment, "vistoria");
  assert.deepEqual(onlyMeeting[0].meeting, { start: "14:00", end: "15:00" });
  const onlyComment = logic.updateEntry(existing, "a1", { comment: "  novo  " });
  assert.equal(onlyComment[0].comment, "novo");
  assert.deepEqual(onlyComment[0].meeting, { start: "09:00", end: "10:00" });
});

test("updateEntry with meeting null removes it; with a blank comment removes the comment", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x", comment: "vistoria", meeting: { start: "09:00", end: "10:00" } }];
  const result = logic.updateEntry(existing, "a1", { meeting: null, comment: "   " });
  assert.equal("meeting" in result[0], false);
  assert.equal("comment" in result[0], false);
});

test("updateEntry returns null for an unknown id and does not mutate its input", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x" }];
  assert.equal(logic.updateEntry(existing, "nope", { comment: "x" }), null);
  logic.updateEntry(existing, "a1", { comment: "x", meeting: { start: "09:00", end: "10:00" } });
  assert.equal(existing[0].comment, undefined);
  assert.equal(existing[0].meeting, undefined);
});

// --- vários dias de uma vez -----------------------------------------------

test("buildEntry trims the comment, normalizes the meeting and leaves out empty fields", function () {
  const full = logic.buildEntry({ date: "2026-08-27", person: "pedro", obra: "almada", comment: "  vistoria ", meeting: { start: "14:00", end: "15:00", extra: 1 } }, "id1", "2026-08-27T12:00:00.000Z");
  assert.deepEqual(full, { id: "id1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "2026-08-27T12:00:00.000Z", comment: "vistoria", meeting: { start: "14:00", end: "15:00" } });
  const bare = logic.buildEntry({ date: "2026-08-27", person: "pedro", obra: "almada", comment: "   " }, "id2", "t");
  assert.equal("comment" in bare, false);
  assert.equal("meeting" in bare, false);
});

function makeMaker() {
  let n = 0;
  return function (item) { n += 1; return logic.buildEntry(item, "m" + n, "t"); };
}

test("addManyEntries adds every item and reports only the ones that changed something", function () {
  const current = [{ id: "a1", date: "2026-10-27", person: "pedro", obra: "almada", createdAt: "x" }];
  const result = logic.addManyEntries(current, [
    { date: "2026-10-27", person: "pedro", obra: "almada" },
    { date: "2026-10-28", person: "pedro", obra: "almada" },
    { date: "2026-10-28", person: "pedro", obra: "porto", comment: "obra" }
  ], makeMaker());
  assert.equal(result.ok, true);
  assert.equal(result.entries.length, 3);
  assert.deepEqual(result.affected, [
    { person: "pedro", date: "2026-10-28" },
    { person: "pedro", date: "2026-10-28" }
  ]);
});

test("addManyEntries dedupes inside the same call", function () {
  const result = logic.addManyEntries([], [
    { date: "2026-10-27", person: "pedro", obra: "almada" },
    { date: "2026-10-27", person: "pedro", obra: "almada" }
  ], makeMaker());
  assert.equal(result.entries.length, 1);
  assert.equal(result.affected.length, 1);
});

test("addManyEntries is all-or-nothing: one invalid item rejects the whole call", function () {
  const current = [];
  const result = logic.addManyEntries(current, [
    { date: "2026-10-27", person: "pedro", obra: "almada" },
    { date: "2026-02-30", person: "pedro", obra: "almada" }
  ], makeMaker());
  assert.equal(result.ok, false);
  assert.match(result.error, /item 2/);
  assert.deepEqual(current, []);
});

test("addManyEntries rejects an empty list, a non-array and more than 60 items", function () {
  assert.equal(logic.addManyEntries([], [], makeMaker()).ok, false);
  assert.equal(logic.addManyEntries([], "x", makeMaker()).ok, false);
  const many = [];
  for (let i = 0; i < 61; i++) many.push({ date: "2026-10-27", person: "pedro", obra: "almada" });
  assert.equal(logic.addManyEntries([], many, makeMaker()).ok, false);
  assert.equal(logic.MAX_MANY, 60);
});

// --- comentário da reunião (meeting.note) -------------------------------
test("a meeting may carry its own note, trimmed and limited to 140 characters", function () {
  const base = { date: "2026-08-27", person: "pedro", obra: "almada" };
  assert.equal(validateEntry(Object.assign({}, base, { meeting: { start: "14:00", end: "15:00", note: "pauta" } })).ok, true);
  assert.equal(validateEntry(Object.assign({}, base, { meeting: { start: "14:00", end: "15:00", note: 5 } })).ok, false);
  assert.equal(validateEntry(Object.assign({}, base, { meeting: { start: "14:00", end: "15:00", note: "x".repeat(141) } })).ok, false);
  const out = logic.updateEntry([{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x" }], "a1", { meeting: { start: "14:00", end: "15:00", note: "  pauta  ", extra: 1 } });
  assert.deepEqual(out[0].meeting, { start: "14:00", end: "15:00", note: "pauta" });
  const blank = logic.updateEntry(out, "a1", { meeting: { start: "14:00", end: "15:00", note: "   " } });
  assert.deepEqual(blank[0].meeting, { start: "14:00", end: "15:00" });
});

test("addEntry updates the meeting when only its note changes", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x", meeting: { start: "14:00", end: "15:00", note: "antiga" } }];
  const result = addEntry(existing, { id: "a2", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "y", meeting: { start: "14:00", end: "15:00", note: "nova" } });
  assert.equal(result[0].meeting.note, "nova");
  assert.equal(addEntry(result, { id: "a3", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "z", meeting: { start: "14:00", end: "15:00", note: "nova" } }), result);
});
