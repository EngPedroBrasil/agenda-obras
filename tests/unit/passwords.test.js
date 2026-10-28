const test = require("node:test");
const assert = require("node:assert/strict");
const { hashPassword, verifyPassword } = require("../../netlify/functions/lib/passwords");

test("hashPassword never stores the password and uses a random salt", function () {
  const a = hashPassword("Mudar@123");
  const b = hashPassword("Mudar@123");
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
  assert.ok(!JSON.stringify(a).includes("Mudar@123"));
  assert.match(a.salt, /^[0-9a-f]{32}$/);
});

test("verifyPassword accepts the right password and rejects wrong ones", function () {
  const rec = hashPassword("Senha@2026");
  assert.equal(verifyPassword("Senha@2026", rec), true);
  assert.equal(verifyPassword("senha@2026", rec), false);
  assert.equal(verifyPassword("", rec), false);
  assert.equal(verifyPassword(undefined, rec), false);
});

test("verifyPassword is false for a missing or incomplete record", function () {
  assert.equal(verifyPassword("x", null), false);
  assert.equal(verifyPassword("x", {}), false);
  assert.equal(verifyPassword("x", { salt: "aa" }), false);
});
