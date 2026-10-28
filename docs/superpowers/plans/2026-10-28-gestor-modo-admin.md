# Agenda de Obras 2.1 — Gestor, notificações e modo administrador — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o perfil Gestor (Leonardo), um quadro de notificações privadas e o modo administrador ligável (15 min) do Pedro.

**Architecture:** O servidor decide tudo pelo *papel efetivo* (`effectiveRole`): admin fora do modo admin vale `user`. O prazo do modo admin fica no registro do usuário (`elevatedUntil`). Notificações ficam na chave `notices` do Blobs, numa função nova (`notices.js`) com lógica pura em `lib/notices-logic.js`. A tela só reflete o que o servidor devolve.

**Tech Stack:** Netlify Functions (Node, CommonJS), Netlify Blobs, HTML/JS puro em `public/index.html`, `node --test`, Playwright (stub de API).

**Spec:** `docs/superpowers/specs/2026-10-28-gestor-modo-admin-design.md`

## Global Constraints

- Nada de dependência nova (só Node padrão). Funções só em arquivos de topo de `netlify/functions/`; helpers em `netlify/functions/lib/`.
- Mensagens ao usuário em português. O servidor devolve `{ error }` com 400/401/403/404.
- As 5 pessoas (`PEOPLE`) não mudam; "semana liberada" continua sendo as 5 confirmadas. O gestor não conta.
- Modo admin: 15 minutos (`ELEVATION_MS = 15 * 60 * 1000`), sem renovação automática.
- Notificação: texto aparado de 1 a 500 caracteres; 1 a 5 destinatários de `PEOPLE`, sem repetir e sem o remetente; limpeza de lidas com mais de 60 dias ao enviar; teto de 500 avisos guardados.
- Notificações ficam fora do backup/restauração.
- Os arquivos usam CRLF no Windows: sempre editar com `.git/patchlib.py` (`patch`, `replace_between`), nunca `sed -i` em `index.html`.
- Convenção deste repositório: `.git/agenda-helpers.sh` (`fixlocks`, `ga`, `gc`) para commits; testes de navegador rodam na nuvem com `/tmp/runpw.sh`.
- Branch: `feature/gestor-modo-admin`. Nada é enviado ao GitHub nesta fase.

---

### Task 1: Papéis, gestor e modo administrador na lógica de usuários

**Files:**
- Modify: `netlify/functions/lib/people.js`
- Modify: `netlify/functions/lib/users-logic.js`
- Modify: `tests/unit/helpers/auth-helpers.js`
- Create: `tests/unit/roles.test.js`

**Interfaces:**
- Produces: `MANAGERS` (`[{id:"leonardo", name:"Leonardo", role:"Gestor"}]`); em `users-logic`: `ELEVATION_MS`, `seedUsers(initialPassword, people, adminIds, managers?)`, `ensureManagers(users, initialPassword, managers) -> users` (mesmo objeto se nada falta), `effectiveRole(rec, nowMs) -> "admin"|"user"|"manager"`, `publicUser(rec, nowMs?)` (admin ganha `canElevate` e `elevatedUntil`), `elevate(users, id, nowMs)`, `unelevate(users, id)`; `changePassword`/`resetPassword` zeram `elevatedUntil`.

- [ ] **Step 1: Escrever o teste que falha**

```bash
cat > tests/unit/roles.test.js <<'EOF'
const test = require("node:test");
const assert = require("node:assert/strict");
const U = require("../../netlify/functions/lib/users-logic");
const { PEOPLE, ADMIN_IDS, MANAGERS } = require("../../netlify/functions/lib/people");
const { verifyPassword } = require("../../netlify/functions/lib/passwords");

const INITIAL = "Mudar@123";
const NOW = Date.UTC(2026, 9, 28, 13, 0, 0);

function ready() {
  const users = U.seedUsers(INITIAL, PEOPLE, ADMIN_IDS, MANAGERS);
  Object.keys(users).forEach(function (id) { users[id].mustChange = false; });
  return users;
}

test("MANAGERS lists Leonardo and PEOPLE stays with the five", function () {
  assert.deepEqual(MANAGERS.map(function (m) { return m.id; }), ["leonardo"]);
  assert.equal(PEOPLE.length, 5);
});

test("seedUsers gives the roles admin, user and manager", function () {
  const users = U.seedUsers(INITIAL, PEOPLE, ADMIN_IDS, MANAGERS);
  assert.equal(users.pedro.role, "admin");
  assert.equal(users.jean.role, "user");
  assert.equal(users.leonardo.role, "manager");
  assert.equal(users.leonardo.mustChange, true);
  assert.equal(verifyPassword(INITIAL, users.leonardo), true);
});

test("seedUsers still works with three arguments (no managers)", function () {
  const users = U.seedUsers(INITIAL, PEOPLE, ADMIN_IDS);
  assert.deepEqual(Object.keys(users).sort(), ["bruna", "gustavo", "haniel", "jean", "pedro"]);
});

test("ensureManagers adds only the missing manager and keeps the others untouched", function () {
  const old = U.seedUsers(INITIAL, PEOPLE, ADMIN_IDS);
  old.jean.pv = 7;
  const next = U.ensureManagers(old, INITIAL, MANAGERS);
  assert.notEqual(next, old);
  assert.equal(next.leonardo.role, "manager");
  assert.equal(next.leonardo.mustChange, true);
  assert.equal(next.jean, old.jean);
  assert.equal(next.jean.pv, 7);
});

test("ensureManagers returns the very same object when nobody is missing", function () {
  const users = ready();
  assert.equal(U.ensureManagers(users, INITIAL, MANAGERS), users);
});

test("effectiveRole: admin is a regular user until the admin mode is on", function () {
  const users = ready();
  assert.equal(U.effectiveRole(users.pedro, NOW), "user");
  assert.equal(U.effectiveRole(Object.assign({}, users.pedro, { elevatedUntil: NOW + 1000 }), NOW), "admin");
  assert.equal(U.effectiveRole(Object.assign({}, users.pedro, { elevatedUntil: NOW }), NOW), "user");
  assert.equal(U.effectiveRole(Object.assign({}, users.pedro, { elevatedUntil: NOW - 1 }), NOW), "user");
  assert.equal(U.effectiveRole(users.jean, NOW), "user");
  assert.equal(U.effectiveRole(users.leonardo, NOW), "manager");
});

test("publicUser exposes canElevate/elevatedUntil only for the admin", function () {
  const users = ready();
  assert.deepEqual(U.publicUser(users.jean, NOW), { id: "jean", name: "Jean", role: "user", mustChange: false });
  assert.deepEqual(U.publicUser(users.leonardo, NOW), { id: "leonardo", name: "Leonardo", role: "manager", mustChange: false });
  assert.deepEqual(U.publicUser(users.pedro, NOW), { id: "pedro", name: "Pedro", role: "user", mustChange: false, canElevate: true, elevatedUntil: 0 });
  const on = Object.assign({}, users.pedro, { elevatedUntil: NOW + 5000 });
  assert.deepEqual(U.publicUser(on, NOW), { id: "pedro", name: "Pedro", role: "admin", mustChange: false, canElevate: true, elevatedUntil: NOW + 5000 });
});

test("elevate gives 15 minutes to the admin only", function () {
  const users = ready();
  const res = U.elevate(users, "pedro", NOW);
  assert.equal(res.ok, true);
  assert.equal(res.user.elevatedUntil, NOW + U.ELEVATION_MS);
  assert.equal(res.users.pedro.elevatedUntil, NOW + 15 * 60 * 1000);
  assert.equal(U.elevate(users, "jean", NOW).status, 403);
  assert.equal(U.elevate(users, "leonardo", NOW).status, 403);
  assert.equal(U.elevate({ pedro: Object.assign({}, users.pedro, { mustChange: true }) }, "pedro", NOW).status, 403);
});

test("unelevate zeroes the deadline and is a no-op when already off", function () {
  const users = U.elevate(ready(), "pedro", NOW).users;
  const off = U.unelevate(users, "pedro");
  assert.equal(off.ok, true);
  assert.equal(off.users.pedro.elevatedUntil, 0);
  const again = U.unelevate(off.users, "pedro");
  assert.equal(again.users, off.users);
});

test("changing or resetting a password also turns the admin mode off", function () {
  const on = U.elevate(ready(), "pedro", NOW).users;
  const changed = U.changePassword(on, "pedro", INITIAL, "NovaSenha123", INITIAL);
  assert.equal(changed.ok, true);
  assert.equal(changed.user.elevatedUntil, 0);
  const reset = U.resetPassword(on, "pedro", INITIAL);
  assert.equal(reset.user.elevatedUntil, 0);
});
EOF
node --test tests/unit/roles.test.js 2>&1 | grep -E "^# (pass|fail)"
```

Expected: FAIL (`MANAGERS`/`ensureManagers`/`effectiveRole`... não existem ainda).

- [ ] **Step 2: Implementar (people, users-logic, helper de testes)**

```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch

patch("netlify/functions/lib/people.js", [(
'const ADMIN_IDS = ["pedro"];\n\nmodule.exports = { PEOPLE, ADMIN_IDS };',
'''const ADMIN_IDS = ["pedro"];

// Gestores: entram com login, acompanham tudo (só leitura) e mandam avisos.
// Não são "pessoas" da agenda: não marcam presença e não contam na semana liberada.
const MANAGERS = [
  { id: "leonardo", name: "Leonardo", role: "Gestor" }
];

module.exports = { PEOPLE, ADMIN_IDS, MANAGERS };''')])

patch("netlify/functions/lib/users-logic.js", [
('const LOCK_MS = 15 * 60 * 1000;\n',
 'const LOCK_MS = 15 * 60 * 1000;\nconst ELEVATION_MS = 15 * 60 * 1000;\n'),
('''function seedUsers(initialPassword, people, adminIds) {
  const users = {};
  people.forEach(function (p) {
    const h = hashPassword(initialPassword);
    users[p.id] = {
      id: p.id, name: p.name, role: adminIds.indexOf(p.id) >= 0 ? "admin" : "user",
      salt: h.salt, hash: h.hash, mustChange: true, pv: 1, failed: 0, lockedUntil: 0
    };
  });
  return users;
}

function publicUser(rec) {
  return { id: rec.id, name: rec.name, role: rec.role, mustChange: !!rec.mustChange };
}
''',
'''function newRecord(p, role, initialPassword) {
  const h = hashPassword(initialPassword);
  return {
    id: p.id, name: p.name, role: role,
    salt: h.salt, hash: h.hash, mustChange: true, pv: 1, failed: 0, lockedUntil: 0
  };
}

function seedUsers(initialPassword, people, adminIds, managers) {
  const users = {};
  people.forEach(function (p) {
    users[p.id] = newRecord(p, adminIds.indexOf(p.id) >= 0 ? "admin" : "user", initialPassword);
  });
  (managers || []).forEach(function (m) {
    users[m.id] = newRecord(m, "manager", initialPassword);
  });
  return users;
}

// Completa um cadastro antigo com os gestores que faltam; devolve o MESMO objeto se nada falta.
function ensureManagers(users, initialPassword, managers) {
  let next = users;
  (managers || []).forEach(function (m) {
    if (Object.prototype.hasOwnProperty.call(next, m.id)) return;
    if (next === users) next = Object.assign({}, users);
    next[m.id] = newRecord(m, "manager", initialPassword);
  });
  return next;
}

// O administrador só age como administrador enquanto o modo administrador estiver ligado.
function effectiveRole(rec, nowMs) {
  if (rec.role === "admin") return rec.elevatedUntil > nowMs ? "admin" : "user";
  return rec.role;
}

function publicUser(rec, nowMs) {
  const now = nowMs === undefined ? Date.now() : nowMs;
  const out = { id: rec.id, name: rec.name, role: effectiveRole(rec, now), mustChange: !!rec.mustChange };
  if (rec.role === "admin") {
    out.canElevate = true;
    out.elevatedUntil = rec.elevatedUntil > now ? rec.elevatedUntil : 0;
  }
  return out;
}
'''),
('''    salt: h.salt, hash: h.hash, mustChange: false, pv: rec.pv + 1, failed: 0, lockedUntil: 0
  });''',
'''    salt: h.salt, hash: h.hash, mustChange: false, pv: rec.pv + 1, failed: 0, lockedUntil: 0, elevatedUntil: 0
  });'''),
('''    salt: h.salt, hash: h.hash, mustChange: true, pv: rec.pv + 1, failed: 0, lockedUntil: 0
  });
  return { ok: true, users: withUser(users, updated), user: updated };
}

module.exports = { MAX_FAILED, LOCK_MS, MIN_LENGTH, seedUsers, publicUser, authenticate, changePassword, resetPassword };''',
'''    salt: h.salt, hash: h.hash, mustChange: true, pv: rec.pv + 1, failed: 0, lockedUntil: 0, elevatedUntil: 0
  });
  return { ok: true, users: withUser(users, updated), user: updated };
}

function elevate(users, id, nowMs) {
  const rec = users[id];
  if (!rec || rec.role !== "admin") {
    return { ok: false, status: 403, error: "apenas o administrador pode ligar o modo administrador" };
  }
  if (rec.mustChange) return { ok: false, status: 403, error: "troque a senha antes de continuar" };
  const updated = Object.assign({}, rec, { elevatedUntil: nowMs + ELEVATION_MS });
  return { ok: true, users: withUser(users, updated), user: updated };
}

function unelevate(users, id) {
  const rec = users[id];
  if (!rec || !rec.elevatedUntil) return { ok: true, users: users, user: rec };
  const updated = Object.assign({}, rec, { elevatedUntil: 0 });
  return { ok: true, users: withUser(users, updated), user: updated };
}

module.exports = {
  MAX_FAILED, LOCK_MS, MIN_LENGTH, ELEVATION_MS,
  seedUsers, ensureManagers, effectiveRole, publicUser, authenticate, changePassword, resetPassword, elevate, unelevate
};''')])

patch("tests/unit/helpers/auth-helpers.js", [
('const { PEOPLE, ADMIN_IDS } = require(', 'const { PEOPLE, ADMIN_IDS, MANAGERS } = require('),
('seeded = seedUsers(INITIAL, PEOPLE, ADMIN_IDS);', 'seeded = seedUsers(INITIAL, PEOPLE, ADMIN_IDS, MANAGERS);'),
('''  Object.keys(users).forEach(function (id) { users[id].mustChange = false; });
  return users;''',
'''  Object.keys(users).forEach(function (id) { users[id].mustChange = false; });
  // O administrador vira "comum" fora do modo administrador; nos testes ele já começa com o modo ligado.
  users.pedro.elevatedUntil = NOW + 60 * 60 * 1000;
  return users;''')])

# testes antigos que esperavam o papel "admin" sem modo ligado
patch("tests/unit/auth.test.js", [(
'  assert.equal(res.body.user.role, "admin");',
'  assert.equal(res.body.user.role, "user");\n  assert.equal(res.body.user.canElevate, true);')])
patch("tests/unit/users-logic.test.js", [(
'test("publicUser exposes only id, name, role and mustChange", function () {\n  assert.deepEqual(U.publicUser(fresh().pedro), { id: "pedro", name: "Pedro", role: "admin", mustChange: true });',
'test("publicUser exposes only id, name, role and mustChange (plus canElevate/elevatedUntil for the admin)", function () {\n  assert.deepEqual(U.publicUser(fresh().pedro, 1), { id: "pedro", name: "Pedro", role: "user", mustChange: true, canElevate: true, elevatedUntil: 0 });')])
PY
node --test tests/unit/roles.test.js tests/unit/users-logic.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```

Expected: `roles.test.js` e `users-logic.test.js` passam (0 fail).

- [ ] **Step 3: Commit**

Run (prefixo): `ga netlify tests && gc "feat(users): gestor, papel efetivo e modo administrador na lógica de usuários"`

---

### Task 2: Servidor de autenticação — Leonardo entra, Pedro liga e desliga o modo administrador

**Files:**
- Modify: `netlify/functions/lib/auth-core.js`
- Modify: `netlify/functions/auth.js`
- Create: `tests/unit/auth-elevation.test.js`

**Interfaces:**
- Consumes: `MANAGERS`; `ensureManagers`, `effectiveRole`, `elevate`, `unelevate`, `publicUser(rec, nowMs)` (Task 1).
- Produces: `A.actingUser(event, users, settings) -> rec com role efetivo | null` (usado nas Tasks 3 e 4); `A.resolveUserId` aceita `leonardo`; ops de `POST /api/auth`: `elevate`, `unelevate` (resposta `{ user }`); `logout` desliga o modo; `loadUsers` completa cadastro antigo com o Leonardo.

- [ ] **Step 1: Escrever o teste que falha**

```bash
cat > tests/unit/auth-elevation.test.js <<'EOF'
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeHandler } = require("../../netlify/functions/auth");
const H = require("./helpers/auth-helpers");
const { makeFakeStore } = require("./helpers/fake-store");
const U = require("../../netlify/functions/lib/users-logic");
const { PEOPLE, ADMIN_IDS } = require("../../netlify/functions/lib/people");

const QUARTER = 15 * 60 * 1000;

function commonSetup() {
  const users = H.readyUsers();
  users.pedro.elevatedUntil = 0;
  const store = H.storeWith([], { users: users });
  const handler = makeHandler(store, H.OPTS);
  const as = function (id) { return H.cookieFor(store.data.users, id); };
  return { store: store, handler: handler, as: as };
}

async function me(s, id) {
  const res = await s.handler(H.event("GET", undefined, s.as(id)));
  return JSON.parse(res.body).user;
}

test("Leonardo logs in with the initial password and is forced to change it", async function () {
  const store = makeFakeStore([], {});
  const handler = makeHandler(store, H.OPTS);
  const res = await H.call(handler, { op: "login", user: "leonardo", password: H.INITIAL });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.user, { id: "leonardo", name: "Leonardo", role: "manager", mustChange: true });
});

test("an old users record without Leonardo gets him added (once) at the next login", async function () {
  const old = U.seedUsers(H.INITIAL, PEOPLE, ADMIN_IDS);
  const store = makeFakeStore([], { users: old });
  const handler = makeHandler(store, H.OPTS);
  const res = await H.call(handler, { op: "login", user: "leonardo", password: H.INITIAL });
  assert.equal(res.status, 200);
  assert.equal(store.data.users.leonardo.role, "manager");
  assert.equal(store.data.users.jean.hash, old.jean.hash);
});

test("Pedro starts as a regular user and can elevate", async function () {
  const s = commonSetup();
  assert.deepEqual(await me(s, "pedro"), { id: "pedro", name: "Pedro", role: "user", mustChange: false, canElevate: true, elevatedUntil: 0 });
  const res = await H.call(s.handler, { op: "elevate" }, s.as("pedro"));
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, "admin");
  assert.equal(res.body.user.elevatedUntil, H.NOW + QUARTER);
  assert.equal(s.store.data.users.pedro.elevatedUntil, H.NOW + QUARTER);
  assert.equal((await me(s, "pedro")).role, "admin");
});

test("elevate is for the administrator only and needs a session", async function () {
  const s = commonSetup();
  assert.equal((await H.call(s.handler, { op: "elevate" }, s.as("jean"))).status, 403);
  assert.equal((await H.call(s.handler, { op: "elevate" }, s.as("leonardo"))).status, 403);
  assert.equal((await H.call(s.handler, { op: "elevate" })).status, 401);
  assert.equal((await H.call(s.handler, { op: "unelevate" })).status, 401);
});

test("unelevate turns the mode off right away", async function () {
  const s = commonSetup();
  await H.call(s.handler, { op: "elevate" }, s.as("pedro"));
  const res = await H.call(s.handler, { op: "unelevate" }, s.as("pedro"));
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, "user");
  assert.equal(res.body.user.elevatedUntil, 0);
  assert.equal(s.store.data.users.pedro.elevatedUntil, 0);
});

test("an expired deadline means regular user again", async function () {
  const s = commonSetup();
  s.store.data.users.pedro.elevatedUntil = H.NOW - 1;
  const u = await me(s, "pedro");
  assert.equal(u.role, "user");
  assert.equal(u.elevatedUntil, 0);
});

test("logout and password change turn the admin mode off", async function () {
  const s = commonSetup();
  await H.call(s.handler, { op: "elevate" }, s.as("pedro"));
  const out = await H.call(s.handler, { op: "logout" }, s.as("pedro"));
  assert.equal(out.status, 200);
  assert.equal(s.store.data.users.pedro.elevatedUntil, 0);

  const s2 = commonSetup();
  await H.call(s2.handler, { op: "elevate" }, s2.as("pedro"));
  const ch = await H.call(s2.handler, { op: "changePassword", current: H.INITIAL, next: "OutraSenha123" }, s2.as("pedro"));
  assert.equal(ch.status, 200);
  assert.equal(s2.store.data.users.pedro.elevatedUntil, 0);
});
EOF
node --test tests/unit/auth-elevation.test.js 2>&1 | grep -E "^# (pass|fail)"
```

Expected: FAIL (Leonardo não loga; `elevate` devolve 400 "op inválida").

- [ ] **Step 2: Implementar**

```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch

# testes antigos que contavam 5 usuários no primeiro cadastro (agora são 5 pessoas + Leonardo)
patch("tests/unit/auth-core.test.js", [
('seeds the five users on the first call', 'seeds the five people and the manager on the first call'),
('["pedro", "jean", "haniel", "gustavo", "bruna"]);\n  assert.deepEqual(store.data.users, first);', '["pedro", "jean", "haniel", "gustavo", "bruna", "leonardo"]);\n  assert.deepEqual(store.data.users, first);')])
patch("tests/unit/auth.test.js", [('assert.equal(Object.keys(store.data.users).length, 5);', 'assert.equal(Object.keys(store.data.users).length, 6);')])

patch("netlify/functions/lib/auth-core.js", [
('const { PEOPLE, ADMIN_IDS } = require("./people");\nconst { seedUsers } = require("./users-logic");',
 'const { PEOPLE, ADMIN_IDS, MANAGERS } = require("./people");\nconst { seedUsers, ensureManagers, effectiveRole } = require("./users-logic");'),
('  return PEOPLE.some(function (p) { return p.id === id; }) ? id : null;',
 '  return PEOPLE.concat(MANAGERS).some(function (p) { return p.id === id; }) ? id : null;'),
('''  let users = await readUsers(store);
  if (!users) {
    users = seedUsers(settings.initialPassword, PEOPLE, ADMIN_IDS);
    await store.setJSON(USERS_KEY, users);
  }
  return users;
}''',
'''  const users = await readUsers(store);
  if (!users) {
    const fresh = seedUsers(settings.initialPassword, PEOPLE, ADMIN_IDS, MANAGERS);
    await store.setJSON(USERS_KEY, fresh);
    return fresh;
  }
  // Cadastro criado antes do gestor existir: completa uma única vez.
  const complete = ensureManagers(users, settings.initialPassword, MANAGERS);
  if (complete !== users) await store.setJSON(USERS_KEY, complete);
  return complete;
}'''),
('''function sessionCookieFor(rec, settings) {''',
'''// Quem age agora: o mesmo registro, mas com o papel EFETIVO (admin fora do modo administrador vale "user").
function actingUser(event, users, settings) {
  const rec = currentUser(event, users, settings);
  return rec ? Object.assign({}, rec, { role: effectiveRole(rec, settings.now()) }) : null;
}

function sessionCookieFor(rec, settings) {'''),
('resolveUserId, readUsers, loadUsers, currentUser, sessionCookieFor', 'resolveUserId, readUsers, loadUsers, currentUser, actingUser, sessionCookieFor')])

patch("netlify/functions/auth.js", [
('''function makeHandler(store, opts) {''',
'''// Ao sair, o modo administrador desliga: a próxima entrada começa em modo comum.
async function dropElevation(store, event, settings) {
  try {
    if (A.configProblem(settings) || !A.header(event, "cookie")) return;
    const users = await A.readUsers(store);
    const rec = users ? A.currentUser(event, users, settings) : null;
    if (!rec || !rec.elevatedUntil) return;
    await store.setJSON(A.USERS_KEY, U.unelevate(users, rec.id).users);
  } catch (e) {
    // sair nunca deve falhar por causa disso
  }
}

function makeHandler(store, opts) {'''),
('return A.json(200, { user: rec ? U.publicUser(rec) : null });',
 'return A.json(200, { user: rec ? U.publicUser(rec, settings.now()) : null });'),
('''    if (payload.op === "logout") {
      return A.json(''',
'''    if (payload.op === "logout") {
      await dropElevation(store, event, settings);
      return A.json('''),
('''      if (!res.ok) return A.json(res.status, { error: res.error });
      return A.json(200, { user: U.publicUser(res.user) }''',
'''      if (!res.ok) return A.json(res.status, { error: res.error });
      return A.json(200, { user: U.publicUser(res.user, settings.now()) }'''),
('''      await store.setJSON(A.USERS_KEY, res.users);
      return A.json(200, { user: U.publicUser(res.user) }''',
'''      await store.setJSON(A.USERS_KEY, res.users);
      return A.json(200, { user: U.publicUser(res.user, settings.now()) }'''),
('''    return A.json(400, { error: "op inválida (esperado 'login', 'logout' ou 'changePassword')" });''',
'''    if (payload.op === "elevate" || payload.op === "unelevate") {
      const rec = A.currentUser(event, users, settings);
      if (!rec) return A.json(401, { error: "faça login primeiro" });
      const res = payload.op === "elevate" ? U.elevate(users, rec.id, settings.now()) : U.unelevate(users, rec.id);
      if (!res.ok) return A.json(res.status, { error: res.error });
      if (res.users !== users) await store.setJSON(A.USERS_KEY, res.users);
      return A.json(200, { user: U.publicUser(res.user, settings.now()) });
    }

    return A.json(400, { error: "op inválida (esperado 'login', 'logout' ou 'changePassword')" });''')])
PY
sed -n 64,74p tests/unit/auth.test.js
node --test tests/unit/auth-elevation.test.js 2>&1 | grep -E "^# (pass|fail)|not ok"
```

- [ ] **Step 3: Rodar tudo**

```bash
node --test tests/unit/*.test.js 2>&1 | grep -E "^# (tests|pass|fail)|^not ok"
```

Expected: `auth-elevation` passa; o teste antigo do login do Pedro já foi ajustado na Task 1 (`role: "user"` + `canElevate`); `admin`/`entries` seguem passando (o helper deixa o Pedro com o modo ligado, mas `admin.js`/`entries.js` só mudam na Task 3).

- [ ] **Step 4: Commit**

Run (prefixo): `ga netlify tests && gc "feat(auth): Leonardo entra; Pedro liga/desliga o modo administrador (15 min); sair e trocar senha desligam"`

---

### Task 3: Permissões — gestor só lê; admin comum vale como pessoa

**Files:**
- Modify: `netlify/functions/lib/access.js`
- Modify: `netlify/functions/entries.js`
- Modify: `netlify/functions/admin.js`
- Create: `tests/unit/permissions.test.js`

**Interfaces:**
- Consumes: `A.actingUser`, `U.effectiveRole` (Task 2).
- Produces: gestor recebe 403 em qualquer escrita na agenda ("o gestor acompanha a agenda, mas não altera marcações"); `admin.js` exige o modo ligado ("ligue o modo administrador para usar esta função").

- [ ] **Step 1: Escrever o teste que falha**

```bash
cat > tests/unit/permissions.test.js <<'EOF'
const test = require("node:test");
const assert = require("node:assert/strict");
const entries = require("../../netlify/functions/entries");
const admin = require("../../netlify/functions/admin");
const { authorize } = require("../../netlify/functions/lib/access");
const H = require("./helpers/auth-helpers");

function setup(elevated) {
  const users = H.readyUsers();
  if (!elevated) users.pedro.elevatedUntil = 0;
  const store = H.storeWith([], { users: users });
  return {
    store: store,
    entries: entries.makeHandler(store, H.OPTS),
    admin: admin.makeHandler(store, H.OPTS),
    as: function (id) { return H.cookieFor(store.data.users, id); }
  };
}

const CONFIRM_JEAN = { op: "confirmWeek", person: "jean", week: "2026-10-25" };

test("manager is denied every write, even on his own name", function () {
  const mgr = { id: "leonardo", role: "manager", mustChange: false };
  ["add", "addMany", "update", "remove", "confirmWeek", "unconfirmWeek"].forEach(function (op) {
    const res = authorize(mgr, { op: op, person: "leonardo", items: [] }, []);
    assert.equal(res.ok, false, op);
    assert.equal(res.status, 403, op);
    assert.match(res.error, /gestor acompanha/);
  });
});

test("manager can read everything: signed-in view, not the visitor view", async function () {
  const s = setup(false);
  const res = await s.entries(H.event("GET", undefined, s.as("leonardo")));
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).restricted, undefined);
});

test("manager POST through the handler gets 403", async function () {
  const s = setup(false);
  const res = await H.call(s.entries, CONFIRM_JEAN, s.as("leonardo"));
  assert.equal(res.status, 403);
});

test("Pedro in common mode only acts as himself", async function () {
  const s = setup(false);
  const other = await H.call(s.entries, CONFIRM_JEAN, s.as("pedro"));
  assert.equal(other.status, 403);
  assert.match(other.body.error, /suas próprias marcações/);
  const own = await H.call(s.entries, { op: "confirmWeek", person: "pedro", week: "2026-10-25" }, s.as("pedro"));
  assert.equal(own.status, 200);
});

test("Pedro in admin mode can act for anybody", async function () {
  const s = setup(true);
  const res = await H.call(s.entries, CONFIRM_JEAN, s.as("pedro"));
  assert.equal(res.status, 200);
});

test("admin functions need the admin mode ON", async function () {
  const off = setup(false);
  const denied = await H.call(off.admin, { op: "listBackups" }, off.as("pedro"));
  assert.equal(denied.status, 403);
  assert.match(denied.body.error, /ligue o modo administrador/);

  const on = setup(true);
  assert.equal((await H.call(on.admin, { op: "listBackups" }, on.as("pedro"))).status, 200);

  const jean = await H.call(on.admin, { op: "listBackups" }, on.as("jean"));
  assert.equal(jean.status, 403);
  assert.match(jean.body.error, /apenas o administrador/);
  assert.equal((await H.call(on.admin, { op: "listBackups" }, on.as("leonardo"))).status, 403);
});

test("admin mode can reset Leonardo's password", async function () {
  const s = setup(true);
  const res = await H.call(s.admin, { op: "resetPassword", user: "leonardo" }, s.as("pedro"));
  assert.equal(res.status, 200);
  assert.equal(res.body.user.id, "leonardo");
  assert.equal(res.body.user.mustChange, true);
});
EOF
node --test tests/unit/permissions.test.js 2>&1 | grep -E "^# (pass|fail)"
```

Expected: FAIL (gestor ainda não é barrado; modo desligado ainda age como admin).

- [ ] **Step 2: Implementar**

```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch

patch("netlify/functions/lib/access.js", [(
'''  if (user.role === "admin") return { ok: true };

  function own(person) {''',
'''  if (user.role === "manager") return deny(403, "o gestor acompanha a agenda, mas não altera marcações");
  if (user.role === "admin") return { ok: true };

  function own(person) {''')])

patch("netlify/functions/entries.js", [(
'    const user = A.currentUser(event, users, settings);\n    const state = await readState(store);',
'    const user = A.actingUser(event, users, settings);\n    const state = await readState(store);')])

patch("netlify/functions/admin.js", [(
'''    if (me.role !== "admin") return A.json(403, { error: "apenas o administrador" });''',
'''    if (U.effectiveRole(me, settings.now()) !== "admin") {
      return A.json(403, { error: me.role === "admin" ? "ligue o modo administrador para usar esta função" : "apenas o administrador" });
    }''')])
PY
node --test tests/unit/*.test.js 2>&1 | grep -E "^# (tests|pass|fail)|^not ok"
```

Expected: tudo passa (inclusive `admin.test.js`, `entries.test.js`, `access.test.js`).

- [ ] **Step 3: Commit**

Run (prefixo): `ga netlify tests && gc "feat(access): gestor só lê; administrador fora do modo vale como pessoa comum"`

---

### Task 4: Quadro de notificações no servidor

**Files:**
- Create: `netlify/functions/lib/notices-logic.js`
- Create: `netlify/functions/notices.js`
- Create: `tests/unit/notices-logic.test.js`
- Create: `tests/unit/notices.test.js`

**Interfaces:**
- Consumes: `A.loadUsers`, `A.currentUser`, `A.json`, `A.readJsonBody`, `A.configProblem`, `U.effectiveRole`, `PEOPLE`.
- Produces: `notices-logic`: `MAX_TEXT = 500`, `MAX_STORED = 500`, `READ_TTL_MS`, `validateSend(payload, senderId, people) -> {ok, text, to} | {ok:false,status,error}`, `buildNotices(from, to, text, nowIso)`, `addNotices(list, created, nowMs)`, `inboxFor(list, id)`, `sentBy(list, id)`, `markRead(list, id, userId, nowIso) -> {ok, list, changed} | {ok:false,status,error}`. `GET /api/notices` → `{ inbox, sent, canSend }`; `POST /api/notices` `{op:"send", to:[ids], text}` → `{ ok, sent: n }`; `{op:"markRead", id}` → `{ ok }`. Aviso: `{ id, from, to, text, createdAt, readAt }`.

- [ ] **Step 1: Escrever os testes que falham**

```bash
cat > tests/unit/notices-logic.test.js <<'EOF'
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
EOF

cat > tests/unit/notices.test.js <<'EOF'
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
EOF
node --test tests/unit/notices-logic.test.js tests/unit/notices.test.js 2>&1 | grep -E "^# (pass|fail)"
```

Expected: FAIL (módulos não existem).

- [ ] **Step 2: Implementar a lógica**

```bash
cat > netlify/functions/lib/notices-logic.js <<'EOF'
"use strict";

const crypto = require("crypto");

const MAX_TEXT = 500;
const MAX_STORED = 500;
const READ_TTL_MS = 60 * 24 * 60 * 60 * 1000;

function fail(status, error) {
  return { ok: false, status: status, error: error };
}

function validateSend(payload, senderId, people) {
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) return fail(400, "escreva a mensagem");
  if (text.length > MAX_TEXT) return fail(400, "mensagem longa demais (máximo " + MAX_TEXT + " caracteres)");
  if (!Array.isArray(payload.to) || payload.to.length === 0) return fail(400, "escolha pelo menos uma pessoa");
  const valid = people.map(function (p) { return p.id; });
  const to = [];
  for (var i = 0; i < payload.to.length; i++) {
    const id = payload.to[i];
    if (typeof id !== "string" || valid.indexOf(id) < 0 || id === senderId) return fail(400, "destinatário inválido");
    if (to.indexOf(id) < 0) to.push(id);
  }
  return { ok: true, text: text, to: to };
}

function buildNotices(from, to, text, nowIso) {
  return to.map(function (recipient) {
    return { id: crypto.randomBytes(8).toString("hex"), from: from, to: recipient, text: text, createdAt: nowIso, readAt: null };
  });
}

// Remove avisos lidos há mais de 60 dias, junta os novos e limita o total guardado.
function addNotices(list, created, nowMs) {
  const kept = list.filter(function (n) {
    return !n.readAt || nowMs - Date.parse(n.readAt) <= READ_TTL_MS;
  });
  const all = kept.concat(created);
  return all.length > MAX_STORED ? all.slice(all.length - MAX_STORED) : all;
}

function inboxFor(list, userId) {
  return list.filter(function (n) { return n.to === userId; }).reverse();
}

function sentBy(list, userId) {
  return list.filter(function (n) { return n.from === userId; }).reverse();
}

function markRead(list, id, userId, nowIso) {
  const index = list.findIndex(function (n) { return n.id === id && n.to === userId; });
  if (index < 0) return fail(404, "aviso não encontrado");
  if (list[index].readAt) return { ok: true, list: list, changed: false };
  const next = list.slice();
  next[index] = Object.assign({}, list[index], { readAt: nowIso });
  return { ok: true, list: next, changed: true };
}

module.exports = { MAX_TEXT, MAX_STORED, READ_TTL_MS, validateSend, buildNotices, addNotices, inboxFor, sentBy, markRead };
EOF
node --test tests/unit/notices-logic.test.js 2>&1 | grep -E "^# (pass|fail)|^not ok"
```

- [ ] **Step 3: Implementar a função**

```bash
cat > netlify/functions/notices.js <<'EOF'
"use strict";

const A = require("./lib/auth-core");
const U = require("./lib/users-logic");
const N = require("./lib/notices-logic");
const { PEOPLE } = require("./lib/people");
const { resolveStore } = require("./lib/store");

const NOTICES_KEY = "notices";

function makeHandler(store, opts) {
  const settings = A.readSettings(opts);

  return async function handler(event) {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") return A.json(405, { error: "método não suportado" });

    const problem = A.configProblem(settings);
    if (problem) return A.json(500, { error: problem });

    const users = await A.loadUsers(store, settings);
    const me = A.currentUser(event, users, settings);
    if (!me) return A.json(401, { error: "faça login" });
    if (me.mustChange) return A.json(403, { error: "troque a senha antes de continuar" });

    const role = U.effectiveRole(me, settings.now());
    const canSend = role === "admin" || role === "manager";
    const list = (await store.get(NOTICES_KEY, { type: "json" })) || [];

    if (event.httpMethod === "GET") {
      return A.json(200, { inbox: N.inboxFor(list, me.id), sent: N.sentBy(list, me.id), canSend: canSend });
    }

    const body = A.readJsonBody(event);
    if (!body.ok) return A.json(body.status, { error: body.error });
    const payload = body.payload;

    if (payload.op === "send") {
      if (!canSend) {
        return A.json(403, {
          error: me.role === "admin"
            ? "ligue o modo administrador para enviar notificações"
            : "apenas o gestor e o administrador enviam notificações"
        });
      }
      const check = N.validateSend(payload, me.id, PEOPLE);
      if (!check.ok) return A.json(check.status, { error: check.error });
      const created = N.buildNotices(me.id, check.to, check.text, new Date(settings.now()).toISOString());
      await store.setJSON(NOTICES_KEY, N.addNotices(list, created, settings.now()));
      return A.json(200, { ok: true, sent: created.length });
    }

    if (payload.op === "markRead") {
      const res = N.markRead(list, payload.id, me.id, new Date(settings.now()).toISOString());
      if (!res.ok) return A.json(res.status, { error: res.error });
      if (res.changed) await store.setJSON(NOTICES_KEY, res.list);
      return A.json(200, { ok: true });
    }

    return A.json(400, { error: "op inválida (esperado 'send' ou 'markRead')" });
  };
}

exports.handler = async function (event, context) {
  return makeHandler(resolveStore(process.env))(event, context);
};
exports.makeHandler = makeHandler;
EOF
node --test tests/unit/*.test.js 2>&1 | grep -E "^# (tests|pass|fail)|^not ok"
```

Expected: tudo passa. Conferir também que o backup não leva avisos: `backup-logic.js` só lê `entries` e `weeks`, então nada a mudar.

- [ ] **Step 4: Commit**

Run (prefixo): `ga netlify tests && gc "feat(notices): quadro de notificações privadas (Leonardo e Pedro em modo admin enviam; cada pessoa lê as suas)"`

---
