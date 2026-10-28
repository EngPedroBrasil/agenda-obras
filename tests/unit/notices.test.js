const test = require("node:test");
const assert = require("node:assert/strict");
const { makeHandler } = require("../../netlify/functions/notices");
const H = require("./helpers/auth-helpers");

function setup(opts) {
  const users = H.readyUsers();
  if (opts && opts.common) users.pedro.elevatedUntil = 0;
  const store = H.storeWith([], Object.assign({ users: users }, (opts && opts.extra) || {}));
  const handler = makeHandler(store, H.OPTS);
  return {
    store: store,
    handler: handler,
    as: function (id) { return H.cookieFor(store.data.users, id); },
    get: function (id) { return handler(H.event("GET", undefined, id ? H.cookieFor(store.data.users, id) : undefined)); }
  };
}

test("needs a session and a changed password", async function () {
  const s = setup();
  assert.equal((await s.get()).statusCode, 401);
  assert.equal((await H.call(s.handler, { op: "send", to: ["jean"], text: "oi" })).status, 401);
  s.store.data.users.jean.mustChange = true;
  assert.equal((await s.get("jean")).statusCode, 403);
});

test("Leonardo sends to two people; each one only sees his own notice", async function () {
  const s = setup();
  const sent = await H.call(s.handler, { op: "send", to: ["jean", "bruna"], text: "Revisar a obra do Porto" }, s.as("leonardo"));
  assert.equal(sent.status, 200);
  assert.equal(sent.body.sent, 2);
  assert.equal(s.store.data.notices.length, 2);

  const jean = JSON.parse((await s.get("jean")).body);
  assert.equal(jean.inbox.length, 1);
  assert.equal(jean.inbox[0].text, "Revisar a obra do Porto");
  assert.equal(jean.inbox[0].from, "leonardo");
  assert.equal(jean.canSend, false);
  assert.deepEqual(jean.sent, []);

  const haniel = JSON.parse((await s.get("haniel")).body);
  assert.deepEqual(haniel.inbox, []);

  const leo = JSON.parse((await s.get("leonardo")).body);
  assert.equal(leo.canSend, true);
  assert.equal(leo.sent.length, 2);
  assert.deepEqual(leo.inbox, []);
});

test("recipient marks as read; the sender sees the time; others cannot mark it", async function () {
  const s = setup();
  await H.call(s.handler, { op: "send", to: ["jean"], text: "Oi" }, s.as("leonardo"));
  const id = s.store.data.notices[0].id;

  assert.equal((await H.call(s.handler, { op: "markRead", id: id }, s.as("bruna"))).status, 404);
  const ok = await H.call(s.handler, { op: "markRead", id: id }, s.as("jean"));
  assert.equal(ok.status, 200);
  assert.equal(s.store.data.notices[0].readAt, new Date(H.NOW).toISOString());

  const leo = JSON.parse((await s.get("leonardo")).body);
  assert.equal(leo.sent[0].readAt, new Date(H.NOW).toISOString());
});

test("ordinary people cannot send", async function () {
  const s = setup();
  const res = await H.call(s.handler, { op: "send", to: ["bruna"], text: "oi" }, s.as("jean"));
  assert.equal(res.status, 403);
  assert.match(res.body.error, /apenas o gestor e o administrador/);
  assert.equal(s.store.data.notices, undefined);
});

test("Pedro sends only with the admin mode on", async function () {
  const off = setup({ common: true });
  const denied = await H.call(off.handler, { op: "send", to: ["jean"], text: "oi" }, off.as("pedro"));
  assert.equal(denied.status, 403);
  assert.match(denied.body.error, /ligue o modo administrador para enviar notificações/);

  const on = setup();
  const ok = await H.call(on.handler, { op: "send", to: ["jean"], text: "oi" }, on.as("pedro"));
  assert.equal(ok.status, 200);
});

test("Pedro in common mode still reads what Leonardo sent him", async function () {
  const s = setup({ common: true });
  await H.call(s.handler, { op: "send", to: ["pedro"], text: "Pedro, vamos falar do Almada" }, s.as("leonardo"));
  const pedro = JSON.parse((await s.get("pedro")).body);
  assert.equal(pedro.inbox.length, 1);
  assert.equal(pedro.canSend, false);
});

test("validation errors are 400 and nothing is stored", async function () {
  const s = setup();
  const res = await H.call(s.handler, { op: "send", to: [], text: "oi" }, s.as("leonardo"));
  assert.equal(res.status, 400);
  assert.equal(s.store.data.notices, undefined);
  assert.equal((await H.call(s.handler, { op: "xyz" }, s.as("leonardo"))).status, 400);
});
