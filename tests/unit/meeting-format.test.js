const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../../public/lib/meeting-format");

test("formatMeetingShort drops empty minutes and leading zeros", function () {
  assert.equal(F.formatMeetingShort({ start: "14:00", end: "15:30" }), "14h–15h30");
  assert.equal(F.formatMeetingShort({ start: "09:05", end: "10:00" }), "9h05–10h");
  assert.equal(F.formatMeetingShort({ start: "00:00", end: "23:59" }), "0h–23h59");
});

test("formatMeetingClock keeps HH:MM", function () {
  assert.equal(F.formatMeetingClock({ start: "14:00", end: "15:30" }), "14:00–15:30");
  assert.equal(F.formatMeetingClock({ start: "09:05", end: "10:00" }), "09:05–10:00");
});

test("missing or malformed meetings give an empty string", function () {
  [undefined, null, {}, { start: "14:00" }, { start: "x", end: "y" }, "14:00"].forEach(function (m) {
    assert.equal(F.formatMeetingShort(m), "");
    assert.equal(F.formatMeetingClock(m), "");
  });
});
