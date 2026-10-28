const test = require("node:test");
const assert = require("node:assert/strict");
const { authorize } = require("../../netlify/functions/lib/access");

const jean = { id: "jean", role: "user", mustChange: false };
const pedro = { id: "pedro", role: "admin", mustChange: false };
const entries = [
  { id: "e1", person: "jean", date: "2026-10-27", obra: "almada" },
  { id: "e2", person: "haniel", date: "2026-10-27", obra: "porto" }
];

test("anonymous users cannot write anything (401)", function () {
  ["add", "addMany", "update", "remove", "confirmWeek", "unconfirmWeek", "nope"].forEach(function (op) {
    const res = authorize(null, { op: op, person: "jean" }, entries);
    assert.equal(res.ok, false, op);
    assert.equal(res.status, 401, op);
  });
});

test("a user who still has to change the password is blocked (403)", function () {
  const res = authorize({ id: "jean", role: "user", mustChange: true }, { op: "add", person: "jean" }, entries);
  assert.equal(res.ok, false);
  assert.equal(res.status, 403);
  assert.equal(authorize({ id: "pedro", role: "admin", mustChange: true }, { op: "add", person: "jean" }, entries).status, 403);
});

test("a regular user acts only on their own name", function () {
  assert.equal(authorize(jean, { op: "add", person: "jean" }, entries).ok, true);
  assert.equal(authorize(jean, { op: "add", person: "haniel" }, entries).status, 403);
  assert.equal(authorize(jean, { op: "confirmWeek", person: "jean" }, entries).ok, true);
  assert.equal(authorize(jean, { op: "unconfirmWeek", person: "haniel" }, entries).status, 403);
  assert.equal(authorize(jean, { op: "addMany", items: [{ person: "jean" }, { person: "jean" }] }, entries).ok, true);
  assert.equal(authorize(jean, { op: "addMany", items: [{ person: "jean" }, { person: "haniel" }] }, entries).status, 403);
});

test("update and remove check the owner of the entry", function () {
  assert.equal(authorize(jean, { op: "update", id: "e1" }, entries).ok, true);
  assert.equal(authorize(jean, { op: "remove", id: "e1" }, entries).ok, true);
  assert.equal(authorize(jean, { op: "update", id: "e2" }, entries).status, 403);
  assert.equal(authorize(jean, { op: "remove", id: "e2" }, entries).status, 403);
});

test("unknown ids, malformed payloads and unknown ops pass authorization for later validation", function () {
  assert.equal(authorize(jean, { op: "remove", id: "nao-existe" }, entries).ok, true);
  assert.equal(authorize(jean, { op: "addMany", items: "x" }, entries).ok, true);
  assert.equal(authorize(jean, { op: "nope" }, entries).ok, true);
});

test("the administrator can act on anyone", function () {
  assert.equal(authorize(pedro, { op: "add", person: "haniel" }, entries).ok, true);
  assert.equal(authorize(pedro, { op: "remove", id: "e2" }, entries).ok, true);
  assert.equal(authorize(pedro, { op: "addMany", items: [{ person: "jean" }, { person: "bruna" }] }, entries).ok, true);
  assert.equal(authorize(pedro, { op: "confirmWeek", person: "gustavo" }, entries).ok, true);
});
