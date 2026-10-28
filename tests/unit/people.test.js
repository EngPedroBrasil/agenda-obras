const test = require("node:test");
const assert = require("node:assert/strict");
const { PEOPLE, ADMIN_IDS } = require("../../netlify/functions/lib/people");
const { PEOPLE_IDS } = require("../../netlify/functions/lib/entries-logic");

test("PEOPLE matches PEOPLE_IDS in ids and order", function () {
  assert.deepEqual(PEOPLE.map(function (p) { return p.id; }), PEOPLE_IDS);
});

test("every person has a name and a role; only pedro is admin", function () {
  PEOPLE.forEach(function (p) {
    assert.ok(p.name && p.role, p.id);
  });
  assert.deepEqual(ADMIN_IDS, ["pedro"]);
});
