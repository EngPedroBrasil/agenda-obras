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

### Task 5: Tela — perfil do gestor (só leitura) e modo administrador

**Files:**
- Modify: `public/index.html` (CSS, `adminBar`, `onMeChanged`, `addAreaHTML`, `renderAuth`, `loginHTML`, `adminInnerHTML`, `weekStripHTML`, `toggleWeek`, ações de clique)

**Interfaces:**
- Consumes: `me.role` (`"user" | "manager" | "admin"`, já efetivo), `me.canElevate`, `me.elevatedUntil` (ms do servidor); `POST /api/auth` `elevate`/`unelevate` (Task 2).
- Produces: `isManager()`, `loginPeople()` (TEAM + Leonardo, só para login e zerar senha), `renderAdminBar()`, `doElevate(on)`, `formatClock(ms)`; ação de clique `elevate`/`unelevate`. Os testes de navegador chegam na Task 7.

- [ ] **Step 1: Aplicar as mudanças**

```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch

patch("public/index.html", [
# ---- CSS ----
(r"""  .toast.show { opacity: 1; }
""",
r"""  .toast.show { opacity: 1; }
  .auth-area { gap: 8px; }
  .admin-bar {
    margin: 0 0 12px; padding: 8px 12px; border-radius: 10px;
    background: #c0392b; color: #fff; font-size: 12.5px; font-weight: 800; letter-spacing: 0.04em;
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  }
  .admin-bar[hidden] { display: none; }
  .admin-bar .btn-mini { background: #fff; color: #c0392b; border-color: transparent; }
  .wk-btn:disabled { cursor: default; }
"""),
# ---- barra vermelha do modo administrador ----
(r"""  </header>
  <div class="local-banner" id="localBanner" hidden>""",
r"""  </header>
  <div class="admin-bar" id="adminBar" hidden></div>
  <div class="local-banner" id="localBanner" hidden>"""),
# ---- onMeChanged ----
(r"""    else if (!me && (authMode === "change" || authMode === "admin")) authMode = null;
    renderAuth();
    renderAuthModal();
    render();
  }""",
r"""    else if (!me && (authMode === "change" || authMode === "admin")) authMode = null;
    else if (authMode === "admin" && !(me && me.role === "admin")) authMode = null;
    renderAuth();
    renderAdminBar();
    renderAuthModal();
    render();
  }"""),
# ---- gestor não marca ----
(r"""    var who = me.role === "admin"
      ? '<label class="field"><span>Marcando como</span>""",
r"""    if (isManager()) {
      return '<p class="modal-sub">Você acompanha a agenda em modo leitura. As marcações são feitas pela equipe.</p>';
    }
    var who = me.role === "admin"
      ? '<label class="field"><span>Marcando como</span>"""),
# ---- menu do usuário ----
(r"""      (me.role === "admin" ? '<button data-action="open-admin">Administração</button>' : "") +""",
r"""      (me.canElevate ? (me.role === "admin"
        ? '<button data-action="unelevate">Desligar modo administrador</button>'
        : '<button data-action="elevate">Modo administrador</button>') : "") +
      (me.role === "admin" ? '<button data-action="open-admin">Administração</button>' : "") +"""),
# ---- login e zerar senha incluem o Leonardo ----
(r"""  function loginHTML() {
    var last = rememberedUser();""",
r"""  function isManager() { return !!me && me.role === "manager"; }
  // Quem pode entrar: a equipe da agenda + o gestor (que não aparece nos filtros nem nas semanas).
  function loginPeople() { return TEAM.concat([{ id: "leonardo", name: "Leonardo" }]); }

  function loginHTML() {
    var last = rememberedUser();"""),
(r"""<select name="user">' + TEAM.map(function (p) {""",
 r"""<select name="user">' + loginPeople().map(function (p) {"""),
(r"""    var people = TEAM.map(function (p) {
      var right;""",
r"""    var people = loginPeople().map(function (p) {
      var right;"""),
# ---- faixa "Semana programada?" ----
(r"""data-person="' + p.id + '" aria-pressed="' + !!at + '" ' +""",
 r"""data-person="' + p.id + '" aria-pressed="' + !!at + '"' + (isManager() ? " disabled" : "") + " " +"""),
(r"""    if (me.mustChange) { authMode = "change"; renderAuthModal(); return; }
    if (!canEditPerson(pid)) {""",
r"""    if (me.mustChange) { authMode = "change"; renderAuthModal(); return; }
    if (isManager()) { showToast("Você acompanha a agenda; cada pessoa fecha a própria semana."); return; }
    if (!canEditPerson(pid)) {"""),
# ---- modo administrador: funções ----
(r"""  /* ---------------- toast ---------------- */""",
r"""  /* ---------------- admin mode ---------------- */
  function formatClock(ms) {
    var parts = {};
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(ms)).forEach(function (p) { parts[p.type] = p.value; });
    return parts.hour + ":" + parts.minute;
  }
  function renderAdminBar() {
    var bar = document.getElementById("adminBar");
    if (!bar) return;
    if (!(me && me.role === "admin")) { bar.hidden = true; bar.innerHTML = ""; return; }
    bar.innerHTML = "<span>MODO ADMINISTRADOR &mdash; volta ao comum às " + formatClock(me.elevatedUntil) + "</span>" +
      '<button type="button" class="btn-mini" data-action="unelevate">Desligar</button>';
    bar.hidden = false;
  }
  function doElevate(on) {
    userMenuOpen = false;
    apiRequest("POST", "/api/auth", { op: on ? "elevate" : "unelevate" }).then(function (data) {
      me = data.user;
      onMeChanged();
      showToast(on ? "Modo administrador ligado por 15 minutos." : "Modo administrador desligado.");
    }).catch(function (err) {
      showToast(describeError(err, "Não foi possível agora. Tente de novo."));
    });
  }
  // Passou do prazo: pergunta ao servidor o papel de agora e avisa, em vez de deixar a tela mentindo.
  setInterval(function () {
    if (!me || me.role !== "admin" || !me.elevatedUntil || me.elevatedUntil > Date.now()) return;
    fetchMe().then(function (user) {
      var was = me && me.role;
      me = user;
      onMeChanged();
      if (user && was === "admin" && user.role !== "admin") showToast("Modo administrador desligado.");
    }).catch(function () { /* tenta no próximo ciclo */ });
  }, 15000);

  /* ---------------- toast ---------------- */"""),
# ---- cliques ----
(r"""    } else if (action === "toggle-week") {""",
r"""    } else if (action === "elevate") {
      doElevate(true);
    } else if (action === "unelevate") {
      doElevate(false);
    } else if (action === "toggle-week") {"""),
])
PY
python3 - <<'PY'
import re
s = open("public/index.html", encoding="utf-8").read()
open("/tmp/inline.js", "w", encoding="utf-8").write(re.findall(r"<script>(.*?)</script>", s, re.S)[-1])
PY
node --check /tmp/inline.js && echo SYNTAX-OK
```

Expected: `SYNTAX-OK`.

- [ ] **Step 2: Commit**

Run (prefixo): `ga public && gc "feat(ui): perfil do gestor em modo leitura e modo administrador (botão, barra vermelha, desliga em 15 min)"`

---

### Task 6: Tela — sino e quadro de notificações

**Files:**
- Modify: `public/index.html` (CSS, `#noticePanel`, sino no topo, painel com abas, `onMeChanged`, `pollForUpdates`, ações de clique, `Escape`)

**Interfaces:**
- Consumes: `GET /api/notices` → `{ inbox, sent, canSend }`; `POST /api/notices` `send`/`markRead` (Task 4); `isManager()`, `formatClosedAt(iso)`, `personById`, `describeError`.
- Produces: `loadNotices()`, `resetNotices()`, `renderNoticePanel()`, `noticeBellHTML()`; ações `toggle-notices`, `notice-tab`, `notice-toggle-read`, `notice-read`, `notice-to`, `notice-to-all`, `notice-send`.

- [ ] **Step 1: Aplicar as mudanças**

```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch

patch("public/index.html", [
# ---- CSS ----
(r"""  .wk-btn:disabled { cursor: default; }
""",
r"""  .wk-btn:disabled { cursor: default; }
  .bell { position: relative; }
  .bell-badge {
    position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; padding: 0 4px;
    border-radius: 9px; background: #c0392b; color: #fff; font-size: 11px; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
  }
  .notice-panel {
    position: fixed; top: 0; right: 0; bottom: 0; width: min(380px, 100vw); z-index: 45;
    background: var(--surface); border-left: 1px solid var(--border); box-shadow: var(--shadow);
    padding: 18px; overflow-y: auto;
  }
  .notice-panel[hidden] { display: none; }
  .notice-panel h2 { font-size: 18px; margin: 0; }
  .notice-tabs { display: flex; gap: 6px; margin: 10px 0 14px; }
  .notice-tabs .btn-mini.active { background: var(--accent); color: var(--accent-ink); border-color: transparent; }
  .notice-item { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; background: var(--surface-2); }
  .notice-item.unread { border-color: var(--accent); }
  .notice-meta { font-size: 12px; color: var(--ink-faint); font-weight: 700; margin-bottom: 4px; }
  .notice-text { white-space: pre-wrap; font-size: 14px; margin-bottom: 6px; }
  .notice-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }
  .notice-chip {
    border: 1px solid var(--border); background: var(--surface); color: var(--ink);
    padding: 5px 12px; border-radius: 999px; cursor: pointer; font-weight: 700; font-size: 12.5px;
  }
  .notice-chip.on { background: var(--accent); color: var(--accent-ink); border-color: transparent; }
  .notice-panel textarea {
    width: 100%; min-height: 120px; box-sizing: border-box; resize: vertical;
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 9px 10px; color: var(--ink); font: inherit; font-size: 14px;
  }
  .notice-count { font-size: 12px; color: var(--ink-faint); text-align: right; margin: 2px 0 6px; }
"""),
# ---- painel ----
(r"""<div class="toast" id="toast"></div>""",
 r"""<aside class="notice-panel" id="noticePanel" aria-label="Notificações" hidden></aside>
<div class="toast" id="toast"></div>"""),
# ---- sino no topo ----
(r"""    area.innerHTML = '<button class="today-btn" id="userBtn" """,
 r"""    area.innerHTML = noticeBellHTML() + '<button class="today-btn" id="userBtn" """),
# ---- troca de usuário/papel ----
(r"""    syncAudience();
    userMenuOpen = false;
""",
r"""    syncAudience();
    userMenuOpen = false;
    if (!me || me.mustChange) resetNotices();
"""),
(r"""    renderAdminBar();
    renderAuthModal();
    render();
  }""",
r"""    renderAdminBar();
    renderAuthModal();
    render();
    if (me && !me.mustChange) loadNotices();
  }"""),
# ---- atualização automática ----
(r"""  function pollForUpdates() {
    loadState()""",
r"""  function pollForUpdates() {
    loadNotices();
    loadState()"""),
# ---- lógica do quadro ----
(r"""  /* ---------------- toast ---------------- */""",
r"""  /* ---------------- notices ---------------- */
  var NOTICE_MAX = 500;
  var noticeData = { inbox: [], sent: [], canSend: false };
  var noticeOpen = false, noticeTab = "inbox", noticeShowRead = false, noticeBusy = false;
  var noticeTo = {}, noticeDraft = "", noticeError = "", noticeSeen = null;

  function resetNotices() {
    noticeData = { inbox: [], sent: [], canSend: false };
    noticeOpen = false; noticeTab = "inbox"; noticeShowRead = false; noticeBusy = false;
    noticeTo = {}; noticeDraft = ""; noticeError = ""; noticeSeen = null;
    renderNoticePanel();
  }
  function noticeName(id) { return id === "leonardo" ? "Leonardo" : (personById[id] ? personById[id].name : id); }
  function noticeUnread() { return noticeData.inbox.filter(function (n) { return !n.readAt; }).length; }

  function noticeBellHTML() {
    if (!me || me.mustChange) return "";
    var n = noticeUnread();
    return '<button class="today-btn bell" id="noticeBtn" data-action="toggle-notices" aria-expanded="' + noticeOpen +
      '" aria-label="Notificações' + (n ? ", " + n + " não lidas" : "") + '">&#128276;' +
      (n ? '<span class="bell-badge">' + n + "</span>" : "") + "</button>";
  }

  function noticeItemHTML(n, kind) {
    var meta, foot = "";
    if (kind === "inbox") {
      meta = "De " + h(noticeName(n.from)) + " &middot; " + formatClosedAt(n.createdAt);
      if (!n.readAt) foot = '<button type="button" class="btn-mini primary" data-action="notice-read" data-id="' + h(n.id) + '">Li</button>';
    } else {
      meta = "Para " + h(noticeName(n.to)) + " &middot; " + formatClosedAt(n.createdAt) + " &middot; " +
        (n.readAt ? "Lido em " + formatClosedAt(n.readAt) : "Não lido");
    }
    return '<div class="notice-item' + (kind === "inbox" && !n.readAt ? " unread" : "") + '"><div class="notice-meta">' + meta +
      '</div><div class="notice-text">' + h(n.text) + "</div>" + foot + "</div>";
  }

  function noticeWriteHTML() {
    var people = TEAM.filter(function (p) { return p.id !== me.id; });
    var all = people.every(function (p) { return noticeTo[p.id]; });
    var chips = '<button type="button" class="notice-chip' + (all ? " on" : "") + '" data-action="notice-to-all" aria-pressed="' + all + '">Todos</button>' +
      people.map(function (p) {
        return '<button type="button" class="notice-chip' + (noticeTo[p.id] ? " on" : "") + '" data-action="notice-to" data-id="' + p.id +
          '" aria-pressed="' + !!noticeTo[p.id] + '">' + h(p.name) + "</button>";
      }).join("");
    return '<p class="modal-sub">Cada pessoa recebe o aviso só para ela, e não há resposta.</p>' +
      '<div class="modal-section-title">Para</div><div class="notice-chips">' + chips + "</div>" +
      '<textarea id="noticeText" maxlength="' + NOTICE_MAX + '" placeholder="Escreva o aviso…">' + h(noticeDraft) + "</textarea>" +
      '<div class="notice-count" id="noticeCount">' + noticeDraft.length + " / " + NOTICE_MAX + "</div>" +
      '<p class="form-error" id="noticeError" role="alert">' + h(noticeError) + "</p>" +
      '<button type="button" class="btn btn-primary" data-action="notice-send"' + (noticeBusy ? " disabled" : "") + ">Enviar</button>";
  }

  function noticePanelHTML() {
    var tabs = [];
    var unread = noticeUnread();
    if (!isManager()) tabs.push(["inbox", "Recebidas" + (unread ? " (" + unread + ")" : "")]);
    if (noticeData.canSend) { tabs.push(["write", "Escrever"]); tabs.push(["sent", "Enviadas"]); }
    var allowed = tabs.map(function (t) { return t[0]; });
    if (allowed.indexOf(noticeTab) < 0) noticeTab = allowed[0];
    var head = '<div class="modal-head"><div><h2>Notificações</h2></div>' +
      '<button class="close-x" data-action="toggle-notices" aria-label="Fechar">&times;</button></div>' +
      '<div class="notice-tabs">' + tabs.map(function (t) {
        return '<button type="button" class="btn-mini' + (t[0] === noticeTab ? " active" : "") + '" data-action="notice-tab" data-tab="' + t[0] + '">' + t[1] + "</button>";
      }).join("") + "</div>";
    var body;
    if (noticeTab === "inbox") {
      var list = noticeData.inbox.filter(function (n) { return noticeShowRead || !n.readAt; });
      var anyRead = noticeData.inbox.some(function (n) { return n.readAt; });
      body = (list.length ? list.map(function (n) { return noticeItemHTML(n, "inbox"); }).join("") : '<p class="current-empty">Nenhum aviso novo.</p>') +
        (anyRead ? '<button type="button" class="btn-link" data-action="notice-toggle-read">' + (noticeShowRead ? "Esconder lidas" : "Mostrar lidas") + "</button>" : "");
    } else if (noticeTab === "sent") {
      body = noticeData.sent.length
        ? noticeData.sent.map(function (n) { return noticeItemHTML(n, "sent"); }).join("")
        : '<p class="current-empty">Você ainda não enviou avisos.</p>';
    } else {
      body = noticeWriteHTML();
    }
    return head + body;
  }

  function renderNoticePanel() {
    var panel = document.getElementById("noticePanel");
    if (!panel) return;
    if (!noticeOpen || !me || me.mustChange) { panel.hidden = true; panel.innerHTML = ""; return; }
    panel.innerHTML = noticePanelHTML();
    panel.hidden = false;
  }

  function loadNotices() {
    if (!me || me.mustChange) return Promise.resolve();
    return apiRequest("GET", "/api/notices").then(function (data) {
      var inbox = Array.isArray(data.inbox) ? data.inbox : [];
      var unread = inbox.filter(function (n) { return !n.readAt; });
      var fresh = unread.filter(function (n) { return !noticeSeen || !noticeSeen[n.id]; });
      noticeSeen = noticeSeen || {};
      unread.forEach(function (n) { noticeSeen[n.id] = true; });
      noticeData = { inbox: inbox, sent: Array.isArray(data.sent) ? data.sent : [], canSend: !!data.canSend };
      if (fresh.length && !noticeOpen) showToast(fresh.length === 1 ? "Você tem 1 aviso novo." : "Você tem " + fresh.length + " avisos novos.");
      renderAuth();
      if (noticeOpen && noticeTab !== "write") renderNoticePanel();
    }).catch(function () { /* silencioso: o próximo ciclo tenta de novo */ });
  }

  function toggleNotices() {
    noticeOpen = !noticeOpen;
    noticeError = "";
    renderNoticePanel();
    renderAuth();
    if (noticeOpen) loadNotices().then(renderNoticePanel);
  }

  function markNoticeRead(id) {
    apiRequest("POST", "/api/notices", { op: "markRead", id: id }).then(function () {
      return loadNotices();
    }).then(renderNoticePanel).catch(function (err) {
      showToast(describeError(err, "Não foi possível marcar agora."));
    });
  }

  function sendNotice() {
    var to = Object.keys(noticeTo).filter(function (id) { return noticeTo[id]; });
    var text = noticeDraft.trim();
    if (!to.length) { noticeError = "Escolha pelo menos uma pessoa."; renderNoticePanel(); return; }
    if (!text) { noticeError = "Escreva o aviso."; renderNoticePanel(); return; }
    noticeBusy = true; noticeError = "";
    renderNoticePanel();
    apiRequest("POST", "/api/notices", { op: "send", to: to, text: text }).then(function (data) {
      noticeBusy = false; noticeDraft = ""; noticeTo = {}; noticeTab = "sent";
      showToast(data.sent === 1 ? "Aviso enviado." : "Aviso enviado para " + data.sent + " pessoas.");
      return loadNotices();
    }).then(renderNoticePanel).catch(function (err) {
      noticeBusy = false;
      noticeError = describeError(err, "Não foi possível enviar agora.");
      renderNoticePanel();
    });
  }

  document.addEventListener("input", function (ev) {
    if (ev.target.id !== "noticeText") return;
    noticeDraft = ev.target.value;
    var counter = document.getElementById("noticeCount");
    if (counter) counter.textContent = noticeDraft.length + " / " + NOTICE_MAX;
  });

  /* ---------------- toast ---------------- */"""),
# ---- cliques ----
(r"""    } else if (action === "toggle-week") {""",
r"""    } else if (action === "toggle-notices") {
      toggleNotices();
    } else if (action === "notice-tab") {
      noticeTab = el.getAttribute("data-tab");
      noticeError = "";
      renderNoticePanel();
    } else if (action === "notice-toggle-read") {
      noticeShowRead = !noticeShowRead;
      renderNoticePanel();
    } else if (action === "notice-read") {
      markNoticeRead(el.getAttribute("data-id"));
    } else if (action === "notice-to") {
      var nid = el.getAttribute("data-id");
      if (noticeTo[nid]) delete noticeTo[nid]; else noticeTo[nid] = true;
      renderNoticePanel();
    } else if (action === "notice-to-all") {
      var others = TEAM.filter(function (p) { return p.id !== me.id; });
      var every = others.every(function (p) { return noticeTo[p.id]; });
      noticeTo = {};
      if (!every) others.forEach(function (p) { noticeTo[p.id] = true; });
      renderNoticePanel();
    } else if (action === "notice-send") {
      sendNotice();
    } else if (action === "toggle-week") {"""),
# ---- Esc fecha o painel ----
(r"""    if (ev.key === "Escape" && waModalOpen) { waModalOpen = false; renderWaModal(); }""",
r"""    if (ev.key === "Escape" && waModalOpen) { waModalOpen = false; renderWaModal(); }
    if (ev.key === "Escape" && noticeOpen) { noticeOpen = false; renderNoticePanel(); renderAuth(); }"""),
])
PY
python3 - <<'PY'
import re
s = open("public/index.html", encoding="utf-8").read()
open("/tmp/inline.js", "w", encoding="utf-8").write(re.findall(r"<script>(.*?)</script>", s, re.S)[-1])
PY
node --check /tmp/inline.js && echo SYNTAX-OK
```

Expected: `SYNTAX-OK`.

- [ ] **Step 2: Commit**

Run (prefixo): `ga public && gc "feat(ui): sino e quadro de notificações (Recebidas com Li, Escrever, Enviadas com lido/não lido)"`

---

### Task 7: Testes de navegador (simulador de API + roteiro do gestor, modo admin e avisos)

**Files:**
- Modify: `tests/helpers/stub-api.js`
- Modify: `tests/frontend-v2.spec.js` (a lista da Administração agora tem 6 linhas)
- Create: `tests/frontend-v21.spec.js`

**Interfaces:**
- Consumes: telas das Tasks 5 e 6.
- Produces: `openApp(page, opts)` aceita `opts.me = "leonardo"`, `opts.common` (Pedro começa em modo comum; sem isso ele começa com o modo administrador ligado por 1 h, para os testes antigos seguirem valendo) e `opts.notices` (lista inicial). O estado devolvido ganha `serverNow` (ms; avançar junto com `page.clock.fastForward`), `elevatedUntil` e `notices`.

- [ ] **Step 1: Atualizar o simulador de API**

```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch

patch("tests/helpers/stub-api.js", [
('const INITIAL_PASSWORD = "Mudar@123";',
 'const MANAGERS = { leonardo: "Leonardo" };\nconst NAMES = Object.assign({}, PEOPLE, MANAGERS);\nconst INITIAL_PASSWORD = "Mudar@123";'),
('''function userRecord(state, id) {
  return { id: id, name: PEOPLE[id], role: id === "pedro" ? "admin" : "user", mustChange: state.mustChange.indexOf(id) >= 0 };
}''',
'''// Mesmas regras do servidor: o administrador só é "admin" com o modo ligado; o gestor é "manager".
function userRecord(state, id) {
  const rec = { id: id, name: NAMES[id], role: MANAGERS[id] ? "manager" : "user", mustChange: state.mustChange.indexOf(id) >= 0 };
  if (id === "pedro") {
    const on = state.elevatedUntil > state.serverNow;
    rec.role = on ? "admin" : "user";
    rec.canElevate = true;
    rec.elevatedUntil = on ? state.elevatedUntil : 0;
  }
  return rec;
}'''),
('''    seq: 0,
    failNext: null
  };
  if (opts.me) state.me = userRecord(state, opts.me);''',
'''    seq: 0,
    failNext: null,
    serverNow: Date.parse(SERVER_NOW),
    elevatedUntil: opts.common ? 0 : Date.parse(SERVER_NOW) + 60 * 60 * 1000,
    notices: JSON.parse(JSON.stringify(opts.notices || []))
  };
  // state.me é recalculado a cada leitura: o modo administrador vence sozinho quando serverNow avança.
  Object.defineProperty(state, "me", {
    get: function () { return this._me ? userRecord(this, this._me.id) : null; },
    set: function (v) { this._me = v; }
  });
  if (opts.me) state.me = userRecord(state, opts.me);'''),
('''    if (state.me.mustChange) return json(route, 403, { error: "troque a senha antes de alterar a agenda" });
    const deny''',
'''    if (state.me.mustChange) return json(route, 403, { error: "troque a senha antes de alterar a agenda" });
    if (state.me.role === "manager") return json(route, 403, { error: "o gestor acompanha a agenda, mas não altera marcações" });
    const deny'''),
('if (!PEOPLE[id] || p.password !== expected)', 'if (!NAMES[id] || p.password !== expected)'),
('if (p.op === "logout") { state.me = null; return json(route, 200, { ok: true }); }',
 'if (p.op === "logout") { state.me = null; state.elevatedUntil = 0; return json(route, 200, { ok: true }); }'),
('''      state.me = userRecord(state, state.me.id);
      return json(route, 200, { user: state.me });
    }
    return json(route, 400, { error: "op inválida" });
  });

  await page.route("**/api/admin"''',
'''      state.me = userRecord(state, state.me.id);
      return json(route, 200, { user: state.me });
    }
    if (p.op === "elevate" || p.op === "unelevate") {
      if (!state.me) return json(route, 401, { error: "faça login primeiro" });
      if (state.me.id !== "pedro") {
        return p.op === "unelevate"
          ? json(route, 200, { user: state.me })
          : json(route, 403, { error: "apenas o administrador pode ligar o modo administrador" });
      }
      state.elevatedUntil = p.op === "elevate" ? state.serverNow + 15 * 60 * 1000 : 0;
      return json(route, 200, { user: state.me });
    }
    return json(route, 400, { error: "op inválida" });
  });

  await page.route("**/api/admin"'''),
('''    if (state.me.role !== "admin") return json(route, 403, { error: "apenas o administrador" });''',
 '''    if (state.me.role !== "admin") {
      return json(route, 403, { error: state.me.canElevate ? "ligue o modo administrador para usar esta função" : "apenas o administrador" });
    }'''),
('return json(route, 200, { user: { id: p.user, name: PEOPLE[p.user], role: "user", mustChange: true } });',
 'return json(route, 200, { user: { id: p.user, name: NAMES[p.user], role: MANAGERS[p.user] ? "manager" : "user", mustChange: true } });'),
('''  return state;
}

// Serves public/''',
'''  await page.route("**/api/notices", async function (route) {
    const req = route.request();
    if (!state.me) return json(route, 401, { error: "faça login" });
    if (state.me.mustChange) return json(route, 403, { error: "troque a senha antes de continuar" });
    const me = state.me;
    const canSend = me.role === "admin" || me.role === "manager";
    if (req.method() === "GET") {
      return json(route, 200, {
        inbox: state.notices.filter(function (n) { return n.to === me.id; }).reverse(),
        sent: state.notices.filter(function (n) { return n.from === me.id; }).reverse(),
        canSend: canSend
      });
    }
    const p = req.postDataJSON();
    state.requests.push({ path: "/api/notices", body: p });
    const nowIso = new Date(state.serverNow).toISOString();
    if (p.op === "send") {
      if (!canSend) {
        return json(route, 403, { error: me.canElevate ? "ligue o modo administrador para enviar notificações" : "apenas o gestor e o administrador enviam notificações" });
      }
      const text = String(p.text || "").trim();
      if (!text || !Array.isArray(p.to) || !p.to.length) return json(route, 400, { error: "escreva a mensagem" });
      p.to.forEach(function (to) {
        state.notices.push({ id: "z" + (++state.seq), from: me.id, to: to, text: text, createdAt: nowIso, readAt: null });
      });
      return json(route, 200, { ok: true, sent: p.to.length });
    }
    if (p.op === "markRead") {
      const found = state.notices.filter(function (n) { return n.id === p.id && n.to === me.id; })[0];
      if (!found) return json(route, 404, { error: "aviso não encontrado" });
      if (!found.readAt) found.readAt = nowIso;
      return json(route, 200, { ok: true });
    }
    return json(route, 400, { error: "op inválida" });
  });

  return state;
}

// Serves public/''')])

patch("tests/frontend-v2.spec.js", [
('await expect(page.locator(".admin-user")).toHaveCount(5);', 'await expect(page.locator(".admin-user")).toHaveCount(6);')])
PY
```

- [ ] **Step 2: Escrever o roteiro novo**

```bash
cat > tests/frontend-v21.spec.js <<'EOF'
const { test, expect } = require("@playwright/test");
const { openApp } = require("./helpers/stub-api");

test.use({ timezoneId: "America/Sao_Paulo", locale: "pt-BR" });

const ENTRIES = [{ id: "a1", date: "2026-10-27", person: "jean", obra: "almada", createdAt: "x" }];

async function loginAs(page, user, password) {
  await page.locator('.top-actions [data-action="open-login"]').click();
  await page.locator('#loginForm select[name="user"]').selectOption(user);
  await page.locator('#loginForm input[name="password"]').fill(password);
  await page.locator("#authSubmit").click();
}

// ---- Gestor --------------------------------------------------------------------------------

test("Leonardo is in the login list, and the filters/week strip still list only the five", async ({ page }) => {
  await openApp(page, { entries: ENTRIES });
  await page.locator('.top-actions [data-action="open-login"]').click();
  await expect(page.locator('#loginForm select[name="user"] option')).toHaveCount(6);
  await expect(page.locator('#loginForm select[name="user"] option[value="leonardo"]')).toHaveText("Leonardo");
});

test("Leonardo logs in and sees everything in read-only mode", async ({ page }) => {
  const state = await openApp(page, { entries: ENTRIES, confirmations: {} });
  await loginAs(page, "leonardo", "Mudar@123");
  await expect(page.locator("#userBtn")).toContainText("Leonardo");
  // semana ainda não liberada, mas o gestor vê (visitante não veria)
  await expect(page.locator(".visitor-lock")).toHaveCount(0);
  await expect(page.locator('[data-view="attention"]')).toBeVisible();
  await expect(page.locator("#waBtn")).toBeVisible();
  // faixa de semana: 5 botões desativados
  await expect(page.locator(".wk-btn")).toHaveCount(5);
  await expect(page.locator(".wk-btn").first()).toBeDisabled();
  // dia: sem formulário de marcação
  await page.locator('[data-action="open-day"][data-date="2026-10-27"]').first().click();
  await expect(page.locator("#modal")).toContainText("modo leitura");
  await expect(page.locator("#addForm")).toHaveCount(0);
  expect(state.requests.filter(function (r) { return r.path === "/api/entries"; })).toHaveLength(0);
});

test("the manager's menu has no admin mode, and the login shows his name on the landing", async ({ page }) => {
  await openApp(page, { me: "leonardo" });
  await page.locator("#userBtn").click();
  await expect(page.locator('#userMenu [data-action="elevate"]')).toHaveCount(0);
  await expect(page.locator('#userMenu [data-action="open-admin"]')).toHaveCount(0);
  await expect(page.locator('#userMenu [data-action="open-change"]')).toBeVisible();
});

// ---- Modo administrador --------------------------------------------------------------------

test("Pedro starts as a regular person: only himself, no Administração", async ({ page }) => {
  await openApp(page, { me: "pedro", common: true, entries: ENTRIES });
  await expect(page.locator("#adminBar")).toBeHidden();
  await page.locator("#userBtn").click();
  await expect(page.locator('#userMenu [data-action="open-admin"]')).toHaveCount(0);
  await expect(page.locator('#userMenu [data-action="elevate"]')).toHaveText("Modo administrador");
  await page.locator("#userBtn").click();
  await page.locator('[data-action="open-day"][data-date="2026-10-27"]').first().click();
  await expect(page.locator("#actAs")).toHaveCount(0);
  await expect(page.locator(".acting-as")).toContainText("Pedro");
});

test("Modo administrador turns on with a red bar and the deadline, and unlocks everything", async ({ page }) => {
  const state = await openApp(page, { me: "pedro", common: true, entries: ENTRIES });
  await page.locator("#userBtn").click();
  await page.locator('#userMenu [data-action="elevate"]').click();
  await expect(page.locator("#adminBar")).toBeVisible();
  await expect(page.locator("#adminBar")).toContainText("MODO ADMINISTRADOR");
  await expect(page.locator("#adminBar")).toContainText("12:15");
  await expect(page.locator("#toast")).toContainText("ligado por 15 minutos");
  expect(state.requests.some(function (r) { return r.body.op === "elevate"; })).toBe(true);

  await page.locator("#userBtn").click();
  await expect(page.locator('#userMenu [data-action="open-admin"]')).toBeVisible();
  await expect(page.locator('#userMenu [data-action="unelevate"]')).toHaveText("Desligar modo administrador");
  await page.locator("#userBtn").click();
  await page.locator('[data-action="open-day"][data-date="2026-10-27"]').first().click();
  await expect(page.locator("#actAs")).toHaveCount(1);
});

test("Desligar on the bar goes back to regular mode", async ({ page }) => {
  await openApp(page, { me: "pedro", entries: ENTRIES });
  await expect(page.locator("#adminBar")).toBeVisible();
  await page.locator('#adminBar [data-action="unelevate"]').click();
  await expect(page.locator("#adminBar")).toBeHidden();
  await expect(page.locator("#toast")).toContainText("Modo administrador desligado");
  await page.locator("#userBtn").click();
  await expect(page.locator('#userMenu [data-action="open-admin"]')).toHaveCount(0);
});

test("when the 15 minutes pass the screen returns to regular mode and warns, closing the admin panel", async ({ page }) => {
  const state = await openApp(page, { me: "pedro", common: true, entries: ENTRIES });
  await page.locator("#userBtn").click();
  await page.locator('#userMenu [data-action="elevate"]').click();
  await expect(page.locator("#adminBar")).toBeVisible();
  await page.locator("#userBtn").click();
  await page.locator('#userMenu [data-action="open-admin"]').click();
  await expect(page.locator("#adminPanel")).toBeVisible();

  state.serverNow += 16 * 60 * 1000;
  await page.clock.fastForward(16 * 60 * 1000);
  await expect(page.locator("#adminBar")).toBeHidden();
  await expect(page.locator("#toast")).toContainText("Modo administrador desligado");
  await expect(page.locator("#adminPanel")).toHaveCount(0);
});

// ---- Notificações --------------------------------------------------------------------------

const FROM_LEO = [
  { id: "n1", from: "leonardo", to: "jean", text: "Revisar a obra do Porto", createdAt: "2026-10-27T14:00:00.000Z", readAt: null },
  { id: "n2", from: "leonardo", to: "bruna", text: "Só para a Bruna", createdAt: "2026-10-27T14:00:00.000Z", readAt: null }
];

test("a person sees the bell with only his own notice, marks Li and can show the read ones", async ({ page }) => {
  const state = await openApp(page, { me: "jean", notices: FROM_LEO });
  await expect(page.locator("#noticeBtn .bell-badge")).toHaveText("1");
  await expect(page.locator("#toast")).toContainText("1 aviso novo");
  await page.locator("#noticeBtn").click();
  await expect(page.locator("#noticePanel")).toBeVisible();
  await expect(page.locator(".notice-item")).toHaveCount(1);
  await expect(page.locator(".notice-item")).toContainText("Revisar a obra do Porto");
  await expect(page.locator(".notice-item")).toContainText("De Leonardo");
  await expect(page.locator('[data-action="notice-tab"][data-tab="write"]')).toHaveCount(0);

  await page.locator('[data-action="notice-read"]').click();
  await expect(page.locator(".notice-item")).toHaveCount(0);
  await expect(page.locator("#noticeBtn .bell-badge")).toHaveCount(0);
  expect(state.notices[0].readAt).not.toBeNull();
  await page.locator('[data-action="notice-toggle-read"]').click();
  await expect(page.locator(".notice-item")).toHaveCount(1);
});

test("Leonardo writes to two people and sees Não lido, then Lido em after they read", async ({ page }) => {
  const state = await openApp(page, { me: "leonardo" });
  await page.locator("#noticeBtn").click();
  await expect(page.locator('[data-action="notice-tab"][data-tab="inbox"]')).toHaveCount(0);
  await page.locator('[data-action="notice-to"][data-id="jean"]').click();
  await page.locator('[data-action="notice-to"][data-id="bruna"]').click();
  await page.locator("#noticeText").fill("Passar na obra do Almada");
  await expect(page.locator("#noticeCount")).toHaveText("24 / 500");
  await page.locator('[data-action="notice-send"]').click();

  await expect(page.locator(".notice-item")).toHaveCount(2);
  await expect(page.locator(".notice-item").first()).toContainText("Não lido");
  const sent = state.requests.filter(function (r) { return r.path === "/api/notices"; })[0].body;
  expect(sent).toEqual({ op: "send", to: ["jean", "bruna"], text: "Passar na obra do Almada" });

  state.notices[0].readAt = new Date(state.serverNow).toISOString();
  await page.clock.fastForward(26000);
  await expect(page.locator(".notice-panel")).toContainText("Lido em 27/10 às 12:00");
});

test("sending without recipient or text shows a message and sends nothing", async ({ page }) => {
  const state = await openApp(page, { me: "leonardo" });
  await page.locator("#noticeBtn").click();
  await page.locator('[data-action="notice-send"]').click();
  await expect(page.locator("#noticeError")).toHaveText("Escolha pelo menos uma pessoa.");
  await page.locator('[data-action="notice-to"][data-id="jean"]').click();
  await page.locator('[data-action="notice-send"]').click();
  await expect(page.locator("#noticeError")).toHaveText("Escreva o aviso.");
  expect(state.notices).toHaveLength(0);
});

test("Todos picks everybody except the sender", async ({ page }) => {
  await openApp(page, { me: "pedro" });
  await page.locator("#noticeBtn").click();
  await page.locator('[data-action="notice-tab"][data-tab="write"]').click();
  await expect(page.locator('[data-action="notice-to"][data-id="pedro"]')).toHaveCount(0);
  await page.locator('[data-action="notice-to-all"]').click();
  await expect(page.locator(".notice-chip.on")).toHaveCount(5); // Todos + 4 pessoas
  await page.locator('[data-action="notice-to-all"]').click();
  await expect(page.locator(".notice-chip.on")).toHaveCount(0);
});

test("Pedro in regular mode can read but has no Escrever tab; visitors have no bell", async ({ page }) => {
  await openApp(page, { me: "pedro", common: true });
  await page.locator("#noticeBtn").click();
  await expect(page.locator('[data-action="notice-tab"][data-tab="write"]')).toHaveCount(0);
  await expect(page.locator("#noticePanel")).toContainText("Nenhum aviso novo");

  const visitor = await page.context().newPage();
  await openApp(visitor, {});
  await expect(visitor.locator("#noticeBtn")).toHaveCount(0);
});
EOF
```

Roda tudo no navegador na nuvem (os arquivos de `public/` e `tests/` são copiados para lá; veja o roteiro de execução na Task 9).
