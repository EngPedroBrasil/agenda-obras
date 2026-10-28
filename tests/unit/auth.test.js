const test = require("node:test");
const assert = require("node:assert/strict");
const { makeHandler } = require("../../netlify/functions/auth");
const { makeFakeStore } = require("./helpers/fake-store");
const H = require("./helpers/auth-helpers");

function login(handler, user, password) {
  return H.call(handler, { op: "login", user: user, password: password });
}

test("GET without a session answers user null and never needs the secret", async function () {
  const handler = makeHandler(H.storeWith([]), { env: {}, now: H.OPTS.now });
  const res = await handler(H.event("GET"));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { user: null });
});

test("GET with a valid session returns the public user", async function () {
  const store = H.storeWith([]);
  const handler = makeHandler(store, H.OPTS);
  const res = await handler(H.event("GET", undefined, H.cookieFor(store.data.users, "jean")));
  assert.deepEqual(JSON.parse(res.body), { user: { id: "jean", name: "Jean", role: "user", mustChange: false } });
});

test("GET never seeds users", async function () {
  const store = makeFakeStore([], {});
  const handler = makeHandler(store, H.OPTS);
  await handler(H.event("GET", undefined, "agenda_session=lixo.lixo"));
  assert.equal(store.data.users, undefined);
});

test("login with the right password sets a hardened cookie and returns the user", async function () {
  const store = makeFakeStore([], { users: H.seededUsers() });
  const handler = makeHandler(store, H.OPTS);
  const res = await login(handler, "Jean", H.INITIAL);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { user: { id: "jean", name: "Jean", role: "user", mustChange: true } });
  const cookie = res.headers["set-cookie"];
  ["agenda_session=", "HttpOnly", "SameSite=Strict", "Secure", "Max-Age=2592000"].forEach(function (part) {
    assert.ok(cookie.includes(part), part);
  });
  assert.ok(!JSON.stringify(res.body).includes("hash"));
});

test("login with a wrong password or unknown user gives the same 401 and no cookie", async function () {
  const handler = makeHandler(makeFakeStore([], { users: H.seededUsers() }), H.OPTS);
  const wrong = await login(handler, "jean", "errada");
  const unknown = await login(handler, "ninguem", "errada");
  const proto = await login(handler, "__proto__", "errada");
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(proto.status, 401);
  assert.equal(wrong.body.error, unknown.body.error);
  assert.equal(wrong.headers["set-cookie"], undefined);
});

test("five wrong attempts lock the account, persisted in the store", async function () {
  const store = makeFakeStore([], { users: H.seededUsers() });
  const handler = makeHandler(store, H.OPTS);
  for (let i = 0; i < 5; i++) await login(handler, "jean", "errada");
  const locked = await login(handler, "jean", H.INITIAL);
  assert.equal(locked.status, 429);
  assert.ok(store.data.users.jean.lockedUntil > H.NOW);
});

test("first login seeds the users when none exist", async function () {
  const store = makeFakeStore([], {});
  const handler = makeHandler(store, H.OPTS);
  const res = await login(handler, "pedro", H.INITIAL);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, "user");
  assert.equal(res.body.user.canElevate, true);
  assert.equal(Object.keys(store.data.users).length, 5);
});

test("login reports a configuration problem instead of failing silently", async function () {
  const handler = makeHandler(makeFakeStore([], {}), { env: { INITIAL_PASSWORD: "x" }, now: H.OPTS.now });
  const res = await login(handler, "pedro", "x");
  assert.equal(res.status, 500);
  assert.match(res.body.error, /SESSION_SECRET/);
});

test("POST needs a JSON content type", async function () {
  const handler = makeHandler(makeFakeStore([], { users: H.seededUsers() }), H.OPTS);
  const res = await handler({ httpMethod: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
  assert.equal(res.statusCode, 415);
});

test("logout clears the cookie", async function () {
  const handler = makeHandler(H.storeWith([]), H.OPTS);
  const res = await H.call(handler, { op: "logout" });
  assert.equal(res.status, 200);
  assert.ok(res.headers["set-cookie"].includes("Max-Age=0"));
});

test("changePassword: wrong current, weak new, anonymous and the happy path", async function () {
  const store = makeFakeStore([], { users: H.seededUsers() });
  const handler = makeHandler(store, H.OPTS);
  const logged = await login(handler, "jean", H.INITIAL);
  const cookie = H.cookieOf(logged);
  assert.equal((await H.call(handler, { op: "changePassword", current: H.INITIAL, next: "NovaSenha1" })).status, 401);
  assert.equal((await H.call(handler, { op: "changePassword", current: "errada", next: "NovaSenha1" }, cookie)).status, 401);
  assert.equal((await H.call(handler, { op: "changePassword", current: H.INITIAL, next: "curta" }, cookie)).status, 400);
  const ok = await H.call(handler, { op: "changePassword", current: H.INITIAL, next: "NovaSenha1" }, cookie);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.mustChange, false);
  assert.ok(ok.headers["set-cookie"]);
  assert.equal(store.data.users.jean.pv, 2);
});

test("after a password change the old session stops working and the new one works", async function () {
  const store = makeFakeStore([], { users: H.seededUsers() });
  const handler = makeHandler(store, H.OPTS);
  const oldCookie = H.cookieOf(await login(handler, "jean", H.INITIAL));
  const changed = await H.call(handler, { op: "changePassword", current: H.INITIAL, next: "NovaSenha1" }, oldCookie);
  const newCookie = H.cookieOf(changed);
  const stale = await handler(H.event("GET", undefined, oldCookie));
  assert.deepEqual(JSON.parse(stale.body), { user: null });
  const fresh = await handler(H.event("GET", undefined, newCookie));
  assert.equal(JSON.parse(fresh.body).user.id, "jean");
});

test("unknown op returns 400 and other methods 405", async function () {
  const handler = makeHandler(H.storeWith([]), H.OPTS);
  assert.equal((await H.call(handler, { op: "nope" })).status, 400);
  assert.equal((await handler({ httpMethod: "DELETE", headers: {} })).statusCode, 405);
});
