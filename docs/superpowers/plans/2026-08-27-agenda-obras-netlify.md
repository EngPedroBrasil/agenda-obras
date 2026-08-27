# Agenda de Obras — site Netlify com banco de dados próprio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Excel+Claude-Artifact calendar with a self-contained Netlify site (static frontend + one serverless function) backed by Netlify Blobs, so the team marks presence directly on the page with no spreadsheet and no Claude in the loop.

**Architecture:** A single Netlify site. `public/index.html` is the existing calendar UI (week/month views, obra logos, holidays, filters) with its data layer rewired to call `/api/entries` instead of reading a static script tag. `netlify/functions/entries.js` is one HTTP function handling GET (list) and POST (`op: "add"` / `op: "remove"`) against a single JSON blob in Netlify Blobs. Pure validation/mutation logic lives in a separate, dependency-free module so it can be unit tested without the Netlify runtime.

**Tech Stack:** Netlify (static hosting + Functions + Blobs), `@netlify/blobs` npm package, plain JS (no framework, matches the existing calendar code), Node's built-in test runner (`node --test`) for unit tests, Playwright for browser tests, Netlify CLI for deploy.

**Spec:** `docs/superpowers/specs/2026-08-27-agenda-obras-netlify-design.md`

## Global Constraints

- No authentication — same open-access model as today (spec: "Não-objetivos").
- No real-time push — the frontend polls `/api/entries` every 25 seconds (spec: "Não-objetivos").
- No concurrency control beyond simple dedupe-on-add — accepted risk, do not add locking/transactions (spec: "Riscos aceitos").
- Fixed lists only: people = `pedro, jean, haniel, gustavo, bruna`; obras = `almada, montebello, miraggio, palmeiras, tulipas, porto` (spec: "Modelo de dados").
- The Netlify Personal Access Token must never be written into any file that gets committed or deployed — pass it only as the `NETLIFY_AUTH_TOKEN` environment variable to CLI commands (spec: "Deploy e credenciais").
- One-time migration of the 6 entries currently in the Excel sheet happens after deploy, via API calls — not a build-time script (spec: "Migração").

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `netlify.toml`

**Interfaces:**
- Produces: `netlify.toml` with `functions = "netlify/functions"`, `publish = "public"`, and a redirect from `/api/*` to the functions endpoint — later tasks' functions and frontend fetch calls depend on this routing.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "agenda-obras",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "node --test netlify/functions/lib/*.test.js netlify/functions/*.test.js"
  },
  "dependencies": {
    "@netlify/blobs": "^8.1.0"
  }
}
```

- [ ] **Step 2: Create `netlify.toml`**

```toml
[build]
  functions = "netlify/functions"
  publish = "public"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200
```

- [ ] **Step 3: Install dependencies**

Run: `cd /tmp/agenda-obras-site && npm install`
Expected: `node_modules/@netlify/blobs` exists, `npm install` exits 0.

- [ ] **Step 4: Commit**

```bash
cd /tmp/agenda-obras-site
git add package.json package-lock.json netlify.toml
git commit -m "chore: scaffold Netlify project (functions + blobs)"
```

---

## Task 2: Pure entries logic (validate/add/remove) with unit tests

**Files:**
- Create: `netlify/functions/lib/entries-logic.js`
- Test: `netlify/functions/lib/entries-logic.test.js`

**Interfaces:**
- Produces: `validateEntry(input) -> {ok: true} | {ok: false, error: string}`, `addEntry(entries, entryWithId) -> newEntries`, `removeEntry(entries, id) -> newEntries`, `PEOPLE_IDS: string[]`, `OBRA_IDS: string[]`. Task 3's function handler consumes all five.

- [ ] **Step 1: Write the failing tests**

Create `netlify/functions/lib/entries-logic.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateEntry, addEntry, removeEntry, PEOPLE_IDS, OBRA_IDS } = require("./entries-logic");

test("validateEntry accepts a valid entry", function () {
  const result = validateEntry({ date: "2026-08-27", person: "pedro", obra: "almada" });
  assert.deepEqual(result, { ok: true });
});

test("validateEntry rejects bad date format", function () {
  const result = validateEntry({ date: "27/08/2026", person: "pedro", obra: "almada" });
  assert.equal(result.ok, false);
});

test("validateEntry rejects unknown person", function () {
  const result = validateEntry({ date: "2026-08-27", person: "ze", obra: "almada" });
  assert.equal(result.ok, false);
});

test("validateEntry rejects unknown obra", function () {
  const result = validateEntry({ date: "2026-08-27", person: "pedro", obra: "inventada" });
  assert.equal(result.ok, false);
});

test("addEntry appends a new entry", function () {
  const entries = [];
  const result = addEntry(entries, { id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "2026-08-27T12:00:00.000Z" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "a1");
});

test("addEntry does not duplicate same date+person+obra", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x" }];
  const result = addEntry(existing, { id: "a2", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "y" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "a1");
});

test("addEntry allows same person+obra on a different date", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x" }];
  const result = addEntry(existing, { id: "a2", date: "2026-08-28", person: "pedro", obra: "almada", createdAt: "y" });
  assert.equal(result.length, 2);
});

test("removeEntry removes by id", function () {
  const existing = [
    { id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x" },
    { id: "a2", date: "2026-08-27", person: "jean", obra: "montebello", createdAt: "y" }
  ];
  const result = removeEntry(existing, "a1");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "a2");
});

test("removeEntry is a no-op for an unknown id", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x" }];
  const result = removeEntry(existing, "does-not-exist");
  assert.equal(result.length, 1);
});

test("PEOPLE_IDS and OBRA_IDS have the expected fixed values", function () {
  assert.deepEqual(PEOPLE_IDS, ["pedro", "jean", "haniel", "gustavo", "bruna"]);
  assert.deepEqual(OBRA_IDS, ["almada", "montebello", "miraggio", "palmeiras", "tulipas", "porto"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /tmp/agenda-obras-site && node --test netlify/functions/lib/entries-logic.test.js`
Expected: FAIL — `Cannot find module './entries-logic'`

- [ ] **Step 3: Write the implementation**

Create `netlify/functions/lib/entries-logic.js`:

```js
"use strict";

const PEOPLE_IDS = ["pedro", "jean", "haniel", "gustavo", "bruna"];
const OBRA_IDS = ["almada", "montebello", "miraggio", "palmeiras", "tulipas", "porto"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateEntry(input) {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "corpo inválido" };
  }
  if (typeof input.date !== "string" || !DATE_RE.test(input.date)) {
    return { ok: false, error: "data inválida (esperado AAAA-MM-DD)" };
  }
  if (!PEOPLE_IDS.includes(input.person)) {
    return { ok: false, error: "pessoa inválida" };
  }
  if (!OBRA_IDS.includes(input.obra)) {
    return { ok: false, error: "obra inválida" };
  }
  return { ok: true };
}

function addEntry(entries, entryWithId) {
  var dup = entries.some(function (en) {
    return en.date === entryWithId.date && en.person === entryWithId.person && en.obra === entryWithId.obra;
  });
  if (dup) return entries;
  return entries.concat([entryWithId]);
}

function removeEntry(entries, id) {
  return entries.filter(function (en) { return en.id !== id; });
}

module.exports = { PEOPLE_IDS, OBRA_IDS, validateEntry, addEntry, removeEntry };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /tmp/agenda-obras-site && node --test netlify/functions/lib/entries-logic.test.js`
Expected: PASS — 9 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
cd /tmp/agenda-obras-site
git add netlify/functions/lib/entries-logic.js netlify/functions/lib/entries-logic.test.js
git commit -m "feat: pure entries validation/add/remove logic with unit tests"
```

---

## Task 3: Netlify Function `entries.js` (HTTP handler over Blobs)

**Files:**
- Create: `netlify/functions/entries.js`
- Test: `netlify/functions/entries.test.js`

**Interfaces:**
- Consumes: `validateEntry`, `addEntry`, `removeEntry` from `./lib/entries-logic` (Task 2).
- Produces: `exports.handler` (real Netlify Function entrypoint, lazily calls `getStore`) and `exports.makeHandler(store)` where `store` has `get(key, {type: "json"}) -> Promise<any>` and `setJSON(key, value) -> Promise<void>` — Task 6/8 (local dev, deploy) rely on `exports.handler`; this task's own tests rely on `exports.makeHandler`.

- [ ] **Step 1: Write the failing tests**

Create `netlify/functions/entries.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeHandler } = require("./entries");

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /tmp/agenda-obras-site && node --test netlify/functions/entries.test.js`
Expected: FAIL — `Cannot find module './entries'`

- [ ] **Step 3: Write the implementation**

Create `netlify/functions/entries.js`:

```js
"use strict";

const { getStore } = require("@netlify/blobs");
const { validateEntry, addEntry, removeEntry } = require("./lib/entries-logic");

const STORE_NAME = "agenda-obras";
const BLOB_KEY = "entries";

function jsonResponse(statusCode, bodyObj) {
  return {
    statusCode: statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(bodyObj)
  };
}

function makeHandler(store) {
  return async function handler(event) {
    if (event.httpMethod === "GET") {
      const current = (await store.get(BLOB_KEY, { type: "json" })) || [];
      return jsonResponse(200, { entries: current });
    }

    if (event.httpMethod === "POST") {
      let payload;
      try {
        payload = JSON.parse(event.body || "{}");
      } catch (e) {
        return jsonResponse(400, { error: "JSON inválido" });
      }

      const current = (await store.get(BLOB_KEY, { type: "json" })) || [];

      if (payload.op === "remove") {
        if (typeof payload.id !== "string" || !payload.id) {
          return jsonResponse(400, { error: "id obrigatório para remover" });
        }
        const updated = removeEntry(current, payload.id);
        await store.setJSON(BLOB_KEY, updated);
        return jsonResponse(200, { entries: updated });
      }

      if (payload.op === "add") {
        const check = validateEntry(payload);
        if (!check.ok) {
          return jsonResponse(400, { error: check.error });
        }
        const entryWithId = {
          id: "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          date: payload.date,
          person: payload.person,
          obra: payload.obra,
          createdAt: new Date().toISOString()
        };
        const updated = addEntry(current, entryWithId);
        await store.setJSON(BLOB_KEY, updated);
        return jsonResponse(200, { entries: updated });
      }

      return jsonResponse(400, { error: "op inválida (esperado 'add' ou 'remove')" });
    }

    return jsonResponse(405, { error: "método não suportado" });
  };
}

exports.handler = async function (event, context) {
  return makeHandler(getStore(STORE_NAME))(event, context);
};
exports.makeHandler = makeHandler;
```

Note: `getStore(STORE_NAME)` is called lazily inside `exports.handler`, not at module load time — calling it outside a Netlify runtime context throws, and the tests in this task only exercise `makeHandler` directly, never `exports.handler`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /tmp/agenda-obras-site && node --test netlify/functions/entries.test.js`
Expected: PASS — 7 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
cd /tmp/agenda-obras-site
git add netlify/functions/entries.js netlify/functions/entries.test.js
git commit -m "feat: entries HTTP function (GET/POST add/remove) over Netlify Blobs"
```

---

## Task 4: Seed the frontend from the existing calendar page

**Files:**
- Create: `public/index.html`

**Interfaces:**
- Produces: `public/index.html` — the starting point Task 5 modifies. Contains the full calendar UI (CSS, obra icons as base64, week/month rendering, holiday computation) already built and browser-tested in an earlier session; only its data layer needs rewiring.

- [ ] **Step 1: Copy the existing built calendar page verbatim**

Read `/tmp/agenda_calendario_base.txt` (this machine's local filesystem — it is the last known-good, fully-rendered version of the calendar: obra logos embedded as base64, all CSS, week/month/filter/holiday logic already implemented and previously verified with Playwright) and write its exact content, unmodified, to `public/index.html`.

```bash
mkdir -p /tmp/agenda-obras-site/public
cp /tmp/agenda_calendario_base.txt /tmp/agenda-obras-site/public/index.html
```

- [ ] **Step 2: Verify the copy is intact**

Run: `wc -c /tmp/agenda_calendario_base.txt /tmp/agenda-obras-site/public/index.html`
Expected: both files report the same byte count.

- [ ] **Step 3: Commit**

```bash
cd /tmp/agenda-obras-site
git add public/index.html
git commit -m "chore: seed frontend from last known-good calendar build"
```

---

## Task 5: Rewire the frontend to `/api/entries` and restore add/remove

**Files:**
- Modify: `public/index.html` (all edits below target this one file)

**Interfaces:**
- Consumes: `GET /api/entries -> {entries: Entry[]}`, `POST /api/entries {op:"add", date, person, obra} -> {entries: Entry[]} | 400 {error}`, `POST /api/entries {op:"remove", id} -> {entries: Entry[]} | 400 {error}` (Task 3).
- Produces: a fully live, editable calendar page with no server-side dependency other than `/api/entries`.

- [ ] **Step 1: Remove the Excel-link header and sync note**

Find this exact block in `public/index.html`:

```html
      <h1 class="brand"><span class="brand-mark">&#127959;</span>Agenda de Obras</h1>
      <p class="tagline">Cada um marca sua presen&ccedil;a na planilha Excel &mdash; este calend&aacute;rio &eacute; s&oacute; a visualiza&ccedil;&atilde;o, atualizada periodicamente a partir dela.</p>
      <a class="readonly-banner show" id="editExcelLink" href="https://blendiep.sharepoint.com/sites/PCP/Documentos%20Compartilhados/agenda_de_obras.xlsx" target="_blank" rel="noopener">Abrir planilha para marcar presen&ccedil;a &#8599;</a>
      <p class="sync-note" id="syncNote"></p>
    </div>
```

Replace with:

```html
      <h1 class="brand"><span class="brand-mark">&#127959;</span>Agenda de Obras</h1>
      <p class="tagline">Clique num dia pra marcar sua presen&ccedil;a numa obra &mdash; todo mundo v&ecirc; a mesma agenda, atualizada ao vivo.</p>
    </div>
```

- [ ] **Step 2: Remove the now-unused `EXCEL_URL` variable**

Find:

```js
  var EXCEL_URL = "https://blendiep.sharepoint.com/sites/PCP/Documentos%20Compartilhados/agenda_de_obras.xlsx";
```

Delete this line entirely.

- [ ] **Step 3: Restore the remove button on entry chips**

Find:

```js
  function entryChipHTML(en) {
    var obra = obraById[en.obra], person = personById[en.person];
    if (!obra || !person) return "";
    return '<div class="entry-chip" style="--chip-color:' + obra.color + '">' +
      '<img src="' + obra.icon + '" alt="">' +
      '<span class="chip-text"><span class="chip-name" title="' + h(person.name) + '">' + h(person.name) + '</span><span class="chip-obra" title="' + h(obra.name) + '">' + h(obra.name) + '</span></span>' +
      "</div>";
  }
```

Replace with:

```js
  function entryChipHTML(en) {
    var obra = obraById[en.obra], person = personById[en.person];
    if (!obra || !person) return "";
    return '<div class="entry-chip" style="--chip-color:' + obra.color + '">' +
      '<img src="' + obra.icon + '" alt="">' +
      '<span class="chip-text"><span class="chip-name" title="' + h(person.name) + '">' + h(person.name) + '</span><span class="chip-obra" title="' + h(obra.name) + '">' + h(obra.name) + '</span></span>' +
      '<button class="rm" data-action="remove-entry" data-id="' + en.id + '" title="Remover" aria-label="Remover">&times;</button>' +
      "</div>";
  }
```

- [ ] **Step 4: Restore the "add presence" form in the day modal**

Find:

```js
    var holHTML = hol.length ? holidayPillsHTML(hol) + '<p class="modal-sub" style="margin-top:6px">' + hol.map(function (x) { return h(x.label); }).join(" · ") + "</p>" : "";

    document.getElementById("modal").innerHTML =
      '<div class="modal-head"><div><h2>' + h(label) + '</h2></div><button class="close-x" data-action="close-modal" aria-label="Fechar">&times;</button></div>' +
      holHTML +
      '<div class="modal-section-title">Marcados neste dia</div>' +
      '<div class="current-list">' + currentHTML + "</div>" +
      '<a class="btn btn-primary" style="text-decoration:none;" href="' + h(EXCEL_URL) + '" target="_blank" rel="noopener">Marcar / editar na planilha &#8599;</a>';

    overlay.classList.add("show");
  }
```

Replace with:

```js
    var personOptions = TEAM.map(function (p) {
      return '<label class="opt-row"><input type="radio" name="modal-person" value="' + p.id + '" style="accent-color:var(--accent)">' +
        '<span class="avatar">' + initials(p.name) + '</span><span class="opt-label">' + h(p.name) + '<div class="opt-sub">' + h(p.role) + '</div></span></label>';
    }).join("");

    var obraOptions = OBRAS.map(function (o) {
      return '<label class="opt-row"><input type="checkbox" name="modal-obra" value="' + o.id + '" style="accent-color:var(--accent)">' +
        '<img src="' + o.icon + '" alt=""><span class="opt-label">' + h(o.name) + '<div class="opt-sub">' + h(o.city) + '</div></span></label>';
    }).join("");

    var holHTML = hol.length ? holidayPillsHTML(hol) + '<p class="modal-sub" style="margin-top:6px">' + hol.map(function (x) { return h(x.label); }).join(" · ") + "</p>" : "";

    document.getElementById("modal").innerHTML =
      '<div class="modal-head"><div><h2>' + h(label) + '</h2></div><button class="close-x" data-action="close-modal" aria-label="Fechar">&times;</button></div>' +
      holHTML +
      '<div class="modal-section-title">Marcados neste dia</div>' +
      '<div class="current-list">' + currentHTML + "</div>" +
      '<div class="modal-section-title">Adicionar presença</div>' +
      '<form id="addForm">' +
      '<div class="radio-list">' + personOptions + '</div>' +
      '<div class="modal-section-title">Obra(s)</div>' +
      '<div class="check-list">' + obraOptions + '</div>' +
      '<button type="submit" class="btn btn-primary" id="addBtn" disabled>Adicionar</button>' +
      "</form>";

    overlay.classList.add("show");

    var form = document.getElementById("addForm");
    var addBtn = document.getElementById("addBtn");
    function refreshBtn() {
      var person = form.querySelector('input[name="modal-person"]:checked');
      var obras = form.querySelectorAll('input[name="modal-obra"]:checked');
      addBtn.disabled = !(person && obras.length);
    }
    form.addEventListener("change", refreshBtn);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var person = form.querySelector('input[name="modal-person"]:checked');
      var obras = form.querySelectorAll('input[name="modal-obra"]:checked');
      if (!person || !obras.length) return;
      addBtn.disabled = true;
      addBtn.textContent = "Adicionando…";
      var dateKeyToAdd = modalDateKey;
      var personId = person.value;
      var obraIds = Array.prototype.map.call(obras, function (cb) { return cb.value; });
      var chain = Promise.resolve();
      obraIds.forEach(function (obraId) {
        chain = chain.then(function () { return submitAdd(dateKeyToAdd, personId, obraId); });
      });
      chain.then(function () {
        renderModal();
        renderCalendar();
        showToast("Presença adicionada.");
      }).catch(function () {
        showToast("Não foi possível salvar agora. Tente de novo.");
        addBtn.disabled = false;
        addBtn.textContent = "Adicionar";
      });
    });
  }
```

- [ ] **Step 5: Restore the remove-entry click handler**

Find:

```js
    } else if (action === "close-modal") {
      modalDateKey = null;
      renderModal();
    }
  });
```

Replace with:

```js
    } else if (action === "close-modal") {
      modalDateKey = null;
      renderModal();
    } else if (action === "remove-entry") {
      var id = el.getAttribute("data-id");
      submitRemove(id).then(function () {
        renderModal();
        renderCalendar();
        showToast("Presença removida.");
      }).catch(function () {
        showToast("Não foi possível remover agora. Tente de novo.");
      });
    }
  });
```

- [ ] **Step 6: Replace the static data block with the API client**

Find:

```js
  /* ---------------- data ---------------- */
  var entries = [];
  try {
    var raw = document.getElementById("cal-data").textContent;
    entries = raw ? JSON.parse(raw) : [];
  } catch (e) { entries = []; }
  if (!Array.isArray(entries)) entries = [];
```

Replace with:

```js
  /* ---------------- data ---------------- */
  var entries = [];

  /* ---------------- API ---------------- */
  function fetchEntries() {
    return fetch("/api/entries").then(function (res) {
      if (!res.ok) throw new Error("fetch failed");
      return res.json();
    }).then(function (data) {
      return Array.isArray(data.entries) ? data.entries : [];
    });
  }
  function submitAdd(date, person, obra) {
    return fetch("/api/entries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "add", date: date, person: person, obra: obra })
    }).then(function (res) {
      if (!res.ok) throw new Error("add failed");
      return res.json();
    }).then(function (data) {
      entries = Array.isArray(data.entries) ? data.entries : entries;
    });
  }
  function submitRemove(id) {
    return fetch("/api/entries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "remove", id: id })
    }).then(function (res) {
      if (!res.ok) throw new Error("remove failed");
      return res.json();
    }).then(function (data) {
      entries = Array.isArray(data.entries) ? data.entries : entries;
    });
  }
```

- [ ] **Step 7: Replace the self-poll (against the published page) with a poll against `/api/entries`**

Find:

```js
  /* ---------------- live refresh (polls this same published page) ---------------- */
  var lastSyncSeen = document.getElementById("syncNote").textContent;
  function pollForUpdates() {
    fetch(location.href, { cache: "no-store" }).then(function (res) {
      if (!res.ok) return;
      return res.text();
    }).then(function (html) {
      if (!html) return;
      var dataMatch = html.match(/<script type="application\/json" id="cal-data">([\s\S]*?)<\/script>/);
      var syncMatch = html.match(/var LAST_SYNC = "([^"]*)";/);
      if (!dataMatch || !syncMatch) return;
      var newSyncNote = syncMatch[1] ? "Atualizado a partir da planilha em " + syncMatch[1] : "";
      if (newSyncNote === lastSyncSeen) return; // nothing new published since we loaded
      var newEntries;
      try { newEntries = JSON.parse(dataMatch[1]); } catch (e) { return; }
      if (!Array.isArray(newEntries)) return;
      entries = newEntries;
      lastSyncSeen = newSyncNote;
      document.getElementById("syncNote").textContent = newSyncNote;
      render();
      showToast("Calendário atualizado com os dados mais recentes.");
    }).catch(function () { /* silent — tenta de novo no próximo ciclo */ });
  }
  setInterval(pollForUpdates, 60000);
```

Replace with:

```js
  /* ---------------- live refresh ---------------- */
  function pollForUpdates() {
    fetchEntries().then(function (newEntries) {
      if (JSON.stringify(newEntries) === JSON.stringify(entries)) return;
      entries = newEntries;
      render();
    }).catch(function () { /* silent — tenta de novo no próximo ciclo */ });
  }
  setInterval(pollForUpdates, 25000);
```

- [ ] **Step 8: Load real data on init instead of assuming it's already populated**

Find:

```js
  /* ---------------- init ---------------- */
  renderLegend();
  render();
  var LAST_SYNC = "__LAST_SYNC__";
  if (LAST_SYNC && LAST_SYNC.indexOf("{{") !== 0) {
    document.getElementById("syncNote").textContent = "Atualizado a partir da planilha em " + LAST_SYNC;
  }
})();
```

Replace with:

```js
  /* ---------------- init ---------------- */
  renderLegend();
  render();
  fetchEntries().then(function (loaded) {
    entries = loaded;
    render();
  }).catch(function () {
    showToast("Não foi possível carregar os dados agora.");
  });
})();
```

- [ ] **Step 9: Remove the now-unused static data script tag**

Find:

```html
<script type="application/json" id="cal-data">__CALENDAR_DATA__</script>
```

Delete this line entirely (data now comes exclusively from `/api/entries`).

- [ ] **Step 10: Verify with a static smoke test (mocked API, no server needed)**

Create `tests/frontend-static.spec.js`:

```js
const { test, expect } = require("@playwright/test");
const path = require("path");

test("calendar loads from API, shows add form, and posts add/remove", async ({ page }) => {
  const fileUrl = "file://" + path.join(__dirname, "..", "public", "index.html");
  const seedEntries = [{ id: "seed1", date: "2026-08-27", person: "jean", obra: "almada", createdAt: "x" }];
  const requests = [];

  await page.route("**/api/entries", async (route) => {
    const req = route.request();
    requests.push({ method: req.method(), body: req.postData() });
    if (req.method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entries: seedEntries }) });
    }
    // POST add or remove: just echo back seedEntries plus a fake new one for add
    const payload = JSON.parse(req.postData() || "{}");
    if (payload.op === "add") {
      const updated = seedEntries.concat([{ id: "new1", date: payload.date, person: payload.person, obra: payload.obra, createdAt: "y" }]);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entries: updated }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entries: [] }) });
  });

  await page.goto(fileUrl);
  await page.waitForTimeout(300);

  const chipCount = await page.locator(".entry-chip").count();
  expect(chipCount).toBeGreaterThan(0);

  await page.locator('[data-action="open-day"][data-date="2026-08-27"]').first().click();
  await page.waitForTimeout(200);

  await expect(page.locator("#addForm")).toHaveCount(1);
  await page.locator('input[name="modal-person"][value="pedro"]').check();
  await page.locator('input[name="modal-obra"][value="montebello"]').check();
  await page.locator("#addBtn").click();
  await page.waitForTimeout(300);

  const addReq = requests.find((r) => r.method === "POST" && JSON.parse(r.body).op === "add");
  expect(addReq).toBeTruthy();
  const addBody = JSON.parse(addReq.body);
  expect(addBody).toMatchObject({ op: "add", date: "2026-08-27", person: "pedro", obra: "montebello" });

  const rmButtonCount = await page.locator(".rm").count();
  expect(rmButtonCount).toBeGreaterThan(0);
});
```

Run: `cd /tmp/agenda-obras-site && npx playwright test tests/frontend-static.spec.js --project=chromium 2>&1 || node_modules/.bin/playwright test tests/frontend-static.spec.js`

If `@playwright/test` is not installed, run `npm install -D @playwright/test` first (Chromium itself is already available in this environment at `/opt/pw-browsers/chromium` — no browser download needed, but if the test runner still tries to fetch one, set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and point `playwright.config.js` `use.launchOptions.executablePath` to `/opt/pw-browsers/chromium`).

Expected: 1 passed.

- [ ] **Step 11: Commit**

```bash
cd /tmp/agenda-obras-site
git add public/index.html tests/frontend-static.spec.js package.json package-lock.json
git commit -m "feat: wire frontend to /api/entries, restore add/remove UI"
```

---

## Task 6: Local integration test against `netlify dev`

**Files:**
- Test: `tests/frontend-live.spec.js`

**Interfaces:**
- Consumes: the real `netlify dev` server (frontend + function + local Blobs emulation together) — this is the first test exercising Task 3's `exports.handler` and Task 5's frontend against each other for real, not mocked.

- [ ] **Step 1: Start `netlify dev` in the background**

Run: `cd /tmp/agenda-obras-site && NETLIFY_AUTH_TOKEN=<token> nohup npx netlify dev --port 8888 > /tmp/netlify-dev.log 2>&1 &`
(Use the token the user provided; do not write it into any file — pass only as an env var on this command line.)

Wait a few seconds, then check: `curl -s http://localhost:8888/api/entries` should return `{"entries":[]}` (or a 200 with a JSON body — empty is fine on first run).

If this fails, read `/tmp/netlify-dev.log` for the actual error before proceeding — do not guess.

- [ ] **Step 2: Write the live integration test**

Create `tests/frontend-live.spec.js`:

```js
const { test, expect } = require("@playwright/test");

const BASE = process.env.AGENDA_BASE_URL || "http://localhost:8888";

test("full add/remove cycle persists through the real API", async ({ page }) => {
  await page.goto(BASE);
  await page.waitForTimeout(500);

  await page.locator('[data-action="open-day"][data-date="2026-08-27"]').first().click();
  await page.waitForTimeout(200);
  await page.locator('input[name="modal-person"][value="gustavo"]').check();
  await page.locator('input[name="modal-obra"][value="porto"]').check();
  await page.locator("#addBtn").click();
  await page.waitForTimeout(500);

  await expect(page.locator(".current-list")).toContainText("Gustavo");

  await page.reload();
  await page.waitForTimeout(500);
  await page.locator('[data-action="open-day"][data-date="2026-08-27"]').first().click();
  await page.waitForTimeout(200);
  await expect(page.locator(".current-list")).toContainText("Gustavo");

  const rmButton = page.locator('.rm[data-id]').first();
  const idToRemove = await rmButton.getAttribute("data-id");
  await rmButton.click();
  await page.waitForTimeout(500);

  const res = await page.request.get(BASE + "/api/entries");
  const body = await res.json();
  const stillThere = body.entries.some((en) => en.id === idToRemove);
  expect(stillThere).toBe(false);
});
```

- [ ] **Step 3: Run the test**

Run: `cd /tmp/agenda-obras-site && npx playwright test tests/frontend-live.spec.js --project=chromium`
Expected: 1 passed. If it fails, check `/tmp/netlify-dev.log` — a common cause is Blobs not being available under local `netlify dev` without a linked site; if so, note the exact error and fall back to testing against the deployed site directly in Task 8 instead of blocking here.

- [ ] **Step 4: Stop the dev server**

Run: `pkill -f "netlify dev"` (or find the PID via `jobs -l` / `ps aux | grep netlify` and `kill` it).

- [ ] **Step 5: Commit**

```bash
cd /tmp/agenda-obras-site
git add tests/frontend-live.spec.js
git commit -m "test: end-to-end add/remove/persist cycle against netlify dev"
```

---

## Task 7: Deploy, migrate existing data, verify in production

**Files:**
- None created — this task operates the already-built site.

**Interfaces:**
- Consumes: the complete site from Tasks 1–6.
- Produces: a live public Netlify URL serving the working calendar.

- [ ] **Step 1: Create the Netlify site and deploy**

Run (token passed only as an env var, never written to a file):

```bash
cd /tmp/agenda-obras-site
export NETLIFY_AUTH_TOKEN=<token>
npx netlify init --manual   # or: npx netlify sites:create --name agenda-obras-blendi
npx netlify deploy --prod --dir=public --functions=netlify/functions
```

Record the production URL printed at the end (`Website URL:` / `Unique Deploy URL:`).

- [ ] **Step 2: Verify the live API works**

Run: `curl -s https://<production-url>/api/entries`
Expected: `{"entries":[]}` (200 OK, valid JSON).

If this fails, read the function's deploy log via `npx netlify functions:log entries` (or the Netlify dashboard) before making any change — do not guess at a fix.

- [ ] **Step 3: Migrate the 6 existing entries from the Excel sheet**

These are the current contents of the "Agenda" sheet in `agenda_de_obras.xlsx` (already read earlier this session) — post each as a separate `add` call:

```bash
BASE="https://<production-url>"
post() { curl -s -X POST "$BASE/api/entries" -H "content-type: application/json" -d "$1" > /dev/null; }
post '{"op":"add","date":"2026-08-27","person":"pedro","obra":"montebello"}'
post '{"op":"add","date":"2026-08-27","person":"pedro","obra":"miraggio"}'
post '{"op":"add","date":"2026-08-27","person":"jean","obra":"montebello"}'
post '{"op":"add","date":"2026-08-27","person":"jean","obra":"miraggio"}'
post '{"op":"add","date":"2026-08-25","person":"pedro","obra":"palmeiras"}'
post '{"op":"add","date":"2026-08-25","person":"pedro","obra":"tulipas"}'
```

- [ ] **Step 4: Verify the migration**

Run: `curl -s https://<production-url>/api/entries`
Expected: JSON with exactly 6 entries matching the data above.

- [ ] **Step 5: Run the live Playwright test against production**

Run: `cd /tmp/agenda-obras-site && AGENDA_BASE_URL=https://<production-url> npx playwright test tests/frontend-live.spec.js --project=chromium`

Note: this test adds and then removes a Gustavo/Porto entry as a side effect — that's expected and leaves production data as it was (6 entries) afterward.

Expected: 1 passed.

- [ ] **Step 6: Commit the recorded production URL**

Add the production URL to `docs/superpowers/specs/2026-08-27-agenda-obras-netlify-design.md` under a new `## URL de produção` section at the end of the file (one line, the URL), then:

```bash
cd /tmp/agenda-obras-site
git add docs/superpowers/specs/2026-08-27-agenda-obras-netlify-design.md
git commit -m "docs: record production URL"
```

---

## Self-Review Notes

- **Spec coverage:** frontend live-edit UI → Task 5; serverless function + Blobs → Task 3; fixed people/obra lists validated → Task 2; migration of the 6 existing entries → Task 7 Step 3; no-auth / no-realtime-push / accepted-concurrency-risk → carried as Global Constraints, not implemented as features (correct — spec lists them as explicit non-goals); token handling → Global Constraints + every deploy step passes it as an env var, never written to a file.
- **Placeholder scan:** no TBD/TODO; every step has literal code or an exact runnable command.
- **Type consistency:** `Entry` shape (`id, date, person, obra, createdAt`) is identical across Task 2 (logic), Task 3 (function + its tests), and Task 5 (frontend fetch handlers). Function names (`fetchEntries`, `submitAdd`, `submitRemove`, `validateEntry`, `addEntry`, `removeEntry`, `makeHandler`) are used consistently in every task that references them.
