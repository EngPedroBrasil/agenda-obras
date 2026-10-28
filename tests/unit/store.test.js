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

test("the file store behaves like the Blobs methods the functions use", async function () {
  const os = require("node:os");
  const path = require("node:path");
  const fs = require("node:fs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agenda-store-"));
  const store = S.makeFileStore(dir);
  assert.equal(await store.get("entries", { type: "json" }), null);
  await store.setJSON("entries", [{ id: "a", comment: "Gestão de custos" }]);
  await store.setJSON("backup-2026-10-27", { entries: [] });
  await store.setJSON("users", { pedro: {} });
  assert.deepEqual(await store.get("entries", { type: "json" }), [{ id: "a", comment: "Gestão de custos" }]);
  const listing = await store.list({ prefix: "backup-" });
  assert.deepEqual(listing.blobs, [{ key: "backup-2026-10-27" }]);
  await store.delete("backup-2026-10-27");
  await store.delete("backup-2026-10-27");
  assert.equal(await store.get("backup-2026-10-27", { type: "json" }), null);
});

test("resolveStore in a local environment never needs Netlify Blobs", async function () {
  const store = S.resolveStore({ AGENDA_LOCAL: "1", BLOBS_SITE_ID: "site", BLOBS_TOKEN: "token" });
  assert.equal(typeof store.setJSON, "function");
  assert.equal(typeof store.list, "function");
});
