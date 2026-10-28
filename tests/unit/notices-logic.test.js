const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../../netlify/functions/lib/notices-logic");
const { PEOPLE } = require("../../netlify/functions/lib/people");

const NOW = Date.UTC(2026, 9, 28, 13, 0, 0);
const ISO = new Date(NOW).toISOString();
const DAY = 24 * 60 * 60 * 1000;

test("validateSend trims the text and keeps the distinct recipients", function () {
  const res = N.validateSend({ to: ["jean", "jean", "bruna"], text: "  Oi  " }, "leonardo", PEOPLE);
  assert.equal(res.ok, true);
  assert.equal(res.text, "Oi");
  assert.deepEqual(res.to, ["jean", "bruna"]);
});

test("validateSend rejects empty, long, unknown and self recipients", function () {
  const bad = function (payload) { return N.validateSend(payload, "pedro", PEOPLE); };
  assert.equal(bad({ to: ["jean"], text: "   " }).status, 400);
  assert.equal(bad({ to: ["jean"], text: "x".repeat(501) }).status, 400);
  assert.equal(bad({ to: ["jean"], text: "x".repeat(500) }).ok, true);
  assert.equal(bad({ to: [], text: "oi" }).status, 400);
  assert.equal(bad({ to: "jean", text: "oi" }).status, 400);
  assert.equal(bad({ to: ["ninguem"], text: "oi" }).status, 400);
  assert.equal(bad({ to: ["leonardo"], text: "oi" }).status, 400);
  assert.equal(bad({ to: ["pedro"], text: "oi" }).status, 400);
  assert.equal(bad({ text: "oi" }).status, 400);
  assert.equal(bad({ to: ["jean"], text: 42 }).status, 400);
});

test("buildNotices makes one unread notice per recipient, with distinct ids", function () {
  const list = N.buildNotices("leonardo", ["jean", "bruna"], "Oi", ISO);
  assert.equal(list.length, 2);
  assert.deepEqual(list.map(function (n) { return n.to; }), ["jean", "bruna"]);
  assert.equal(list[0].from, "leonardo");
  assert.equal(list[0].text, "Oi");
  assert.equal(list[0].createdAt, ISO);
  assert.equal(list[0].readAt, null);
  assert.notEqual(list[0].id, list[1].id);
});

test("addNotices drops notices read more than 60 days ago and keeps the rest", function () {
  const old = { id: "o", from: "leonardo", to: "jean", text: "a", createdAt: "x", readAt: new Date(NOW - 61 * DAY).toISOString() };
  const recent = { id: "r", from: "leonardo", to: "jean", text: "b", createdAt: "x", readAt: new Date(NOW - 59 * DAY).toISOString() };
  const unread = { id: "u", from: "leonardo", to: "jean", text: "c", createdAt: "x", readAt: null };
  const created = N.buildNotices("leonardo", ["bruna"], "d", ISO);
  const out = N.addNotices([old, recent, unread], created, NOW);
  assert.deepEqual(out.map(function (n) { return n.id; }), ["r", "u", created[0].id]);
});

test("addNotices keeps at most 500 stored, dropping the oldest", function () {
  const many = [];
  for (var i = 0; i < 500; i++) many.push({ id: "n" + i, from: "leonardo", to: "jean", text: "t", createdAt: "x", readAt: null });
  const created = N.buildNotices("leonardo", ["jean"], "novo", ISO);
  const out = N.addNotices(many, created, NOW);
  assert.equal(out.length, 500);
  assert.equal(out[0].id, "n1");
  assert.equal(out[499].id, created[0].id);
});

test("inboxFor and sentBy are private and newest first", function () {
  const a = { id: "a", from: "leonardo", to: "jean", text: "1", createdAt: "x", readAt: null };
  const b = { id: "b", from: "leonardo", to: "bruna", text: "2", createdAt: "x", readAt: null };
  const c = { id: "c", from: "pedro", to: "jean", text: "3", createdAt: "x", readAt: null };
  const list = [a, b, c];
  assert.deepEqual(N.inboxFor(list, "jean").map(function (n) { return n.id; }), ["c", "a"]);
  assert.deepEqual(N.inboxFor(list, "gustavo"), []);
  assert.deepEqual(N.sentBy(list, "leonardo").map(function (n) { return n.id; }), ["b", "a"]);
  assert.deepEqual(N.sentBy(list, "jean"), []);
});

test("markRead stamps the notice once, only for its recipient", function () {
  const a = { id: "a", from: "leonardo", to: "jean", text: "1", createdAt: "x", readAt: null };
  const res = N.markRead([a], "a", "jean", ISO);
  assert.equal(res.ok, true);
  assert.equal(res.changed, true);
  assert.equal(res.list[0].readAt, ISO);
  assert.equal(a.readAt, null);

  const again = N.markRead(res.list, "a", "jean", new Date(NOW + 1000).toISOString());
  assert.equal(again.ok, true);
  assert.equal(again.changed, false);
  assert.equal(again.list[0].readAt, ISO);

  assert.equal(N.markRead([a], "a", "bruna", ISO).status, 404);
  assert.equal(N.markRead([a], "zzz", "jean", ISO).status, 404);
});
