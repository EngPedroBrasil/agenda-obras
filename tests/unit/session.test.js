const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../../netlify/functions/lib/session");

const SECRET = "x".repeat(32);
const NOW = 1000000;

test("a signed session verifies and returns its payload", function () {
  const token = S.signSession({ u: "pedro", pv: 1, exp: NOW + 1000 }, SECRET);
  assert.deepEqual(S.verifySession(token, SECRET, NOW), { u: "pedro", pv: 1, exp: NOW + 1000 });
});

test("verifySession rejects tampered tokens, wrong secrets and expired sessions", function () {
  const token = S.signSession({ u: "pedro", pv: 1, exp: NOW + 1000 }, SECRET);
  const dot = token.indexOf(".");
  const forged = Buffer.from(JSON.stringify({ u: "pedro", pv: 1, exp: NOW + 1000, role: "admin" })).toString("base64url") + token.slice(dot);
  assert.equal(S.verifySession(forged, SECRET, NOW), null);
  assert.equal(S.verifySession(token.slice(0, -2) + "xx", SECRET, NOW), null);
  assert.equal(S.verifySession(token, "y".repeat(32), NOW), null);
  assert.equal(S.verifySession(token, SECRET, NOW + 1000), null);
  assert.equal(S.verifySession(token, SECRET, NOW + 5000), null);
});

test("verifySession rejects malformed input without throwing", function () {
  [undefined, null, "", "abc", ".", "a.b", 42, {}].forEach(function (value) {
    assert.equal(S.verifySession(value, SECRET, NOW), null, String(value));
  });
  assert.equal(S.verifySession("a.b", "", NOW), null);
});

test("parseCookies reads a header and tolerates junk", function () {
  assert.deepEqual(S.parseCookies("a=1; agenda_session=abc.def; b=x%20y"), { a: "1", agenda_session: "abc.def", b: "x y" });
  assert.deepEqual(S.parseCookies(undefined), {});
  assert.deepEqual(S.parseCookies("novalue; ok=1; bad=%E0%A4%A"), { ok: "1", bad: "%E0%A4%A" });
});

test("buildCookie sets the hardening attributes; secure can be turned off for localhost", function () {
  const c = S.buildCookie("tok", {});
  ["agenda_session=tok", "HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=2592000", "Secure"].forEach(function (part) {
    assert.ok(c.includes(part), part + " in " + c);
  });
  assert.ok(!S.buildCookie("tok", { secure: false }).includes("Secure"));
});

test("clearCookie expires the cookie immediately", function () {
  const c = S.clearCookie({});
  assert.ok(c.startsWith("agenda_session=;"));
  assert.ok(c.includes("Max-Age=0"));
});
