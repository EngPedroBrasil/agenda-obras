const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../../netlify/functions/lib/store");

test("isLocalEnv recognises netlify dev and the explicit local flag", function () {
  assert.equal(S.isLocalEnv({ NETLIFY_DEV: "true" }), true);
  assert.equal(S.isLocalEnv({ AGENDA_LOCAL: "1" }), true);
  assert.equal(S.isLocalEnv({}), false);
  assert.equal(S.isLocalEnv({ NETLIFY_DEV: "false", AGENDA_LOCAL: "0" }), false);
});

test("local environments use the dev store and ignore production credentials", function () {
  const env = { NETLIFY_DEV: "true", BLOBS_SITE_ID: "site", BLOBS_TOKEN: "token" };
  assert.deepEqual(S.storeConfigFor(env), { name: "agenda-obras-dev" });
  assert.deepEqual(S.storeConfigFor({ AGENDA_LOCAL: "1", BLOBS_SITE_ID: "site", BLOBS_TOKEN: "token" }), { name: "agenda-obras-dev" });
});

test("production uses the credentials when present and the plain name otherwise", function () {
  assert.deepEqual(S.storeConfigFor({ BLOBS_SITE_ID: "site", BLOBS_TOKEN: "token" }), { name: "agenda-obras", siteID: "site", token: "token" });
  assert.deepEqual(S.storeConfigFor({}), { name: "agenda-obras" });
  assert.deepEqual(S.storeConfigFor({ BLOBS_SITE_ID: "site" }), { name: "agenda-obras" });
});
