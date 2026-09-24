const test = require("node:test");
const assert = require("node:assert/strict");
const { makeHandler } = require("../../netlify/functions/entries");

function makeFakeStore(initial) {
  let data = initial;
  return {
    get: async function () { return data; },
    setJSON: async function (key, value) { data = value; }
  };
}

test("GET returns empty list when store is empty", async function () {
  const handler = makeHandler(makeFakeStore(null));
  const res = await handler({ httpMethod: "GET" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { entries: [] });
});

test("POST add appends a valid entry", async function () {
  const handler = makeHandler(makeFakeStore([]));
  const res = await handler({
    httpMethod: "POST",
    body: JSON.stringify({ op: "add", date: "2026-08-27", person: "pedro", obra: "almada" })
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.entries.length, 1);
  assert.equal(body.entries[0].person, "pedro");
  assert.ok(body.entries[0].id);
  assert.ok(body.entries[0].createdAt);
});

test("POST add rejects invalid payload", async function () {
  const handler = makeHandler(makeFakeStore([]));
  const res = await handler({
    httpMethod: "POST",
    body: JSON.stringify({ op: "add", date: "27/08/2026", person: "pedro", obra: "almada" })
  });
  assert.equal(res.statusCode, 400);
});

test("POST remove deletes by id", async function () {
  const seeded = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x" }];
  const handler = makeHandler(makeFakeStore(seeded));
  const res = await handler({ httpMethod: "POST", body: JSON.stringify({ op: "remove", id: "a1" }) });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.entries.length, 0);
});

test("POST with unknown op returns 400", async function () {
  const handler = makeHandler(makeFakeStore([]));
  const res = await handler({ httpMethod: "POST", body: JSON.stringify({ op: "nope" }) });
  assert.equal(res.statusCode, 400);
});

test("POST with invalid JSON body returns 400", async function () {
  const handler = makeHandler(makeFakeStore([]));
  const res = await handler({ httpMethod: "POST", body: "{not json" });
  assert.equal(res.statusCode, 400);
});

test("unsupported method returns 405", async function () {
  const handler = makeHandler(makeFakeStore([]));
  const res = await handler({ httpMethod: "DELETE" });
  assert.equal(res.statusCode, 405);
});

// --- comments ---------------------------------------------------------

test("POST add stores the trimmed comment on the new entry", async function () {
  const handler = makeHandler(makeFakeStore([]));
  const res = await handler({
    httpMethod: "POST",
    body: JSON.stringify({ op: "add", date: "2026-08-27", person: "pedro", obra: "almada", comment: "  concretagem da laje  " })
  });
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).entries[0].comment, "concretagem da laje");
});

test("POST add with a blank comment stores no comment at all", async function () {
  const handler = makeHandler(makeFakeStore([]));
  const res = await handler({
    httpMethod: "POST",
    body: JSON.stringify({ op: "add", date: "2026-08-27", person: "pedro", obra: "almada", comment: "   " })
  });
  assert.equal(res.statusCode, 200);
  assert.equal("comment" in JSON.parse(res.body).entries[0], false);
});

test("POST add rejects a comment over the limit", async function () {
  const handler = makeHandler(makeFakeStore([]));
  const res = await handler({
    httpMethod: "POST",
    body: JSON.stringify({ op: "add", date: "2026-08-27", person: "pedro", obra: "almada", comment: "a".repeat(141) })
  });
  assert.equal(res.statusCode, 400);
});

test("POST update replaces the comment of an existing entry", async function () {
  const seeded = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x", comment: "antigo" }];
  const handler = makeHandler(makeFakeStore(seeded));
  const res = await handler({ httpMethod: "POST", body: JSON.stringify({ op: "update", id: "a1", comment: "novo" }) });
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).entries[0].comment, "novo");
});

test("POST update with an empty comment clears it", async function () {
  const seeded = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x", comment: "antigo" }];
  const handler = makeHandler(makeFakeStore(seeded));
  const res = await handler({ httpMethod: "POST", body: JSON.stringify({ op: "update", id: "a1", comment: "" }) });
  assert.equal(res.statusCode, 200);
  assert.equal("comment" in JSON.parse(res.body).entries[0], false);
});

test("POST update for an unknown id returns 404", async function () {
  const handler = makeHandler(makeFakeStore([]));
  const res = await handler({ httpMethod: "POST", body: JSON.stringify({ op: "update", id: "nao-existe", comment: "x" }) });
  assert.equal(res.statusCode, 404);
});

test("POST update rejects an over-long comment and keeps the stored one", async function () {
  const seeded = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x", comment: "original" }];
  const handler = makeHandler(makeFakeStore(seeded));
  const res = await handler({ httpMethod: "POST", body: JSON.stringify({ op: "update", id: "a1", comment: "a".repeat(141) }) });
  assert.equal(res.statusCode, 400);
  const after = await handler({ httpMethod: "GET" });
  assert.equal(JSON.parse(after.body).entries[0].comment, "original");
});

test("POST update without an id returns 400", async function () {
  const handler = makeHandler(makeFakeStore([]));
  const res = await handler({ httpMethod: "POST", body: JSON.stringify({ op: "update", comment: "x" }) });
  assert.equal(res.statusCode, 400);
});
