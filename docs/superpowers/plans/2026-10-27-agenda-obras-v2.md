# Agenda de Obras v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar num único lançamento a aba "Atenção por obra", as correções e ajustes de interface (Lote 1), reunião com horário + vários dias + semana programada (Lote 2) e login por pessoa com administrador, backup e rollback (Lote 3) na Agenda de Obras da Blendi.

**Architecture:** Site estático (`public/index.html` + módulos puros em `public/lib/`) e functions serverless Netlify (`netlify/functions/`) sobre Netlify Blobs. Regras de negócio ficam em módulos puros testados com `node --test`; as functions só fazem a cola (HTTP, sessão, armazenamento). O formato de `entries` não muda além de campos aditivos; chaves novas (`weeks`, `users`, `backup-*`) são aditivas, então a versão antiga continua funcionando se for preciso voltar atrás.

**Tech Stack:** Node (CommonJS, só módulos nativos: `node:crypto`, `node:test`), `@netlify/blobs` 8.2.0 (já instalado), JavaScript de navegador sem framework, Playwright (`@playwright/test`, roda na nuvem).

**Specs:**
- `docs/superpowers/specs/2026-10-27-atencao-por-obra-design.md` (Lote 1)
- `docs/superpowers/specs/2026-10-27-reuniao-semana-programada-design.md` (Lote 2)
- `docs/superpowers/specs/2026-10-27-login-admin-backup-design.md` (Lote 3)

## Global Constraints

Valores copiados dos specs; toda tarefa os herda.

- Sem dependências novas: criptografia só com `node:crypto` (`scryptSync`, `createHmac`, `timingSafeEqual`).
- Datas sempre texto `AAAA-MM-DD`, comparadas como texto; diferença em dias via `Date.UTC`; sem fuso. A única exceção é o dia do snapshot, calculado em `America/Sao_Paulo`.
- Comentário: máximo 140 caracteres (depois de `trim`). Reunião: `meeting: { start: "HH:MM", end: "HH:MM" }`, 00:00–23:59, `end` > `start`.
- `addMany`: no máximo 60 itens, tudo ou nada.
- Semana programada: chave = **domingo** `AAAA-MM-DD`; reabre sozinha quando uma marcação da pessoa naquela semana realmente muda.
- Aba Atenção: realizado = `periodStart <= data <= hoje` (hoje conta); planejado = `data > hoje`; filtro de período Este mês / 30 / 60 / 90 dias (só afeta o realizado); `staleDays = 14`.
- Senha inicial `Mudar@123` vem de `INITIAL_PASSWORD` (variável de ambiente, fora do repositório); mínimo 8 caracteres; nova senha diferente da inicial; 5 erros seguidos bloqueiam 15 minutos; sessão de 30 dias em cookie `agenda_session` (`HttpOnly; Secure; SameSite=Strict; Path=/`), assinada com `SESSION_SECRET` (≥ 32 caracteres).
- Ver a agenda: público. Alterar: exige login; usuário comum só o próprio nome; administrador (`pedro`) altera qualquer um. Usuário com `mustChange` não grava.
- Backup: snapshot diário `backup-AAAA-MM-DD` (mantém 30), `backup-prerestore-*` antes de restaurar; exportação nunca inclui `users`.
- Ambiente local (`NETLIFY_DEV === "true"` ou `AGENDA_LOCAL === "1"`) usa a loja `agenda-obras-dev` e **ignora** `BLOBS_SITE_ID`/`BLOBS_TOKEN`.
- Nenhum arquivo JS novo no topo de `netlify/functions/` além de `entries.js`, `auth.js`, `admin.js` (a Netlify trata cada `.js` do topo como function). Helpers vão em `netlify/functions/lib/`.
- **Não dar push na `master`/`main`.** Todo o trabalho fica na branch `release/v2`. Cada push na branch de produção gera deploy (15 créditos).
- Todo commit termina com as linhas de atribuição (o helper `gc` abaixo já as inclui).
- Textos para o usuário em português do Brasil.

## Convenções de execução

**Onde rodar o quê.**
- Edição de arquivos e testes unitários: `device_bash` (Node 22 na VM do computador do usuário). A pasta do repositório está em `$HOME/mnt/Gestão e Inteligência de Custos - Engenharia/08 - Agenda de Obras - 2026_08 - PCP/05_Repositorio_Github`.
- Testes de navegador (Playwright): na nuvem (`Bash`), onde o Chromium já existe; ver "Como rodar o Playwright" no fim desta seção.

**Prefixo padrão de todo comando `device_bash`** (cada chamada é um shell novo; o helper é criado na Tarefa 0):

```bash
cd "$HOME/mnt/Gestão e Inteligência de Custos - Engenharia/08 - Agenda de Obras - 2026_08 - PCP/05_Repositorio_Github" && . .git/agenda-helpers.sh
```

Nos passos, "(prefixo)" significa esse trecho no começo do comando.

**Criar ou sobrescrever um arquivo:** `device_bash` com heredoc entre aspas: `cat > caminho <<'EOF' … EOF`.

**Alterar parte de um arquivo existente:** `python3` com o helper `patchlib` (Tarefa 0). Ele tolera CRLF e falha em voz alta se o trecho antigo não existir exatamente uma vez:

```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch, replace_between
patch("arquivo", [("trecho antigo", "trecho novo")])
replace_between("arquivo", "início (único)", "fim", "novo", keep_end=False)
PY
```

**Commit:** `ga arquivo1 arquivo2 && gc "mensagem"` (helpers da Tarefa 0; tratam os arquivos de trava `.git/*.lock` que a pasta do OneDrive não deixa apagar).

**Testes unitários:** `node --test tests/unit/*.test.js` (esperado no começo: 52 testes passando).

**Como rodar o Playwright (na nuvem).**
1. Com `device_stage_files`, copie para a nuvem: `public/index.html`, `public/lib/*.js`, `public/assets/blendi-symbol.png`, `tests/*.spec.js` e `tests/helpers/*.js`.
2. Na nuvem (`Bash`) — o Playwright já está instalado lá (não instale outro; a versão não acharia o navegador). Só falta apontar `@playwright/test` para ele:
   ```bash
   SRC="/mnt/user-data/uploads/Gestão e Inteligência de Custos - Engenharia/08 - Agenda de Obras - 2026_08 - PCP/05_Repositorio_Github"
   rm -rf /tmp/pw && mkdir -p /tmp/pw/node_modules/@playwright/test \
     && cp -r "$SRC/public" "$SRC/tests" /tmp/pw/ && cd /tmp/pw \
     && echo 'module.exports = require("/opt/npm-tools/node_modules/playwright/test");' > node_modules/@playwright/test/index.js \
     && echo 'module.exports = { testDir: "./tests", timeout: 30000 };' > playwright.config.js \
     && node /opt/npm-tools/node_modules/playwright/cli.js test tests/frontend-v2.spec.js --reporter=line
   ```
   Troque `tests/frontend-v2.spec.js` pelo arquivo que a tarefa pede (ou omita para rodar todos, menos `frontend-live.spec.js`, que precisa de um servidor local). O `playwright.config.js` do repositório não é usado na nuvem (ele aponta para um caminho de navegador que só existe no computador do Pedro).
3. Sempre faça o stage de novo dos arquivos alterados antes de rodar (a cópia na nuvem é um retrato do momento).

## Mapa de arquivos

**Criar**
- `netlify/functions/lib/people.js` — lista fixa de pessoas, funções e administradores (fonte única no backend).
- `netlify/functions/lib/weeks-logic.js` — semana programada (domingo, confirmar, desconfirmar, reabrir).
- `netlify/functions/lib/passwords.js` — hash e verificação de senha (`scrypt`).
- `netlify/functions/lib/session.js` — cookie de sessão assinado.
- `netlify/functions/lib/users-logic.js` — semente dos usuários, login com bloqueio, troca e zerar senha.
- `netlify/functions/lib/access.js` — matriz de autorização das operações de escrita.
- `netlify/functions/lib/backup-logic.js` — snapshot diário, poda, exportação, restauração.
- `netlify/functions/lib/store.js` — escolha da loja (produção × local isolado).
- `netlify/functions/lib/auth-core.js` — usuários, sessão corrente, configuração, cookie.
- `netlify/functions/auth.js`, `netlify/functions/admin.js` — functions HTTP.
- `public/lib/attention.js`, `public/lib/week-message.js`, `public/lib/meeting-format.js` — módulos puros do navegador.
- `tests/unit/*.test.js` correspondentes; `tests/unit/helpers/fake-store.js`, `tests/unit/helpers/auth-helpers.js`.
- `tests/helpers/stub-api.js`, `tests/frontend-v2.spec.js` — Playwright.
- `.gitattributes`, `.env.example`, `docs/RELEASE-v2.md`.

**Modificar**
- `netlify/functions/lib/entries-logic.js`, `netlify/functions/entries.js`.
- `public/lib/grouping.js`, `public/lib/week-model.js`, `public/lib/week-image.js`.
- `public/index.html`, `README.md`, `.gitignore`, `tests/unit/entries.test.js`, `tests/unit/entries-logic.test.js`, `tests/unit/week-model.test.js`, `tests/frontend-static.spec.js`, `tests/frontend-live.spec.js`.

**Ordem de execução.** Fase 0 (preparação) → Fase 1 (lógica pura do backend) → Fase 2 (functions) → Fase 3 (módulos puros do navegador) → Fase 4 (interface) → Fase 5 (lançamento). Cada tarefa traz a etiqueta do lote ([L1], [L2], [L3]) e seu commit usa o mesmo prefixo.

---

## Fase 0 — Preparação

### Task 0: Helpers de execução, .gitignore, .gitattributes, linha de base

**Files:**
- Create (fora do versionamento): `.git/agenda-helpers.sh`, `.git/patchlib.py`
- Create: `.gitignore`, `.gitattributes`, `.env.example`

**Interfaces:**
- Produces: funções de shell `fixlocks`, `ga`, `gc`; módulo Python `patchlib` com `patch(path, [(old, new)])` e `replace_between(path, start, end, new, keep_end=False)`.

- [ ] **Step 1: Confirmar a branch e a tag**

Run (prefixo): `git branch --show-current; git tag; git log --oneline | head -3`
Expected: `release/v2`; tag `v1-antes-do-v2`; último commit `docs: Lote 3 spec …`. Se a branch não for `release/v2`, rode `git switch release/v2`.

- [ ] **Step 2: Criar os helpers**

Run:
```bash
cd "$HOME/mnt/Gestão e Inteligência de Custos - Engenharia/08 - Agenda de Obras - 2026_08 - PCP/05_Repositorio_Github" && cat > .git/agenda-helpers.sh <<'EOF'
fixlocks() {
  for f in .git/HEAD.lock .git/index.lock .git/objects/maintenance.lock; do
    [ -e "$f" ] && mv "$f" ".git/stale-$(basename "$f")-$(date +%s%N)"
  done
  true
}
ga() { git add "$@" 2>&1 | grep -v unlink; fixlocks; }
gc() {
  git commit -q -m "$1" -m "$(printf 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01XAAStRKRXisLQay74QwQHa')" 2>&1 | grep -v unlink
  fixlocks
  git log --oneline | head -1
}
EOF
cat > .git/patchlib.py <<'EOF'
import sys

def _read(path):
    raw = open(path, "rb").read().decode("utf-8")
    crlf = "\r\n" in raw
    return raw.replace("\r\n", "\n"), crlf

def _write(path, s, crlf):
    if crlf:
        s = s.replace("\n", "\r\n")
    open(path, "wb").write(s.encode("utf-8"))

def patch(path, pairs):
    s, crlf = _read(path)
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            sys.exit("PATCH FAILED (%d matches) in %s:\n%s" % (n, path, old[:300]))
        s = s.replace(old, new)
    _write(path, s, crlf)

def replace_between(path, start, end, new, keep_end=False):
    s, crlf = _read(path)
    if s.count(start) != 1:
        sys.exit("START not unique/found in %s: %r" % (path, start[:150]))
    i = s.find(start)
    j = s.find(end, i + len(start))
    if j < 0:
        sys.exit("END not found in %s: %r" % (path, end[:150]))
    if not keep_end:
        j += len(end)
    s = s[:i] + new + s[j:]
    _write(path, s, crlf)
EOF
. .git/agenda-helpers.sh && type gc | head -1
. .git/agenda-helpers.sh && type gc | head -1
```
Expected: `gc is a function`.

- [ ] **Step 3: Criar `.gitignore`, `.gitattributes` e `.env.example`**

Run (prefixo):
```bash
cat > .gitignore <<'EOF'
.netlify
node_modules/
.env
.env.*
!.env.example
EOF
cat > .gitattributes <<'EOF'
* text=auto
*.png binary
EOF
cat > .env.example <<'EOF'
# Copie para .env (que NÃO vai para o git) para rodar localmente com: npx netlify-cli dev --offline
SESSION_SECRET=troque-por-um-texto-aleatorio-com-pelo-menos-32-caracteres
INITIAL_PASSWORD=Mudar@123
AGENDA_LOCAL=1
EOF
git config core.fileMode false
git status --short | grep -v '^??' | head
```
Expected: nenhuma linha ` M` (os 20 arquivos "modificados" eram só fim de linha/permissão). Se ainda aparecerem, rode `git add --renormalize . ; git status --short` e confira com `git diff --cached --stat | tail -3` que só há mudança de fim de linha antes de seguir; não commite conteúdo que você não reconheça.

- [ ] **Step 4: Linha de base dos testes**

Run (prefixo): `node --test tests/unit/*.test.js 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: `# tests 52`, `# pass 52`, `# fail 0`.

- [ ] **Step 5: Commit**

Run (prefixo): `ga .gitignore .gitattributes .env.example && gc "chore: gitignore node_modules/.env, gitattributes text=auto, .env.example"`

---

## Fase 1 — Lógica pura do backend (TDD)

### Task 1: [L1] Validar datas que existem de verdade

**Files:**
- Modify: `netlify/functions/lib/entries-logic.js`
- Test: `tests/unit/entries-logic.test.js`

**Interfaces:**
- Produces: `isRealDate(key: string): boolean`, exportada; `validateEntry` passa a usá-la.

- [ ] **Step 1: Escrever o teste que falha**

Run (prefixo):
```bash
cat >> tests/unit/entries-logic.test.js <<'EOF'

// --- datas reais do calendário -----------------------------------------

test("validateEntry rejects dates that do not exist on the calendar", function () {
  ["2026-99-99", "2026-02-30", "2026-13-01", "2026-00-10", "2026-04-31", "2026-02-29"].forEach(function (date) {
    assert.equal(validateEntry({ date: date, person: "pedro", obra: "almada" }).ok, false, date);
  });
});

test("validateEntry accepts 29 February in a leap year and the last day of a month", function () {
  assert.equal(validateEntry({ date: "2028-02-29", person: "pedro", obra: "almada" }).ok, true);
  assert.equal(validateEntry({ date: "2026-10-31", person: "pedro", obra: "almada" }).ok, true);
});
EOF
```

- [ ] **Step 2: Rodar e ver falhar**

Run (prefixo): `node --test tests/unit/entries-logic.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 1` (o primeiro teste novo: `2026-99-99` hoje passa na validação).

- [ ] **Step 3: Implementar**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch
patch("netlify/functions/lib/entries-logic.js", [
  ("function validateEntry(input) {", '''function isRealDate(key) {
  if (typeof key !== "string" || !DATE_RE.test(key)) return false;
  var p = key.split("-").map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
}

function validateEntry(input) {'''),
  ('  if (typeof input.date !== "string" || !DATE_RE.test(input.date)) {', '  if (!isRealDate(input.date)) {'),
  ("  PEOPLE_IDS, OBRA_IDS,\n", "  PEOPLE_IDS, OBRA_IDS, isRealDate,\n"),
])
PY
```

- [ ] **Step 4: Rodar e ver passar**

Run (prefixo): `node --test tests/unit/*.test.js 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

Run (prefixo): `ga netlify/functions/lib/entries-logic.js tests/unit/entries-logic.test.js && gc "feat(L1): reject calendar dates that do not exist"`

---

### Task 2: [L1] Remarcar a mesma pessoa+obra+dia atualiza o comentário

**Files:**
- Modify: `netlify/functions/lib/entries-logic.js` (função `addEntry`)
- Test: `tests/unit/entries-logic.test.js`

**Interfaces:**
- Produces: `addEntry(entries, entryWithId) -> array`. Mesma pessoa+obra+dia: comentário novo, não vazio e diferente substitui o atual (mantém `id` e `createdAt`); caso contrário devolve **a mesma referência** do array recebido. Slot novo: devolve array novo com a marcação no fim.

- [ ] **Step 1: Escrever os testes que falham**

Run (prefixo):
```bash
cat >> tests/unit/entries-logic.test.js <<'EOF'

// --- remarcar o mesmo slot --------------------------------------------

test("addEntry replaces the comment when the same slot is added again with a different one", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x", comment: "antigo" }];
  const result = addEntry(existing, { id: "a2", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "y", comment: "novo" });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "a1");
  assert.equal(result[0].createdAt, "x");
  assert.equal(result[0].comment, "novo");
  assert.equal(existing[0].comment, "antigo");
});

test("addEntry sets a comment on an existing entry that had none", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x" }];
  const result = addEntry(existing, { id: "a2", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "y", comment: "vistoria" });
  assert.equal(result[0].comment, "vistoria");
});

test("addEntry returns the very same array when the slot exists and nothing would change", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x", comment: "igual" }];
  assert.equal(addEntry(existing, { id: "a2", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "y", comment: "igual" }), existing);
  assert.equal(addEntry(existing, { id: "a3", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "z" }), existing);
});
EOF
node --test tests/unit/entries-logic.test.js 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# fail 2` (os dois primeiros; o terceiro já passa porque hoje devolve o mesmo array).

- [ ] **Step 2: Implementar**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import replace_between
replace_between("netlify/functions/lib/entries-logic.js",
  "function addEntry(entries, entryWithId) {",
  "  return entries.concat([entryWithId]);\n}\n",
'''function sameSlot(a, b) {
  return a.date === b.date && a.person === b.person && a.obra === b.obra;
}

// Adding a slot that already exists never duplicates it: a new, non-empty, different
// comment replaces the stored one (id and createdAt are kept). Returns the very same
// array when nothing changed, so callers can tell "no-op" from "changed" by reference.
function addEntry(entries, entryWithId) {
  var matched = false;
  var changed = false;
  var result = entries.map(function (en) {
    if (!sameSlot(en, entryWithId)) return en;
    matched = true;
    var patch = {};
    if (entryWithId.comment && entryWithId.comment !== en.comment) patch.comment = entryWithId.comment;
    if (Object.keys(patch).length === 0) return en;
    changed = true;
    return Object.assign({}, en, patch);
  });
  if (matched) return changed ? result : entries;
  return entries.concat([entryWithId]);
}
''')
PY
node --test tests/unit/*.test.js 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# fail 0`.

- [ ] **Step 3: Commit**

Run (prefixo): `ga netlify/functions/lib/entries-logic.js tests/unit/entries-logic.test.js && gc "fix(L1): re-adding the same slot updates the comment instead of dropping it"`

---

### Task 3: [L2] Reunião com horário e atualização parcial

**Files:**
- Modify: `netlify/functions/lib/entries-logic.js`
- Test: `tests/unit/entries-logic.test.js`

**Interfaces:**
- Produces: `validateMeeting(value) -> {ok, error?}`; `normalizeMeeting(value) -> {start,end}|null`; `validateEntry` também valida `meeting`; `addEntry` também atualiza `meeting` diferente no mesmo slot; `updateEntry(entries, id, patch) -> array|null` onde `patch` pode ter `comment` (texto; vazio apaga) e/ou `meeting` (objeto define; `null` apaga) — só as chaves presentes mudam; `updateEntryComment(entries, id, comment)` continua existindo (envolve `updateEntry`).

- [ ] **Step 1: Escrever os testes que falham**

Run (prefixo):
```bash
cat >> tests/unit/entries-logic.test.js <<'EOF'

// --- reunião com horário ------------------------------------------------

const logic = require("../../netlify/functions/lib/entries-logic");

test("validateMeeting accepts absent meeting and a valid range", function () {
  assert.deepEqual(logic.validateMeeting(undefined), { ok: true });
  assert.deepEqual(logic.validateMeeting(null), { ok: true });
  assert.deepEqual(logic.validateMeeting({ start: "14:00", end: "15:30" }), { ok: true });
  assert.deepEqual(logic.validateMeeting({ start: "00:00", end: "23:59" }), { ok: true });
});

test("validateMeeting rejects bad shapes, bad times and ranges that do not move forward", function () {
  [
    "14:00", [], 5,
    { start: "9:00", end: "10:00" },
    { start: "24:00", end: "23:59" },
    { start: "12:60", end: "13:00" },
    { start: "10:00" },
    { start: "10:00", end: "10:00" },
    { start: "11:00", end: "10:00" }
  ].forEach(function (value) {
    assert.equal(logic.validateMeeting(value).ok, false, JSON.stringify(value));
  });
});

test("validateEntry validates the optional meeting", function () {
  assert.equal(validateEntry({ date: "2026-08-27", person: "pedro", obra: "almada", meeting: { start: "14:00", end: "15:00" } }).ok, true);
  assert.equal(validateEntry({ date: "2026-08-27", person: "pedro", obra: "almada", meeting: { start: "15:00", end: "14:00" } }).ok, false);
});

test("addEntry updates a different meeting on an existing slot and keeps the comment", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x", comment: "vistoria", meeting: { start: "09:00", end: "10:00" } }];
  const result = addEntry(existing, { id: "a2", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "y", meeting: { start: "14:00", end: "15:00" } });
  assert.deepEqual(result[0].meeting, { start: "14:00", end: "15:00" });
  assert.equal(result[0].comment, "vistoria");
  assert.equal(addEntry(result, { id: "a3", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "z", meeting: { start: "14:00", end: "15:00" } }), result);
});

test("updateEntry changes only the keys present in the patch", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x", comment: "vistoria", meeting: { start: "09:00", end: "10:00" } }];
  const onlyMeeting = logic.updateEntry(existing, "a1", { meeting: { start: "14:00", end: "15:00", extra: 1 } });
  assert.equal(onlyMeeting[0].comment, "vistoria");
  assert.deepEqual(onlyMeeting[0].meeting, { start: "14:00", end: "15:00" });
  const onlyComment = logic.updateEntry(existing, "a1", { comment: "  novo  " });
  assert.equal(onlyComment[0].comment, "novo");
  assert.deepEqual(onlyComment[0].meeting, { start: "09:00", end: "10:00" });
});

test("updateEntry with meeting null removes it; with a blank comment removes the comment", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x", comment: "vistoria", meeting: { start: "09:00", end: "10:00" } }];
  const result = logic.updateEntry(existing, "a1", { meeting: null, comment: "   " });
  assert.equal("meeting" in result[0], false);
  assert.equal("comment" in result[0], false);
});

test("updateEntry returns null for an unknown id and does not mutate its input", function () {
  const existing = [{ id: "a1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "x" }];
  assert.equal(logic.updateEntry(existing, "nope", { comment: "x" }), null);
  logic.updateEntry(existing, "a1", { comment: "x", meeting: { start: "09:00", end: "10:00" } });
  assert.equal(existing[0].comment, undefined);
  assert.equal(existing[0].meeting, undefined);
});
EOF
node --test tests/unit/entries-logic.test.js 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# fail` ≥ 6 (as funções novas ainda não existem).

- [ ] **Step 2: Implementar**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch, replace_between
P = "netlify/functions/lib/entries-logic.js"
patch(P, [
  ("const MAX_COMMENT_LENGTH = 140;", "const TIME_RE = /^([01]\\d|2[0-3]):[0-5]\\d$/;\nconst MAX_COMMENT_LENGTH = 140;"),
  ("function isRealDate(key) {", '''function validateMeeting(value) {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "reunião inválida" };
  }
  if (typeof value.start !== "string" || !TIME_RE.test(value.start) ||
      typeof value.end !== "string" || !TIME_RE.test(value.end)) {
    return { ok: false, error: "horário da reunião inválido (esperado HH:MM)" };
  }
  if (value.end <= value.start) {
    return { ok: false, error: "o fim da reunião deve ser depois do início" };
  }
  return { ok: true };
}

function normalizeMeeting(value) {
  return value ? { start: value.start, end: value.end } : null;
}

function sameMeeting(a, b) {
  return !!a && !!b && a.start === b.start && a.end === b.end;
}

function isRealDate(key) {'''),
  ("  return validateComment(input.comment);\n", "  var commentCheck = validateComment(input.comment);\n  if (!commentCheck.ok) return commentCheck;\n  return validateMeeting(input.meeting);\n"),
  ("    if (entryWithId.comment && entryWithId.comment !== en.comment) patch.comment = entryWithId.comment;\n",
   "    if (entryWithId.comment && entryWithId.comment !== en.comment) patch.comment = entryWithId.comment;\n    if (entryWithId.meeting && !sameMeeting(entryWithId.meeting, en.meeting)) patch.meeting = entryWithId.meeting;\n"),
  ("  validateEntry, validateComment, normalizeComment,\n  addEntry, removeEntry, updateEntryComment\n};",
   "  validateEntry, validateComment, validateMeeting, normalizeComment, normalizeMeeting,\n  addEntry, removeEntry, updateEntry, updateEntryComment\n};"),
])
replace_between(P, "// Returns a new array with the entry's comment set",
  "  return found ? updated : null;\n}\n",
'''// Returns a new array with the entry patched, or null when no entry has that id.
// Only the keys present in `patch` change: `comment` (blank removes it) and
// `meeting` ({start,end} sets it, null removes it).
function updateEntry(entries, id, patch) {
  var found = false;
  var updated = entries.map(function (en) {
    if (en.id !== id) return en;
    found = true;
    var copy = Object.assign({}, en);
    if ("comment" in patch) {
      var text = normalizeComment(patch.comment);
      if (text) copy.comment = text; else delete copy.comment;
    }
    if ("meeting" in patch) {
      if (patch.meeting) copy.meeting = normalizeMeeting(patch.meeting); else delete copy.meeting;
    }
    return copy;
  });
  return found ? updated : null;
}

function updateEntryComment(entries, id, comment) {
  return updateEntry(entries, id, { comment: comment });
}
''')
PY
node --test tests/unit/*.test.js 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# fail 0`.

- [ ] **Step 3: Commit**

Run (prefixo): `ga netlify/functions/lib/entries-logic.js tests/unit/entries-logic.test.js && gc "feat(L2): meeting start/end on entries and partial update"`

---

### Task 4: [L2] Marcar vários dias de uma vez (`addManyEntries`)

**Files:**
- Modify: `netlify/functions/lib/entries-logic.js`
- Test: `tests/unit/entries-logic.test.js`

**Interfaces:**
- Consumes: `validateEntry`, `addEntry`, `normalizeComment`, `normalizeMeeting` (Tarefas 1–3).
- Produces:
  - `MAX_MANY = 60`.
  - `buildEntry(payload, id, nowIso) -> entry` (comentário aparado, `meeting` normalizado, sem campos vazios).
  - `newId() -> string`.
  - `addManyEntries(current, items, makeEntry) -> { ok: true, entries, affected } | { ok: false, error }` onde `makeEntry(item)` devolve a marcação com `id`, e `affected` é `[{ person, date }]` só dos itens que realmente mudaram algo. Tudo ou nada: um item inválido devolve `{ ok: false }` e nada é salvo.

- [ ] **Step 1: Escrever os testes que falham**

Run (prefixo):
```bash
cat >> tests/unit/entries-logic.test.js <<'EOF'

// --- vários dias de uma vez -----------------------------------------------

test("buildEntry trims the comment, normalizes the meeting and leaves out empty fields", function () {
  const full = logic.buildEntry({ date: "2026-08-27", person: "pedro", obra: "almada", comment: "  vistoria ", meeting: { start: "14:00", end: "15:00", extra: 1 } }, "id1", "2026-08-27T12:00:00.000Z");
  assert.deepEqual(full, { id: "id1", date: "2026-08-27", person: "pedro", obra: "almada", createdAt: "2026-08-27T12:00:00.000Z", comment: "vistoria", meeting: { start: "14:00", end: "15:00" } });
  const bare = logic.buildEntry({ date: "2026-08-27", person: "pedro", obra: "almada", comment: "   " }, "id2", "t");
  assert.equal("comment" in bare, false);
  assert.equal("meeting" in bare, false);
});

function makeMaker() {
  let n = 0;
  return function (item) { n += 1; return logic.buildEntry(item, "m" + n, "t"); };
}

test("addManyEntries adds every item and reports only the ones that changed something", function () {
  const current = [{ id: "a1", date: "2026-10-27", person: "pedro", obra: "almada", createdAt: "x" }];
  const result = logic.addManyEntries(current, [
    { date: "2026-10-27", person: "pedro", obra: "almada" },
    { date: "2026-10-28", person: "pedro", obra: "almada" },
    { date: "2026-10-28", person: "pedro", obra: "porto", comment: "obra" }
  ], makeMaker());
  assert.equal(result.ok, true);
  assert.equal(result.entries.length, 3);
  assert.deepEqual(result.affected, [
    { person: "pedro", date: "2026-10-28" },
    { person: "pedro", date: "2026-10-28" }
  ]);
});

test("addManyEntries dedupes inside the same call", function () {
  const result = logic.addManyEntries([], [
    { date: "2026-10-27", person: "pedro", obra: "almada" },
    { date: "2026-10-27", person: "pedro", obra: "almada" }
  ], makeMaker());
  assert.equal(result.entries.length, 1);
  assert.equal(result.affected.length, 1);
});

test("addManyEntries is all-or-nothing: one invalid item rejects the whole call", function () {
  const current = [];
  const result = logic.addManyEntries(current, [
    { date: "2026-10-27", person: "pedro", obra: "almada" },
    { date: "2026-02-30", person: "pedro", obra: "almada" }
  ], makeMaker());
  assert.equal(result.ok, false);
  assert.match(result.error, /item 2/);
  assert.deepEqual(current, []);
});

test("addManyEntries rejects an empty list, a non-array and more than 60 items", function () {
  assert.equal(logic.addManyEntries([], [], makeMaker()).ok, false);
  assert.equal(logic.addManyEntries([], "x", makeMaker()).ok, false);
  const many = [];
  for (let i = 0; i < 61; i++) many.push({ date: "2026-10-27", person: "pedro", obra: "almada" });
  assert.equal(logic.addManyEntries([], many, makeMaker()).ok, false);
  assert.equal(logic.MAX_MANY, 60);
});
EOF
node --test tests/unit/entries-logic.test.js 2>&1 | grep -E "^# (pass|fail)"
```
Expected: falhas (`buildEntry`/`addManyEntries` não existem).

- [ ] **Step 2: Implementar**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch
P = "netlify/functions/lib/entries-logic.js"
patch(P, [
  ("const MAX_COMMENT_LENGTH = 140;", "const MAX_COMMENT_LENGTH = 140;\nconst MAX_MANY = 60;"),
  ("function removeEntry(entries, id) {", '''function newId() {
  return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function buildEntry(payload, id, nowIso) {
  var entry = { id: id, date: payload.date, person: payload.person, obra: payload.obra, createdAt: nowIso };
  var comment = normalizeComment(payload.comment);
  if (comment) entry.comment = comment;
  if (payload.meeting) entry.meeting = normalizeMeeting(payload.meeting);
  return entry;
}

// All-or-nothing: every item is validated before anything is added. `affected` lists
// only the items that really changed the data (new slot, new comment or new meeting).
function addManyEntries(current, items, makeEntry) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "items obrigatório" };
  }
  if (items.length > MAX_MANY) {
    return { ok: false, error: "máximo de " + MAX_MANY + " itens por chamada" };
  }
  for (var i = 0; i < items.length; i++) {
    var check = validateEntry(items[i]);
    if (!check.ok) return { ok: false, error: "item " + (i + 1) + ": " + check.error };
  }
  var result = current;
  var affected = [];
  items.forEach(function (item) {
    var next = addEntry(result, makeEntry(item));
    if (next !== result) {
      affected.push({ person: item.person, date: item.date });
      result = next;
    }
  });
  return { ok: true, entries: result, affected: affected };
}

function removeEntry(entries, id) {'''),
  ("  addEntry, removeEntry, updateEntry, updateEntryComment\n};",
   "  addEntry, addManyEntries, buildEntry, newId, MAX_MANY,\n  removeEntry, updateEntry, updateEntryComment\n};"),
])
PY
node --test tests/unit/*.test.js 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# fail 0`.

- [ ] **Step 3: Commit**

Run (prefixo): `ga netlify/functions/lib/entries-logic.js tests/unit/entries-logic.test.js && gc "feat(L2): addManyEntries (all-or-nothing, max 60) and buildEntry"`

---

### Task 5: [L2] Semana programada (`weeks-logic`)

**Files:**
- Create: `netlify/functions/lib/weeks-logic.js`
- Test: `tests/unit/weeks-logic.test.js`

**Interfaces:**
- Consumes: `isRealDate`, `PEOPLE_IDS` de `entries-logic.js`.
- Produces: `isSunday(key)`, `weekKeyOf(dateKey) -> domingo da semana`, `validateWeekOp({week, person}) -> {ok, error?}`, `confirmWeek(weeks, week, person, iso)`, `unconfirmWeek(weeks, week, person)`, `reopenForEntries(weeks, affected)`. Todas são imutáveis e devolvem **a mesma referência** quando nada muda. Formato de `weeks`: `{ "AAAA-MM-DD": { "<pessoa>": "<ISO>" } }`.

- [ ] **Step 1: Escrever o teste que falha**

Run (prefixo):
```bash
cat > tests/unit/weeks-logic.test.js <<'EOF'
const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../../netlify/functions/lib/weeks-logic");

test("isSunday accepts only real Sundays", function () {
  assert.equal(W.isSunday("2026-10-25"), true);
  assert.equal(W.isSunday("2026-10-26"), false);
  assert.equal(W.isSunday("2026-02-30"), false);
  assert.equal(W.isSunday("nope"), false);
});

test("weekKeyOf returns the Sunday that starts the week, across month boundaries", function () {
  assert.equal(W.weekKeyOf("2026-10-27"), "2026-10-25");
  assert.equal(W.weekKeyOf("2026-10-25"), "2026-10-25");
  assert.equal(W.weekKeyOf("2026-10-31"), "2026-10-25");
  assert.equal(W.weekKeyOf("2026-10-01"), "2026-09-27");
  assert.equal(W.weekKeyOf("2027-01-02"), "2026-12-27");
});

test("validateWeekOp checks the Sunday and the person", function () {
  assert.deepEqual(W.validateWeekOp({ week: "2026-10-25", person: "pedro" }), { ok: true });
  assert.equal(W.validateWeekOp({ week: "2026-10-26", person: "pedro" }).ok, false);
  assert.equal(W.validateWeekOp({ week: "2026-10-25", person: "ninguem" }).ok, false);
});

test("confirmWeek records the person and does not mutate; confirming twice is a no-op", function () {
  const empty = {};
  const one = W.confirmWeek(empty, "2026-10-25", "pedro", "2026-10-27T12:00:00.000Z");
  assert.deepEqual(one, { "2026-10-25": { pedro: "2026-10-27T12:00:00.000Z" } });
  assert.deepEqual(empty, {});
  assert.equal(W.confirmWeek(one, "2026-10-25", "pedro", "later"), one);
  const two = W.confirmWeek(one, "2026-10-25", "jean", "t2");
  assert.deepEqual(Object.keys(two["2026-10-25"]).sort(), ["jean", "pedro"]);
});

test("unconfirmWeek removes the person, drops empty weeks and is a no-op when absent", function () {
  const weeks = { "2026-10-25": { pedro: "t1", jean: "t2" } };
  const afterOne = W.unconfirmWeek(weeks, "2026-10-25", "pedro");
  assert.deepEqual(afterOne, { "2026-10-25": { jean: "t2" } });
  assert.deepEqual(W.unconfirmWeek(afterOne, "2026-10-25", "jean"), {});
  assert.equal(W.unconfirmWeek(weeks, "2026-10-25", "bruna"), weeks);
  assert.equal(W.unconfirmWeek(weeks, "2026-11-01", "pedro"), weeks);
  assert.deepEqual(weeks, { "2026-10-25": { pedro: "t1", jean: "t2" } });
});

test("reopenForEntries reopens the week of each affected person and only theirs", function () {
  const weeks = { "2026-10-25": { pedro: "t1", jean: "t2" }, "2026-11-01": { pedro: "t3" } };
  const result = W.reopenForEntries(weeks, [{ person: "pedro", date: "2026-10-28" }]);
  assert.deepEqual(result, { "2026-10-25": { jean: "t2" }, "2026-11-01": { pedro: "t3" } });
  assert.equal(W.reopenForEntries(weeks, []), weeks);
  assert.equal(W.reopenForEntries(weeks, [{ person: "bruna", date: "2026-10-28" }]), weeks);
});
EOF
node --test tests/unit/weeks-logic.test.js 2>&1 | grep -E "^# (pass|fail)|Cannot find"
```
Expected: falha (`Cannot find module`).

- [ ] **Step 2: Implementar**

Run (prefixo):
```bash
cat > netlify/functions/lib/weeks-logic.js <<'EOF'
"use strict";

const { isRealDate, PEOPLE_IDS } = require("./entries-logic");

function pad(n) { return (n < 10 ? "0" : "") + n; }

function parts(key) { return key.split("-").map(Number); }

function dayOfWeekUTC(key) {
  var p = parts(key);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
}

function isSunday(key) {
  return isRealDate(key) && dayOfWeekUTC(key) === 0;
}

// The Sunday that starts the week containing `dateKey` (the calendar starts on Sunday).
function weekKeyOf(dateKey) {
  var p = parts(dateKey);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] - dayOfWeekUTC(dateKey)));
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
}

function validateWeekOp(payload) {
  if (!isSunday(payload.week)) {
    return { ok: false, error: "semana inválida (esperado o domingo, AAAA-MM-DD)" };
  }
  if (!PEOPLE_IDS.includes(payload.person)) {
    return { ok: false, error: "pessoa inválida" };
  }
  return { ok: true };
}

// All three return the very same object when nothing changes.
function confirmWeek(weeks, week, person, iso) {
  if (weeks[week] && weeks[week][person]) return weeks;
  var next = Object.assign({}, weeks);
  next[week] = Object.assign({}, weeks[week]);
  next[week][person] = iso;
  return next;
}

function unconfirmWeek(weeks, week, person) {
  if (!weeks[week] || !weeks[week][person]) return weeks;
  var next = Object.assign({}, weeks);
  var inner = Object.assign({}, weeks[week]);
  delete inner[person];
  if (Object.keys(inner).length) next[week] = inner; else delete next[week];
  return next;
}

function reopenForEntries(weeks, affected) {
  return affected.reduce(function (acc, item) {
    return unconfirmWeek(acc, weekKeyOf(item.date), item.person);
  }, weeks);
}

module.exports = { isSunday, weekKeyOf, validateWeekOp, confirmWeek, unconfirmWeek, reopenForEntries };
EOF
node --test tests/unit/*.test.js 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# fail 0`.

- [ ] **Step 3: Commit**

Run (prefixo): `ga netlify/functions/lib/weeks-logic.js tests/unit/weeks-logic.test.js && gc "feat(L2): weeks-logic (confirm, unconfirm, reopen on change)"`

---

### Task 6: [L3] Lista de pessoas e hash de senha

**Files:**
- Create: `netlify/functions/lib/people.js`, `netlify/functions/lib/passwords.js`
- Test: `tests/unit/people.test.js`, `tests/unit/passwords.test.js`

**Interfaces:**
- Produces: `PEOPLE: [{id, name, role}]` (mesma ordem e ids de `PEOPLE_IDS`), `ADMIN_IDS: ["pedro"]`; `hashPassword(password) -> { salt, hash }` (hex); `verifyPassword(password, record) -> boolean` (registro com `salt` e `hash`; comparação em tempo constante; registro ausente ou incompleto → `false`).

- [ ] **Step 1: Escrever os testes que falham**

Run (prefixo):
```bash
cat > tests/unit/people.test.js <<'EOF'
const test = require("node:test");
const assert = require("node:assert/strict");
const { PEOPLE, ADMIN_IDS } = require("../../netlify/functions/lib/people");
const { PEOPLE_IDS } = require("../../netlify/functions/lib/entries-logic");

test("PEOPLE matches PEOPLE_IDS in ids and order", function () {
  assert.deepEqual(PEOPLE.map(function (p) { return p.id; }), PEOPLE_IDS);
});

test("every person has a name and a role; only pedro is admin", function () {
  PEOPLE.forEach(function (p) {
    assert.ok(p.name && p.role, p.id);
  });
  assert.deepEqual(ADMIN_IDS, ["pedro"]);
});
EOF
cat > tests/unit/passwords.test.js <<'EOF'
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
EOF
node --test tests/unit/people.test.js tests/unit/passwords.test.js 2>&1 | grep -E "^# (pass|fail)|Cannot find" | head -3
```
Expected: falha (módulos não existem).

- [ ] **Step 2: Implementar**

Run (prefixo):
```bash
cat > netlify/functions/lib/people.js <<'EOF'
"use strict";

// Fonte única das pessoas no backend (o frontend tem a sua cópia em public/index.html).
const PEOPLE = [
  { id: "pedro", name: "Pedro", role: "Custos" },
  { id: "jean", name: "Jean", role: "PCP" },
  { id: "haniel", name: "Haniel", role: "PCP" },
  { id: "gustavo", name: "Gustavo", role: "Qualidade" },
  { id: "bruna", name: "Bruna", role: "Projetos" }
];

const ADMIN_IDS = ["pedro"];

module.exports = { PEOPLE, ADMIN_IDS };
EOF
cat > netlify/functions/lib/passwords.js <<'EOF'
"use strict";

const crypto = require("node:crypto");

const KEY_LENGTH = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, KEY_LENGTH).toString("hex");
  return { salt: salt, hash: hash };
}

function verifyPassword(password, record) {
  if (!record || typeof record.salt !== "string" || typeof record.hash !== "string") return false;
  if (typeof password !== "string" || password === "") return false;
  const expected = Buffer.from(record.hash, "hex");
  if (expected.length === 0) return false;
  const actual = crypto.scryptSync(password, record.salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, verifyPassword };
EOF
node --test tests/unit/*.test.js 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# fail 0`.

- [ ] **Step 3: Commit**

Run (prefixo): `ga netlify/functions/lib/people.js netlify/functions/lib/passwords.js tests/unit/people.test.js tests/unit/passwords.test.js && gc "feat(L3): people list and scrypt password hashing"`

---

### Task 7: [L3] Sessão assinada em cookie

**Files:**
- Create: `netlify/functions/lib/session.js`
- Test: `tests/unit/session.test.js`

**Interfaces:**
- Produces: `COOKIE_NAME = "agenda_session"`, `MAX_AGE_SECONDS = 2592000`; `signSession(payload, secret) -> token`; `verifySession(token, secret, nowMs) -> payload|null` (`null` se malformado, adulterado, secret errado ou `exp <= nowMs`); `parseCookies(headerString) -> {nome: valor}`; `buildCookie(token, {secure}) -> string` (`HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`, mais `Secure` a menos que `secure === false`); `clearCookie({secure}) -> string` (`Max-Age=0`). O payload usado pelo sistema é `{ u: id, pv: número, exp: ms }`.

- [ ] **Step 1: Escrever o teste que falha**

Run (prefixo):
```bash
cat > tests/unit/session.test.js <<'EOF'
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
EOF
node --test tests/unit/session.test.js 2>&1 | grep -E "^# (pass|fail)|Cannot find" | head -3
```
Expected: falha (módulo não existe).

- [ ] **Step 2: Implementar**

Run (prefixo):
```bash
cat > netlify/functions/lib/session.js <<'EOF'
"use strict";

const crypto = require("node:crypto");

const COOKIE_NAME = "agenda_session";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function sign(data, secret) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

function signSession(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return body + "." + sign(body, secret);
}

function verifySession(token, secret, nowMs) {
  if (typeof token !== "string" || typeof secret !== "string" || !secret) return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(body, secret));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch (e) {
    return null;
  }
  if (!payload || typeof payload.exp !== "number" || payload.exp <= nowMs) return null;
  return payload;
}

function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach(function (part) {
    const idx = part.indexOf("=");
    if (idx < 0) return;
    const name = part.slice(0, idx).trim();
    const raw = part.slice(idx + 1).trim();
    try { out[name] = decodeURIComponent(raw); } catch (e) { out[name] = raw; }
  });
  return out;
}

function attrs(maxAge, opts) {
  const parts = ["HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=" + maxAge];
  if (!opts || opts.secure !== false) parts.push("Secure");
  return parts.join("; ");
}

function buildCookie(token, opts) {
  return COOKIE_NAME + "=" + token + "; " + attrs(MAX_AGE_SECONDS, opts);
}

function clearCookie(opts) {
  return COOKIE_NAME + "=; " + attrs(0, opts);
}

module.exports = { COOKIE_NAME, MAX_AGE_SECONDS, signSession, verifySession, parseCookies, buildCookie, clearCookie };
EOF
node --test tests/unit/session.test.js 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# fail 0`.

- [ ] **Step 3: Commit**

Run (prefixo): `ga netlify/functions/lib/session.js tests/unit/session.test.js && gc "feat(L3): signed session cookie (HMAC, 30 days, hardened attributes)"`

---

### Task 8: [L3] Usuários: semente, login com bloqueio, troca e zerar senha

**Files:**
- Create: `netlify/functions/lib/users-logic.js`
- Test: `tests/unit/users-logic.test.js`

**Interfaces:**
- Consumes: `hashPassword`, `verifyPassword` (Tarefa 6); `PEOPLE`, `ADMIN_IDS` (Tarefa 6).
- Produces (todas puras e imutáveis; `users` é `{ [id]: registro }`; registro = `{ id, name, role: "admin"|"user", salt, hash, mustChange, pv, failed, lockedUntil }`):
  - `seedUsers(initialPassword, people, adminIds) -> users` (todos `mustChange: true`, `pv: 1`).
  - `publicUser(rec) -> { id, name, role, mustChange }`.
  - `authenticate(users, id, password, nowMs) -> { ok: true, users, user } | { ok: false, status: 401|429, error, users }` — o `users` devolvido (com contadores atualizados) deve ser gravado pelo chamador.
  - `changePassword(users, id, current, next, initialPassword) -> { ok: true, users, user } | { ok: false, status, error }`.
  - `resetPassword(users, id, initialPassword) -> { ok: true, users, user } | { ok: false, status: 404, error }`.
  - Constantes: `MAX_FAILED = 5`, `LOCK_MS = 900000`, `MIN_LENGTH = 8`.

- [ ] **Step 1: Escrever o teste que falha**

Run (prefixo):
```bash
cat > tests/unit/users-logic.test.js <<'EOF'
const test = require("node:test");
const assert = require("node:assert/strict");
const U = require("../../netlify/functions/lib/users-logic");
const { PEOPLE, ADMIN_IDS } = require("../../netlify/functions/lib/people");
const { verifyPassword } = require("../../netlify/functions/lib/passwords");

const INITIAL = "Mudar@123";
const NOW = 1000000000000;
const SEEDED = U.seedUsers(INITIAL, PEOPLE, ADMIN_IDS);
function fresh() { return JSON.parse(JSON.stringify(SEEDED)); }

test("seedUsers creates the five people with the initial password, pedro as admin, all must change it", function () {
  const users = fresh();
  assert.deepEqual(Object.keys(users), ["pedro", "jean", "haniel", "gustavo", "bruna"]);
  assert.equal(users.pedro.role, "admin");
  assert.equal(users.jean.role, "user");
  Object.keys(users).forEach(function (id) {
    assert.equal(users[id].mustChange, true);
    assert.equal(users[id].pv, 1);
    assert.equal(verifyPassword(INITIAL, users[id]), true);
  });
  assert.notEqual(users.pedro.hash, users.jean.hash);
});

test("publicUser exposes only id, name, role and mustChange", function () {
  assert.deepEqual(U.publicUser(fresh().pedro), { id: "pedro", name: "Pedro", role: "admin", mustChange: true });
});

test("authenticate succeeds with the right password and clears the failure counter", function () {
  const users = fresh();
  users.jean.failed = 3;
  const res = U.authenticate(users, "jean", INITIAL, NOW);
  assert.equal(res.ok, true);
  assert.equal(res.user.id, "jean");
  assert.equal(res.users.jean.failed, 0);
  assert.equal(users.jean.failed, 3);
});

test("authenticate gives the same generic error for a wrong password and an unknown user", function () {
  const users = fresh();
  const wrong = U.authenticate(users, "jean", "errada", NOW);
  const unknown = U.authenticate(users, "ninguem", "errada", NOW);
  assert.equal(wrong.ok, false);
  assert.equal(wrong.status, 401);
  assert.equal(wrong.error, unknown.error);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.users.jean.failed, 1);
});

test("five wrong passwords lock the user for 15 minutes, even for the right password, then it unlocks", function () {
  let users = fresh();
  for (let i = 0; i < 5; i++) {
    const res = U.authenticate(users, "jean", "errada", NOW + i);
    assert.equal(res.status, 401);
    users = res.users;
  }
  const locked = U.authenticate(users, "jean", INITIAL, NOW + 10);
  assert.equal(locked.ok, false);
  assert.equal(locked.status, 429);
  const still = U.authenticate(users, "jean", INITIAL, NOW + 4 + 15 * 60 * 1000 - 1);
  assert.equal(still.status, 429);
  const later = U.authenticate(users, "jean", INITIAL, NOW + 4 + 15 * 60 * 1000 + 1);
  assert.equal(later.ok, true);
});

test("changePassword enforces the rules, clears mustChange and bumps the session version", function () {
  const users = fresh();
  assert.equal(U.changePassword(users, "jean", "errada", "NovaSenha1", INITIAL).status, 401);
  assert.equal(U.changePassword(users, "jean", INITIAL, "curta", INITIAL).status, 400);
  assert.equal(U.changePassword(users, "jean", INITIAL, INITIAL, INITIAL).status, 400);
  const ok = U.changePassword(users, "jean", INITIAL, "NovaSenha1", INITIAL);
  assert.equal(ok.ok, true);
  assert.equal(ok.user.mustChange, false);
  assert.equal(ok.user.pv, 2);
  assert.equal(verifyPassword("NovaSenha1", ok.users.jean), true);
  assert.equal(verifyPassword(INITIAL, ok.users.jean), false);
  assert.equal(users.jean.mustChange, true);
});

test("resetPassword puts the initial password back, forces a change, bumps pv and clears the lock", function () {
  const changed = U.changePassword(fresh(), "jean", INITIAL, "NovaSenha1", INITIAL).users;
  changed.jean.lockedUntil = NOW + 999999;
  changed.jean.failed = 4;
  const res = U.resetPassword(changed, "jean", INITIAL);
  assert.equal(res.ok, true);
  assert.equal(res.user.mustChange, true);
  assert.equal(res.user.pv, 3);
  assert.equal(res.user.lockedUntil, 0);
  assert.equal(res.user.failed, 0);
  assert.equal(verifyPassword(INITIAL, res.users.jean), true);
  assert.equal(U.resetPassword(changed, "ninguem", INITIAL).status, 404);
});
EOF
node --test tests/unit/users-logic.test.js 2>&1 | grep -E "^# (pass|fail)|Cannot find" | head -3
```
Expected: falha (módulo não existe).

- [ ] **Step 2: Implementar**

Run (prefixo):
```bash
cat > netlify/functions/lib/users-logic.js <<'EOF'
"use strict";

const { hashPassword, verifyPassword } = require("./passwords");

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
const MIN_LENGTH = 8;
const INVALID = "usuário ou senha inválidos";

let dummyRecord = null;
function dummy() {
  if (!dummyRecord) dummyRecord = hashPassword("dummy-password-for-timing");
  return dummyRecord;
}

function seedUsers(initialPassword, people, adminIds) {
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

function withUser(users, rec) {
  const next = Object.assign({}, users);
  next[rec.id] = rec;
  return next;
}

function authenticate(users, id, password, nowMs) {
  const rec = users[id];
  if (!rec) {
    verifyPassword(password, dummy());
    return { ok: false, status: 401, error: INVALID, users: users };
  }
  if (rec.lockedUntil && rec.lockedUntil > nowMs) {
    return { ok: false, status: 429, error: "muitas tentativas; tente de novo em alguns minutos", users: users };
  }
  const updated = Object.assign({}, rec);
  if (verifyPassword(password, rec)) {
    updated.failed = 0;
    updated.lockedUntil = 0;
    return { ok: true, users: withUser(users, updated), user: updated };
  }
  updated.failed = (rec.failed || 0) + 1;
  if (updated.failed >= MAX_FAILED) {
    updated.failed = 0;
    updated.lockedUntil = nowMs + LOCK_MS;
  }
  return { ok: false, status: 401, error: INVALID, users: withUser(users, updated) };
}

function changePassword(users, id, current, next, initialPassword) {
  const rec = users[id];
  if (!rec || !verifyPassword(current, rec)) {
    return { ok: false, status: 401, error: "senha atual incorreta" };
  }
  if (typeof next !== "string" || next.length < MIN_LENGTH) {
    return { ok: false, status: 400, error: "a nova senha precisa ter pelo menos " + MIN_LENGTH + " caracteres" };
  }
  if (next === initialPassword || next === current) {
    return { ok: false, status: 400, error: "escolha uma senha diferente da atual e da senha inicial" };
  }
  const h = hashPassword(next);
  const updated = Object.assign({}, rec, {
    salt: h.salt, hash: h.hash, mustChange: false, pv: rec.pv + 1, failed: 0, lockedUntil: 0
  });
  return { ok: true, users: withUser(users, updated), user: updated };
}

function resetPassword(users, id, initialPassword) {
  const rec = users[id];
  if (!rec) return { ok: false, status: 404, error: "usuário não encontrado" };
  const h = hashPassword(initialPassword);
  const updated = Object.assign({}, rec, {
    salt: h.salt, hash: h.hash, mustChange: true, pv: rec.pv + 1, failed: 0, lockedUntil: 0
  });
  return { ok: true, users: withUser(users, updated), user: updated };
}

module.exports = { MAX_FAILED, LOCK_MS, MIN_LENGTH, seedUsers, publicUser, authenticate, changePassword, resetPassword };
EOF
node --test tests/unit/*.test.js 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# fail 0`.

- [ ] **Step 3: Commit**

Run (prefixo): `ga netlify/functions/lib/users-logic.js tests/unit/users-logic.test.js && gc "feat(L3): users logic (seed, login lockout, change and reset password)"`

---

### Task 9: [L3] Matriz de autorização

**Files:**
- Create: `netlify/functions/lib/access.js`
- Test: `tests/unit/access.test.js`

**Interfaces:**
- Produces: `authorize(user, payload, entries) -> { ok: true } | { ok: false, status: 401|403, error }`. `user` é o registro do usuário logado ou `null`. Regras: sem usuário → 401; `mustChange` → 403; administrador → ok; usuário comum só age no próprio `person` (`add`, `confirmWeek`, `unconfirmWeek`, todos os itens de `addMany`, e a marcação dona do `id` em `update`/`remove`). `update`/`remove` de id inexistente e `op` desconhecida passam (a validação posterior responde 404/400).

- [ ] **Step 1: Escrever o teste que falha**

Run (prefixo):
```bash
cat > tests/unit/access.test.js <<'EOF'
const test = require("node:test");
const assert = require("node:assert/strict");
const { authorize } = require("../../netlify/functions/lib/access");

const jean = { id: "jean", role: "user", mustChange: false };
const pedro = { id: "pedro", role: "admin", mustChange: false };
const entries = [
  { id: "e1", person: "jean", date: "2026-10-27", obra: "almada" },
  { id: "e2", person: "haniel", date: "2026-10-27", obra: "porto" }
];

test("anonymous users cannot write anything (401)", function () {
  ["add", "addMany", "update", "remove", "confirmWeek", "unconfirmWeek", "nope"].forEach(function (op) {
    const res = authorize(null, { op: op, person: "jean" }, entries);
    assert.equal(res.ok, false, op);
    assert.equal(res.status, 401, op);
  });
});

test("a user who still has to change the password is blocked (403)", function () {
  const res = authorize({ id: "jean", role: "user", mustChange: true }, { op: "add", person: "jean" }, entries);
  assert.equal(res.ok, false);
  assert.equal(res.status, 403);
  assert.equal(authorize({ id: "pedro", role: "admin", mustChange: true }, { op: "add", person: "jean" }, entries).status, 403);
});

test("a regular user acts only on their own name", function () {
  assert.equal(authorize(jean, { op: "add", person: "jean" }, entries).ok, true);
  assert.equal(authorize(jean, { op: "add", person: "haniel" }, entries).status, 403);
  assert.equal(authorize(jean, { op: "confirmWeek", person: "jean" }, entries).ok, true);
  assert.equal(authorize(jean, { op: "unconfirmWeek", person: "haniel" }, entries).status, 403);
  assert.equal(authorize(jean, { op: "addMany", items: [{ person: "jean" }, { person: "jean" }] }, entries).ok, true);
  assert.equal(authorize(jean, { op: "addMany", items: [{ person: "jean" }, { person: "haniel" }] }, entries).status, 403);
});

test("update and remove check the owner of the entry", function () {
  assert.equal(authorize(jean, { op: "update", id: "e1" }, entries).ok, true);
  assert.equal(authorize(jean, { op: "remove", id: "e1" }, entries).ok, true);
  assert.equal(authorize(jean, { op: "update", id: "e2" }, entries).status, 403);
  assert.equal(authorize(jean, { op: "remove", id: "e2" }, entries).status, 403);
});

test("unknown ids, malformed payloads and unknown ops pass authorization for later validation", function () {
  assert.equal(authorize(jean, { op: "remove", id: "nao-existe" }, entries).ok, true);
  assert.equal(authorize(jean, { op: "addMany", items: "x" }, entries).ok, true);
  assert.equal(authorize(jean, { op: "nope" }, entries).ok, true);
});

test("the administrator can act on anyone", function () {
  assert.equal(authorize(pedro, { op: "add", person: "haniel" }, entries).ok, true);
  assert.equal(authorize(pedro, { op: "remove", id: "e2" }, entries).ok, true);
  assert.equal(authorize(pedro, { op: "addMany", items: [{ person: "jean" }, { person: "bruna" }] }, entries).ok, true);
  assert.equal(authorize(pedro, { op: "confirmWeek", person: "gustavo" }, entries).ok, true);
});
EOF
node --test tests/unit/access.test.js 2>&1 | grep -E "^# (pass|fail)|Cannot find" | head -3
```
Expected: falha (módulo não existe).

- [ ] **Step 2: Implementar**

Run (prefixo):
```bash
cat > netlify/functions/lib/access.js <<'EOF'
"use strict";

function deny(status, error) {
  return { ok: false, status: status, error: error };
}

const OWN = "você só pode alterar as suas próprias marcações";

function authorize(user, payload, entries) {
  if (!user) return deny(401, "faça login para alterar a agenda");
  if (user.mustChange) return deny(403, "troque a senha antes de alterar a agenda");
  if (user.role === "admin") return { ok: true };

  function own(person) {
    return person === user.id ? { ok: true } : deny(403, OWN);
  }

  switch (payload.op) {
    case "add":
    case "confirmWeek":
    case "unconfirmWeek":
      return own(payload.person);
    case "addMany": {
      if (!Array.isArray(payload.items)) return { ok: true };
      for (var i = 0; i < payload.items.length; i++) {
        var item = payload.items[i];
        if (!item || item.person !== user.id) return deny(403, OWN);
      }
      return { ok: true };
    }
    case "update":
    case "remove": {
      var entry = (entries || []).filter(function (en) { return en.id === payload.id; })[0];
      return entry ? own(entry.person) : { ok: true };
    }
    default:
      return { ok: true };
  }
}

module.exports = { authorize };
EOF
node --test tests/unit/*.test.js 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# fail 0`.

- [ ] **Step 3: Commit**

Run (prefixo): `ga netlify/functions/lib/access.js tests/unit/access.test.js && gc "feat(L3): authorization matrix (anonymous, user, admin)"`

---

### Task 10: [L3] Backup: snapshot diário, exportação e restauração

**Files:**
- Create: `netlify/functions/lib/backup-logic.js`, `tests/unit/helpers/fake-store.js`
- Test: `tests/unit/backup-logic.test.js`

**Interfaces:**
- Produces:
  - `makeFakeStore(initialEntries, extra) -> store` (helper de teste) com `get(key)`, `setJSON(key, value)`, `delete(key)`, `list({prefix}) -> { blobs: [{key}] }` e `store.data` exposto. `makeFakeStore(null)` ⇒ `get("entries")` devolve `null`.
  - `dayKeySP(nowMs) -> "AAAA-MM-DD"` em `America/Sao_Paulo`.
  - `keysToPrune(keys, keep) -> string[]` (só chaves `backup-AAAA-MM-DD`; as mais antigas além de `keep`).
  - `buildExport(entries, weeks, nowMs) -> { exportedAt, entries, weeks }`.
  - `ensureDailySnapshot(store, nowMs, keep = 30) -> Promise<boolean>` (cria `backup-<dia>` com `{createdAt, entries, weeks}` na primeira chamada do dia, poda, devolve `true`; senão `false`).
  - `listBackups(store) -> Promise<[{id, kind: "daily"|"prerestore", label}]>` mais recentes primeiro.
  - `restoreSnapshot(store, id, nowMs) -> Promise<{ ok: true } | { ok: false, status: 400|404, error }>` — grava antes `backup-prerestore-<ISO sem : e .>` com o estado atual; restaura só `entries` e `weeks`.

- [ ] **Step 1: Escrever o helper e o teste que falha**

Run (prefixo):
```bash
mkdir -p tests/unit/helpers
cat > tests/unit/helpers/fake-store.js <<'EOF'
"use strict";

// In-memory stand-in for a Netlify Blobs store.
function makeFakeStore(initialEntries, extra) {
  const data = Object.assign({ entries: initialEntries }, extra || {});
  return {
    data: data,
    get: async function (key) { return data[key] === undefined ? null : data[key]; },
    setJSON: async function (key, value) { data[key] = JSON.parse(JSON.stringify(value)); },
    delete: async function (key) { delete data[key]; },
    list: async function (opts) {
      const prefix = (opts && opts.prefix) || "";
      return { blobs: Object.keys(data).filter(function (k) { return k.indexOf(prefix) === 0; }).map(function (k) { return { key: k }; }) };
    }
  };
}

module.exports = { makeFakeStore };
EOF
cat > tests/unit/backup-logic.test.js <<'EOF'
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../../netlify/functions/lib/backup-logic");
const { makeFakeStore } = require("./helpers/fake-store");

const T1 = Date.UTC(2026, 9, 27, 15, 0, 0);

test("dayKeySP uses the Sao Paulo calendar day (UTC-3)", function () {
  assert.equal(B.dayKeySP(Date.UTC(2026, 9, 28, 2, 30)), "2026-10-27");
  assert.equal(B.dayKeySP(Date.UTC(2026, 9, 28, 3, 30)), "2026-10-28");
  assert.equal(B.dayKeySP(T1), "2026-10-27");
});

test("keysToPrune keeps the newest daily snapshots and never touches other keys", function () {
  const keys = ["backup-2026-10-01", "backup-2026-10-02", "backup-2026-10-03", "backup-prerestore-2026-10-01T00-00-00-000Z", "entries", "users"];
  assert.deepEqual(B.keysToPrune(keys, 2), ["backup-2026-10-01"]);
  assert.deepEqual(B.keysToPrune(keys, 5), []);
});

test("buildExport has entries, weeks and a timestamp, and nothing about users", function () {
  const out = B.buildExport([{ id: "a" }], { "2026-10-25": { pedro: "t" } }, T1);
  assert.deepEqual(Object.keys(out).sort(), ["entries", "exportedAt", "weeks"]);
  assert.equal(out.exportedAt, "2026-10-27T15:00:00.000Z");
});

test("ensureDailySnapshot snapshots once per day and prunes old ones", async function () {
  const store = makeFakeStore([{ id: "a" }], { weeks: { "2026-10-25": { pedro: "t" } } });
  assert.equal(await B.ensureDailySnapshot(store, T1, 2), true);
  assert.deepEqual(store.data["backup-2026-10-27"], { createdAt: "2026-10-27T15:00:00.000Z", entries: [{ id: "a" }], weeks: { "2026-10-25": { pedro: "t" } } });
  assert.equal(await B.ensureDailySnapshot(store, T1 + 1000, 2), false);
  await B.ensureDailySnapshot(store, T1 + 86400000, 2);
  await B.ensureDailySnapshot(store, T1 + 2 * 86400000, 2);
  const daily = Object.keys(store.data).filter(function (k) { return /^backup-\d/.test(k); }).sort();
  assert.deepEqual(daily, ["backup-2026-10-28", "backup-2026-10-29"]);
});

test("listBackups returns newest first with a readable kind and label", async function () {
  const store = makeFakeStore([], { "backup-2026-10-26": {}, "backup-2026-10-27": {}, "backup-prerestore-2026-10-27T15-00-00-000Z": {}, users: {} });
  const list = await B.listBackups(store);
  assert.deepEqual(list.map(function (b) { return b.id; }), ["backup-prerestore-2026-10-27T15-00-00-000Z", "backup-2026-10-27", "backup-2026-10-26"]);
  assert.deepEqual(list.map(function (b) { return b.kind; }), ["prerestore", "daily", "daily"]);
  assert.match(list[1].label, /27\/10\/2026/);
});

test("restoreSnapshot restores entries and weeks after saving a pre-restore snapshot", async function () {
  const store = makeFakeStore([{ id: "atual" }], {
    weeks: { "2026-11-01": { jean: "t" } },
    "backup-2026-10-26": { createdAt: "x", entries: [{ id: "antigo" }], weeks: {} }
  });
  const res = await B.restoreSnapshot(store, "backup-2026-10-26", T1);
  assert.deepEqual(res, { ok: true });
  assert.deepEqual(store.data.entries, [{ id: "antigo" }]);
  assert.deepEqual(store.data.weeks, {});
  const pre = store.data["backup-prerestore-2026-10-27T15-00-00-000Z"];
  assert.deepEqual(pre.entries, [{ id: "atual" }]);
  assert.deepEqual(pre.weeks, { "2026-11-01": { jean: "t" } });
});

test("restoreSnapshot refuses ids that are not snapshots and snapshots that do not exist", async function () {
  const store = makeFakeStore([{ id: "atual" }], { users: { pedro: {} } });
  assert.equal((await B.restoreSnapshot(store, "users", T1)).status, 400);
  assert.equal((await B.restoreSnapshot(store, "../entries", T1)).status, 400);
  assert.equal((await B.restoreSnapshot(store, "backup-2020-01-01", T1)).status, 404);
  assert.deepEqual(store.data.entries, [{ id: "atual" }]);
});
EOF
node --test tests/unit/backup-logic.test.js 2>&1 | grep -E "^# (pass|fail)|Cannot find" | head -3
```
Expected: falha (módulo não existe).

- [ ] **Step 2: Implementar**

Run (prefixo):
```bash
cat > netlify/functions/lib/backup-logic.js <<'EOF'
"use strict";

const PREFIX = "backup-";
const KEEP_DEFAULT = 30;
const DAILY_RE = /^backup-\d{4}-\d{2}-\d{2}$/;
const PRERESTORE_PREFIX = "backup-prerestore-";
const RESTORABLE_RE = /^backup-(\d{4}-\d{2}-\d{2}|prerestore-[0-9TZ-]+)$/;

function dayKeySP(nowMs) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(nowMs));
}

function keysToPrune(keys, keep) {
  const daily = keys.filter(function (k) { return DAILY_RE.test(k); }).sort();
  return daily.length > keep ? daily.slice(0, daily.length - keep) : [];
}

function buildExport(entries, weeks, nowMs) {
  return { exportedAt: new Date(nowMs).toISOString(), entries: entries, weeks: weeks };
}

async function readState(store) {
  const entries = (await store.get("entries", { type: "json" })) || [];
  const weeks = (await store.get("weeks", { type: "json" })) || {};
  return { entries: entries, weeks: weeks };
}

async function ensureDailySnapshot(store, nowMs, keep) {
  const key = PREFIX + dayKeySP(nowMs);
  if (await store.get(key, { type: "json" })) return false;
  const state = await readState(store);
  await store.setJSON(key, { createdAt: new Date(nowMs).toISOString(), entries: state.entries, weeks: state.weeks });
  const listing = await store.list({ prefix: PREFIX });
  const old = keysToPrune(listing.blobs.map(function (b) { return b.key; }), keep || KEEP_DEFAULT);
  for (var i = 0; i < old.length; i++) await store.delete(old[i]);
  return true;
}

function labelFor(key) {
  if (DAILY_RE.test(key)) {
    var p = key.slice(PREFIX.length).split("-");
    return "Diário " + p[2] + "/" + p[1] + "/" + p[0];
  }
  return "Antes de uma restauração (" + key.slice(PRERESTORE_PREFIX.length) + ")";
}

async function listBackups(store) {
  const listing = await store.list({ prefix: PREFIX });
  return listing.blobs
    .map(function (b) { return b.key; })
    .filter(function (k) { return RESTORABLE_RE.test(k); })
    .sort()
    .reverse()
    .map(function (k) {
      return { id: k, kind: DAILY_RE.test(k) ? "daily" : "prerestore", label: labelFor(k) };
    });
}

async function restoreSnapshot(store, id, nowMs) {
  if (typeof id !== "string" || !RESTORABLE_RE.test(id)) {
    return { ok: false, status: 400, error: "backup inválido" };
  }
  const snapshot = await store.get(id, { type: "json" });
  if (!snapshot || !Array.isArray(snapshot.entries)) {
    return { ok: false, status: 404, error: "backup não encontrado" };
  }
  const current = await readState(store);
  const preKey = PRERESTORE_PREFIX + new Date(nowMs).toISOString().replace(/[:.]/g, "-");
  await store.setJSON(preKey, { createdAt: new Date(nowMs).toISOString(), entries: current.entries, weeks: current.weeks });
  await store.setJSON("entries", snapshot.entries);
  await store.setJSON("weeks", snapshot.weeks || {});
  return { ok: true };
}

module.exports = { dayKeySP, keysToPrune, buildExport, readState, ensureDailySnapshot, listBackups, restoreSnapshot };
EOF
node --test tests/unit/*.test.js 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# fail 0`.

- [ ] **Step 3: Commit**

Run (prefixo): `ga netlify/functions/lib/backup-logic.js tests/unit/backup-logic.test.js tests/unit/helpers/fake-store.js && gc "feat(L3): daily snapshots, export and restore with pre-restore snapshot"`

---

### Task 11: [L3] Escolha da loja: produção × local isolado

**Files:**
- Create: `netlify/functions/lib/store.js`
- Test: `tests/unit/store.test.js`

**Interfaces:**
- Produces: `STORE_NAME = "agenda-obras"`, `LOCAL_STORE_NAME = "agenda-obras-dev"`; `isLocalEnv(env) -> boolean` (`NETLIFY_DEV === "true"` ou `AGENDA_LOCAL === "1"`); `storeConfigFor(env) -> { name, siteID?, token? }` (em ambiente local ignora `BLOBS_SITE_ID`/`BLOBS_TOKEN`); `resolveStore(env = process.env)` devolve o store do `@netlify/blobs` (importado só dentro da função).

- [ ] **Step 1: Escrever o teste que falha**

Run (prefixo):
```bash
cat > tests/unit/store.test.js <<'EOF'
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
EOF
node --test tests/unit/store.test.js 2>&1 | grep -E "^# (pass|fail)|Cannot find" | head -3
```
Expected: falha (módulo não existe).

- [ ] **Step 2: Implementar**

Run (prefixo):
```bash
cat > netlify/functions/lib/store.js <<'EOF'
"use strict";

const STORE_NAME = "agenda-obras";
const LOCAL_STORE_NAME = "agenda-obras-dev";

// `netlify dev` can inherit the site's variables (BLOBS_SITE_ID/BLOBS_TOKEN) and point
// at the production database. In a local environment we deliberately ignore them.
function isLocalEnv(env) {
  return env.NETLIFY_DEV === "true" || env.AGENDA_LOCAL === "1";
}

function storeConfigFor(env) {
  if (isLocalEnv(env)) return { name: LOCAL_STORE_NAME };
  if (env.BLOBS_SITE_ID && env.BLOBS_TOKEN) {
    return { name: STORE_NAME, siteID: env.BLOBS_SITE_ID, token: env.BLOBS_TOKEN };
  }
  return { name: STORE_NAME };
}

function resolveStore(env) {
  const { getStore } = require("@netlify/blobs");
  const config = storeConfigFor(env || process.env);
  return config.siteID ? getStore(config) : getStore(config.name);
}

module.exports = { STORE_NAME, LOCAL_STORE_NAME, isLocalEnv, storeConfigFor, resolveStore };
EOF
node --test tests/unit/*.test.js 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# fail 0`.

- [ ] **Step 3: Commit**

Run (prefixo): `ga netlify/functions/lib/store.js tests/unit/store.test.js && gc "feat(L3): store resolver that never touches production data in local environments"`

---

## Fase 2 — Funções Netlify (login, `entries` reescrita, admin)

### Task 12: [L3] Núcleo de autenticação e função `auth`

**Files:**
- Create: `netlify/functions/lib/auth-core.js`, `netlify/functions/auth.js`, `tests/unit/helpers/auth-helpers.js`
- Test: `tests/unit/auth-core.test.js`, `tests/unit/auth.test.js`

**Interfaces:**
- Consumes: `PEOPLE`, `ADMIN_IDS` (T6); `seedUsers`, `publicUser`, `authenticate`, `changePassword` (T8); `signSession`, `verifySession`, `parseCookies`, `buildCookie`, `clearCookie`, `COOKIE_NAME`, `MAX_AGE_SECONDS` (T7); `isLocalEnv`, `resolveStore` (T11); `makeFakeStore` (T10).
- Produces em `auth-core.js`:
  - `USERS_KEY = "users"`.
  - `readSettings(opts) -> { env, now, secret, initialPassword, secure }` (`opts = { env?, now? }`; padrão `process.env` e `Date.now`; `secure = !isLocalEnv(env)`).
  - `configProblem(settings) -> string | null` (`SESSION_SECRET` ausente ou com menos de 32 caracteres; `INITIAL_PASSWORD` ausente).
  - `header(event, name) -> string` (busca sem diferenciar maiúsculas; `""` se não houver).
  - `readJsonBody(event) -> { ok: true, payload } | { ok: false, status: 415|400, error }`.
  - `json(status, body, extraHeaders?) -> resposta Lambda`.
  - `resolveUserId(input) -> id | null` (aparado, minúsculo, só ids de `PEOPLE`).
  - `readUsers(store) -> users | null` e `loadUsers(store, settings) -> users` (semeia e grava na primeira chamada).
  - `currentUser(event, users, settings) -> registro | null` (valida assinatura, validade e `pv`).
  - `sessionCookieFor(rec, settings) -> string`.
- Produces `auth.js`: `exports.handler`, `exports.makeHandler(store, opts)`; API: `GET /api/auth → {user: {id,name,role,mustChange}|null}`; `POST {op:"login", user, password}`; `POST {op:"logout"}`; `POST {op:"changePassword", current, next}`.
- Produces `auth-helpers.js` (só testes): `SECRET`, `INITIAL`, `NOW`, `OPTS`, `seededUsers()`, `readyUsers()` (todos com `mustChange: false`), `cookieFor(users, id)`, `call(handler, body, cookie?) -> {status, body, headers}`, `storeWith(entries, extra?)` (store falso já com `users` prontos), `cookieOf(res)`.

- [ ] **Step 1: Escrever helpers e testes que falham**

Run (prefixo):
```bash
cat > tests/unit/helpers/auth-helpers.js <<'EOF'
"use strict";

const { signSession } = require("../../../netlify/functions/lib/session");
const { seedUsers } = require("../../../netlify/functions/lib/users-logic");
const { PEOPLE, ADMIN_IDS } = require("../../../netlify/functions/lib/people");
const { makeFakeStore } = require("./fake-store");

const SECRET = "s".repeat(32);
const INITIAL = "Mudar@123";
const NOW = Date.UTC(2026, 9, 27, 15, 0, 0);
const OPTS = { env: { SESSION_SECRET: SECRET, INITIAL_PASSWORD: INITIAL }, now: function () { return NOW; } };

let seeded = null;
function seededUsers() {
  if (!seeded) seeded = seedUsers(INITIAL, PEOPLE, ADMIN_IDS);
  return JSON.parse(JSON.stringify(seeded));
}

// Everybody already changed the initial password (mustChange false): the common case in tests.
function readyUsers() {
  const users = seededUsers();
  Object.keys(users).forEach(function (id) { users[id].mustChange = false; });
  return users;
}

function cookieFor(users, id) {
  return "agenda_session=" + signSession({ u: id, pv: users[id].pv, exp: NOW + 60000 }, SECRET);
}

function event(method, body, cookie) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return { httpMethod: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body) };
}

async function call(handler, body, cookie) {
  const res = await handler(event("POST", body, cookie));
  return { status: res.statusCode, body: JSON.parse(res.body), headers: res.headers };
}

function storeWith(entries, extra) {
  return makeFakeStore(entries, Object.assign({ users: readyUsers() }, extra || {}));
}

function cookieOf(res) {
  return res.headers["set-cookie"].split(";")[0];
}

module.exports = { SECRET, INITIAL, NOW, OPTS, seededUsers, readyUsers, cookieFor, event, call, storeWith, cookieOf };
EOF
cat > tests/unit/auth-core.test.js <<'EOF'
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../../netlify/functions/lib/auth-core");
const H = require("./helpers/auth-helpers");

test("configProblem flags a missing or short SESSION_SECRET and a missing INITIAL_PASSWORD", function () {
  const ok = A.readSettings({ env: { SESSION_SECRET: "x".repeat(32), INITIAL_PASSWORD: "Mudar@123" } });
  assert.equal(A.configProblem(ok), null);
  assert.match(A.configProblem(A.readSettings({ env: { INITIAL_PASSWORD: "a" } })), /SESSION_SECRET/);
  assert.match(A.configProblem(A.readSettings({ env: { SESSION_SECRET: "curto", INITIAL_PASSWORD: "a" } })), /SESSION_SECRET/);
  assert.match(A.configProblem(A.readSettings({ env: { SESSION_SECRET: "x".repeat(32) } })), /INITIAL_PASSWORD/);
});

test("readSettings: the cookie is Secure except in a local environment", function () {
  assert.equal(A.readSettings({ env: {} }).secure, true);
  assert.equal(A.readSettings({ env: { NETLIFY_DEV: "true" } }).secure, false);
  assert.equal(A.readSettings({ env: { AGENDA_LOCAL: "1" } }).secure, false);
});

test("header finds names regardless of case", function () {
  assert.equal(A.header({ headers: { "Content-Type": "application/json" } }, "content-type"), "application/json");
  assert.equal(A.header({}, "cookie"), "");
});

test("readJsonBody requires a JSON content type (415), valid JSON (400) and an object (400)", function () {
  const ok = A.readJsonBody({ headers: { "content-type": "application/json; charset=utf-8" }, body: '{"a":1}' });
  assert.deepEqual(ok, { ok: true, payload: { a: 1 } });
  assert.equal(A.readJsonBody({ headers: { "content-type": "text/plain" }, body: "{}" }).status, 415);
  assert.equal(A.readJsonBody({ headers: {}, body: "{}" }).status, 415);
  assert.equal(A.readJsonBody({ headers: { "content-type": "application/json" }, body: "{nope" }).status, 400);
  assert.equal(A.readJsonBody({ headers: { "content-type": "application/json" }, body: "[1]" }).status, 400);
  assert.equal(A.readJsonBody({ headers: { "content-type": "application/json" }, body: "null" }).status, 400);
});

test("resolveUserId accepts ids and names in any case, nothing else", function () {
  assert.equal(A.resolveUserId(" Pedro "), "pedro");
  assert.equal(A.resolveUserId("BRUNA"), "bruna");
  assert.equal(A.resolveUserId("__proto__"), null);
  assert.equal(A.resolveUserId("ninguem"), null);
  assert.equal(A.resolveUserId(undefined), null);
  assert.equal(A.resolveUserId({}), null);
});

test("currentUser accepts a valid cookie and rejects tampering, expiry and a stale password version", function () {
  const users = H.readyUsers();
  const settings = A.readSettings(H.OPTS);
  const good = { headers: { cookie: H.cookieFor(users, "jean") } };
  assert.equal(A.currentUser(good, users, settings).id, "jean");
  assert.equal(A.currentUser({ headers: {} }, users, settings), null);
  assert.equal(A.currentUser({ headers: { cookie: H.cookieFor(users, "jean") + "x" } }, users, settings), null);
  const later = A.readSettings({ env: H.OPTS.env, now: function () { return H.NOW + 120000; } });
  assert.equal(A.currentUser(good, users, later), null);
  const bumped = JSON.parse(JSON.stringify(users));
  bumped.jean.pv = 2;
  assert.equal(A.currentUser(good, bumped, settings), null);
  const gone = JSON.parse(JSON.stringify(users));
  delete gone.jean;
  assert.equal(A.currentUser(good, gone, settings), null);
});

test("loadUsers seeds the five users on the first call and reuses them afterwards", async function () {
  const { makeFakeStore } = require("./helpers/fake-store");
  const store = makeFakeStore([], {});
  const settings = A.readSettings(H.OPTS);
  assert.equal(await A.readUsers(store), null);
  const first = await A.loadUsers(store, settings);
  assert.deepEqual(Object.keys(first), ["pedro", "jean", "haniel", "gustavo", "bruna"]);
  assert.deepEqual(store.data.users, first);
  const second = await A.loadUsers(store, settings);
  assert.deepEqual(second, first);
});
EOF
cat > tests/unit/auth.test.js <<'EOF'
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
  assert.equal(res.body.user.role, "admin");
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
EOF
node --test tests/unit/auth-core.test.js tests/unit/auth.test.js 2>&1 | grep -E "^# (pass|fail)|Cannot find" | head -3
```
Expected: falha (módulos não existem).

- [ ] **Step 2: Implementar `auth-core.js` e `auth.js`**

Run (prefixo):
```bash
cat > netlify/functions/lib/auth-core.js <<'EOF'
"use strict";

const { PEOPLE, ADMIN_IDS } = require("./people");
const { seedUsers } = require("./users-logic");
const S = require("./session");
const { isLocalEnv } = require("./store");

const USERS_KEY = "users";
const MIN_SECRET_LENGTH = 32;

function readSettings(opts) {
  const env = (opts && opts.env) || process.env;
  const now = (opts && opts.now) || Date.now;
  return {
    env: env,
    now: now,
    secret: env.SESSION_SECRET || "",
    initialPassword: env.INITIAL_PASSWORD || "",
    secure: !isLocalEnv(env)
  };
}

function configProblem(settings) {
  if (settings.secret.length < MIN_SECRET_LENGTH) {
    return "SESSION_SECRET ausente ou curta demais (mínimo " + MIN_SECRET_LENGTH + " caracteres) nas variáveis de ambiente";
  }
  if (!settings.initialPassword) {
    return "INITIAL_PASSWORD ausente nas variáveis de ambiente";
  }
  return null;
}

function header(event, name) {
  const headers = (event && event.headers) || {};
  const wanted = name.toLowerCase();
  const keys = Object.keys(headers);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === wanted) return String(headers[keys[i]]);
  }
  return "";
}

function readJsonBody(event) {
  if (!/application\/json/i.test(header(event, "content-type"))) {
    return { ok: false, status: 415, error: "content-type deve ser application/json" };
  }
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { ok: false, status: 400, error: "JSON inválido" };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, status: 400, error: "corpo deve ser um objeto JSON" };
  }
  return { ok: true, payload: payload };
}

function json(status, body, extraHeaders) {
  return {
    statusCode: status,
    headers: Object.assign({ "content-type": "application/json", "cache-control": "no-store" }, extraHeaders || {}),
    body: JSON.stringify(body)
  };
}

function resolveUserId(input) {
  if (typeof input !== "string") return null;
  const id = input.trim().toLowerCase();
  return PEOPLE.some(function (p) { return p.id === id; }) ? id : null;
}

async function readUsers(store) {
  return (await store.get(USERS_KEY, { type: "json" })) || null;
}

async function loadUsers(store, settings) {
  let users = await readUsers(store);
  if (!users) {
    users = seedUsers(settings.initialPassword, PEOPLE, ADMIN_IDS);
    await store.setJSON(USERS_KEY, users);
  }
  return users;
}

function currentUser(event, users, settings) {
  const token = S.parseCookies(header(event, "cookie"))[S.COOKIE_NAME];
  const payload = S.verifySession(token, settings.secret, settings.now());
  if (!payload || !Object.prototype.hasOwnProperty.call(users, payload.u)) return null;
  const rec = users[payload.u];
  return rec.pv === payload.pv ? rec : null;
}

function sessionCookieFor(rec, settings) {
  const token = S.signSession({ u: rec.id, pv: rec.pv, exp: settings.now() + S.MAX_AGE_SECONDS * 1000 }, settings.secret);
  return S.buildCookie(token, { secure: settings.secure });
}

module.exports = {
  USERS_KEY, readSettings, configProblem, header, readJsonBody, json,
  resolveUserId, readUsers, loadUsers, currentUser, sessionCookieFor
};
EOF
cat > netlify/functions/auth.js <<'EOF'
"use strict";

const A = require("./lib/auth-core");
const U = require("./lib/users-logic");
const S = require("./lib/session");
const { resolveStore } = require("./lib/store");

const GENERIC_UNKNOWN_ID = "__desconhecido__";

function makeHandler(store, opts) {
  const settings = A.readSettings(opts);

  return async function handler(event) {
    if (event.httpMethod === "GET") {
      if (!A.header(event, "cookie") || A.configProblem(settings)) return A.json(200, { user: null });
      const users = await A.readUsers(store);
      const rec = users ? A.currentUser(event, users, settings) : null;
      return A.json(200, { user: rec ? U.publicUser(rec) : null });
    }

    if (event.httpMethod !== "POST") return A.json(405, { error: "método não suportado" });

    const body = A.readJsonBody(event);
    if (!body.ok) return A.json(body.status, { error: body.error });
    const payload = body.payload;

    if (payload.op === "logout") {
      return A.json(200, { ok: true }, { "set-cookie": S.clearCookie({ secure: settings.secure }) });
    }

    const problem = A.configProblem(settings);
    if (problem) return A.json(500, { error: problem });
    const users = await A.loadUsers(store, settings);

    if (payload.op === "login") {
      const id = A.resolveUserId(payload.user);
      const res = U.authenticate(users, id || GENERIC_UNKNOWN_ID, payload.password, settings.now());
      if (id && JSON.stringify(res.users[id]) !== JSON.stringify(users[id])) {
        await store.setJSON(A.USERS_KEY, res.users);
      }
      if (!res.ok) return A.json(res.status, { error: res.error });
      return A.json(200, { user: U.publicUser(res.user) }, { "set-cookie": A.sessionCookieFor(res.user, settings) });
    }

    if (payload.op === "changePassword") {
      const rec = A.currentUser(event, users, settings);
      if (!rec) return A.json(401, { error: "faça login primeiro" });
      const res = U.changePassword(users, rec.id, payload.current, payload.next, settings.initialPassword);
      if (!res.ok) return A.json(res.status, { error: res.error });
      await store.setJSON(A.USERS_KEY, res.users);
      return A.json(200, { user: U.publicUser(res.user) }, { "set-cookie": A.sessionCookieFor(res.user, settings) });
    }

    return A.json(400, { error: "op inválida (esperado 'login', 'logout' ou 'changePassword')" });
  };
}

exports.handler = async function (event, context) {
  return makeHandler(resolveStore(process.env))(event, context);
};
exports.makeHandler = makeHandler;
EOF
node --test tests/unit/*.test.js 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# fail 0` (os testes antigos de `entries.test.js` continuam passando; ele só muda na Tarefa 13).

- [ ] **Step 3: Commit**

Run (prefixo): `ga netlify/functions/lib/auth-core.js netlify/functions/auth.js tests/unit/helpers/auth-helpers.js tests/unit/auth-core.test.js tests/unit/auth.test.js && gc "feat(L3): auth function (login, logout, change password) and shared auth core"`

---

### Task 13: [L1+L2+L3] Reescrever `entries.js` (autorização, addMany, reunião, semana programada, snapshot)

**Files:**
- Modify (reescrever inteiro): `netlify/functions/entries.js`
- Modify (reescrever inteiro): `tests/unit/entries.test.js`

**Interfaces:**
- Consumes: tudo de `entries-logic.js` (`validateEntry`, `validateComment`, `validateMeeting`, `addEntry`, `addManyEntries`, `buildEntry`, `newId`, `removeEntry`, `updateEntry`), `weeks-logic.js` (`validateWeekOp`, `confirmWeek`, `unconfirmWeek`, `reopenForEntries`), `authorize` (T9), `ensureDailySnapshot`, `readState` (T10), `auth-core` (T12), `resolveStore` (T11).
- Produces (contrato HTTP que o frontend usa):
  - `GET /api/entries → 200 { entries, confirmations }` (anônimo; `confirmations = { "AAAA-MM-DD": { pessoa: ISO } }`).
  - `POST /api/entries` com `Content-Type: application/json` e cookie de sessão; todas as respostas de sucesso são `200 { entries, confirmations }`. Operações: `{op:"add", date, person, obra, comment?, meeting?}`, `{op:"addMany", items:[…]}`, `{op:"update", id, comment?, meeting?}` (`meeting: null` apaga), `{op:"remove", id}`, `{op:"confirmWeek", week, person}`, `{op:"unconfirmWeek", week, person}`.
  - Erros: 400 validação, 401 sem login, 403 sem permissão ou senha por trocar, 404 id inexistente em `update`, 415 content-type, 500 configuração.
  - `exports.handler`, `exports.makeHandler(store, opts)` (`opts = { env?, now? }`).

- [ ] **Step 1: Reescrever o teste (falha até a implementação)**

Run (prefixo):
```bash
cat > tests/unit/entries.test.js <<'EOF'
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeHandler } = require("../../netlify/functions/entries");
const H = require("./helpers/auth-helpers");

const E = function (id, person, date, obra, extra) {
  return Object.assign({ id: id, date: date, person: person, obra: obra, createdAt: "x" }, extra || {});
};

function setup(entries, extra) {
  const store = H.storeWith(entries, extra);
  const writes = [];
  const original = store.setJSON;
  store.setJSON = async function (key, value) { writes.push(key); return original(key, value); };
  const handler = makeHandler(store, H.OPTS);
  const as = function (id) { return H.cookieFor(store.data.users, id); };
  return { store: store, handler: handler, as: as, writes: writes };
}

// --- leitura ---------------------------------------------------------------

test("GET is public, works without any secret and returns entries and confirmations", async function () {
  const store = H.storeWith([E("a1", "pedro", "2026-10-27", "almada")], { weeks: { "2026-10-25": { jean: "t" } } });
  const handler = makeHandler(store, { env: {}, now: H.OPTS.now });
  const res = await handler({ httpMethod: "GET", headers: {} });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { entries: [E("a1", "pedro", "2026-10-27", "almada")], confirmations: { "2026-10-25": { jean: "t" } } });
});

test("GET on an empty store returns empty entries and confirmations", async function () {
  const { handler } = setup(null);
  const res = await handler({ httpMethod: "GET", headers: {} });
  assert.deepEqual(JSON.parse(res.body), { entries: [], confirmations: {} });
});

test("unsupported method returns 405", async function () {
  const { handler } = setup([]);
  assert.equal((await handler({ httpMethod: "DELETE", headers: {} })).statusCode, 405);
});

// --- porta de entrada --------------------------------------------------------

test("POST needs JSON content type, valid JSON and a configured server", async function () {
  const { handler, as } = setup([]);
  const wrongType = await handler({ httpMethod: "POST", headers: { "content-type": "text/plain", cookie: as("jean") }, body: "{}" });
  assert.equal(wrongType.statusCode, 415);
  const badJson = await handler({ httpMethod: "POST", headers: { "content-type": "application/json", cookie: as("jean") }, body: "{not json" });
  assert.equal(badJson.statusCode, 400);
  const noSecret = makeHandler(H.storeWith([]), { env: { INITIAL_PASSWORD: "x" }, now: H.OPTS.now });
  const res = await H.call(noSecret, { op: "add", date: "2026-10-27", person: "jean", obra: "almada" });
  assert.equal(res.status, 500);
});

test("anonymous POST is 401 and nothing is written", async function () {
  const { handler, store, writes } = setup([]);
  const res = await H.call(handler, { op: "add", date: "2026-10-27", person: "jean", obra: "almada" });
  assert.equal(res.status, 401);
  assert.deepEqual(store.data.entries, []);
  assert.equal(writes.length, 0);
});

test("a user who still must change the password cannot write (403)", async function () {
  const { handler, store } = setup([]);
  store.data.users.jean.mustChange = true;
  const res = await H.call(handler, { op: "add", date: "2026-10-27", person: "jean", obra: "almada" }, H.cookieFor(store.data.users, "jean"));
  assert.equal(res.status, 403);
});

test("a session issued before a password change is rejected (401)", async function () {
  const { handler, store } = setup([]);
  const cookie = H.cookieFor(store.data.users, "jean");
  store.data.users.jean.pv = 2;
  const res = await H.call(handler, { op: "add", date: "2026-10-27", person: "jean", obra: "almada" }, cookie);
  assert.equal(res.status, 401);
});

test("unknown op returns 400 for a logged user", async function () {
  const { handler, as } = setup([]);
  assert.equal((await H.call(handler, { op: "nope" }, as("jean"))).status, 400);
});

// --- add -------------------------------------------------------------------------

test("add: a user marks their own name and gets id and createdAt", async function () {
  const { handler, as } = setup([]);
  const res = await H.call(handler, { op: "add", date: "2026-10-27", person: "jean", obra: "almada" }, as("jean"));
  assert.equal(res.status, 200);
  assert.equal(res.body.entries.length, 1);
  assert.equal(res.body.entries[0].person, "jean");
  assert.ok(res.body.entries[0].id);
  assert.equal(res.body.entries[0].createdAt, "2026-10-27T15:00:00.000Z");
  assert.deepEqual(res.body.confirmations, {});
});

test("add: a user cannot mark someone else (403) but the admin can", async function () {
  const { handler, as } = setup([]);
  const denied = await H.call(handler, { op: "add", date: "2026-10-27", person: "haniel", obra: "almada" }, as("jean"));
  assert.equal(denied.status, 403);
  const allowed = await H.call(handler, { op: "add", date: "2026-10-27", person: "haniel", obra: "almada" }, as("pedro"));
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.entries[0].person, "haniel");
});

test("add rejects bad formats and impossible dates", async function () {
  const { handler, as } = setup([]);
  assert.equal((await H.call(handler, { op: "add", date: "27/10/2026", person: "jean", obra: "almada" }, as("jean"))).status, 400);
  assert.equal((await H.call(handler, { op: "add", date: "2026-02-30", person: "jean", obra: "almada" }, as("jean"))).status, 400);
  assert.equal((await H.call(handler, { op: "add", date: "2026-10-27", person: "jean", obra: "nao-existe" }, as("jean"))).status, 400);
});

test("add stores the trimmed comment, drops a blank one and rejects an over-long one", async function () {
  const { handler, as } = setup([]);
  const trimmed = await H.call(handler, { op: "add", date: "2026-10-27", person: "jean", obra: "almada", comment: "  concretagem  " }, as("jean"));
  assert.equal(trimmed.body.entries[0].comment, "concretagem");
  const blank = await H.call(handler, { op: "add", date: "2026-10-28", person: "jean", obra: "almada", comment: "   " }, as("jean"));
  assert.equal("comment" in blank.body.entries[1], false);
  const long = await H.call(handler, { op: "add", date: "2026-10-29", person: "jean", obra: "almada", comment: "a".repeat(141) }, as("jean"));
  assert.equal(long.status, 400);
});

test("add: the same person+obra+day with a new comment updates it, keeping id and createdAt", async function () {
  const { handler, as } = setup([E("a1", "jean", "2026-10-27", "almada", { comment: "velho" })]);
  const res = await H.call(handler, { op: "add", date: "2026-10-27", person: "jean", obra: "almada", comment: "novo" }, as("jean"));
  assert.equal(res.status, 200);
  assert.equal(res.body.entries.length, 1);
  assert.equal(res.body.entries[0].id, "a1");
  assert.equal(res.body.entries[0].createdAt, "x");
  assert.equal(res.body.entries[0].comment, "novo");
});

test("add: repeating exactly the same marking writes nothing", async function () {
  const { handler, as, writes } = setup([E("a1", "jean", "2026-10-27", "almada")]);
  const res = await H.call(handler, { op: "add", date: "2026-10-27", person: "jean", obra: "almada" }, as("jean"));
  assert.equal(res.status, 200);
  assert.equal(res.body.entries.length, 1);
  assert.equal(writes.length, 0);
});

test("add stores a valid meeting and rejects an invalid one", async function () {
  const { handler, as } = setup([]);
  const ok = await H.call(handler, { op: "add", date: "2026-10-27", person: "jean", obra: "almada", meeting: { start: "14:00", end: "15:30" } }, as("jean"));
  assert.deepEqual(ok.body.entries[0].meeting, { start: "14:00", end: "15:30" });
  const bad = await H.call(handler, { op: "add", date: "2026-10-28", person: "jean", obra: "almada", meeting: { start: "15:00", end: "14:00" } }, as("jean"));
  assert.equal(bad.status, 400);
});

// --- addMany -----------------------------------------------------------------------

test("addMany adds every day for the user's own name", async function () {
  const { handler, as } = setup([]);
  const items = ["2026-10-27", "2026-10-28", "2026-10-29"].map(function (d) { return { date: d, person: "jean", obra: "porto" }; });
  const res = await H.call(handler, { op: "addMany", items: items }, as("jean"));
  assert.equal(res.status, 200);
  assert.equal(res.body.entries.length, 3);
});

test("addMany is all-or-nothing and respects the limit", async function () {
  const { handler, as, store } = setup([]);
  const bad = await H.call(handler, { op: "addMany", items: [
    { date: "2026-10-27", person: "jean", obra: "porto" },
    { date: "2026-02-30", person: "jean", obra: "porto" }
  ] }, as("jean"));
  assert.equal(bad.status, 400);
  assert.deepEqual(store.data.entries, []);
  const many = [];
  for (let i = 0; i < 61; i++) many.push({ date: "2026-10-27", person: "jean", obra: "porto" });
  assert.equal((await H.call(handler, { op: "addMany", items: many }, as("jean"))).status, 400);
});

test("addMany: one foreign item makes a regular user's whole call 403; admin may mix people", async function () {
  const { handler, as } = setup([]);
  const mixed = { op: "addMany", items: [
    { date: "2026-10-27", person: "jean", obra: "porto" },
    { date: "2026-10-27", person: "haniel", obra: "porto" }
  ] };
  assert.equal((await H.call(handler, mixed, as("jean"))).status, 403);
  assert.equal((await H.call(handler, mixed, as("pedro"))).status, 200);
});

// --- update ------------------------------------------------------------------------

test("update replaces and clears the comment, and sets and clears the meeting", async function () {
  const { handler, as } = setup([E("a1", "jean", "2026-10-27", "almada", { comment: "antigo" })]);
  const c1 = await H.call(handler, { op: "update", id: "a1", comment: "novo" }, as("jean"));
  assert.equal(c1.body.entries[0].comment, "novo");
  const c2 = await H.call(handler, { op: "update", id: "a1", comment: "" }, as("jean"));
  assert.equal("comment" in c2.body.entries[0], false);
  const m1 = await H.call(handler, { op: "update", id: "a1", meeting: { start: "09:00", end: "10:00" } }, as("jean"));
  assert.deepEqual(m1.body.entries[0].meeting, { start: "09:00", end: "10:00" });
  const m2 = await H.call(handler, { op: "update", id: "a1", meeting: null }, as("jean"));
  assert.equal("meeting" in m2.body.entries[0], false);
});

test("update errors: no id, nothing to update, unknown id, bad comment, bad meeting", async function () {
  const { handler, as, store } = setup([E("a1", "jean", "2026-10-27", "almada", { comment: "original" })]);
  assert.equal((await H.call(handler, { op: "update", comment: "x" }, as("jean"))).status, 400);
  assert.equal((await H.call(handler, { op: "update", id: "a1" }, as("jean"))).status, 400);
  assert.equal((await H.call(handler, { op: "update", id: "nao-existe", comment: "x" }, as("jean"))).status, 404);
  assert.equal((await H.call(handler, { op: "update", id: "a1", comment: "a".repeat(141) }, as("jean"))).status, 400);
  assert.equal((await H.call(handler, { op: "update", id: "a1", meeting: { start: "25:00", end: "26:00" } }, as("jean"))).status, 400);
  assert.equal(store.data.entries[0].comment, "original");
});

test("update: only the owner or the admin", async function () {
  const { handler, as } = setup([E("a1", "haniel", "2026-10-27", "almada")]);
  assert.equal((await H.call(handler, { op: "update", id: "a1", comment: "x" }, as("jean"))).status, 403);
  assert.equal((await H.call(handler, { op: "update", id: "a1", comment: "x" }, as("pedro"))).status, 200);
});

// --- remove ------------------------------------------------------------------------

test("remove: owner and admin can, others cannot, unknown id changes nothing", async function () {
  const { handler, as, writes } = setup([E("a1", "haniel", "2026-10-27", "almada"), E("a2", "jean", "2026-10-27", "porto")]);
  assert.equal((await H.call(handler, { op: "remove", id: "a1" }, as("jean"))).status, 403);
  const own = await H.call(handler, { op: "remove", id: "a2" }, as("jean"));
  assert.deepEqual(own.body.entries.map(function (e) { return e.id; }), ["a1"]);
  const before = writes.length;
  const none = await H.call(handler, { op: "remove", id: "nao-existe" }, as("jean"));
  assert.equal(none.status, 200);
  assert.equal(writes.length, before);
  const admin = await H.call(handler, { op: "remove", id: "a1" }, as("pedro"));
  assert.equal(admin.body.entries.length, 0);
  assert.equal((await H.call(handler, { op: "remove" }, as("pedro"))).status, 400);
});

// --- semana programada -----------------------------------------------------------------

test("confirmWeek and unconfirmWeek: own name only, admin for anyone, Sunday required", async function () {
  const { handler, as } = setup([]);
  const ok = await H.call(handler, { op: "confirmWeek", week: "2026-10-25", person: "jean" }, as("jean"));
  assert.equal(ok.status, 200);
  assert.equal(ok.body.confirmations["2026-10-25"].jean, "2026-10-27T15:00:00.000Z");
  assert.equal((await H.call(handler, { op: "confirmWeek", week: "2026-10-25", person: "haniel" }, as("jean"))).status, 403);
  assert.equal((await H.call(handler, { op: "confirmWeek", week: "2026-10-26", person: "jean" }, as("jean"))).status, 400);
  const admin = await H.call(handler, { op: "confirmWeek", week: "2026-10-25", person: "haniel" }, as("pedro"));
  assert.ok(admin.body.confirmations["2026-10-25"].haniel);
  const undone = await H.call(handler, { op: "unconfirmWeek", week: "2026-10-25", person: "jean" }, as("jean"));
  assert.equal(undone.body.confirmations["2026-10-25"].jean, undefined);
  assert.ok(undone.body.confirmations["2026-10-25"].haniel);
});

test("a real change in a confirmed week reopens only that person's confirmation", async function () {
  const { handler, as } = setup([], { weeks: { "2026-10-25": { jean: "t", haniel: "t" } } });
  const res = await H.call(handler, { op: "add", date: "2026-10-28", person: "jean", obra: "almada" }, as("jean"));
  assert.equal(res.body.confirmations["2026-10-25"].jean, undefined);
  assert.equal(res.body.confirmations["2026-10-25"].haniel, "t");
});

test("a change in another week, or a no-op, keeps the confirmation", async function () {
  const { handler, as } = setup([E("a1", "jean", "2026-10-28", "almada")], { weeks: { "2026-10-25": { jean: "t" } } });
  const other = await H.call(handler, { op: "add", date: "2026-11-03", person: "jean", obra: "almada" }, as("jean"));
  assert.equal(other.body.confirmations["2026-10-25"].jean, "t");
  const same = await H.call(handler, { op: "add", date: "2026-10-28", person: "jean", obra: "almada" }, as("jean"));
  assert.equal(same.body.confirmations["2026-10-25"].jean, "t");
});

test("removing, editing and addMany in a confirmed week reopen it too", async function () {
  const weeks = function () { return { "2026-10-25": { jean: "t" } }; };
  const a = setup([E("a1", "jean", "2026-10-28", "almada")], { weeks: weeks() });
  assert.equal((await H.call(a.handler, { op: "remove", id: "a1" }, a.as("jean"))).body.confirmations["2026-10-25"], undefined);
  const b = setup([E("a1", "jean", "2026-10-28", "almada")], { weeks: weeks() });
  assert.equal((await H.call(b.handler, { op: "update", id: "a1", comment: "x" }, b.as("jean"))).body.confirmations["2026-10-25"], undefined);
  const c = setup([], { weeks: weeks() });
  const many = await H.call(c.handler, { op: "addMany", items: [{ date: "2026-10-29", person: "jean", obra: "porto" }] }, c.as("jean"));
  assert.equal(many.body.confirmations["2026-10-25"], undefined);
});

// --- snapshot diário ------------------------------------------------------------------------

test("the first write of the day takes a snapshot of the previous state; reads and no-ops do not", async function () {
  const { handler, as, store } = setup([E("a1", "jean", "2026-10-27", "almada")]);
  await handler({ httpMethod: "GET", headers: {} });
  await H.call(handler, { op: "add", date: "2026-10-27", person: "jean", obra: "almada" }, as("jean"));
  assert.equal(store.data["backup-2026-10-27"], undefined);
  await H.call(handler, { op: "add", date: "2026-10-28", person: "jean", obra: "almada" }, as("jean"));
  assert.deepEqual(store.data["backup-2026-10-27"].entries, [E("a1", "jean", "2026-10-27", "almada")]);
  await H.call(handler, { op: "add", date: "2026-10-29", person: "jean", obra: "almada" }, as("jean"));
  assert.equal(store.data["backup-2026-10-27"].entries.length, 1);
});
EOF
node --test tests/unit/entries.test.js 2>&1 | grep -E "^# (pass|fail)" | head -3
```
Expected: muitos testes falham (a implementação antiga não conhece login nem `confirmations`).

- [ ] **Step 2: Reescrever `netlify/functions/entries.js`**

Run (prefixo):
```bash
cat > netlify/functions/entries.js <<'EOF'
"use strict";

const L = require("./lib/entries-logic");
const W = require("./lib/weeks-logic");
const A = require("./lib/auth-core");
const { authorize } = require("./lib/access");
const { ensureDailySnapshot, readState } = require("./lib/backup-logic");
const { resolveStore } = require("./lib/store");

const ENTRIES_KEY = "entries";
const WEEKS_KEY = "weeks";

function fail(status, error) {
  return { ok: false, status: status, error: error };
}

function done(state, entries, affected) {
  return { ok: true, entries: entries, weeks: W.reopenForEntries(state.weeks, affected) };
}

// Pure: turns one request into the next state, or an error. Nothing is written here.
function applyOp(payload, state, iso) {
  const entries = state.entries;
  const weeks = state.weeks;

  switch (payload.op) {
    case "add": {
      const check = L.validateEntry(payload);
      if (!check.ok) return fail(400, check.error);
      const next = L.addEntry(entries, L.buildEntry(payload, L.newId(), iso));
      return done(state, next, next === entries ? [] : [{ person: payload.person, date: payload.date }]);
    }

    case "addMany": {
      const result = L.addManyEntries(entries, payload.items, function (item) {
        return L.buildEntry(item, L.newId(), iso);
      });
      if (!result.ok) return fail(400, result.error);
      return done(state, result.entries, result.affected);
    }

    case "update": {
      if (typeof payload.id !== "string" || !payload.id) return fail(400, "id obrigatório para atualizar");
      const patch = {};
      if ("comment" in payload) {
        const c = L.validateComment(payload.comment);
        if (!c.ok) return fail(400, c.error);
        patch.comment = payload.comment;
      }
      if ("meeting" in payload) {
        if (payload.meeting !== null) {
          const m = L.validateMeeting(payload.meeting);
          if (!m.ok) return fail(400, m.error);
        }
        patch.meeting = payload.meeting;
      }
      if (!("comment" in patch) && !("meeting" in patch)) return fail(400, "nada para atualizar (envie comment e/ou meeting)");
      const next = L.updateEntry(entries, payload.id, patch);
      if (!next) return fail(404, "marcação não encontrada");
      const entry = entries.filter(function (e) { return e.id === payload.id; })[0];
      const changed = JSON.stringify(next) !== JSON.stringify(entries);
      return done(state, next, changed ? [{ person: entry.person, date: entry.date }] : []);
    }

    case "remove": {
      if (typeof payload.id !== "string" || !payload.id) return fail(400, "id obrigatório para remover");
      const entry = entries.filter(function (e) { return e.id === payload.id; })[0];
      if (!entry) return done(state, entries, []);
      return done(state, L.removeEntry(entries, payload.id), [{ person: entry.person, date: entry.date }]);
    }

    case "confirmWeek":
    case "unconfirmWeek": {
      const check = W.validateWeekOp(payload);
      if (!check.ok) return fail(400, check.error);
      const next = payload.op === "confirmWeek"
        ? W.confirmWeek(weeks, payload.week, payload.person, iso)
        : W.unconfirmWeek(weeks, payload.week, payload.person);
      return { ok: true, entries: entries, weeks: next };
    }

    default:
      return fail(400, "op inválida (esperado add, addMany, update, remove, confirmWeek ou unconfirmWeek)");
  }
}

function differs(a, b) {
  return a !== b && JSON.stringify(a) !== JSON.stringify(b);
}

function makeHandler(store, opts) {
  const settings = A.readSettings(opts);

  return async function handler(event) {
    if (event.httpMethod === "GET") {
      const state = await readState(store);
      return A.json(200, { entries: state.entries, confirmations: state.weeks });
    }

    if (event.httpMethod !== "POST") return A.json(405, { error: "método não suportado" });

    const body = A.readJsonBody(event);
    if (!body.ok) return A.json(body.status, { error: body.error });
    const payload = body.payload;

    const problem = A.configProblem(settings);
    if (problem) return A.json(500, { error: problem });

    const users = await A.loadUsers(store, settings);
    const user = A.currentUser(event, users, settings);
    const state = await readState(store);

    const allowed = authorize(user, payload, state.entries);
    if (!allowed.ok) return A.json(allowed.status, { error: allowed.error });

    const out = applyOp(payload, state, new Date(settings.now()).toISOString());
    if (!out.ok) return A.json(out.status, { error: out.error });

    const entriesChanged = differs(out.entries, state.entries);
    const weeksChanged = differs(out.weeks, state.weeks);
    if (entriesChanged || weeksChanged) {
      await ensureDailySnapshot(store, settings.now());
      if (entriesChanged) await store.setJSON(ENTRIES_KEY, out.entries);
      if (weeksChanged) await store.setJSON(WEEKS_KEY, out.weeks);
    }
    return A.json(200, { entries: out.entries, confirmations: out.weeks });
  };
}

exports.handler = async function (event, context) {
  return makeHandler(resolveStore(process.env))(event, context);
};
exports.makeHandler = makeHandler;
EOF
node --test tests/unit/*.test.js 2>&1 | grep -E "^# (pass|fail)|^not ok" | head -20
```
Expected: `# fail 0`. Se algum teste de semana falhar por causa do formato de `reopenForEntries`, conferir a Tarefa 5 (a função recebe `affected = [{person, date}]` e usa `weekKeyOf(date)`).

- [ ] **Step 3: Commit**

Run (prefixo): `ga netlify/functions/entries.js tests/unit/entries.test.js && gc "feat(L1-L3): entries API with auth, addMany, meetings, week confirmations and daily snapshot"`

---

### Task 14: [L3] Função `admin` (zerar senha, backups)

**Files:**
- Create: `netlify/functions/admin.js`
- Test: `tests/unit/admin.test.js`

**Interfaces:**
- Consumes: `resetPassword`, `publicUser` (T8); `listBackups`, `restoreSnapshot`, `buildExport`, `readState` (T10); `auth-core` (T12).
- Produces: `POST /api/admin` (só administrador com senha já trocada), todas com JSON:
  - `{op:"resetPassword", user}` → `200 {user: publicUser}`; zerar a própria senha → 400; usuário inexistente → 404.
  - `{op:"listBackups"}` → `200 {backups: [{id, kind, label}]}`.
  - `{op:"downloadBackup"}` → `200 {export: {exportedAt, entries, weeks}}` (estado atual, sem usuários).
  - `{op:"restoreBackup", id}` → `200 {ok: true}`; `id` inválido → 400; inexistente → 404.
  - Sem login 401; usuário comum ou com senha por trocar 403; GET → 405.
  - `exports.handler`, `exports.makeHandler(store, opts)`.

- [ ] **Step 1: Escrever o teste que falha**

Run (prefixo):
```bash
cat > tests/unit/admin.test.js <<'EOF'
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeHandler } = require("../../netlify/functions/admin");
const { verifyPassword } = require("../../netlify/functions/lib/passwords");
const H = require("./helpers/auth-helpers");

function setup(entries, extra) {
  const store = H.storeWith(entries, extra);
  return { store: store, handler: makeHandler(store, H.OPTS), as: function (id) { return H.cookieFor(store.data.users, id); } };
}

test("admin endpoints reject anonymous (401), regular users (403) and an admin who must change the password (403)", async function () {
  const { handler, as, store } = setup([]);
  assert.equal((await H.call(handler, { op: "listBackups" })).status, 401);
  assert.equal((await H.call(handler, { op: "listBackups" }, as("jean"))).status, 403);
  store.data.users.pedro.mustChange = true;
  assert.equal((await H.call(handler, { op: "listBackups" }, as("pedro"))).status, 403);
});

test("only POST with JSON is accepted", async function () {
  const { handler, as } = setup([]);
  assert.equal((await handler({ httpMethod: "GET", headers: { cookie: as("pedro") } })).statusCode, 405);
  assert.equal((await handler({ httpMethod: "POST", headers: { "content-type": "text/plain", cookie: as("pedro") }, body: "{}" })).statusCode, 415);
});

test("resetPassword puts the initial password back, forces a change and invalidates the old session", async function () {
  const { handler, as, store } = setup([]);
  const jeanCookie = as("jean");
  const res = await H.call(handler, { op: "resetPassword", user: "jean" }, as("pedro"));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.user, { id: "jean", name: "Jean", role: "user", mustChange: true });
  assert.equal(verifyPassword(H.INITIAL, store.data.users.jean), true);
  assert.equal(store.data.users.jean.pv, 2);
  const stale = await H.call(handler, { op: "listBackups" }, jeanCookie);
  assert.equal(stale.status, 401);
});

test("resetPassword rejects unknown users (404) and the admin's own account (400)", async function () {
  const { handler, as } = setup([]);
  assert.equal((await H.call(handler, { op: "resetPassword", user: "ninguem" }, as("pedro"))).status, 404);
  assert.equal((await H.call(handler, { op: "resetPassword", user: "pedro" }, as("pedro"))).status, 400);
  assert.equal((await H.call(handler, { op: "resetPassword" }, as("pedro"))).status, 400);
});

test("downloadBackup returns the current entries and weeks and no user data", async function () {
  const entries = [{ id: "a1", date: "2026-10-27", person: "jean", obra: "almada", createdAt: "x" }];
  const { handler, as } = setup(entries, { weeks: { "2026-10-25": { jean: "t" } } });
  const res = await H.call(handler, { op: "downloadBackup" }, as("pedro"));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.export, { exportedAt: "2026-10-27T15:00:00.000Z", entries: entries, weeks: { "2026-10-25": { jean: "t" } } });
  assert.ok(!JSON.stringify(res.body).includes("hash"));
});

test("listBackups and restoreBackup bring the data back, saving a pre-restore snapshot", async function () {
  const { handler, as, store } = setup([{ id: "atual" }], {
    "backup-2026-10-26": { createdAt: "x", entries: [{ id: "antigo" }], weeks: {} }
  });
  const list = await H.call(handler, { op: "listBackups" }, as("pedro"));
  assert.deepEqual(list.body.backups.map(function (b) { return b.id; }), ["backup-2026-10-26"]);
  const res = await H.call(handler, { op: "restoreBackup", id: "backup-2026-10-26" }, as("pedro"));
  assert.deepEqual(res.body, { ok: true });
  assert.deepEqual(store.data.entries, [{ id: "antigo" }]);
  assert.ok(store.data["backup-prerestore-2026-10-27T15-00-00-000Z"]);
  assert.equal((await H.call(handler, { op: "restoreBackup", id: "users" }, as("pedro"))).status, 400);
  assert.equal((await H.call(handler, { op: "restoreBackup", id: "backup-2020-01-01" }, as("pedro"))).status, 404);
});

test("unknown op returns 400", async function () {
  const { handler, as } = setup([]);
  assert.equal((await H.call(handler, { op: "nope" }, as("pedro"))).status, 400);
});
EOF
node --test tests/unit/admin.test.js 2>&1 | grep -E "^# (pass|fail)|Cannot find" | head -3
```
Expected: falha (módulo não existe).

- [ ] **Step 2: Implementar**

Run (prefixo):
```bash
cat > netlify/functions/admin.js <<'EOF'
"use strict";

const A = require("./lib/auth-core");
const U = require("./lib/users-logic");
const B = require("./lib/backup-logic");
const { resolveStore } = require("./lib/store");

function makeHandler(store, opts) {
  const settings = A.readSettings(opts);

  return async function handler(event) {
    if (event.httpMethod !== "POST") return A.json(405, { error: "método não suportado" });

    const body = A.readJsonBody(event);
    if (!body.ok) return A.json(body.status, { error: body.error });
    const payload = body.payload;

    const problem = A.configProblem(settings);
    if (problem) return A.json(500, { error: problem });

    const users = await A.loadUsers(store, settings);
    const me = A.currentUser(event, users, settings);
    if (!me) return A.json(401, { error: "faça login" });
    if (me.mustChange) return A.json(403, { error: "troque a senha antes de continuar" });
    if (me.role !== "admin") return A.json(403, { error: "apenas o administrador" });

    if (payload.op === "resetPassword") {
      const id = A.resolveUserId(payload.user);
      if (typeof payload.user !== "string" || !payload.user.trim()) return A.json(400, { error: "user obrigatório" });
      if (!id) return A.json(404, { error: "usuário não encontrado" });
      if (id === me.id) return A.json(400, { error: "para trocar a sua própria senha use Minha conta" });
      const res = U.resetPassword(users, id, settings.initialPassword);
      if (!res.ok) return A.json(res.status, { error: res.error });
      await store.setJSON(A.USERS_KEY, res.users);
      return A.json(200, { user: U.publicUser(res.user) });
    }

    if (payload.op === "listBackups") {
      return A.json(200, { backups: await B.listBackups(store) });
    }

    if (payload.op === "downloadBackup") {
      const state = await B.readState(store);
      return A.json(200, { export: B.buildExport(state.entries, state.weeks, settings.now()) });
    }

    if (payload.op === "restoreBackup") {
      const res = await B.restoreSnapshot(store, payload.id, settings.now());
      if (!res.ok) return A.json(res.status, { error: res.error });
      return A.json(200, { ok: true });
    }

    return A.json(400, { error: "op inválida" });
  };
}

exports.handler = async function (event, context) {
  return makeHandler(resolveStore(process.env))(event, context);
};
exports.makeHandler = makeHandler;
EOF
node --test tests/unit/*.test.js 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# fail 0`.

- [ ] **Step 3: Verificar que só os arquivos de topo viram funções e commitar**

Run (prefixo):
```bash
ls netlify/functions/*.js
ga netlify/functions/admin.js tests/unit/admin.test.js && gc "feat(L3): admin function (reset password, list/download/restore backups)"
```
Expected: lista `admin.js  auth.js  entries.js` (os helpers ficam em `lib/`, que o Netlify não expõe).

---

## Fase 3 — Módulos puros do navegador

Todos seguem o padrão UMD já usado em `public/lib/grouping.js`: funcionam como `window.Nome` na página e como `require` nos testes.

### Task 15: [L1] Módulo `attention.js` (aba Atenção)

**Files:**
- Create: `public/lib/attention.js`
- Test: `tests/unit/attention.test.js`

**Interfaces:**
- Produces:
  - `daysBetween(fromKey, toKey) -> inteiro` (datas `AAAA-MM-DD`, diferença em dias inteiros via `Date.UTC`).
  - `periodStartFor(todayKey, period) -> "AAAA-MM-DD"`; `period` = `"month"` (dia 1 do mês de hoje) ou `30`/`60`/`90` (janela de N dias **incluindo hoje**, ou seja, hoje − (N−1)).
  - `buildAttention({ entries, today, periodStart, obraOrder, personOrder, staleDays = 14 }) -> { rows, personTotals }`, em que `rows[i] = { obra, byPerson: {[pessoa]: {done, planned}}, done, planned, lastVisit, daysSinceLast, nextVisit, stale, noPlan }` e `personTotals = {[pessoa]: {done, planned}}`. `lastVisit`/`nextVisit` são `AAAA-MM-DD` ou `null`; `daysSinceLast` é inteiro ou `null`; `stale = lastVisit === null || daysSinceLast > staleDays`; `noPlan = planned === 0`. Linhas seguem `obraOrder`. Ids desconhecidos de pessoa/obra são ignorados.
  - Exposto no navegador como `window.Attention`.

- [ ] **Step 1: Escrever o teste que falha**

Run (prefixo):
```bash
cat > tests/unit/attention.test.js <<'EOF'
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../../public/lib/attention");

const OBRAS = ["almada", "porto", "montebello", "tulipas"];
const PEOPLE = ["pedro", "jean", "haniel", "bruna"];
const TODAY = "2026-10-27";

function e(person, obra, date) { return { id: person + obra + date, person: person, obra: obra, date: date }; }
function build(entries, overrides) {
  return A.buildAttention(Object.assign({
    entries: entries, today: TODAY, periodStart: "2026-10-01", obraOrder: OBRAS, personOrder: PEOPLE
  }, overrides || {}));
}
function row(result, obra) { return result.rows.filter(function (r) { return r.obra === obra; })[0]; }

test("daysBetween counts whole days across month and year changes", function () {
  assert.equal(A.daysBetween("2026-10-27", "2026-10-27"), 0);
  assert.equal(A.daysBetween("2026-09-20", "2026-10-27"), 37);
  assert.equal(A.daysBetween("2025-12-30", "2026-01-02"), 3);
  assert.equal(A.daysBetween("2026-10-30", "2026-10-27"), -3);
});

test("periodStartFor: month starts on day 1; N days include today", function () {
  assert.equal(A.periodStartFor("2026-10-27", "month"), "2026-10-01");
  assert.equal(A.periodStartFor("2026-10-27", 30), "2026-09-28");
  assert.equal(A.periodStartFor("2026-10-27", 60), "2026-08-29");
  assert.equal(A.periodStartFor("2026-10-27", 90), "2026-07-30");
  assert.equal(A.periodStartFor("2026-01-10", 30), "2025-12-12");
});

test("rows follow obraOrder and start with zeros for everyone", function () {
  const result = build([]);
  assert.deepEqual(result.rows.map(function (r) { return r.obra; }), OBRAS);
  assert.deepEqual(row(result, "almada").byPerson.jean, { done: 0, planned: 0 });
  assert.deepEqual(result.personTotals.pedro, { done: 0, planned: 0 });
});

test("today counts as done; future dates count as planned with no period limit", function () {
  const result = build([
    e("jean", "almada", "2026-10-05"),
    e("jean", "almada", "2026-10-27"),
    e("pedro", "almada", "2026-10-28"),
    e("pedro", "almada", "2027-03-01")
  ]);
  const r = row(result, "almada");
  assert.deepEqual(r.byPerson.jean, { done: 2, planned: 0 });
  assert.deepEqual(r.byPerson.pedro, { done: 0, planned: 2 });
  assert.equal(r.done, 2);
  assert.equal(r.planned, 2);
  assert.equal(r.nextVisit, "2026-10-28");
  assert.deepEqual(result.personTotals.jean, { done: 2, planned: 0 });
});

test("the period only filters done; last visit ignores the period", function () {
  const result = build([e("haniel", "porto", "2026-09-20")]);
  const r = row(result, "porto");
  assert.equal(r.done, 0);
  assert.equal(r.lastVisit, "2026-09-20");
  assert.equal(r.daysSinceLast, 37);
  const wide = build([e("haniel", "porto", "2026-09-20")], { periodStart: "2026-09-01" });
  assert.equal(row(wide, "porto").done, 1);
});

test("a never-visited obra has no last visit and is stale", function () {
  const r = row(build([]), "montebello");
  assert.equal(r.lastVisit, null);
  assert.equal(r.daysSinceLast, null);
  assert.equal(r.stale, true);
  assert.equal(r.noPlan, true);
  assert.equal(r.nextVisit, null);
});

test("stale means more than 14 days; exactly 14 is not stale", function () {
  const fourteen = row(build([e("pedro", "almada", "2026-10-13")]), "almada");
  assert.equal(fourteen.daysSinceLast, 14);
  assert.equal(fourteen.stale, false);
  const fifteen = row(build([e("pedro", "almada", "2026-10-12")]), "almada");
  assert.equal(fifteen.daysSinceLast, 15);
  assert.equal(fifteen.stale, true);
  const custom = row(build([e("pedro", "almada", "2026-10-20")], { staleDays: 5 }), "almada");
  assert.equal(custom.stale, true);
});

test("noPlan is true only when nothing is planned for the obra", function () {
  const r = row(build([e("bruna", "tulipas", "2026-11-02")]), "tulipas");
  assert.equal(r.noPlan, false);
  assert.equal(r.stale, true);
  assert.equal(r.nextVisit, "2026-11-02");
  assert.equal(row(build([e("bruna", "tulipas", "2026-10-20")]), "tulipas").noPlan, true);
});

test("unknown people and obras are ignored", function () {
  const result = build([e("ninguem", "almada", "2026-10-05"), e("pedro", "inventada", "2026-10-05"), e("pedro", "porto", "2026-10-05")]);
  assert.equal(row(result, "almada").done, 0);
  assert.equal(row(result, "porto").done, 1);
  assert.equal(result.rows.length, 4);
});

test("works across a year boundary", function () {
  const result = build([e("pedro", "almada", "2025-12-30"), e("pedro", "almada", "2026-01-05")], {
    today: "2026-01-02", periodStart: A.periodStartFor("2026-01-02", 30)
  });
  const r = row(result, "almada");
  assert.equal(r.done, 1);
  assert.equal(r.planned, 1);
  assert.equal(r.lastVisit, "2025-12-30");
  assert.equal(r.daysSinceLast, 3);
});
EOF
node --test tests/unit/attention.test.js 2>&1 | grep -E "^# (pass|fail)|Cannot find" | head -3
```
Expected: falha (módulo não existe).

- [ ] **Step 2: Implementar**

Run (prefixo):
```bash
cat > public/lib/attention.js <<'EOF'
// Counts visits per person and obra for the "Atenção" view. Pure, shared by the page
// (window.Attention) and the unit tests (require). Dates are "AAAA-MM-DD" strings.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Attention = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function utc(key) {
    var p = key.split("-").map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]);
  }

  function daysBetween(fromKey, toKey) {
    return Math.round((utc(toKey) - utc(fromKey)) / 86400000);
  }

  function addDaysKey(key, n) {
    var d = new Date(utc(key) + n * 86400000);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }

  function periodStartFor(todayKey, period) {
    if (period === "month") return todayKey.slice(0, 8) + "01";
    return addDaysKey(todayKey, -(Number(period) - 1));
  }

  // opts: { entries, today, periodStart, obraOrder, personOrder, staleDays = 14 }
  function buildAttention(opts) {
    var staleDays = opts.staleDays === undefined ? 14 : opts.staleDays;
    var rowsByObra = {};
    var personTotals = {};
    opts.personOrder.forEach(function (p) { personTotals[p] = { done: 0, planned: 0 }; });

    var rows = opts.obraOrder.map(function (obra) {
      var byPerson = {};
      opts.personOrder.forEach(function (p) { byPerson[p] = { done: 0, planned: 0 }; });
      var row = { obra: obra, byPerson: byPerson, done: 0, planned: 0, lastVisit: null, daysSinceLast: null, nextVisit: null, stale: true, noPlan: true };
      rowsByObra[obra] = row;
      return row;
    });

    opts.entries.forEach(function (en) {
      var row = rowsByObra[en.obra];
      if (!row || !personTotals[en.person]) return;
      var cell = row.byPerson[en.person];
      if (en.date > opts.today) {
        cell.planned += 1; row.planned += 1; personTotals[en.person].planned += 1;
        if (row.nextVisit === null || en.date < row.nextVisit) row.nextVisit = en.date;
      } else {
        if (row.lastVisit === null || en.date > row.lastVisit) row.lastVisit = en.date;
        if (en.date >= opts.periodStart) {
          cell.done += 1; row.done += 1; personTotals[en.person].done += 1;
        }
      }
    });

    rows.forEach(function (row) {
      row.daysSinceLast = row.lastVisit === null ? null : daysBetween(row.lastVisit, opts.today);
      row.stale = row.lastVisit === null || row.daysSinceLast > staleDays;
      row.noPlan = row.planned === 0;
    });

    return { rows: rows, personTotals: personTotals };
  }

  return { daysBetween: daysBetween, periodStartFor: periodStartFor, buildAttention: buildAttention };
});
EOF
node --test tests/unit/*.test.js 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# fail 0`.

- [ ] **Step 3: Commit**

Run (prefixo): `ga public/lib/attention.js tests/unit/attention.test.js && gc "feat(L1): attention module (visits per person and obra, stale and no-plan flags)"`

---

### Task 16: [L1] Mensagem do WhatsApp em módulo puro, com linha em branco entre pessoas

**Files:**
- Create: `public/lib/week-message.js`
- Modify: `public/index.html` (`buildWeeklyWhatsAppMessage` passa a delegar; tag `<script>`)
- Test: `tests/unit/week-message.test.js`

**Interfaces:**
- Produces: `buildWeekMessage({ weekStart: Date, entries, team: [{id,name,role}], obraById: {[id]: {name, shortName?}}, rangeLabel: string }) -> string`. Formato: título, linha em branco, e para cada setor (na ordem do `team`, só os que têm marcações) `*Setor*`, depois para cada pessoa (ordem de primeira aparição na semana) o nome, uma linha por dia com marcações (`Quarta (28) Porto (comentário)`; várias obras no mesmo dia unidas por `" e "`) e **uma linha em branco depois de cada pessoa**. Semana vazia: `Ninguém marcado nessa semana.`. A string final não termina em quebra de linha. Exposto como `window.WeekMessage`.
- (A Tarefa 17 acrescenta a reunião a este mesmo formato.)

- [ ] **Step 1: Escrever o teste que falha**

Run (prefixo):
```bash
cat > tests/unit/week-message.test.js <<'EOF'
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildWeekMessage } = require("../../public/lib/week-message");

const TEAM = [
  { id: "pedro", name: "Pedro", role: "Custos" },
  { id: "jean", name: "Jean", role: "PCP" },
  { id: "haniel", name: "Haniel", role: "PCP" },
  { id: "gustavo", name: "Gustavo", role: "Qualidade" },
  { id: "bruna", name: "Bruna", role: "Projetos" }
];
const OBRA_BY_ID = {
  almada: { id: "almada", name: "Almada" },
  porto: { id: "porto", name: "Reserva do Porto", shortName: "Porto" },
  palmeiras: { id: "palmeiras", name: "Reserva das Palmeiras", shortName: "Palmeiras" }
};
const WEEK_START = new Date(2026, 9, 25); // domingo
const RANGE = "25/10 a 31/10/2026";

function msg(entries) {
  return buildWeekMessage({ weekStart: WEEK_START, entries: entries, team: TEAM, obraById: OBRA_BY_ID, rangeLabel: RANGE });
}
function e(person, date, obra, extra) { return Object.assign({ id: person + date + obra, person: person, date: date, obra: obra }, extra || {}); }

test("people of the same sector are separated by a blank line, and sectors too", function () {
  const text = msg([
    e("pedro", "2026-10-26", "almada"),
    e("haniel", "2026-10-27", "porto", { comment: "vistoria" }),
    e("haniel", "2026-10-28", "palmeiras"),
    e("jean", "2026-10-27", "almada"),
    e("jean", "2026-10-27", "porto")
  ]);
  assert.equal(text, [
    "📅 *Agenda de Obras — semana de 25/10 a 31/10/2026*",
    "",
    "*Custos*",
    "Pedro",
    "Segunda (26) Almada",
    "",
    "*PCP*",
    "Haniel",
    "Terça (27) Porto (vistoria)",
    "Quarta (28) Palmeiras",
    "",
    "Jean",
    "Terça (27) Almada e Porto"
  ].join("\n"));
});

test("sectors follow the team order even when they appear later in the week", function () {
  const text = msg([e("bruna", "2026-10-26", "almada"), e("pedro", "2026-10-27", "porto")]);
  assert.ok(text.indexOf("*Custos*") < text.indexOf("*Projetos*"));
});

test("an empty week says nobody is scheduled", function () {
  assert.equal(msg([]), "📅 *Agenda de Obras — semana de 25/10 a 31/10/2026*\n\nNinguém marcado nessa semana.");
});

test("entries outside the week and unknown people or obras are ignored", function () {
  const text = msg([e("pedro", "2026-11-02", "almada"), e("ninguem", "2026-10-26", "almada"), e("pedro", "2026-10-26", "inventada")]);
  assert.ok(text.endsWith("Ninguém marcado nessa semana."));
});

test("the text never ends with a line break and never has two blank lines in a row", function () {
  const text = msg([e("pedro", "2026-10-26", "almada"), e("jean", "2026-10-27", "porto"), e("gustavo", "2026-10-28", "almada")]);
  assert.equal(text, text.trim());
  assert.ok(text.indexOf("\n\n\n") === -1);
});

test("the week may cross a month boundary", function () {
  const text = buildWeekMessage({
    weekStart: new Date(2026, 9, 25), entries: [e("pedro", "2026-10-31", "almada")], team: TEAM, obraById: OBRA_BY_ID, rangeLabel: RANGE
  });
  assert.ok(text.includes("Sábado (31) Almada"));
});
EOF
node --test tests/unit/week-message.test.js 2>&1 | grep -E "^# (pass|fail)|Cannot find" | head -3
```
Expected: falha (módulo não existe).

- [ ] **Step 2: Implementar o módulo**

Run (prefixo):
```bash
cat > public/lib/week-message.js <<'EOF'
// Builds the WhatsApp text for one week. Pure, shared by the page (window.WeekMessage)
// and the unit tests (require).
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.WeekMessage = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var WEEKDAY_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function keyOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  // opts: { weekStart: Date, entries, team, obraById, rangeLabel }
  function buildWeekMessage(opts) {
    var sectorOrder = [];
    var sectors = {};
    var personById = {};
    opts.team.forEach(function (p) {
      personById[p.id] = p;
      if (!sectors[p.role]) { sectors[p.role] = { peopleOrder: [], people: {} }; sectorOrder.push(p.role); }
    });

    for (var i = 0; i < 7; i++) {
      var d = new Date(opts.weekStart.getFullYear(), opts.weekStart.getMonth(), opts.weekStart.getDate() + i);
      var key = keyOf(d);
      var dayLabel = WEEKDAY_FULL[d.getDay()] + " (" + pad(d.getDate()) + ")";
      opts.entries.filter(function (en) { return en.date === key; }).forEach(function (en) {
        var person = personById[en.person], obra = opts.obraById[en.obra];
        if (!person || !obra) return;
        var sector = sectors[person.role];
        if (!sector.people[person.id]) {
          sector.people[person.id] = { name: person.name, dayOrder: [], days: {} };
          sector.peopleOrder.push(person.id);
        }
        var pdata = sector.people[person.id];
        if (!pdata.days[dayLabel]) { pdata.days[dayLabel] = []; pdata.dayOrder.push(dayLabel); }
        pdata.days[dayLabel].push((obra.shortName || obra.name) + (en.comment ? " (" + en.comment + ")" : ""));
      });
    }

    var lines = ["📅 *Agenda de Obras — semana de " + opts.rangeLabel + "*", ""];
    var anyEntry = false;
    sectorOrder.forEach(function (role) {
      var sector = sectors[role];
      if (!sector.peopleOrder.length) return;
      anyEntry = true;
      lines.push("*" + role + "*");
      sector.peopleOrder.forEach(function (pid) {
        var pdata = sector.people[pid];
        lines.push(pdata.name);
        pdata.dayOrder.forEach(function (dayLabel) {
          lines.push(dayLabel + " " + pdata.days[dayLabel].join(" e "));
        });
        lines.push("");
      });
    });
    if (!anyEntry) lines.push("Ninguém marcado nessa semana.");
    return lines.join("\n").trim();
  }

  return { buildWeekMessage: buildWeekMessage };
});
EOF
node --test tests/unit/*.test.js 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# fail 0`.

- [ ] **Step 3: Ligar no `index.html`**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch, replace_between
P = "public/index.html"
patch(P, [('<script src="lib/week-image.js"></script>', '<script src="lib/week-image.js"></script>\n<script src="lib/week-message.js"></script>')])
replace_between(P, "  function buildWeeklyWhatsAppMessage() {", "  /* ---- weekly image (canvas), shown in the message modal ---- */", '''  function buildWeeklyWhatsAppMessage() {
    return WeekMessage.buildWeekMessage({
      weekStart: startOfWeek(cursor),
      entries: entries,
      team: TEAM,
      obraById: obraById,
      rangeLabel: weekRangeLabel()
    });
  }

''', keep_end=True)
PY
grep -c "WeekMessage.buildWeekMessage" public/index.html; grep -c "lib/week-message.js" public/index.html
```
Expected: `1` e `1`.

- [ ] **Step 4: Fumaça no navegador**

Rodar o Playwright (receita do início do plano) com `tests/frontend-static.spec.js`. Expected: passa (a página continua carregando sem erros). Depois abrir manualmente, se quiser, o botão "Gerar mensagem" no passo de verificação da Tarefa 23.

- [ ] **Step 5: Commit**

Run (prefixo): `ga public/lib/week-message.js public/index.html tests/unit/week-message.test.js && gc "feat(L1): WhatsApp message in a tested module with a blank line between people"`

---

### Task 17: [L2] Formato da reunião e propagação para agrupamento, semana e mensagem

**Files:**
- Create: `public/lib/meeting-format.js`
- Modify: `public/lib/grouping.js`, `public/lib/week-model.js`, `public/lib/week-message.js`, `public/index.html` (tag `<script>`)
- Test: `tests/unit/meeting-format.test.js`, `tests/unit/grouping.test.js`, `tests/unit/week-model.test.js`, `tests/unit/week-message.test.js`

**Interfaces:**
- Produces:
  - `formatMeetingShort({start,end}) -> "14h–15h30"` (hora cheia sem minutos; zero à esquerda removido: `"09:05"` → `"9h05"`; separador é o travessão `–`). Entrada ausente ou inválida → `""`.
  - `formatMeetingClock({start,end}) -> "14:00–15:30"`. Entrada ausente ou inválida → `""`.
  - `window.MeetingFormat`.
  - `groupByObra` e `buildWeekModel` (itens por pessoa e grupos por obra) passam a carregar `meeting` (`{start,end}`) quando a marcação tem.
  - `buildWeekMessage` acrescenta `, reunião 14h–15h30` logo depois do nome da obra e antes do comentário: `Quarta (28) Porto, reunião 14h–15h30 (comentário)`.

- [ ] **Step 1: Escrever os testes que falham**

Run (prefixo):
```bash
cat > tests/unit/meeting-format.test.js <<'EOF'
const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../../public/lib/meeting-format");

test("formatMeetingShort drops empty minutes and leading zeros", function () {
  assert.equal(F.formatMeetingShort({ start: "14:00", end: "15:30" }), "14h–15h30");
  assert.equal(F.formatMeetingShort({ start: "09:05", end: "10:00" }), "9h05–10h");
  assert.equal(F.formatMeetingShort({ start: "00:00", end: "23:59" }), "0h–23h59");
});

test("formatMeetingClock keeps HH:MM", function () {
  assert.equal(F.formatMeetingClock({ start: "14:00", end: "15:30" }), "14:00–15:30");
  assert.equal(F.formatMeetingClock({ start: "09:05", end: "10:00" }), "09:05–10:00");
});

test("missing or malformed meetings give an empty string", function () {
  [undefined, null, {}, { start: "14:00" }, { start: "x", end: "y" }, "14:00"].forEach(function (m) {
    assert.equal(F.formatMeetingShort(m), "");
    assert.equal(F.formatMeetingClock(m), "");
  });
});
EOF
cat >> tests/unit/grouping.test.js <<'EOF'

test("groupByObra carries the meeting of each person", function () {
  const Grouping = require("../../public/lib/grouping");
  const groups = Grouping.groupByObra([
    { person: "jean", obra: "almada", meeting: { start: "14:00", end: "15:00" } },
    { person: "pedro", obra: "almada", comment: "x" }
  ], ["almada"], ["pedro", "jean"]);
  assert.deepEqual(groups[0].people, [
    { person: "pedro", comment: "x" },
    { person: "jean", meeting: { start: "14:00", end: "15:00" } }
  ]);
});
EOF
cat >> tests/unit/week-model.test.js <<'EOF'

test("person view carries the meeting of each item", function () {
  const days = model({
    entries: [{ id: "1", date: "2026-09-24", person: "jean", obra: "almada", meeting: { start: "14:00", end: "15:30" } }]
  });
  assert.deepEqual(days[4].items, [{ person: "jean", obra: "almada", meeting: { start: "14:00", end: "15:30" } }]);
});
EOF
cat >> tests/unit/week-message.test.js <<'EOF'

test("a meeting goes right after the obra name, before the comment", function () {
  const text = msg([
    e("jean", "2026-10-28", "porto", { meeting: { start: "14:00", end: "15:30" }, comment: "pauta" }),
    e("jean", "2026-10-29", "almada", { meeting: { start: "09:00", end: "10:00" } })
  ]);
  assert.ok(text.includes("Quarta (28) Porto, reunião 14h–15h30 (pauta)"), text);
  assert.ok(text.includes("Quinta (29) Almada, reunião 9h–10h"), text);
});
EOF
head -5 tests/unit/grouping.test.js
node --test tests/unit/meeting-format.test.js tests/unit/grouping.test.js tests/unit/week-model.test.js tests/unit/week-message.test.js 2>&1 | grep -E "^# (pass|fail)|Cannot find" | head -3
```
Expected: falhas. Se `grouping.test.js` já importar `Grouping` no topo com outro nome, o `require` dentro do teste novo continua funcionando.

- [ ] **Step 2: Implementar**

Run (prefixo):
```bash
cat > public/lib/meeting-format.js <<'EOF'
// Formats a meeting window ({start:"HH:MM", end:"HH:MM"}) for display. Pure, shared by the
// page (window.MeetingFormat) and the unit tests (require).
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MeetingFormat = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

  function valid(m) {
    return !!m && typeof m.start === "string" && typeof m.end === "string" && TIME_RE.test(m.start) && TIME_RE.test(m.end);
  }

  function short(hhmm) {
    var p = TIME_RE.exec(hhmm);
    var hour = String(Number(p[1]));
    return p[2] === "00" ? hour + "h" : hour + "h" + p[2];
  }

  function formatMeetingShort(m) {
    return valid(m) ? short(m.start) + "–" + short(m.end) : "";
  }

  function formatMeetingClock(m) {
    return valid(m) ? m.start + "–" + m.end : "";
  }

  return { formatMeetingShort: formatMeetingShort, formatMeetingClock: formatMeetingClock };
});
EOF
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch
patch("public/lib/grouping.js", [
  ("        if (en.comment) entry.comment = en.comment;\n        people.push(entry);",
   "        if (en.comment) entry.comment = en.comment;\n        if (en.meeting) entry.meeting = en.meeting;\n        people.push(entry);")
])
patch("public/lib/week-model.js", [
  ("        if (en.comment) item.comment = en.comment;\n        items.push(item);",
   "        if (en.comment) item.comment = en.comment;\n        if (en.meeting) item.meeting = en.meeting;\n        items.push(item);")
])
patch("public/lib/week-message.js", [
  ('''  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.WeekMessage = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {''',
   '''  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./meeting-format"));
  } else {
    root.WeekMessage = factory(root.MeetingFormat);
  }
})(typeof self !== "undefined" ? self : this, function (MeetingFormat) {'''),
  ('''        pdata.days[dayLabel].push((obra.shortName || obra.name) + (en.comment ? " (" + en.comment + ")" : ""));''',
   '''        var meeting = MeetingFormat.formatMeetingShort(en.meeting);
        pdata.days[dayLabel].push((obra.shortName || obra.name) + (meeting ? ", reunião " + meeting : "") + (en.comment ? " (" + en.comment + ")" : ""));''')
])
patch("public/index.html", [
  ('<script src="lib/grouping.js"></script>', '<script src="lib/grouping.js"></script>\n<script src="lib/meeting-format.js"></script>')
])
PY
node --test tests/unit/*.test.js 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# fail 0`. Conferir a ordem das tags: `meeting-format.js` vem antes de `week-message.js` (`grep -n "<script src" public/index.html`).

- [ ] **Step 3: Commit**

Run (prefixo): `ga public/lib/meeting-format.js public/lib/grouping.js public/lib/week-model.js public/lib/week-message.js public/index.html tests/unit/meeting-format.test.js tests/unit/grouping.test.js tests/unit/week-model.test.js tests/unit/week-message.test.js && gc "feat(L2): meeting format and meeting carried into grouping, week model and WhatsApp text"`

---

### Task 18: [L2] Horário da reunião na imagem da semana

**Files:**
- Modify: `public/lib/week-image.js`, `public/index.html` (nenhuma mudança além da tag já existente)

**Interfaces:**
- Consumes: `window.MeetingFormat.formatMeetingClock(meeting)` (T17); itens do modelo com `meeting` (T17).
- Produces: na visão "Por pessoa", `personChip` desenha uma linha `14:00–15:30` (negrito, 13px) entre o nome da obra e o comentário e aumenta a altura do cartão em 17px; na visão "Por obra", `obraCard` desenha o horário ao lado do nome da pessoa.

O desenho é em canvas e não tem teste unitário; a verificação é a conferência visual da Tarefa 23.

- [ ] **Step 1: Alterar o desenho dos cartões**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch
patch("public/lib/week-image.js", [
  # personChip: altura
  ("    var h = 9 + 21 + 18 + (lines.length ? 4 + lines.length * 17 : 0) + 9;\n    if (!draw) return h;\n    cardBackground(ctx, x, y, w, h, obra.color);\n    circleImage(ctx, o.icons[item.obra], x + 5 + 9, y + 9, 22);",
   "    var clock = item.meeting ? root.MeetingFormat.formatMeetingClock(item.meeting) : \"\";\n    var head = 9 + 21 + 18 + (clock ? 17 : 0);\n    var h = head + (lines.length ? 4 + lines.length * 17 : 0) + 9;\n    if (!draw) return h;\n    cardBackground(ctx, x, y, w, h, obra.color);\n    circleImage(ctx, o.icons[item.obra], x + 5 + 9, y + 9, 22);"),
  # personChip: desenho do horário e do comentário
  ("    ctx.fillStyle = C.soft; font(ctx, 400, 13, true);\n    lines.forEach(function (ln, i) { ctx.fillText(ln, innerX, y + 9 + 21 + 18 + 4 + 13 + i * 17); });",
   "    if (clock) { ctx.fillStyle = C.ink; font(ctx, 700, 13); ctx.fillText(clock, innerX, y + 9 + 21 + 18 + 12, innerW); }\n    ctx.fillStyle = C.soft; font(ctx, 400, 13, true);\n    lines.forEach(function (ln, i) { ctx.fillText(ln, innerX, y + head + 4 + 13 + i * 17); });"),
  # obraCard: dado
  ("      return { name: o.personById[p.person].name, lines: p.comment ? wrap(ctx, p.comment, innerW) : [] };",
   "      return {\n        name: o.personById[p.person].name,\n        clock: p.meeting ? root.MeetingFormat.formatMeetingClock(p.meeting) : \"\",\n        lines: p.comment ? wrap(ctx, p.comment, innerW) : []\n      };"),
  # obraCard: desenho
  ("      ctx.fillText(r.name, innerX, cy + 15, innerW);\n      cy += 20;",
   "      ctx.fillText(r.name, innerX, cy + 15, innerW);\n      if (r.clock) {\n        var nameW = ctx.measureText(r.name).width;\n        ctx.fillStyle = C.soft; font(ctx, 500, 13);\n        ctx.fillText(r.clock, innerX + nameW + 8, cy + 15);\n      }\n      cy += 20;")
])
PY
node --check public/lib/week-image.js && echo OK
```
Expected: `OK`. Se o `patch` acusar `PATCH FAILED`, abrir o trecho indicado em `week-image.js` e ajustar o `old` ao texto real (espaços iguais).

- [ ] **Step 2: Commit**

Run (prefixo): `ga public/lib/week-image.js && gc "feat(L2): meeting time on the weekly image"`

---

## Fase 4 — Interface (`public/index.html`)

Todos os testes desta fase são Playwright, rodam na nuvem (receita "Como rodar o Playwright" no início do plano) contra `public/index.html` aberto como `file://`, com `/api/*` simulada por `tests/helpers/stub-api.js` (criado na Tarefa 19) e o relógio fixado em **terça, 27/10/2026, 12:00 (America/Sao_Paulo)**. A semana exibida é então **25/10 a 31/10/2026**.

Convenções dos testes:
- `openApp(page, opts)` instala o relógio, liga as rotas simuladas e abre a página. `opts`: `entries`, `confirmations`, `me` (id do usuário já logado, ex. `"jean"`), `mustChange` (ids com troca de senha pendente), `backups`, `local` (abre em `http://localhost:8888/`).
- A função devolve `state` (o "servidor" simulado): `state.entries`, `state.confirmations`, `state.me`, `state.requests` (cada POST recebido, `{path, body}`), `state.resetUsers`, `state.restored`. Testes alteram `state` para simular outra pessoa mexendo.
- A cada tarefa, antes de rodar: `device_stage_files` de `public/index.html`, `public/lib/*.js`, `tests/*.spec.js`, `tests/helpers/*.js`.

### Task 19: [L1] Cabeçalho estável, rótulos sem capitalizar e o "servidor" simulado dos testes

**Files:**
- Create: `tests/helpers/stub-api.js`, `tests/frontend-v2.spec.js`
- Modify: `public/index.html` (CSS do cabeçalho, bloco `<header>`, `capFirst`, `periodLabel`, título do modal, `renderCalendar`)

**Interfaces:**
- Produces (HTML): linha de navegação `nav.nav-row` abaixo do título com `#viewSeg`, `.arrows`, `#periodLabel`, `.nav-spacer`, `#groupSeg`, `#waBtn`; canto superior direito `.top-actions` com `#authArea` (vazio por enquanto) e `#themeToggle`; faixa `#localBanner` (oculta; ligada na Tarefa 22). Controles exclusivos da visão Semana (`#groupSeg`, `#waBtn`) recebem a classe `.is-off` (`visibility:hidden`) nas outras visões, nunca `display:none`.
- Produces (JS): `capFirst(s)`; `renderCalendar()` usa `.is-off`.
- Produces (testes): `stub-api.js` exporta `{ openApp, stubApi, NOW_ISO }`.

- [ ] **Step 1: Criar o servidor simulado e o primeiro teste**

Run (prefixo):
```bash
mkdir -p tests/helpers
cat > tests/helpers/stub-api.js <<'EOF'
"use strict";

// Simulated backend for the Playwright specs: /api/entries, /api/auth and /api/admin.
// It mirrors the real permission rules closely enough for the UI to be exercised.
const path = require("path");
const fs = require("fs");

const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");
const NOW_ISO = "2026-10-27T12:00:00-03:00";
const SERVER_NOW = "2026-10-27T15:00:00.000Z";
const PEOPLE = { pedro: "Pedro", jean: "Jean", haniel: "Haniel", gustavo: "Gustavo", bruna: "Bruna" };
const INITIAL_PASSWORD = "Mudar@123";

function weekKeyOf(dateKey) {
  const p = dateKey.split("-").map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

function json(route, status, body) {
  return route.fulfill({ status: status, contentType: "application/json", body: JSON.stringify(body) });
}

function userRecord(state, id) {
  return { id: id, name: PEOPLE[id], role: id === "pedro" ? "admin" : "user", mustChange: state.mustChange.indexOf(id) >= 0 };
}

function mayAct(state, person) {
  const me = state.me;
  return !!me && !me.mustChange && (me.role === "admin" || me.id === person);
}

function reopen(state, person, date) {
  const week = weekKeyOf(date);
  if (state.confirmations[week] && state.confirmations[week][person]) {
    delete state.confirmations[week][person];
    if (!Object.keys(state.confirmations[week]).length) delete state.confirmations[week];
  }
}

// Returns true when something changed (new slot, new comment or new meeting).
function upsertEntry(state, item) {
  const comment = typeof item.comment === "string" ? item.comment.trim() : "";
  const existing = state.entries.filter(function (e) {
    return e.person === item.person && e.obra === item.obra && e.date === item.date;
  })[0];
  if (existing) {
    let changed = false;
    if (comment && comment !== existing.comment) { existing.comment = comment; changed = true; }
    if (item.meeting && JSON.stringify(item.meeting) !== JSON.stringify(existing.meeting)) { existing.meeting = item.meeting; changed = true; }
    if (changed) reopen(state, item.person, item.date);
    return changed;
  }
  const entry = { id: "n" + (++state.seq), date: item.date, person: item.person, obra: item.obra, createdAt: SERVER_NOW };
  if (comment) entry.comment = comment;
  if (item.meeting) entry.meeting = item.meeting;
  state.entries.push(entry);
  reopen(state, item.person, item.date);
  return true;
}

async function stubApi(page, opts) {
  opts = opts || {};
  const state = {
    entries: JSON.parse(JSON.stringify(opts.entries || [])),
    confirmations: JSON.parse(JSON.stringify(opts.confirmations || {})),
    me: null,
    passwords: {},
    mustChange: (opts.mustChange || []).slice(),
    backups: JSON.parse(JSON.stringify(opts.backups || [])),
    requests: [],
    resetUsers: [],
    restored: null,
    seq: 0,
    failNext: null
  };
  if (opts.me) state.me = userRecord(state, opts.me);

  await page.route(/fonts\.(googleapis|gstatic)\.com/, function (route) { return route.abort(); });

  await page.route("**/api/entries", async function (route) {
    const req = route.request();
    if (req.method() === "GET") return json(route, 200, { entries: state.entries, confirmations: state.confirmations });
    const p = req.postDataJSON();
    state.requests.push({ path: "/api/entries", body: p });
    if (state.failNext) { const f = state.failNext; state.failNext = null; return json(route, f.status, { error: f.error || "erro simulado" }); }
    if (!state.me) return json(route, 401, { error: "faça login para alterar a agenda" });
    if (state.me.mustChange) return json(route, 403, { error: "troque a senha antes de alterar a agenda" });
    const deny = function () { return json(route, 403, { error: "você só pode alterar as suas próprias marcações" }); };
    const ok = function () { return json(route, 200, { entries: state.entries, confirmations: state.confirmations }); };

    if (p.op === "add") {
      if (!mayAct(state, p.person)) return deny();
      upsertEntry(state, p);
      return ok();
    }
    if (p.op === "addMany") {
      if (!Array.isArray(p.items) || !p.items.length) return json(route, 400, { error: "items obrigatório" });
      if (!p.items.every(function (it) { return mayAct(state, it.person); })) return deny();
      p.items.forEach(function (it) { upsertEntry(state, it); });
      return ok();
    }
    if (p.op === "update" || p.op === "remove") {
      const entry = state.entries.filter(function (e) { return e.id === p.id; })[0];
      if (!entry) return p.op === "remove" ? ok() : json(route, 404, { error: "marcação não encontrada" });
      if (!mayAct(state, entry.person)) return deny();
      if (p.op === "remove") {
        state.entries = state.entries.filter(function (e) { return e.id !== p.id; });
      } else {
        if ("comment" in p) { if (p.comment) entry.comment = p.comment; else delete entry.comment; }
        if ("meeting" in p) { if (p.meeting) entry.meeting = p.meeting; else delete entry.meeting; }
      }
      reopen(state, entry.person, entry.date);
      return ok();
    }
    if (p.op === "confirmWeek" || p.op === "unconfirmWeek") {
      if (!mayAct(state, p.person)) return deny();
      if (p.op === "confirmWeek") {
        state.confirmations[p.week] = state.confirmations[p.week] || {};
        state.confirmations[p.week][p.person] = SERVER_NOW;
      } else if (state.confirmations[p.week]) {
        delete state.confirmations[p.week][p.person];
        if (!Object.keys(state.confirmations[p.week]).length) delete state.confirmations[p.week];
      }
      return ok();
    }
    return json(route, 400, { error: "op inválida" });
  });

  await page.route("**/api/auth", async function (route) {
    const req = route.request();
    if (req.method() === "GET") return json(route, 200, { user: state.me });
    const p = req.postDataJSON();
    state.requests.push({ path: "/api/auth", body: p });
    if (p.op === "login") {
      const id = String(p.user || "").trim().toLowerCase();
      const expected = state.passwords[id] || INITIAL_PASSWORD;
      if (!PEOPLE[id] || p.password !== expected) return json(route, 401, { error: "usuário ou senha inválidos" });
      state.me = userRecord(state, id);
      return json(route, 200, { user: state.me });
    }
    if (p.op === "logout") { state.me = null; return json(route, 200, { ok: true }); }
    if (p.op === "changePassword") {
      if (!state.me) return json(route, 401, { error: "faça login primeiro" });
      const current = state.passwords[state.me.id] || INITIAL_PASSWORD;
      if (p.current !== current) return json(route, 401, { error: "senha atual incorreta" });
      if (typeof p.next !== "string" || p.next.length < 8) return json(route, 400, { error: "a nova senha precisa ter pelo menos 8 caracteres" });
      if (p.next === INITIAL_PASSWORD || p.next === current) return json(route, 400, { error: "escolha uma senha diferente da atual e da senha inicial" });
      state.passwords[state.me.id] = p.next;
      state.mustChange = state.mustChange.filter(function (id) { return id !== state.me.id; });
      state.me = userRecord(state, state.me.id);
      return json(route, 200, { user: state.me });
    }
    return json(route, 400, { error: "op inválida" });
  });

  await page.route("**/api/admin", async function (route) {
    const p = route.request().postDataJSON();
    state.requests.push({ path: "/api/admin", body: p });
    if (!state.me) return json(route, 401, { error: "faça login" });
    if (state.me.role !== "admin") return json(route, 403, { error: "apenas o administrador" });
    if (p.op === "resetPassword") {
      state.resetUsers.push(p.user);
      state.passwords[p.user] = INITIAL_PASSWORD;
      if (state.mustChange.indexOf(p.user) < 0) state.mustChange.push(p.user);
      return json(route, 200, { user: { id: p.user, name: PEOPLE[p.user], role: "user", mustChange: true } });
    }
    if (p.op === "listBackups") {
      return json(route, 200, { backups: state.backups.map(function (b) { return { id: b.id, kind: b.kind, label: b.label }; }) });
    }
    if (p.op === "downloadBackup") {
      return json(route, 200, { export: { exportedAt: SERVER_NOW, entries: state.entries, weeks: state.confirmations } });
    }
    if (p.op === "restoreBackup") {
      const backup = state.backups.filter(function (b) { return b.id === p.id; })[0];
      if (!backup) return json(route, 404, { error: "backup não encontrado" });
      state.entries = JSON.parse(JSON.stringify(backup.entries || []));
      state.confirmations = JSON.parse(JSON.stringify(backup.weeks || {}));
      state.restored = p.id;
      return json(route, 200, { ok: true });
    }
    return json(route, 400, { error: "op inválida" });
  });

  return state;
}

// Serves public/ at http://localhost:8888/ so the page believes it is running locally.
async function serveLocal(page) {
  await page.route("http://localhost:8888/**", async function (route) {
    const url = new URL(route.request().url());
    const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const file = path.join(PUBLIC_DIR, rel);
    if (file.indexOf(PUBLIC_DIR) !== 0 || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return route.fulfill({ status: 404, body: "not found" });
    }
    return route.fulfill({ path: file });
  });
}

async function openApp(page, opts) {
  opts = opts || {};
  await page.clock.install({ time: new Date(NOW_ISO) });
  if (opts.local) await serveLocal(page);
  const state = await stubApi(page, opts);
  const url = opts.local ? "http://localhost:8888/" : "file://" + path.join(PUBLIC_DIR, "index.html");
  const loaded = page.waitForResponse(function (r) { return r.url().indexOf("/api/entries") >= 0 && r.request().method() === "GET"; });
  await page.goto(url);
  await loaded;
  await page.waitForSelector("#calendarArea .day-card, #calendarArea .month-cell, #calendarArea .att-table");
  return state;
}

module.exports = { openApp, stubApi, NOW_ISO };
EOF
cat > tests/frontend-v2.spec.js <<'EOF'
const { test, expect } = require("@playwright/test");
const { openApp } = require("./helpers/stub-api");

test.use({ timezoneId: "America/Sao_Paulo", locale: "pt-BR" });

// ---- Tarefa 19: cabeçalho estável e rótulos -------------------------------------------

test("header controls keep their place when switching between Semana and Mês", async ({ page }) => {
  await openApp(page);
  const ids = ["#viewSeg", "#periodLabel", "#themeToggle", "#waBtn", "#groupSeg"];
  async function boxes() {
    const out = {};
    for (const id of ids) out[id] = await page.locator(id).boundingBox();
    return out;
  }
  const week = await boxes();
  await page.locator('[data-view="month"]').click();
  const month = await boxes();
  for (const id of ids) expect(month[id], id).toEqual(week[id]);
  await expect(page.locator("#waBtn")).toHaveCSS("visibility", "hidden");
  await expect(page.locator("#groupSeg")).toHaveCSS("visibility", "hidden");
  await page.locator('[data-view="week"]').click();
  await expect(page.locator("#waBtn")).toHaveCSS("visibility", "visible");
  await expect(page.locator("#groupSeg")).toHaveCSS("visibility", "visible");
});

test("period labels keep small words in lowercase and only the first letter capitalised", async ({ page }) => {
  await openApp(page);
  await expect(page.locator("#periodLabel")).toHaveText("25–31 de outubro de 2026");
  await page.locator('[data-view="month"]').click();
  await expect(page.locator("#periodLabel")).toHaveText("Outubro de 2026");
  await page.locator('[data-view="week"]').click();
  await page.locator('[data-action="open-day"][data-date="2026-10-27"]').first().click();
  await expect(page.locator("#modal h2")).toHaveText("Terça-feira, 27 de outubro");
});
EOF
echo done
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar o Playwright (receita) com `tests/frontend-v2.spec.js`. Expected: os 2 testes falham (`#waBtn` só tem `display:none`, rótulo vira "De").

- [ ] **Step 3: Alterar CSS e HTML do cabeçalho**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch, replace_between
P = "public/index.html"

patch(P, [
  # .nav-cluster -> novas regras do cabeçalho
  ('''  .nav-cluster {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }''',
   '''  .top-actions { display: flex; align-items: center; gap: 10px; flex: none; }
  .nav-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
  .nav-spacer { flex: 1; }
  .is-off { visibility: hidden; }
  .auth-area { position: relative; display: flex; align-items: center; }
  .local-banner {
    margin: 0 0 12px; padding: 8px 12px; border-radius: 10px;
    background: var(--holiday-fac-bg); color: var(--holiday-fac); border: 1px dashed var(--holiday-fac);
    font-size: 12.5px; font-weight: 800; letter-spacing: 0.04em;
  }
  .local-banner[hidden] { display: none; }'''),
  # rótulo do período: sem capitalize, largura fixa
  ('''    color: var(--ink);
    text-transform: capitalize;
    white-space: nowrap;
  }''',
   '''    color: var(--ink);
    white-space: nowrap;
    min-width: 300px;
  }'''),
  ("  .modal h2 { font-size: 18px; margin: 0; text-transform: capitalize; }",
   "  .modal h2 { font-size: 18px; margin: 0; }"),
  ("    .nav-cluster { justify-content: space-between; }",
   "    .nav-row { justify-content: space-between; }\n    .period-label { min-width: 0; }"),
])

replace_between(P, '  <header class="topbar">', "  </header>", '''  <header class="topbar">
    <div class="brand-block">
      <h1 class="brand"><span class="brand-mark"><img src="assets/blendi-symbol.png" alt=""></span>Agenda de Obras</h1>
      <p class="tagline">Clique num dia pra marcar sua presen&ccedil;a numa obra &mdash; todo mundo v&ecirc; a mesma agenda, atualizada ao vivo.</p>
    </div>
    <div class="top-actions">
      <div class="auth-area" id="authArea"></div>
      <button class="theme-toggle" id="themeToggle" data-action="toggle-theme" aria-label="Alternar tema claro/escuro"></button>
    </div>
  </header>
  <div class="local-banner" id="localBanner" hidden>AMBIENTE LOCAL DE TESTE &mdash; os dados desta tela s&atilde;o de teste e n&atilde;o afetam a produ&ccedil;&atilde;o.</div>
  <nav class="nav-row" aria-label="Navega&ccedil;&atilde;o do calend&aacute;rio">
    <div class="seg" id="viewSeg">
      <button data-action="set-view" data-view="week">Semana</button>
      <button data-action="set-view" data-view="month">M&ecirc;s</button>
    </div>
    <div class="arrows" id="arrowsBox">
      <button data-action="prev" aria-label="Anterior">&#8249;</button>
      <button data-action="today" aria-label="Hoje" style="width:auto;padding:0 10px;font-size:12px;font-weight:700;">Hoje</button>
      <button data-action="next" aria-label="Pr&oacute;ximo">&#8250;</button>
    </div>
    <span class="period-label" id="periodLabel"></span>
    <span class="nav-spacer"></span>
    <div class="seg" id="groupSeg" role="group" aria-label="Agrupar por">
      <button data-action="set-group" data-group="person" title="Um chip por pessoa">Por pessoa</button>
      <button data-action="set-group" data-group="obra" title="Um card por obra, com os nomes de quem estar&aacute; l&aacute;">Por obra</button>
    </div>
    <button class="today-btn" id="waBtn" data-action="open-wa-modal">Gerar mensagem</button>
  </nav>''')
PY
grep -c "nav-cluster" public/index.html
```
Expected: `0`.

- [ ] **Step 4: Alterar o JavaScript**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch
P = "public/index.html"
patch(P, [
  ("  function initials(name) { return name.slice(0, 2).toUpperCase(); }",
   "  function initials(name) { return name.slice(0, 2).toUpperCase(); }\n  function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }"),
  ('    return MONTH_NAMES[cursor.getMonth()] + " de " + cursor.getFullYear();',
   '    return capFirst(MONTH_NAMES[cursor.getMonth()] + " de " + cursor.getFullYear());'),
  ('    var label = weekdayFull + ", " + d.getDate() + " de " + MONTH_NAMES[d.getMonth()];',
   '    var label = capFirst(weekdayFull + ", " + d.getDate() + " de " + MONTH_NAMES[d.getMonth()]);'),
  ('''    document.getElementById("waBtn").style.display = view === "week" ? "" : "none";
    var groupSeg = document.getElementById("groupSeg");
    groupSeg.style.display = view === "week" ? "" : "none";''',
   '''    document.getElementById("waBtn").classList.toggle("is-off", view !== "week");
    var groupSeg = document.getElementById("groupSeg");
    groupSeg.classList.toggle("is-off", view !== "week");'''),
])
PY
grep -c "capitalize" public/index.html
```
Expected: `0`.

- [ ] **Step 5: Rodar e ver passar; commit**

Rodar o Playwright (receita) com `tests/frontend-v2.spec.js`. Expected: 2 passam. Então:

Run (prefixo): `ga public/index.html tests/helpers/stub-api.js tests/frontend-v2.spec.js && gc "feat(L1): stable header between views, lowercase period labels, simulated API for browser tests"`

---

### Task 20: [L1+L2] Camada de API do navegador e polling que não reseta o modal

**Files:**
- Modify: `public/index.html` (bloco `API`, `renderModal` → `currentListHTML`, polling, tratadores de remoção/edição/comentário, `init`)
- Modify (reescrever): `tests/frontend-static.spec.js`

**Interfaces:**
- Consumes: contrato HTTP da Tarefa 13 (`{entries, confirmations}`), `GET /api/auth` (Tarefa 12).
- Produces (JS, dentro do IIFE da página):
  - Estado: `confirmations` (`{ semana: { pessoa: ISO } }`), `me` (`{id,name,role,mustChange}` ou `null`).
  - `apiRequest(method, path, body) -> Promise<json>` (rejeita com `Error` que tem `.status` e `.message` = erro do servidor).
  - `normalizeState(data) -> {entries, confirmations}`, `loadState()`, `applyState(state)`.
  - `entriesOp(payload) -> Promise<data>` (POST `/api/entries`, aplica o estado); atalhos `submitAdd(date, person, obra, comment?, meeting?)`, `submitAddMany(items)`, `submitUpdate(id, patch)`, `submitRemove(id)`, `submitWeek(op, week, person)`.
  - `fetchMe() -> Promise<user|null>`.
  - `describeError(err, fallback) -> string` (401 → "Sua sessão expirou. Entre de novo." e chama `onSessionLost()`; 400/403/429 → mensagem do servidor).
  - `onMeChanged()` (por enquanto `render()`), `onSessionLost()` (`me = null; onMeChanged()`).
  - `currentListHTML(key)`, `paintModalList()` (sempre repinta a lista do dia aberto), `refreshModalList()` (igual, mas não faz nada se uma edição está aberta).
  - `pollForUpdates()` repinta calendário e lista do dia, **nunca** o formulário de adicionar.

- [ ] **Step 1: Reescrever `tests/frontend-static.spec.js` (falha até a implementação)**

Run (prefixo):
```bash
cat > tests/frontend-static.spec.js <<'EOF'
const { test, expect } = require("@playwright/test");
const { openApp } = require("./helpers/stub-api");

test.use({ timezoneId: "America/Sao_Paulo", locale: "pt-BR" });

const SEED = [{ id: "seed1", date: "2026-10-27", person: "jean", obra: "almada", createdAt: "x" }];

test("calendar loads the entries from the API", async ({ page }) => {
  await openApp(page, { entries: SEED });
  await expect(page.locator('.day-card[data-date="2026-10-27"] .entry-chip')).toHaveCount(1);
});

test("adding through the form posts op add and shows the new chip (administrator)", async ({ page }) => {
  const state = await openApp(page, { entries: SEED, me: "pedro" });
  await page.locator('[data-action="open-day"][data-date="2026-10-27"]').first().click();
  await page.locator('input[name="modal-person"][value="pedro"]').check();
  await page.locator('input[name="modal-obra"][value="montebello"]').check();
  await page.locator("#addBtn").click();
  await expect(page.locator('.day-card[data-date="2026-10-27"] .entry-chip')).toHaveCount(2);
  const add = state.requests.filter(function (r) { return r.body.op === "add"; })[0];
  expect(add.body).toMatchObject({ op: "add", date: "2026-10-27", person: "pedro", obra: "montebello" });
});

test("removing posts op remove and the chip disappears", async ({ page }) => {
  const state = await openApp(page, { entries: SEED, me: "pedro" });
  await page.locator('[data-action="open-day"][data-date="2026-10-27"]').first().click();
  await page.locator("#modal .rm").first().click();
  await expect(page.locator('.day-card[data-date="2026-10-27"] .entry-chip')).toHaveCount(0);
  expect(state.requests.some(function (r) { return r.body.op === "remove" && r.body.id === "seed1"; })).toBe(true);
});

test("a 401 answer shows the session-expired message", async ({ page }) => {
  const state = await openApp(page, { entries: SEED, me: "pedro" });
  await page.locator('[data-action="open-day"][data-date="2026-10-27"]').first().click();
  state.me = null;
  await page.locator('input[name="modal-person"][value="pedro"]').check();
  await page.locator('input[name="modal-obra"][value="montebello"]').check();
  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toContainText("Sua sessão expirou");
});
EOF
echo ok
```
Rodar o Playwright com `tests/frontend-static.spec.js`. Expected: o teste do 401 falha (a página mostra a mensagem antiga); os demais podem passar.

- [ ] **Step 2: Trocar o bloco de API**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch, replace_between
P = "public/index.html"

replace_between(P, "  /* ---------------- API ---------------- */", "  /* ---------------- date helpers ---------------- */", '''  /* ---------------- API ---------------- */
  var confirmations = {};   // { "AAAA-MM-DD" (domingo): { pessoa: ISO } }
  var me = null;            // { id, name, role, mustChange } or null

  function apiRequest(method, path, body) {
    var init = { method: method, credentials: "same-origin", headers: {} };
    if (body !== undefined) {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    return fetch(path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.error) || ("erro " + res.status));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }
  function normalizeState(data) {
    return {
      entries: Array.isArray(data.entries) ? data.entries : [],
      confirmations: data.confirmations && typeof data.confirmations === "object" ? data.confirmations : {}
    };
  }
  function loadState() { return apiRequest("GET", "/api/entries").then(normalizeState); }
  function applyState(state) { entries = state.entries; confirmations = state.confirmations; }
  function entriesOp(payload) {
    return apiRequest("POST", "/api/entries", payload).then(function (data) {
      applyState(normalizeState(data));
      return data;
    });
  }
  function submitAdd(date, person, obra, comment, meeting) {
    var payload = { op: "add", date: date, person: person, obra: obra };
    if (comment) payload.comment = comment;
    if (meeting) payload.meeting = meeting;
    return entriesOp(payload);
  }
  function submitAddMany(items) { return entriesOp({ op: "addMany", items: items }); }
  function submitUpdate(id, patch) { return entriesOp(Object.assign({ op: "update", id: id }, patch)); }
  function submitRemove(id) { return entriesOp({ op: "remove", id: id }); }
  function submitWeek(op, week, person) { return entriesOp({ op: op, week: week, person: person }); }
  function fetchMe() { return apiRequest("GET", "/api/auth").then(function (data) { return data.user || null; }); }

  function describeError(err, fallback) {
    if (err && err.status === 401) { onSessionLost(); return "Sua sessão expirou. Entre de novo."; }
    if (err && (err.status === 400 || err.status === 403 || err.status === 429) && err.message) return err.message;
    return fallback;
  }
  function onMeChanged() { render(); }
  function onSessionLost() { me = null; onMeChanged(); }

''', keep_end=True)
PY
grep -c "function apiRequest" public/index.html
```
Expected: `1`.

- [ ] **Step 3: Lista do dia em função própria e polling que não reseta o formulário**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch, replace_between
P = "public/index.html"

# 3a. currentListHTML / paintModalList / refreshModalList antes de renderModal
patch(P, [(
'''  function renderModal() {
    var overlay = document.getElementById("overlay");''',
'''  function currentListHTML(key) {
    var byPerson = {};
    entriesForDate(key).forEach(function (en) {
      if (!byPerson[en.person]) byPerson[en.person] = [];
      byPerson[en.person].push(en);
    });
    var ids = Object.keys(byPerson);
    if (!ids.length) return '<p class="current-empty">Ninguém marcado neste dia ainda.</p>';
    return ids.map(function (pid) {
      var person = personById[pid];
      if (!person) return "";
      return '<div class="person-group"><div class="pg-name">' + h(person.name) + '</div><div class="pg-obras">' +
        byPerson[pid].map(function (en) { return entryChipHTML(en, true); }).join("") +
        "</div></div>";
    }).join("");
  }
  // Repaints only the list of the open day; the add form is never touched.
  function paintModalList() {
    if (!modalDateKey) return;
    var box = document.querySelector("#modal .current-list");
    if (box) box.innerHTML = currentListHTML(modalDateKey);
  }
  // Same, but leaves an open edit form alone (used by background refreshes).
  function refreshModalList() {
    if (editingEntryId) return;
    paintModalList();
  }

  function renderModal() {
    var overlay = document.getElementById("overlay");''')])

# 3b. renderModal usa currentListHTML
replace_between(P, "    var byPerson = {};\n    dayEntries.forEach(function (en) {", "    var personOptions = TEAM.map(function (p) {",
  "    var currentHTML = currentListHTML(modalDateKey);\n\n", keep_end=True)

# 3c. polling
replace_between(P, "  /* ---------------- live refresh ---------------- */", "  setInterval(pollForUpdates, 25000);", '''  /* ---------------- live refresh ---------------- */
  // Polling refreshes the calendar and only the list of the open day; the add form is never
  // rebuilt, so what the person is typing survives.
  function pollForUpdates() {
    loadState().then(function (state) {
      if (JSON.stringify(state) === JSON.stringify({ entries: entries, confirmations: confirmations })) return;
      applyState(state);
      renderCalendar();
      refreshModalList();
    }).catch(function () { /* silent — tenta de novo no próximo ciclo */ });
  }
''', keep_end=True)
PY
grep -c "currentListHTML" public/index.html
```
Expected: `3`.

- [ ] **Step 4: Tratadores de eventos e inicialização**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch, replace_between
P = "public/index.html"

patch(P, [
  # remover
  ('''      submitRemove(id).then(function () {
        renderModal();
        renderCalendar();
        showToast("Presença removida.");
      }).catch(function () {
        showToast("Não foi possível remover agora. Tente de novo.");
      });''',
   '''      submitRemove(id).then(function () {
        paintModalList();
        renderCalendar();
        showToast("Presença removida.");
      }).catch(function (err) {
        showToast(describeError(err, "Não foi possível remover agora. Tente de novo."));
      });'''),
  # abrir edição
  ('''      editingEntryId = el.getAttribute("data-id");
      renderModal();
      var editInput''',
   '''      editingEntryId = el.getAttribute("data-id");
      paintModalList();
      var editInput'''),
  # cancelar edição
  ('''    } else if (action === "cancel-edit-comment") {
      editingEntryId = null;
      renderModal();''',
   '''    } else if (action === "cancel-edit-comment") {
      editingEntryId = null;
      paintModalList();'''),
  # erro ao adicionar
  ('''      }).catch(function () {
        showToast("Não foi possível salvar agora. Tente de novo.");
        addBtn.disabled = false;''',
   '''      }).catch(function (err) {
        showToast(describeError(err, "Não foi possível salvar agora. Tente de novo."));
        addBtn.disabled = false;'''),
])

# salvar comentário
replace_between(P, '  document.addEventListener("submit", function (ev) {', '  document.addEventListener("keydown", function (ev) {', '''  document.addEventListener("submit", function (ev) {
    var editForm = ev.target.closest(".comment-edit");
    if (!editForm) return;
    ev.preventDefault();
    var id = editForm.getAttribute("data-id");
    var text = editForm.querySelector("input").value.trim();
    submitUpdate(id, { comment: text }).then(function () {
      editingEntryId = null;
      paintModalList();
      renderCalendar();
      showToast("Comentário salvo.");
    }).catch(function (err) {
      if (err && err.status === 404) {
        editingEntryId = null;
        loadState().then(function (state) { applyState(state); render(); });
        showToast("Essa marcação não existe mais.");
      } else {
        showToast(describeError(err, "Não foi possível salvar agora. Tente de novo."));
      }
    });
  });
''', keep_end=True)

# init
replace_between(P, "  /* ---------------- init ---------------- */", "})();\n</script>", '''  /* ---------------- init ---------------- */
  applyTheme();
  renderLegend();
  render();
  loadState().then(function (state) {
    applyState(state);
    render();
  }).catch(function () {
    showToast("Não foi possível carregar os dados agora.");
  });
  fetchMe().then(function (user) {
    me = user;
    onMeChanged();
  }).catch(function () { /* sem sessão: segue só leitura */ });
''', keep_end=True)
PY
grep -c "fetchEntries\|submitUpdateComment" public/index.html
```
Expected: `0` (nenhuma referência restante às funções antigas).

- [ ] **Step 5: Rodar e ver passar; commit**

Rodar o Playwright com `tests/frontend-static.spec.js` e `tests/frontend-v2.spec.js`. Expected: todos passam.

Run (prefixo): `ga public/index.html tests/frontend-static.spec.js && gc "feat(L1-L3): browser API layer with sessions and errors; polling no longer resets the day modal"`

---

### Task 21: [L1] Aba "Atenção" (pessoa × obra)

**Files:**
- Modify: `public/index.html` (botão da visão, `<script>`, estado, CSS, `periodLabel`, `renderCalendar`, `renderAttention`, clique do período)
- Test: `tests/frontend-v2.spec.js` (acrescentar)

**Interfaces:**
- Consumes: `Attention.buildAttention`, `Attention.periodStartFor` (T15); filtros de pessoas/obras já existentes (`selectedPeople`, `selectedObras`, `entryVisible`).
- Produces (DOM usado pelos testes): botão `[data-view="attention"]`; filtro de período `button[data-action="set-att-period"][data-period="month|30|60|90"]`; tabela `.att-table` com uma `tr[data-obra="<id>"]` por obra (classe `att-alert` quando `stale` ou `noPlan`), células `td[data-person="<id>"]` ("realizado / planejado"), `td.att-total`, `td[data-col="last"]`, `td[data-col="next"]`, e a linha de totais `tr.att-sum`. Na visão Atenção o rótulo do período é "Atenção por obra" e as setas ficam `.is-off`.

- [ ] **Step 1: Escrever os testes que falham**

Run (prefixo):
```bash
cat >> tests/frontend-v2.spec.js <<'EOF'

// ---- Tarefa 21: aba Atenção ----------------------------------------------------------------

const ATT = [
  { id: "a1", date: "2026-10-05", person: "jean", obra: "almada", createdAt: "x" },
  { id: "a2", date: "2026-10-27", person: "jean", obra: "almada", createdAt: "x" },
  { id: "a3", date: "2026-10-28", person: "pedro", obra: "almada", createdAt: "x" },
  { id: "a4", date: "2026-09-20", person: "haniel", obra: "porto", createdAt: "x" },
  { id: "a5", date: "2026-11-02", person: "bruna", obra: "tulipas", createdAt: "x" }
];

async function openAttention(page) {
  const state = await openApp(page, { entries: ATT });
  await page.locator('[data-view="attention"]').click();
  await expect(page.locator(".att-table")).toBeVisible();
  return state;
}

test("Atenção counts realized / planned per person and obra, today counting as done", async ({ page }) => {
  await openAttention(page);
  const almada = page.locator('tr[data-obra="almada"]');
  await expect(almada.locator('td[data-person="jean"]')).toHaveText("2 / 0");
  await expect(almada.locator('td[data-person="pedro"]')).toHaveText("0 / 1");
  await expect(almada.locator("td.att-total")).toHaveText("2 / 1");
  await expect(almada.locator('td[data-col="last"]')).toContainText("hoje");
  await expect(almada.locator('td[data-col="next"]')).toContainText("28/10");
  await expect(almada).not.toHaveClass(/att-alert/);
  await expect(page.locator("tr.att-sum td[data-person=\"jean\"]")).toHaveText("2 / 0");
});

test("Atenção highlights stale and unplanned obras", async ({ page }) => {
  await openAttention(page);
  const porto = page.locator('tr[data-obra="porto"]');
  await expect(porto).toHaveClass(/att-alert/);
  await expect(porto.locator('td[data-col="last"]')).toContainText("há 37 dias");
  await expect(porto.locator('td[data-col="next"]')).toHaveText("Nada planejado");
  const montebello = page.locator('tr[data-obra="montebello"]');
  await expect(montebello).toHaveClass(/att-alert/);
  await expect(montebello.locator('td[data-col="last"]')).toHaveText("—");
  const tulipas = page.locator('tr[data-obra="tulipas"]');
  await expect(tulipas).toHaveClass(/att-alert/);
  await expect(tulipas.locator('td[data-col="next"]')).toContainText("02/11");
});

test("the period filter changes only the realized count", async ({ page }) => {
  await openAttention(page);
  const haniel = page.locator('tr[data-obra="porto"] td[data-person="haniel"]');
  await expect(haniel).toHaveText("0 / 0");
  await page.locator('[data-action="set-att-period"][data-period="90"]').click();
  await expect(haniel).toHaveText("1 / 0");
  await expect(page.locator('[data-action="set-att-period"][data-period="90"]')).toHaveClass(/active/);
  await expect(page.locator('tr[data-obra="porto"] td[data-col="last"]')).toContainText("há 37 dias");
});

test("the obra filter narrows the table", async ({ page }) => {
  await openAttention(page);
  await expect(page.locator("tbody tr[data-obra]")).toHaveCount(6);
  await page.locator('[data-action="toggle-obra"][data-id="porto"]').click();
  await expect(page.locator("tbody tr[data-obra]")).toHaveCount(1);
});

test("the header keeps its place and the label reads Atenção por obra", async ({ page }) => {
  await openApp(page, { entries: ATT });
  const ids = ["#viewSeg", "#periodLabel", "#themeToggle"];
  const before = {};
  for (const id of ids) before[id] = await page.locator(id).boundingBox();
  await page.locator('[data-view="attention"]').click();
  for (const id of ids) expect(await page.locator(id).boundingBox(), id).toEqual(before[id]);
  await expect(page.locator("#periodLabel")).toHaveText("Atenção por obra");
  await expect(page.locator("#arrowsBox")).toHaveCSS("visibility", "hidden");
  await expect(page.locator("#waBtn")).toHaveCSS("visibility", "hidden");
});
EOF
echo ok
```
Rodar o Playwright com `tests/frontend-v2.spec.js`. Expected: os 5 testes novos falham (não existe o botão).

- [ ] **Step 2: Implementar o botão, o script, o CSS e o estado**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch
P = "public/index.html"
patch(P, [
  # botão da visão
  ('''      <button data-action="set-view" data-view="month">M&ecirc;s</button>
    </div>
    <div class="arrows" id="arrowsBox">''',
   '''      <button data-action="set-view" data-view="month">M&ecirc;s</button>
      <button data-action="set-view" data-view="attention">Aten&ccedil;&atilde;o</button>
    </div>
    <div class="arrows" id="arrowsBox">'''),
  # módulo
  ('<script src="lib/week-message.js"></script>',
   '<script src="lib/week-message.js"></script>\n<script src="lib/attention.js"></script>'),
  # estado
  ('  var groupBy = "person"; // "person" | "obra" (week view only)',
   '  var groupBy = "person"; // "person" | "obra" (week view only)\n  var attentionPeriod = "month"; // "month" | "30" | "60" | "90" (Atenção view only)'),
  # CSS
  ('  /* ---------- legend ---------- */',
   '''  /* ---------- attention view ---------- */
  .att-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
  .att-note { font-size: 12.5px; color: var(--ink-soft); margin: 0 0 12px; line-height: 1.45; }
  .att-scroll { overflow-x: auto; }
  .att-table {
    width: 100%; min-width: 760px; border-collapse: separate; border-spacing: 0;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    overflow: hidden; font-size: 13.5px;
  }
  .att-table th, .att-table td { padding: 10px 12px; text-align: center; border-bottom: 1px solid var(--border); }
  .att-table th {
    font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--ink-faint); background: var(--surface-2);
  }
  .att-table th.att-obra, .att-table td.att-obra { text-align: left; }
  .att-table tr:last-child td { border-bottom: none; }
  .att-obra-cell { display: flex; align-items: center; gap: 8px; font-weight: 800; }
  .att-obra-cell img { width: 22px; height: 22px; border-radius: 50%; }
  .att-zero { color: var(--ink-faint); opacity: 0.55; }
  .att-total { font-weight: 800; }
  .att-sub { color: var(--ink-faint); font-size: 11.5px; font-weight: 600; margin-left: 4px; }
  .att-alert td.att-obra { box-shadow: inset 4px 0 0 var(--danger); }
  .att-bad { color: var(--danger); font-weight: 800; }
  .att-sum td { background: var(--surface-2); font-weight: 800; }
  .att-empty { font-size: 13px; color: var(--ink-faint); font-style: italic; }

  /* ---------- legend ---------- */'''),
])
PY
echo ok
```

- [ ] **Step 3: Implementar `renderAttention` e a integração**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch
P = "public/index.html"
patch(P, [
  # rótulo do período
  ('''  function periodLabel() {
    if (view === "week") {''',
   '''  function periodLabel() {
    if (view === "attention") return "Atenção por obra";
    if (view === "week") {'''),
  # renderCalendar: terceira visão e setas invisíveis
  ('    document.getElementById("calendarArea").innerHTML = view === "week" ? renderWeek() : renderMonth();',
   '    document.getElementById("calendarArea").innerHTML = view === "week" ? renderWeek() : view === "month" ? renderMonth() : renderAttention();'),
  ('    document.getElementById("waBtn").classList.toggle("is-off", view !== "week");',
   '    document.getElementById("arrowsBox").classList.toggle("is-off", view === "attention");\n    document.getElementById("waBtn").classList.toggle("is-off", view !== "week");'),
  # função renderAttention antes de renderCalendar
  ('  function renderCalendar() {',
   '''  /* ---------------- attention view ---------------- */
  var ATTENTION_PERIODS = [["month", "Este mês"], ["30", "30 dias"], ["60", "60 dias"], ["90", "90 dias"]];

  function daysAgoLabel(n) {
    if (n === null) return "—";
    if (n === 0) return "hoje";
    return "há " + n + (n === 1 ? " dia" : " dias");
  }
  function dayMonthLabel(key) { var p = key.split("-"); return p[2] + "/" + p[1]; }
  function pairHTML(c) {
    return '<span class="' + (c.done ? "" : "att-zero") + '">' + c.done + '</span> / <span class="' + (c.planned ? "" : "att-zero") + '">' + c.planned + "</span>";
  }

  function renderAttention() {
    var today = dateKey(new Date());
    var anyObra = Object.keys(selectedObras).length > 0;
    var anyPerson = Object.keys(selectedPeople).length > 0;
    var obraIds = OBRAS.filter(function (o) { return !anyObra || selectedObras[o.id]; }).map(function (o) { return o.id; });
    var peopleIds = TEAM.filter(function (p) { return !anyPerson || selectedPeople[p.id]; }).map(function (p) { return p.id; });
    var result = Attention.buildAttention({
      entries: entries.filter(entryVisible),
      today: today,
      periodStart: Attention.periodStartFor(today, attentionPeriod),
      obraOrder: obraIds,
      personOrder: peopleIds
    });

    var bar = '<div class="att-bar"><div class="seg" id="attPeriodSeg">' + ATTENTION_PERIODS.map(function (p) {
      return '<button data-action="set-att-period" data-period="' + p[0] + '"' + (String(attentionPeriod) === p[0] ? ' class="active"' : "") + ">" + p[1] + "</button>";
    }).join("") + "</div></div>";
    var note = '<p class="att-note">Os números medem presença <strong>planejada</strong> (o que foi marcado na agenda), não confirmada. ' +
      "Cada célula mostra <strong>realizado / planejado</strong>: o realizado conta do início do período escolhido até hoje; o planejado é tudo que já está marcado daqui para frente. " +
      "“Última visita” ignora o período. Em vermelho: obra sem visita há mais de 14 dias ou sem nada planejado.</p>";
    if (!result.rows.length) return bar + note + '<p class="att-empty">Nenhuma obra nos filtros escolhidos.</p>';

    var head = '<tr><th class="att-obra">Obra</th>' +
      peopleIds.map(function (pid) { return "<th>" + h(personById[pid].name) + "</th>"; }).join("") +
      "<th>Total</th><th>Última visita</th><th>Próxima</th></tr>";

    var totalDone = 0, totalPlanned = 0;
    var body = result.rows.map(function (r) {
      var obra = obraById[r.obra];
      totalDone += r.done; totalPlanned += r.planned;
      var alert = r.stale || r.noPlan;
      return '<tr class="' + (alert ? "att-alert" : "") + '" data-obra="' + r.obra + '">' +
        '<td class="att-obra"><div class="att-obra-cell"><img src="' + obra.icon + '" alt="">' + h(obra.shortName || obra.name) + "</div></td>" +
        peopleIds.map(function (pid) { return '<td data-person="' + pid + '">' + pairHTML(r.byPerson[pid]) + "</td>"; }).join("") +
        '<td class="att-total">' + pairHTML({ done: r.done, planned: r.planned }) + "</td>" +
        '<td data-col="last" class="' + (r.stale ? "att-bad" : "") + '">' + daysAgoLabel(r.daysSinceLast) +
          (r.lastVisit ? '<span class="att-sub">' + dayMonthLabel(r.lastVisit) + "</span>" : "") + "</td>" +
        '<td data-col="next" class="' + (r.noPlan ? "att-bad" : "") + '">' + (r.nextVisit ? dayMonthLabel(r.nextVisit) : "Nada planejado") + "</td></tr>";
    }).join("");

    var sum = '<tr class="att-sum"><td class="att-obra">Total</td>' +
      peopleIds.map(function (pid) { return '<td data-person="' + pid + '">' + pairHTML(result.personTotals[pid]) + "</td>"; }).join("") +
      '<td class="att-total">' + pairHTML({ done: totalDone, planned: totalPlanned }) + "</td><td></td><td></td></tr>";

    return bar + note + '<div class="att-scroll"><table class="att-table"><thead>' + head + "</thead><tbody>" + body + sum + "</tbody></table></div>";
  }

  function renderCalendar() {'''),
  # clique no filtro de período
  ('''    } else if (action === "set-view") {
      view = el.getAttribute("data-view");
      renderCalendar();''',
   '''    } else if (action === "set-view") {
      view = el.getAttribute("data-view");
      renderCalendar();
    } else if (action === "set-att-period") {
      attentionPeriod = el.getAttribute("data-period");
      renderCalendar();'''),
])
PY
echo ok
```

- [ ] **Step 4: Rodar e ver passar; commit**

Rodar o Playwright com `tests/frontend-v2.spec.js` e `tests/frontend-static.spec.js`. Expected: todos passam. Se `td[data-col="last"]` do almada não contiver "hoje", conferir se o relógio simulado está em 27/10/2026 (`NOW_ISO` em `stub-api.js`).

Run (prefixo): `ga public/index.html tests/frontend-v2.spec.js && gc "feat(L1): Atenção view (realized/planned per person and obra, stale and no-plan highlights)"`

---

### Task 22: [L3] Entrar, conta, troca obrigatória de senha e faixa de ambiente local

**Files:**
- Modify: `public/index.html` (overlay de autenticação, CSS, `renderAuth`, `renderAuthModal`, login/troca/saída, `onMeChanged`, `onSessionLost`, tagline, `init`)
- Test: `tests/frontend-v2.spec.js` (acrescentar)

**Interfaces:**
- Consumes: `apiRequest`, `me`, `fetchMe`, `describeError`, `onMeChanged`, `onSessionLost` (T20); contrato de `/api/auth` (T12).
- Produces (DOM): `#authArea` com `button[data-action="open-login"]` ("Entrar") ou `#userBtn` (nome + ▾) e `#userMenu` (botões `[data-action="open-change"]`, `[data-action="logout"]`); `#authOverlay > #authModal` com `#loginForm` (`select[name="user"]`, `input[name="password"]`) ou `#changeForm` (`current`, `next`, `confirm`), mensagem `#authError`; `#localBanner` visível só em `localhost`/`127.0.0.1`.
- Produces (JS): `authMode` (`null | "login" | "change"`; a Tarefa 25 acrescenta `"admin"`), `renderAuth()`, `renderAuthModal()`, `closeAuth()` (não fecha a troca obrigatória), `isLocalHost(hostname)`.

- [ ] **Step 1: Escrever os testes que falham**

Run (prefixo):
```bash
cat >> tests/frontend-v2.spec.js <<'EOF'

// ---- Tarefa 22: login, conta, troca obrigatória, ambiente local ------------------------------

async function loginAs(page, user, password) {
  await page.locator('[data-action="open-login"]').click();
  await page.locator('#loginForm select[name="user"]').selectOption(user);
  await page.locator('#loginForm input[name="password"]').fill(password);
  await page.locator('#loginForm button[type="submit"]').click();
}

test("logged-out visitors see Entrar and no user menu", async ({ page }) => {
  await openApp(page);
  await expect(page.locator('[data-action="open-login"]')).toBeVisible();
  await expect(page.locator("#userBtn")).toHaveCount(0);
});

test("a wrong password shows the generic error and keeps the visitor logged out", async ({ page }) => {
  await openApp(page);
  await loginAs(page, "jean", "errada");
  await expect(page.locator("#authError")).toHaveText("usuário ou senha inválidos");
  await expect(page.locator("#loginForm")).toBeVisible();
});

test("a correct login shows the name; the menu offers Trocar senha and Sair", async ({ page }) => {
  await openApp(page, { passwords: {} });
  await loginAs(page, "jean", "Mudar@123");
  await expect(page.locator("#userBtn")).toContainText("Jean");
  await expect(page.locator("#authModal #loginForm")).toHaveCount(0);
  await page.locator("#userBtn").click();
  await expect(page.locator('#userMenu [data-action="open-change"]')).toBeVisible();
  await expect(page.locator('#userMenu [data-action="logout"]')).toBeVisible();
});

test("an existing session is recognised on load", async ({ page }) => {
  await openApp(page, { me: "jean" });
  await expect(page.locator("#userBtn")).toContainText("Jean");
});

test("first access forces a new password; the modal cannot be dismissed", async ({ page }) => {
  const state = await openApp(page, { mustChange: ["jean"] });
  await loginAs(page, "jean", "Mudar@123");
  await expect(page.locator("#authModal h2")).toHaveText("Defina a sua senha");
  await page.keyboard.press("Escape");
  await expect(page.locator("#changeForm")).toBeVisible();
  await expect(page.locator('#authModal [data-action="close-auth"]')).toHaveCount(0);

  await page.locator('#changeForm input[name="current"]').fill("Mudar@123");
  await page.locator('#changeForm input[name="next"]').fill("curta");
  await page.locator('#changeForm input[name="confirm"]').fill("curta");
  await page.locator('#changeForm button[type="submit"]').click();
  await expect(page.locator("#authError")).toContainText("pelo menos 8");

  await page.locator('#changeForm input[name="next"]').fill("NovaSenha1");
  await page.locator('#changeForm input[name="confirm"]').fill("Outra1234");
  await page.locator('#changeForm button[type="submit"]').click();
  await expect(page.locator("#authError")).toContainText("não confere");

  await page.locator('#changeForm input[name="confirm"]').fill("NovaSenha1");
  await page.locator('#changeForm button[type="submit"]').click();
  await expect(page.locator("#changeForm")).toHaveCount(0);
  await expect(page.locator("#userBtn")).toContainText("Jean");
  expect(state.passwords.jean).toBe("NovaSenha1");
});

test("a voluntary password change can be cancelled and reports a wrong current password", async ({ page }) => {
  await openApp(page, { me: "jean" });
  await page.locator("#userBtn").click();
  await page.locator('#userMenu [data-action="open-change"]').click();
  await expect(page.locator("#authModal h2")).toHaveText("Trocar senha");
  await page.locator('#changeForm input[name="current"]').fill("errada");
  await page.locator('#changeForm input[name="next"]').fill("NovaSenha1");
  await page.locator('#changeForm input[name="confirm"]').fill("NovaSenha1");
  await page.locator('#changeForm button[type="submit"]').click();
  await expect(page.locator("#authError")).toHaveText("senha atual incorreta");
  await page.locator('#authModal [data-action="close-auth"]').click();
  await expect(page.locator("#changeForm")).toHaveCount(0);
});

test("Sair returns to the logged-out state", async ({ page }) => {
  const state = await openApp(page, { me: "jean" });
  await page.locator("#userBtn").click();
  await page.locator('#userMenu [data-action="logout"]').click();
  await expect(page.locator('[data-action="open-login"]')).toBeVisible();
  expect(state.me).toBe(null);
});

test("the local-test banner shows on localhost and not elsewhere", async ({ page }) => {
  await openApp(page, { local: true });
  await expect(page.locator("#localBanner")).toBeVisible();
  await expect(page.locator("#localBanner")).toContainText("AMBIENTE LOCAL DE TESTE");
});

test("the local-test banner is hidden when the page is not local", async ({ page }) => {
  await openApp(page);
  await expect(page.locator("#localBanner")).toBeHidden();
});
EOF
echo ok
```
Rodar o Playwright com `tests/frontend-v2.spec.js`. Expected: os 9 testes novos falham.

- [ ] **Step 2: HTML, CSS e texto de apoio**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch
P = "public/index.html"
patch(P, [
  # overlay de autenticação
  ('''<div class="overlay" id="waOverlay">
  <div class="modal" id="waModal" role="dialog" aria-modal="true"></div>
</div>''',
   '''<div class="overlay" id="waOverlay">
  <div class="modal" id="waModal" role="dialog" aria-modal="true"></div>
</div>
<div class="overlay" id="authOverlay">
  <div class="modal" id="authModal" role="dialog" aria-modal="true"></div>
</div>'''),
  # texto de apoio
  ('Clique num dia pra marcar sua presen&ccedil;a numa obra &mdash; todo mundo v&ecirc; a mesma agenda, atualizada ao vivo.',
   'Clique num dia pra ver quem vai a cada obra. Entre com o seu nome e senha pra marcar a sua presen&ccedil;a &mdash; todo mundo v&ecirc; a mesma agenda, atualizada ao vivo.'),
  # CSS
  ('  /* ---------- attention view ---------- */',
   '''  /* ---------- account ---------- */
  .user-menu {
    position: absolute; right: 0; top: calc(100% + 6px); min-width: 170px; z-index: 40;
    background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
    box-shadow: var(--shadow); padding: 4px; display: flex; flex-direction: column;
  }
  .user-menu[hidden] { display: none; }
  .user-menu button {
    border: none; background: none; text-align: left; padding: 8px 10px; border-radius: 8px;
    cursor: pointer; font-weight: 700; font-size: 13px;
  }
  .user-menu button:hover { background: var(--surface-2); }
  #authModal { max-width: 400px; }
  .auth-form { display: flex; flex-direction: column; gap: 10px; }
  .field { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; font-weight: 700; color: var(--ink-soft); }
  .field input, .field select {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 9px 10px; color: var(--ink); font: inherit; font-size: 14px;
  }
  .field input:focus, .field select:focus { outline: 2px solid var(--accent); border-color: transparent; }
  .form-error { margin: 0; min-height: 1.2em; color: var(--danger); font-size: 12.5px; font-weight: 700; }
  .btn-link {
    border: none; background: none; color: var(--ink-soft); cursor: pointer; font-weight: 700;
    font-size: 12.5px; padding: 6px; align-self: center; text-decoration: underline;
  }

  /* ---------- attention view ---------- */'''),
])
PY
echo ok
```

- [ ] **Step 3: JavaScript de login, conta e saída**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch, replace_between
P = "public/index.html"

# onMeChanged passa a cuidar do cabeçalho e do modal de autenticação
patch(P, [
  ("  function onMeChanged() { render(); }",
   '''  function onMeChanged() {
    userMenuOpen = false;
    if (me && me.mustChange) authMode = "change";
    else if (!me && authMode === "change") authMode = null;
    renderAuth();
    renderAuthModal();
    render();
  }'''),
])

# bloco de login/conta antes da seção de toast
patch(P, [(
"  /* ---------------- toast ---------------- */",
'''  /* ---------------- login and account ---------------- */
  var authMode = null;       // null | "login" | "change"
  var userMenuOpen = false;
  var LAST_USER_KEY = "agenda-obras-last-user";

  function rememberedUser() {
    try { return localStorage.getItem(LAST_USER_KEY) || ""; } catch (e) { return ""; }
  }
  function rememberUser(id) {
    try { localStorage.setItem(LAST_USER_KEY, id); } catch (e) { /* ignora */ }
  }
  function isLocalHost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
  }

  function renderAuth() {
    var area = document.getElementById("authArea");
    if (!me) {
      area.innerHTML = '<button class="today-btn" data-action="open-login">Entrar</button>';
      return;
    }
    area.innerHTML = '<button class="today-btn" id="userBtn" data-action="toggle-user-menu" aria-haspopup="true" aria-expanded="' + userMenuOpen + '">' +
      h(me.name) + ' &#9662;</button>' +
      '<div class="user-menu" id="userMenu"' + (userMenuOpen ? "" : " hidden") + ">" +
      '<button data-action="open-change">Trocar senha</button>' +
      '<button data-action="logout">Sair</button></div>';
  }

  function loginHTML() {
    var last = rememberedUser();
    return '<div class="modal-head"><div><h2>Entrar</h2></div><button class="close-x" data-action="close-auth" aria-label="Fechar">&times;</button></div>' +
      '<p class="modal-sub">Escolha o seu nome e digite a senha.</p>' +
      '<form id="loginForm" class="auth-form">' +
      '<label class="field"><span>Nome</span><select name="user">' + TEAM.map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === last ? " selected" : "") + ">" + h(p.name) + "</option>";
      }).join("") + "</select></label>" +
      '<label class="field"><span>Senha</span><input type="password" name="password" autocomplete="current-password" required></label>' +
      '<p class="form-error" id="authError" role="alert"></p>' +
      '<button type="submit" class="btn btn-primary" id="authSubmit">Entrar</button></form>';
  }

  function changeHTML() {
    var forced = !!(me && me.mustChange);
    return '<div class="modal-head"><div><h2>' + (forced ? "Defina a sua senha" : "Trocar senha") + "</h2></div>" +
      (forced ? "" : '<button class="close-x" data-action="close-auth" aria-label="Fechar">&times;</button>') + "</div>" +
      '<p class="modal-sub">' + (forced ? "Este é o seu primeiro acesso (ou a senha foi zerada). Escolha uma senha nova para continuar. " : "Digite a senha atual e a nova. ") +
      "Mínimo de 8 caracteres, diferente da senha inicial.</p>" +
      '<form id="changeForm" class="auth-form">' +
      '<label class="field"><span>Senha atual</span><input type="password" name="current" autocomplete="current-password" required></label>' +
      '<label class="field"><span>Nova senha</span><input type="password" name="next" autocomplete="new-password" required></label>' +
      '<label class="field"><span>Repita a nova senha</span><input type="password" name="confirm" autocomplete="new-password" required></label>' +
      '<p class="form-error" id="authError" role="alert"></p>' +
      '<button type="submit" class="btn btn-primary" id="authSubmit">Salvar senha</button>' +
      (forced ? '<button type="button" class="btn-link" data-action="logout">Sair</button>' : "") + "</form>";
  }

  function renderAuthModal() {
    var overlay = document.getElementById("authOverlay");
    var modal = document.getElementById("authModal");
    if (!authMode) { overlay.classList.remove("show"); modal.innerHTML = ""; return; }
    var wanted = authMode === "login" ? "loginForm" : "changeForm";
    if (!modal.querySelector("#" + wanted)) {
      modal.innerHTML = authMode === "login" ? loginHTML() : changeHTML();
      var first = modal.querySelector("select, input");
      if (first) first.focus();
    }
    overlay.classList.add("show");
  }

  function closeAuth() {
    if (authMode === "change" && me && me.mustChange) return; // a troca obrigatória não se dispensa
    authMode = null;
    renderAuthModal();
  }

  function setAuthError(msg) {
    var el = document.getElementById("authError");
    if (el) el.textContent = msg || "";
  }
  function authFailureText(err) {
    return err && err.status ? err.message : "Não foi possível agora. Tente de novo.";
  }

  function doLogin(form) {
    var btn = document.getElementById("authSubmit");
    btn.disabled = true;
    setAuthError("");
    apiRequest("POST", "/api/auth", { op: "login", user: form.elements.user.value, password: form.elements.password.value }).then(function (data) {
      me = data.user;
      rememberUser(me.id);
      authMode = me.mustChange ? "change" : null;
      onMeChanged();
      if (!me.mustChange) showToast("Olá, " + me.name + ".");
    }).catch(function (err) {
      btn.disabled = false;
      setAuthError(authFailureText(err));
      form.elements.password.value = "";
      form.elements.password.focus();
    });
  }

  function doChangePassword(form) {
    var current = form.elements.current.value, next = form.elements.next.value, again = form.elements.confirm.value;
    if (next.length < 8) { setAuthError("A nova senha precisa ter pelo menos 8 caracteres."); return; }
    if (next !== again) { setAuthError("A confirmação não confere com a nova senha."); return; }
    var btn = document.getElementById("authSubmit");
    btn.disabled = true;
    setAuthError("");
    apiRequest("POST", "/api/auth", { op: "changePassword", current: current, next: next }).then(function (data) {
      me = data.user;
      authMode = null;
      onMeChanged();
      showToast("Senha alterada.");
    }).catch(function (err) {
      btn.disabled = false;
      setAuthError(authFailureText(err));
    });
  }

  function doLogout() {
    apiRequest("POST", "/api/auth", { op: "logout" }).catch(function () { /* cookie expira sozinho */ }).then(function () {
      me = null;
      authMode = null;
      onMeChanged();
      showToast("Você saiu.");
    });
  }

  /* ---------------- toast ---------------- */''')])
PY
echo ok
```

- [ ] **Step 4: Ligar os eventos e a inicialização**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch
P = "public/index.html"
patch(P, [
  # fecha o menu ao clicar fora; fecha o modal de login ao clicar no fundo
  ('''  document.addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-action]");
    if (!el) {''',
   '''  document.addEventListener("click", function (ev) {
    if (userMenuOpen && !ev.target.closest(".auth-area")) { userMenuOpen = false; renderAuth(); }
    var el = ev.target.closest("[data-action]");
    if (!el) {
      if (ev.target.id === "authOverlay") closeAuth();'''),
  # novas ações
  ('''    } else if (action === "set-att-period") {''',
   '''    } else if (action === "open-login") {
      authMode = "login";
      renderAuthModal();
    } else if (action === "toggle-user-menu") {
      userMenuOpen = !userMenuOpen;
      renderAuth();
    } else if (action === "open-change") {
      userMenuOpen = false;
      authMode = "change";
      renderAuth();
      renderAuthModal();
    } else if (action === "close-auth") {
      closeAuth();
    } else if (action === "logout") {
      userMenuOpen = false;
      doLogout();
    } else if (action === "set-att-period") {'''),
  # envio dos formulários e Escape
  ('''  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && modalDateKey) { modalDateKey = null; renderModal(); }''',
   '''  document.addEventListener("submit", function (ev) {
    if (ev.target.id === "loginForm") { ev.preventDefault(); doLogin(ev.target); }
    else if (ev.target.id === "changeForm") { ev.preventDefault(); doChangePassword(ev.target); }
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && authMode) { closeAuth(); return; }
    if (ev.key === "Escape" && modalDateKey) { modalDateKey = null; renderModal(); }'''),
  # inicialização
  ('''  applyTheme();
  renderLegend();
  render();''',
   '''  applyTheme();
  renderLegend();
  renderAuth();
  document.getElementById("localBanner").hidden = !isLocalHost(location.hostname);
  render();'''),
])
PY
echo ok
```

- [ ] **Step 5: Rodar e ver passar; commit**

Rodar o Playwright com `tests/frontend-v2.spec.js` e `tests/frontend-static.spec.js`. Expected: todos passam. O teste "a 401 answer shows the session-expired message" (static) continua passando: `onSessionLost()` agora também atualiza o cabeçalho.

Run (prefixo): `ga public/index.html tests/frontend-v2.spec.js && gc "feat(L3): login, account menu, forced password change and local-environment banner"`

---

### Task 23: [L2+L3] Modal do dia: por perfil, reunião, vários dias e permissões

**Files:**
- Modify: `public/index.html` (CSS, `entryChipHTML`, `obraCardsHTML`, `renderModal` e auxiliares, cliques, envio da edição)
- Modify: `tests/frontend-static.spec.js` (dois testes passam a usar o novo formulário)
- Test: `tests/frontend-v2.spec.js` (acrescentar)

**Interfaces:**
- Consumes: `MeetingFormat.formatMeetingClock` (T17); `me`, `submitAddMany`, `submitUpdate`, `describeError`, `paintModalList`, `refreshModalList`, `currentListHTML`, `onMeChanged` (T20/T22).
- Produces (DOM usado pelos testes):
  - Sem login: `.modal` mostra `button[data-action="open-login"]` ("Entrar para marcar") e **nenhum** `#addForm`. Com `mustChange`: botão `[data-action="open-change"]`.
  - Usuário comum: `.acting-as` ("Marcando como <strong>Jean</strong>"), sem `input[name="modal-person"]` e sem `#actAs`. Administrador: `select#actAs` ("Marcando como"), padrão ele mesmo.
  - Formulário `#addForm`: checkboxes `input[name="modal-obra"]`; para cada obra marcada aparece `.obra-extra[data-obra]` com `.obra-comment` e o bloco de reunião (`.meet-on` = "Tem reunião", `.meet-start`, `.meet-end`; o fim é preenchido com início + 1 h).
  - Seção "Dias" `#daysPicker`: chips `button.day-chip[data-date]` (classe `on` quando marcado), setas `[data-action="mday-prev"|"mday-next"]`, rótulo `.days-range` ("25/10 a 31/10"), contador `#daysCount` ("3 dias selecionados"). O botão `#addBtn` só habilita com ≥ 1 obra e ≥ 1 dia.
  - O envio faz **uma** chamada `addMany`; toast "N marcações adicionadas." (ou "1 marcação adicionada.").
  - O × (`.rm`) e o ✎ (`.edit`) só existem para o dono da marcação e para o administrador. O formulário de edição `.comment-edit` tem `input[name="comment"]` e o bloco de reunião.
  - Chips do calendário mostram `.chip-meeting` ("14:00–15:30"); em "Por obra" o horário fica ao lado do nome; no detalhe do dia aparece "🕑 Reunião 14:00–15:30".
- Produces (JS): `canEditPerson(pid)`, `meetingFieldsHTML(meeting)`, `readMeeting(box) -> {ok, meeting}`, `plusOneHour(hhmm)`, `addAreaHTML()`, `daysPickerHTML()`, `repaintDaysPicker()`, `updateAddBtn()`, `submitAddForm(ev)`; estado `modalDays` (`{data: true}`) e `modalWeekStart` (Date).

- [ ] **Step 1: Escrever os testes que falham**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch
# os dois testes do formulário antigo passam a usar o formulário novo
patch("tests/frontend-static.spec.js", [
  ('''test("adding through the form posts op add and shows the new chip (administrator)", async ({ page }) => {
  const state = await openApp(page, { entries: SEED, me: "pedro" });
  await page.locator('[data-action="open-day"][data-date="2026-10-27"]').first().click();
  await page.locator('input[name="modal-person"][value="pedro"]').check();
  await page.locator('input[name="modal-obra"][value="montebello"]').check();
  await page.locator("#addBtn").click();
  await expect(page.locator('.day-card[data-date="2026-10-27"] .entry-chip')).toHaveCount(2);
  const add = state.requests.filter(function (r) { return r.body.op === "add"; })[0];
  expect(add.body).toMatchObject({ op: "add", date: "2026-10-27", person: "pedro", obra: "montebello" });
});''',
   '''test("adding through the form posts one addMany and shows the new chip (administrator)", async ({ page }) => {
  const state = await openApp(page, { entries: SEED, me: "pedro" });
  await page.locator('[data-action="open-day"][data-date="2026-10-27"]').first().click();
  await page.locator('input[name="modal-obra"][value="montebello"]').check();
  await page.locator("#addBtn").click();
  await expect(page.locator('.day-card[data-date="2026-10-27"] .entry-chip')).toHaveCount(2);
  const add = state.requests.filter(function (r) { return r.body.op === "addMany"; })[0];
  expect(add.body.items).toEqual([{ date: "2026-10-27", person: "pedro", obra: "montebello" }]);
});'''),
  ('''  state.me = null;
  await page.locator('input[name="modal-person"][value="pedro"]').check();
  await page.locator('input[name="modal-obra"][value="montebello"]').check();''',
   '''  state.me = null;
  await page.locator('input[name="modal-obra"][value="montebello"]').check();'''),
])
PY
cat >> tests/frontend-v2.spec.js <<'EOF'

// ---- Tarefa 23: modal do dia ---------------------------------------------------------------

const DAY = "2026-10-27";
const MIX = [
  { id: "m1", date: DAY, person: "jean", obra: "almada", createdAt: "x", comment: "vistoria", meeting: { start: "14:00", end: "15:30" } },
  { id: "m2", date: DAY, person: "haniel", obra: "porto", createdAt: "x" }
];

async function openDay(page, key) {
  await page.locator('[data-action="open-day"][data-date="' + (key || DAY) + '"]').first().click();
  await expect(page.locator("#modal")).toBeVisible();
}

test("anonymous visitors see the day but cannot edit anything", async ({ page }) => {
  await openApp(page, { entries: MIX });
  await expect(page.locator(".entry-chip .rm")).toHaveCount(0);
  await openDay(page);
  await expect(page.locator("#modal .rm, #modal .edit")).toHaveCount(0);
  await expect(page.locator("#addForm")).toHaveCount(0);
  await page.locator('#modal [data-action="open-login"]').click();
  await expect(page.locator("#loginForm")).toBeVisible();
});

test("a user who must change the password is asked to do so in the day modal", async ({ page }) => {
  await openApp(page, { me: "jean", mustChange: ["jean"] });
  await expect(page.locator("#changeForm")).toBeVisible();
});

test("a regular user marks only as themselves: no person list, just the obras", async ({ page }) => {
  const state = await openApp(page, { me: "jean", entries: [] });
  await openDay(page);
  await expect(page.locator(".acting-as")).toContainText("Marcando como Jean");
  await expect(page.locator('input[name="modal-person"]')).toHaveCount(0);
  await expect(page.locator("#actAs")).toHaveCount(0);
  await expect(page.locator('input[name="modal-obra"]')).toHaveCount(6);
  await expect(page.locator("#addBtn")).toBeDisabled();
  await page.locator('input[name="modal-obra"][value="almada"]').check();
  await expect(page.locator("#addBtn")).toBeEnabled();
  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toHaveText("1 marcação adicionada.");
  const call = state.requests.filter(function (r) { return r.body.op === "addMany"; })[0];
  expect(call.body.items).toEqual([{ date: DAY, person: "jean", obra: "almada" }]);
  await expect(page.locator('.day-card[data-date="' + DAY + '"] .entry-chip')).toHaveCount(1);
});

test("× and ✎ only appear for the owner; the administrator sees them everywhere", async ({ page }) => {
  await openApp(page, { me: "jean", entries: MIX });
  await openDay(page);
  const jean = page.locator("#modal .entry-chip", { hasText: "Jean" });
  const haniel = page.locator("#modal .entry-chip", { hasText: "Haniel" });
  await expect(jean.locator(".rm")).toHaveCount(1);
  await expect(jean.locator(".edit")).toHaveCount(1);
  await expect(haniel.locator(".rm")).toHaveCount(0);
  await expect(haniel.locator(".edit")).toHaveCount(0);
  await expect(page.locator('.day-card[data-date="' + DAY + '"] .entry-chip .rm')).toHaveCount(1);
});

test("the administrator picks who to mark as", async ({ page }) => {
  const state = await openApp(page, { me: "pedro", entries: [] });
  await openDay(page);
  await expect(page.locator("#actAs option")).toHaveCount(5);
  await expect(page.locator("#actAs")).toHaveValue("pedro");
  await page.locator("#actAs").selectOption("haniel");
  await page.locator('input[name="modal-obra"][value="tulipas"]').check();
  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toHaveText("1 marcação adicionada.");
  const call = state.requests.filter(function (r) { return r.body.op === "addMany"; })[0];
  expect(call.body.items[0]).toMatchObject({ person: "haniel", obra: "tulipas" });
});

test("several days at once go in a single addMany; the picker keeps the selection across weeks", async ({ page }) => {
  const state = await openApp(page, { me: "jean", entries: [] });
  await openDay(page);
  await expect(page.locator("#daysCount")).toHaveText("1 dia selecionado");
  await expect(page.locator('.day-chip[data-date="2026-10-27"]')).toHaveClass(/on/);
  await page.locator('.day-chip[data-date="2026-10-28"]').click();
  await page.locator('.day-chip[data-date="2026-10-29"]').click();
  await expect(page.locator("#daysCount")).toHaveText("3 dias selecionados");

  await page.locator('[data-action="mday-next"]').click();
  await expect(page.locator(".days-range")).toHaveText("01/11 a 07/11");
  await page.locator('.day-chip[data-date="2026-11-03"]').click();
  await expect(page.locator("#daysCount")).toHaveText("4 dias selecionados");
  await page.locator('[data-action="mday-prev"]').click();
  await expect(page.locator(".days-range")).toHaveText("25/10 a 31/10");
  await expect(page.locator("#daysCount")).toHaveText("4 dias selecionados");
  await page.locator('.day-chip[data-date="2026-10-29"]').click();
  await expect(page.locator("#daysCount")).toHaveText("3 dias selecionados");

  await page.locator('input[name="modal-obra"][value="porto"]').check();
  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toHaveText("3 marcações adicionadas.");
  const calls = state.requests.filter(function (r) { return r.body.op === "addMany"; });
  expect(calls).toHaveLength(1);
  expect(calls[0].body.items.map(function (i) { return i.date; })).toEqual(["2026-10-27", "2026-10-28", "2026-11-03"]);
  await expect(page.locator('.day-card[data-date="2026-10-28"] .entry-chip')).toHaveCount(1);
});

test("a meeting needs start and end; the end is prefilled with start + 1 hour", async ({ page }) => {
  const state = await openApp(page, { me: "jean", entries: [] });
  await openDay(page);
  await page.locator('input[name="modal-obra"][value="almada"]').check();
  const box = page.locator('.obra-extra[data-obra="almada"]');
  await expect(box.locator(".meet-times")).toBeHidden();
  await box.locator(".meet-on").check();
  await expect(box.locator(".meet-times")).toBeVisible();

  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toContainText("início e o fim");
  expect(state.requests.filter(function (r) { return r.body.op === "addMany"; })).toHaveLength(0);

  await box.locator(".meet-start").fill("14:00");
  await expect(box.locator(".meet-end")).toHaveValue("15:00");
  await box.locator(".meet-end").fill("13:00");
  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toContainText("início e o fim");

  await box.locator(".meet-end").fill("15:30");
  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toHaveText("1 marcação adicionada.");
  const call = state.requests.filter(function (r) { return r.body.op === "addMany"; })[0];
  expect(call.body.items[0].meeting).toEqual({ start: "14:00", end: "15:30" });
  await expect(page.locator('.day-card[data-date="' + DAY + '"] .chip-meeting')).toHaveText("14:00–15:30");
});

test("the same meeting applies to every selected day", async ({ page }) => {
  const state = await openApp(page, { me: "jean", entries: [] });
  await openDay(page);
  await page.locator('.day-chip[data-date="2026-10-28"]').click();
  await page.locator('input[name="modal-obra"][value="porto"]').check();
  const box = page.locator('.obra-extra[data-obra="porto"]');
  await box.locator(".meet-on").check();
  await box.locator(".meet-start").fill("09:00");
  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toHaveText("2 marcações adicionadas.");
  const items = state.requests.filter(function (r) { return r.body.op === "addMany"; })[0].body.items;
  expect(items.map(function (i) { return i.meeting; })).toEqual([{ start: "09:00", end: "10:00" }, { start: "09:00", end: "10:00" }]);
});

test("the day detail shows the meeting, and editing changes comment and meeting", async ({ page }) => {
  const state = await openApp(page, { me: "jean", entries: MIX });
  await openDay(page);
  await expect(page.locator("#modal .entry-chip", { hasText: "Jean" })).toContainText("Reunião 14:00–15:30");
  await page.locator('#modal .edit[data-id="m1"]').click();
  const form = page.locator(".comment-edit");
  await expect(form.locator('input[name="comment"]')).toHaveValue("vistoria");
  await expect(form.locator(".meet-on")).toBeChecked();
  await expect(form.locator(".meet-start")).toHaveValue("14:00");
  await form.locator('input[name="comment"]').fill("pauta nova");
  await form.locator(".meet-end").fill("16:00");
  await form.locator('button[type="submit"]').click();
  await expect(page.locator("#toast")).toHaveText("Comentário salvo.");
  const call = state.requests.filter(function (r) { return r.body.op === "update"; })[0];
  expect(call.body).toEqual({ op: "update", id: "m1", comment: "pauta nova", meeting: { start: "14:00", end: "16:00" } });
  await expect(page.locator("#modal .entry-chip", { hasText: "Jean" })).toContainText("14:00–16:00");
});

test("unchecking the meeting while editing removes it", async ({ page }) => {
  const state = await openApp(page, { me: "jean", entries: MIX });
  await openDay(page);
  await page.locator('#modal .edit[data-id="m1"]').click();
  await page.locator(".comment-edit .meet-on").uncheck();
  await page.locator('.comment-edit button[type="submit"]').click();
  await expect(page.locator("#toast")).toHaveText("Comentário salvo.");
  const call = state.requests.filter(function (r) { return r.body.op === "update"; })[0];
  expect(call.body.meeting).toBe(null);
  expect(state.entries[0].meeting).toBeUndefined();
});

test("the meeting time sits next to the name in the Por obra view", async ({ page }) => {
  await openApp(page, { entries: MIX });
  await page.locator('[data-group="obra"]').click();
  await expect(page.locator('.day-card[data-date="' + DAY + '"] .obra-card .chip-meeting')).toHaveText("14:00–15:30");
});

test("background refresh keeps what the person is typing in the add form", async ({ page }) => {
  const state = await openApp(page, { me: "jean", entries: [] });
  await openDay(page);
  await page.locator('input[name="modal-obra"][value="porto"]').check();
  await page.locator('.obra-comment[data-obra="porto"]').fill("pauta da reunião");
  state.entries.push({ id: "x1", date: DAY, person: "haniel", obra: "almada", createdAt: "y" });
  await page.clock.fastForward(26000);
  await expect(page.locator("#modal .current-list")).toContainText("Haniel");
  await expect(page.locator('input[name="modal-obra"][value="porto"]')).toBeChecked();
  await expect(page.locator('.obra-comment[data-obra="porto"]')).toHaveValue("pauta da reunião");
});

test("background refresh does not touch an open edit form", async ({ page }) => {
  const state = await openApp(page, { me: "jean", entries: MIX });
  await openDay(page);
  await page.locator('#modal .edit[data-id="m1"]').click();
  await page.locator('.comment-edit input[name="comment"]').fill("rascunho");
  state.entries.push({ id: "x2", date: DAY, person: "bruna", obra: "tulipas", createdAt: "y" });
  await page.clock.fastForward(26000);
  await expect(page.locator('.day-card[data-date="' + DAY + '"] .entry-chip')).toHaveCount(3);
  await expect(page.locator('.comment-edit input[name="comment"]')).toHaveValue("rascunho");
});
EOF
echo ok
```
Rodar o Playwright com `tests/frontend-v2.spec.js` e `tests/frontend-static.spec.js`. Expected: os testes novos falham (o modal ainda é o antigo).

- [ ] **Step 2: CSS, estado e atalhos**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch
P = "public/index.html"
patch(P, [
  ("  .obra-opt .obra-comment { margin: 2px 0 8px 40px; width: calc(100% - 40px); }",
   '''  .obra-extra { margin: 2px 0 10px 40px; display: flex; flex-direction: column; gap: 6px; }
  .obra-extra[hidden] { display: none; }
  .obra-extra .obra-comment { margin: 0; width: 100%; }
  .acting-as { margin: 0 0 6px; font-size: 13.5px; }
  .meet-block { display: flex; flex-direction: column; gap: 6px; }
  .meet-toggle { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: var(--ink-soft); cursor: pointer; }
  .meet-times { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ink-soft); }
  .meet-times[hidden] { display: none; }
  .meet-times input[type="time"] {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 6px 8px; color: var(--ink); font: inherit; font-size: 13px;
  }
  .chip-meeting { display: block; font-size: 11px; font-weight: 700; color: var(--ink); }
  .obra-card .chip-meeting { display: inline; margin-left: 2px; }
  .chip-detail .chip-meeting { font-size: 12px; margin-bottom: 2px; }
  .days-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .days-range { font-size: 12.5px; font-weight: 700; color: var(--ink-soft); }
  .days-strip { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .day-chip {
    border: 1.5px solid var(--border); background: var(--surface); color: var(--ink-soft); border-radius: 9px;
    padding: 6px 0; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 1px;
    font-size: 11px; font-weight: 700;
  }
  .day-chip strong { font-size: 14px; color: var(--ink); }
  .day-chip.on { border-color: var(--accent); background: var(--accent-soft); }
  .day-chip.origin { box-shadow: inset 0 -3px 0 var(--accent); }
  .days-count { margin: 6px 0 0; font-size: 12px; color: var(--ink-faint); }'''),
  ("  var editingEntryId = null;",
   "  var editingEntryId = null;\n  var modalDays = {};         // dias marcados no seletor do modal: { \"AAAA-MM-DD\": true }\n  var modalWeekStart = null;  // domingo (Date) da semana mostrada no seletor"),
])
PY
echo ok
```

- [ ] **Step 3: Chips, cartões "Por obra" e funções do modal**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch, replace_between
P = "public/index.html"

# 3a. chip
replace_between(P, "  // detailed=false: compact chip for the calendar (comment shown as an icon).", "  function holidayPillsHTML(list) {", '''  function canEditPerson(pid) {
    return !!me && !me.mustChange && (me.role === "admin" || me.id === pid);
  }

  function plusOneHour(hhmm) {
    var parts = hhmm.split(":");
    var hour = Number(parts[0]) + 1;
    return hour > 23 ? "23:59" : pad(hour) + ":" + parts[1];
  }

  // "Tem reunião" + start/end inputs. `meeting` ({start,end}) prefills them when editing.
  function meetingFieldsHTML(meeting) {
    var on = !!meeting;
    return '<div class="meet-block">' +
      '<label class="meet-toggle"><input type="checkbox" class="meet-on" style="accent-color:var(--accent)"' + (on ? " checked" : "") + "> Tem reunião</label>" +
      '<div class="meet-times"' + (on ? "" : " hidden") + ">" +
      '<input type="time" class="meet-start" aria-label="Início da reunião" value="' + (on ? h(meeting.start) : "") + '">' +
      "<span>até</span>" +
      '<input type="time" class="meet-end" aria-label="Fim da reunião" value="' + (on ? h(meeting.end) : "") + '">' +
      "</div></div>";
  }

  // Reads the meeting fields inside `box`: { ok: true, meeting: null | {start,end} } or { ok: false }.
  function readMeeting(box) {
    var on = box.querySelector(".meet-on");
    if (!on || !on.checked) return { ok: true, meeting: null };
    var start = box.querySelector(".meet-start").value;
    var end = box.querySelector(".meet-end").value;
    if (!start || !end || end <= start) return { ok: false };
    return { ok: true, meeting: { start: start, end: end } };
  }

  function editFormHTML(en) {
    return '<div class="chip-detail"><form class="comment-edit" data-id="' + en.id + '">' +
      '<input type="text" name="comment" maxlength="140" value="' + h(en.comment || "") + '" placeholder="O que vai fazer lá?" aria-label="Comentário">' +
      meetingFieldsHTML(en.meeting) +
      '<div class="comment-edit-actions"><button type="submit" class="btn-mini primary">Salvar</button>' +
      '<button type="button" class="btn-mini" data-action="cancel-edit-comment">Cancelar</button></div></form></div>';
  }

  // detailed=false: compact chip for the calendar (comment as an icon, meeting as a line).
  // detailed=true: chip for the day modal (full comment, meeting, edit form).
  // The remove and edit buttons only exist for the owner of the entry and for the administrator.
  function entryChipHTML(en, detailed) {
    var obra = obraById[en.obra], person = personById[en.person];
    if (!obra || !person) return "";
    var canEdit = canEditPerson(en.person);
    var clock = MeetingFormat.formatMeetingClock(en.meeting);
    var badge = "", detail = "", editBtn = "";
    var rmBtn = canEdit
      ? '<button class="rm" data-action="remove-entry" data-id="' + en.id + '" title="Remover" aria-label="Remover">&times;</button>'
      : "";
    if (detailed) {
      if (canEdit) {
        editBtn = '<button class="edit" data-action="edit-comment" data-id="' + en.id + '" title="Editar" aria-label="Editar">&#9998;</button>';
      }
      if (canEdit && editingEntryId === en.id) {
        detail = editFormHTML(en);
      } else if (en.comment || clock) {
        detail = '<div class="chip-detail">' +
          (clock ? '<span class="chip-meeting">&#128337; Reunião ' + clock + "</span>" : "") +
          (en.comment ? '<span class="chip-comment-text">' + h(en.comment) + "</span>" : "") + "</div>";
      }
    } else if (en.comment) {
      badge = '<span class="chip-comment" title="' + h(en.comment) + '" aria-label="Comentário: ' + h(en.comment) + '">&#128172;</span>';
    }
    return '<div class="entry-chip" style="--chip-color:' + obra.color + '">' +
      '<img src="' + obra.icon + '" alt="">' +
      '<span class="chip-text"><span class="chip-name" title="' + h(person.name) + '">' + h(person.name) + "</span>" +
      '<span class="chip-obra" title="' + h(obra.name) + '">' + h(obra.shortName || obra.name) + "</span>" +
      (!detailed && clock ? '<span class="chip-meeting">' + clock + "</span>" : "") + "</span>" +
      badge + editBtn + rmBtn + detail + "</div>";
  }

''', keep_end=True)

# 3b. "Por obra": horário ao lado do nome
patch(P, [("        return h(personById[p.person].name) + badge;",
           '''        var clock = MeetingFormat.formatMeetingClock(p.meeting);
        return h(personById[p.person].name) + (clock ? ' <span class="chip-meeting">' + clock + "</span>" : "") + badge;''')])
PY
grep -c "canEditPerson" public/index.html
```
Expected: `≥ 2`.

- [ ] **Step 4: Reescrever `renderModal` e as funções do formulário**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import replace_between
P = "public/index.html"

replace_between(P, "  function renderModal() {", "  function render() {", '''  function obraOptionsHTML() {
    return OBRAS.map(function (o) {
      return '<div class="obra-opt"><label class="opt-row"><input type="checkbox" name="modal-obra" value="' + o.id + '" style="accent-color:var(--accent)">' +
        '<img src="' + o.icon + '" alt=""><span class="opt-label">' + h(o.name) + '<div class="opt-sub">' + h(o.city) + "</div></span></label>" +
        '<div class="obra-extra" data-obra="' + o.id + '" hidden>' +
        '<input type="text" class="obra-comment" data-obra="' + o.id + '" maxlength="140" placeholder="O que vai fazer lá? (opcional)" aria-label="Comentário para ' + h(o.name) + '">' +
        meetingFieldsHTML(null) + "</div></div>";
    }).join("");
  }

  function addAreaHTML() {
    if (!me) {
      return '<p class="modal-sub">Entre com o seu nome e senha para marcar a sua presença.</p>' +
        '<button type="button" class="btn btn-primary" data-action="open-login">Entrar para marcar</button>';
    }
    if (me.mustChange) {
      return '<p class="modal-sub">Troque a sua senha para poder marcar.</p>' +
        '<button type="button" class="btn btn-primary" data-action="open-change">Trocar senha</button>';
    }
    var who = me.role === "admin"
      ? '<label class="field"><span>Marcando como</span><select id="actAs" name="act-as">' + TEAM.map(function (p) {
          return '<option value="' + p.id + '"' + (p.id === me.id ? " selected" : "") + ">" + h(p.name) + "</option>";
        }).join("") + "</select></label>"
      : '<p class="acting-as">Marcando como <strong>' + h(me.name) + "</strong></p>";
    return '<form id="addForm">' + who +
      '<div class="modal-section-title">Obra(s)</div><div class="check-list">' + obraOptionsHTML() + "</div>" +
      '<div class="modal-section-title">Dias</div><div id="daysPicker" class="days-picker"></div>' +
      '<button type="submit" class="btn btn-primary" id="addBtn" disabled>Adicionar</button></form>';
  }

  function daysPickerHTML() {
    var start = modalWeekStart, end = addDays(start, 6), chips = [];
    for (var i = 0; i < 7; i++) {
      var d = addDays(start, i), key = dateKey(d), on = !!modalDays[key];
      chips.push('<button type="button" class="day-chip' + (on ? " on" : "") + (key === modalDateKey ? " origin" : "") +
        '" data-action="toggle-mday" data-date="' + key + '" aria-pressed="' + on + '"><span>' + WEEKDAY_SHORT[i] + "</span><strong>" + d.getDate() + "</strong></button>");
    }
    return '<div class="days-nav"><button type="button" class="btn-mini" data-action="mday-prev" aria-label="Semana anterior">&#8249;</button>' +
      '<span class="days-range">' + pad(start.getDate()) + "/" + pad(start.getMonth() + 1) + " a " + pad(end.getDate()) + "/" + pad(end.getMonth() + 1) + "</span>" +
      '<button type="button" class="btn-mini" data-action="mday-next" aria-label="Próxima semana">&#8250;</button></div>' +
      '<div class="days-strip">' + chips.join("") + "</div>" +
      '<p class="days-count" id="daysCount"></p>';
  }

  // Enables the add button and shows the extra fields of the checked obras. Never rebuilds the form.
  function updateAddBtn() {
    var form = document.getElementById("addForm");
    if (!form) return;
    var obras = form.querySelectorAll('input[name="modal-obra"]:checked').length;
    var days = Object.keys(modalDays).length;
    document.getElementById("addBtn").disabled = !(obras && days);
    form.querySelectorAll('input[name="modal-obra"]').forEach(function (cb) {
      var extra = form.querySelector('.obra-extra[data-obra="' + cb.value + '"]');
      if (extra) extra.hidden = !cb.checked;
    });
    var count = document.getElementById("daysCount");
    if (count) count.textContent = days === 1 ? "1 dia selecionado" : days + " dias selecionados";
  }
  function repaintDaysPicker() {
    var box = document.getElementById("daysPicker");
    if (box) box.innerHTML = daysPickerHTML();
    updateAddBtn();
  }

  function submitAddForm(ev) {
    ev.preventDefault();
    var form = ev.target;
    var person = form.elements["act-as"] ? form.elements["act-as"].value : me.id;
    var days = Object.keys(modalDays).sort();
    var checks = Array.prototype.slice.call(form.querySelectorAll('input[name="modal-obra"]:checked'));
    if (!checks.length || !days.length) return;
    var specs = [];
    for (var i = 0; i < checks.length; i++) {
      var extra = form.querySelector('.obra-extra[data-obra="' + checks[i].value + '"]');
      var meet = readMeeting(extra);
      if (!meet.ok) { showToast("Informe o início e o fim da reunião (o fim precisa ser depois do início)."); return; }
      specs.push({ obra: checks[i].value, comment: extra.querySelector(".obra-comment").value.trim(), meeting: meet.meeting });
    }
    var items = [];
    days.forEach(function (day) {
      specs.forEach(function (s) {
        var item = { date: day, person: person, obra: s.obra };
        if (s.comment) item.comment = s.comment;
        if (s.meeting) item.meeting = s.meeting;
        items.push(item);
      });
    });
    if (items.length > 60) { showToast("No máximo 60 marcações por vez. Escolha menos dias ou obras."); return; }
    var btn = document.getElementById("addBtn");
    btn.disabled = true;
    btn.textContent = "Adicionando…";
    submitAddMany(items).then(function () {
      modalDays = {};
      modalDays[modalDateKey] = true;
      modalWeekStart = startOfWeek(parseKey(modalDateKey));
      renderModal();
      renderCalendar();
      showToast(items.length === 1 ? "1 marcação adicionada." : items.length + " marcações adicionadas.");
    }).catch(function (err) {
      showToast(describeError(err, "Não foi possível salvar agora. Tente de novo."));
      btn.disabled = false;
      btn.textContent = "Adicionar";
    });
  }

  function renderModal() {
    var overlay = document.getElementById("overlay");
    if (!modalDateKey) { editingEntryId = null; overlay.classList.remove("show"); return; }
    var d = parseKey(modalDateKey);
    var hol = holidaysForDate(d);
    var weekdayFull = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"][d.getDay()];
    var label = capFirst(weekdayFull + ", " + d.getDate() + " de " + MONTH_NAMES[d.getMonth()]);
    if (!modalWeekStart) modalWeekStart = startOfWeek(d);
    var holHTML = hol.length ? holidayPillsHTML(hol) + '<p class="modal-sub" style="margin-top:6px">' + hol.map(function (x) { return h(x.label); }).join(" · ") + "</p>" : "";

    document.getElementById("modal").innerHTML =
      '<div class="modal-head"><div><h2>' + h(label) + '</h2></div><button class="close-x" data-action="close-modal" aria-label="Fechar">&times;</button></div>' +
      holHTML +
      '<div class="modal-section-title">Marcados neste dia</div>' +
      '<div class="current-list">' + currentListHTML(modalDateKey) + "</div>" +
      '<div class="modal-section-title">Adicionar presença</div>' +
      addAreaHTML();
    overlay.classList.add("show");

    var form = document.getElementById("addForm");
    if (form) {
      repaintDaysPicker();
      form.addEventListener("change", updateAddBtn);
      form.addEventListener("submit", submitAddForm);
    }
  }

''', keep_end=True)
PY
grep -c "modal-person" public/index.html
```
Expected: `0`.

- [ ] **Step 5: Eventos (abrir o dia, seletor de dias, campos de reunião, salvar edição)**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch, replace_between
P = "public/index.html"

patch(P, [
  # abrir o dia: seletor começa só com o dia clicado
  ('''    } else if (action === "open-day") {
      modalDateKey = el.getAttribute("data-date");
      renderModal();''',
   '''    } else if (action === "open-day") {
      modalDateKey = el.getAttribute("data-date");
      modalDays = {};
      modalDays[modalDateKey] = true;
      modalWeekStart = startOfWeek(parseKey(modalDateKey));
      renderModal();
    } else if (action === "toggle-mday") {
      var mday = el.getAttribute("data-date");
      if (modalDays[mday]) delete modalDays[mday]; else modalDays[mday] = true;
      repaintDaysPicker();
    } else if (action === "mday-prev" || action === "mday-next") {
      modalWeekStart = addDays(modalWeekStart, action === "mday-prev" ? -7 : 7);
      repaintDaysPicker();'''),
])

# salvar edição (comentário + reunião)
replace_between(P, '  document.addEventListener("submit", function (ev) {\n    var editForm = ev.target.closest(".comment-edit");',
  '  document.addEventListener("submit", function (ev) {\n    if (ev.target.id === "loginForm")', '''  document.addEventListener("submit", function (ev) {
    var editForm = ev.target.closest(".comment-edit");
    if (!editForm) return;
    ev.preventDefault();
    var id = editForm.getAttribute("data-id");
    var meet = readMeeting(editForm);
    if (!meet.ok) { showToast("Informe o início e o fim da reunião (o fim precisa ser depois do início)."); return; }
    submitUpdate(id, { comment: editForm.elements.comment.value.trim(), meeting: meet.meeting }).then(function () {
      editingEntryId = null;
      paintModalList();
      renderCalendar();
      showToast("Comentário salvo.");
    }).catch(function (err) {
      if (err && err.status === 404) {
        editingEntryId = null;
        loadState().then(function (state) { applyState(state); render(); });
        showToast("Essa marcação não existe mais.");
      } else {
        showToast(describeError(err, "Não foi possível salvar agora. Tente de novo."));
      }
    });
  });
''', keep_end=True)

# campos de reunião (vale para o formulário de adicionar e o de editar)
patch(P, [(
'''  document.addEventListener("submit", function (ev) {
    if (ev.target.id === "loginForm")''',
'''  document.addEventListener("change", function (ev) {
    var t = ev.target;
    if (t.classList.contains("meet-on")) {
      t.closest(".meet-block").querySelector(".meet-times").hidden = !t.checked;
    } else if (t.classList.contains("meet-start")) {
      var end = t.closest(".meet-block").querySelector(".meet-end");
      if (t.value && (!end.value || end.dataset.auto === "1")) { end.value = plusOneHour(t.value); end.dataset.auto = "1"; }
    } else if (t.classList.contains("meet-end")) {
      t.dataset.auto = "";
    }
  });
  document.addEventListener("submit", function (ev) {
    if (ev.target.id === "loginForm")''')])
PY
echo ok
```

- [ ] **Step 6: Rodar e ver passar; commit**

Rodar o Playwright com `tests/frontend-v2.spec.js` e `tests/frontend-static.spec.js`. Expected: todos passam. Falhas comuns: `await expect(...).toHaveText("14:00–15:30")` falha se o travessão for `-` (deve ser `–`, U+2013, como em `meeting-format.js`).

Run (prefixo): `ga public/index.html tests/frontend-v2.spec.js tests/frontend-static.spec.js && gc "feat(L2-L3): day modal by role, meeting fields, multi-day picker with one addMany, owner-only edit and remove"`

---

### Task 24: [L2] Semana programada: faixa no calendário, aviso de reabertura e banner na mensagem

**Files:**
- Modify: `public/index.html` (CSS, `renderWeek`, `entriesOp`, `renderWaModal`, polling, cliques, três toasts da Tarefa 23)
- Test: `tests/frontend-v2.spec.js` (acrescentar)

**Interfaces:**
- Consumes: `confirmations`, `me`, `canEditPerson`, `submitWeek(op, week, person)`, `startOfWeek`, `dateKey`, `describeError`, `renderAuthModal`, `authMode` (T20–T23).
- Produces (DOM): na visão Semana, acima da grade, `.week-strip` com rótulo "Semana programada", cinco botões `button.wk-btn[data-person]` (classe `done` quando fechada, texto "✓ Jean" / "○ Jean", `title` "Fechada em dd/mm às HH:MM" ou "Ainda não programou a semana") e o contador `.wk-count` ("N de 5 programadas"). No modal da mensagem: `#waBanner` com classe `ok` ("✓ Todos programaram a semana.") ou `warn` ("Faltam: Jean, Haniel."). O banner **nunca** entra no texto da mensagem (`#waText`).
- Produces (JS): `weekKeyOfCursor()`, `weekStripHTML(start)`, `formatClosedAt(iso)`, `toggleWeek(pid)`, `waBannerHTML()`, `refreshWaBanner()`, `reopenNote()`; variável `pendingReopen` (lista de nomes das semanas reabertas pela última gravação).
- Regras: clicar no próprio nome fecha/reabre a semana exibida; administrador age em qualquer nome; usuário comum clicando em outro nome vê o toast "Você só pode fechar a sua própria semana." e nada é enviado; sem login abre o formulário de entrada. Quando uma gravação (adicionar, editar, remover) faz o servidor reabrir uma semana que estava fechada, o toast acrescenta " Semana de Jean reaberta, feche de novo quando terminar."

- [ ] **Step 1: Escrever os testes que falham**

Run (prefixo):
```bash
cat >> tests/frontend-v2.spec.js <<'EOF'

// ---- Tarefa 24: semana programada ------------------------------------------------------------

const WEEK = "2026-10-25"; // domingo da semana de 27/10/2026
const CLOSED_AT = "2026-10-27T15:00:00.000Z"; // 12:00 em São Paulo

test("the strip shows who already closed the week, with the closing time", async ({ page }) => {
  await openApp(page, { confirmations: { [WEEK]: { jean: CLOSED_AT } } });
  await expect(page.locator(".week-strip .wk-btn")).toHaveCount(5);
  await expect(page.locator(".wk-count")).toHaveText("1 de 5 programadas");
  const jean = page.locator('.wk-btn[data-person="jean"]');
  await expect(jean).toHaveClass(/done/);
  await expect(jean).toContainText("✓");
  await expect(jean).toHaveAttribute("title", "Fechada em 27/10 às 12:00");
  const haniel = page.locator('.wk-btn[data-person="haniel"]');
  await expect(haniel).not.toHaveClass(/done/);
  await expect(haniel).toContainText("○");
});

test("the strip only exists in the week view", async ({ page }) => {
  await openApp(page);
  await page.locator('[data-view="month"]').click();
  await expect(page.locator(".week-strip")).toHaveCount(0);
  await page.locator('[data-view="week"]').click();
  await expect(page.locator(".week-strip")).toHaveCount(1);
});

test("a person closes and reopens their own week", async ({ page }) => {
  const state = await openApp(page, { me: "jean" });
  await page.locator('.wk-btn[data-person="jean"]').click();
  await expect(page.locator("#toast")).toHaveText("Semana de Jean fechada.");
  await expect(page.locator(".wk-count")).toHaveText("1 de 5 programadas");
  expect(state.requests.filter(function (r) { return r.body.op === "confirmWeek"; })[0].body).toEqual({ op: "confirmWeek", week: WEEK, person: "jean" });
  await page.locator('.wk-btn[data-person="jean"]').click();
  await expect(page.locator("#toast")).toHaveText("Semana de Jean reaberta.");
  await expect(page.locator(".wk-count")).toHaveText("0 de 5 programadas");
  expect(state.requests.filter(function (r) { return r.body.op === "unconfirmWeek"; })).toHaveLength(1);
});

test("a regular user cannot close someone else's week", async ({ page }) => {
  const state = await openApp(page, { me: "jean" });
  await page.locator('.wk-btn[data-person="haniel"]').click();
  await expect(page.locator("#toast")).toHaveText("Você só pode fechar a sua própria semana.");
  expect(state.requests.filter(function (r) { return r.body.op === "confirmWeek"; })).toHaveLength(0);
});

test("the administrator closes the week of anyone", async ({ page }) => {
  const state = await openApp(page, { me: "pedro" });
  await page.locator('.wk-btn[data-person="haniel"]').click();
  await expect(page.locator("#toast")).toHaveText("Semana de Haniel fechada.");
  expect(state.confirmations[WEEK].haniel).toBeTruthy();
});

test("anonymous visitors are asked to sign in instead", async ({ page }) => {
  const state = await openApp(page);
  await page.locator('.wk-btn[data-person="jean"]').click();
  await expect(page.locator("#loginForm")).toBeVisible();
  expect(state.requests.filter(function (r) { return r.body.op === "confirmWeek"; })).toHaveLength(0);
});

test("changing a marking reopens the closed week and the toast says so", async ({ page }) => {
  await openApp(page, { me: "jean", confirmations: { [WEEK]: { jean: CLOSED_AT, haniel: CLOSED_AT } } });
  await openDay(page);
  await page.locator('input[name="modal-obra"][value="porto"]').check();
  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toHaveText("1 marcação adicionada. Semana de Jean reaberta, feche de novo quando terminar.");
  await expect(page.locator(".wk-count")).toHaveText("1 de 5 programadas");
  await expect(page.locator('.wk-btn[data-person="jean"]')).not.toHaveClass(/done/);
  await expect(page.locator('.wk-btn[data-person="haniel"]')).toHaveClass(/done/);
});

test("removing a marking reopens the week too", async ({ page }) => {
  await openApp(page, { me: "jean", entries: MIX, confirmations: { [WEEK]: { jean: CLOSED_AT } } });
  await openDay(page);
  await page.locator('#modal .rm[data-id="m1"]').click();
  await expect(page.locator("#toast")).toHaveText("Presença removida. Semana de Jean reaberta, feche de novo quando terminar.");
});

test("the message modal warns who is missing, without putting it in the message", async ({ page }) => {
  await openApp(page, { confirmations: { [WEEK]: { jean: CLOSED_AT } } });
  await page.locator("#waBtn").click();
  await expect(page.locator("#waBanner")).toHaveClass(/warn/);
  await expect(page.locator("#waBanner")).toHaveText("Faltam: Pedro, Haniel, Gustavo, Bruna.");
  await expect(page.locator("#waText")).not.toHaveValue(/Faltam|programaram/);
});

test("the banner turns green when everybody closed the week, and follows background refreshes", async ({ page }) => {
  const state = await openApp(page);
  await page.locator("#waBtn").click();
  await expect(page.locator("#waBanner")).toHaveText("Faltam: Pedro, Jean, Haniel, Gustavo, Bruna.");
  state.confirmations[WEEK] = { pedro: CLOSED_AT, jean: CLOSED_AT, haniel: CLOSED_AT, gustavo: CLOSED_AT, bruna: CLOSED_AT };
  await page.clock.fastForward(26000);
  await expect(page.locator("#waBanner")).toHaveClass(/ok/);
  await expect(page.locator("#waBanner")).toContainText("Todos programaram a semana");
  await expect(page.locator("#waText")).not.toHaveValue(/programaram/);
});
EOF
echo ok
```
Rodar o Playwright com `tests/frontend-v2.spec.js`. Expected: os 10 testes novos falham (não existe `.week-strip`).

- [ ] **Step 2: CSS**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch
patch("public/index.html", [(
"  .days-count { margin: 6px 0 0; font-size: 12px; color: var(--ink-faint); }",
'''  .days-count { margin: 6px 0 0; font-size: 12px; color: var(--ink-faint); }
  .week-strip { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; margin: 0 0 10px; font-size: 13px; }
  .week-strip .wk-label { font-weight: 700; color: var(--ink-soft); margin-right: 2px; }
  .wk-btn {
    border: 1.5px solid var(--border); background: var(--surface); color: var(--ink-soft); border-radius: 999px;
    padding: 5px 11px; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer;
  }
  .wk-btn.done { border-color: #2e9e5b; background: rgba(46, 158, 91, 0.14); color: var(--ink); }
  .wk-count { margin-left: auto; font-size: 12.5px; color: var(--ink-faint); }
  .wa-banner { margin: 0 0 10px; padding: 8px 12px; border-radius: 10px; font-size: 13px; font-weight: 700; }
  .wa-banner.ok { background: rgba(46, 158, 91, 0.16); color: var(--ink); }
  .wa-banner.warn { background: rgba(230, 160, 30, 0.2); color: var(--ink); }''')])
PY
echo ok
```

- [ ] **Step 3: Faixa, banner, tratador e aviso de reabertura**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch
P = "public/index.html"

patch(P, [
  # faixa acima da grade da semana
  ('''    return '<div class="week-scroll"><div class="week-grid">' + cells.join("") + "</div></div>";''',
   '''    return weekStripHTML(start) + '<div class="week-scroll"><div class="week-grid">' + cells.join("") + "</div></div>";'''),

  # entriesOp guarda quais semanas o servidor reabriu
  ('''  function entriesOp(payload) {
    return apiRequest("POST", "/api/entries", payload).then(function (data) {
      applyState(normalizeState(data));
      return data;
    });
  }''',
   '''  var pendingReopen = [];   // nomes cujas semanas fechadas o servidor reabriu na última gravação
  function reopenedNames(before, after) {
    var names = [];
    Object.keys(before).forEach(function (week) {
      Object.keys(before[week]).forEach(function (pid) {
        var still = after[week] && after[week][pid];
        if (!still && personById[pid] && names.indexOf(personById[pid].name) < 0) names.push(personById[pid].name);
      });
    });
    return names;
  }
  // Text to append to the toast of the last write; reads and clears the pending notice.
  function reopenNote() {
    if (!pendingReopen.length) return "";
    var text = pendingReopen.length === 1
      ? " Semana de " + pendingReopen[0] + " reaberta, feche de novo quando terminar."
      : " Semanas de " + pendingReopen.join(", ") + " reabertas, feche de novo quando terminar.";
    pendingReopen = [];
    return text;
  }
  function entriesOp(payload) {
    var before = confirmations;
    return apiRequest("POST", "/api/entries", payload).then(function (data) {
      applyState(normalizeState(data));
      pendingReopen = payload.op === "confirmWeek" || payload.op === "unconfirmWeek" ? [] : reopenedNames(before, confirmations);
      return data;
    });
  }'''),

  # os três toasts da Tarefa 23 passam a anexar o aviso
  ('''      showToast(items.length === 1 ? "1 marcação adicionada." : items.length + " marcações adicionadas.");''',
   '''      showToast((items.length === 1 ? "1 marcação adicionada." : items.length + " marcações adicionadas.") + reopenNote());'''),
  ('''        showToast("Presença removida.");''', '''        showToast("Presença removida." + reopenNote());'''),
  ('''      showToast("Comentário salvo.");''', '''      showToast("Comentário salvo." + reopenNote());'''),

  # banner no modal da mensagem + funções da semana programada
  ('''  function renderWaModal() {
    var overlay = document.getElementById("waOverlay");''',
   '''  /* ---------------- semana programada ---------------- */
  function weekKeyOfCursor() { return dateKey(startOfWeek(cursor)); }

  // "27/10 às 12:00" in São Paulo time, whatever the browser time zone.
  function formatClosedAt(iso) {
    var parts = {};
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso)).forEach(function (p) { parts[p.type] = p.value; });
    return parts.day + "/" + parts.month + " às " + parts.hour + ":" + parts.minute;
  }

  function weekStripHTML(start) {
    var conf = confirmations[dateKey(start)] || {};
    var done = 0;
    var buttons = TEAM.map(function (p) {
      var at = conf[p.id];
      if (at) done++;
      return '<button type="button" class="wk-btn' + (at ? " done" : "") + '" data-action="toggle-week" data-person="' + p.id + '" aria-pressed="' + !!at + '" ' +
        'title="' + (at ? "Fechada em " + formatClosedAt(at) : "Ainda não programou a semana") + '">' + (at ? "&#10003; " : "&#9675; ") + h(p.name) + "</button>";
    }).join("");
    return '<div class="week-strip"><span class="wk-label">Semana programada</span>' + buttons +
      '<span class="wk-count">' + done + " de " + TEAM.length + " programadas</span></div>";
  }

  function toggleWeek(pid) {
    if (!me) { authMode = "login"; renderAuthModal(); showToast("Entre para fechar a sua semana."); return; }
    if (me.mustChange) { authMode = "change"; renderAuthModal(); return; }
    if (!canEditPerson(pid)) { showToast("Você só pode fechar a sua própria semana."); return; }
    var key = weekKeyOfCursor();
    var closed = !!(confirmations[key] && confirmations[key][pid]);
    submitWeek(closed ? "unconfirmWeek" : "confirmWeek", key, pid).then(function () {
      renderCalendar();
      showToast("Semana de " + personById[pid].name + (closed ? " reaberta." : " fechada."));
    }).catch(function (err) {
      showToast(describeError(err, "Não foi possível salvar agora. Tente de novo."));
    });
  }

  function waBannerHTML() {
    var conf = confirmations[weekKeyOfCursor()] || {};
    var missing = TEAM.filter(function (p) { return !conf[p.id]; });
    if (!missing.length) return '<div class="wa-banner ok" id="waBanner">&#10003; Todos programaram a semana.</div>';
    return '<div class="wa-banner warn" id="waBanner">Faltam: ' + missing.map(function (p) { return h(p.name); }).join(", ") + ".</div>";
  }
  function refreshWaBanner() {
    if (!waModalOpen) return;
    var el = document.getElementById("waBanner");
    if (el) el.outerHTML = waBannerHTML();
  }

  function renderWaModal() {
    var overlay = document.getElementById("waOverlay");'''),
  ('''      '<p class="modal-sub">Confira o texto, edite se quiser, e copie ou abra direto no WhatsApp.</p>' +''',
   '''      waBannerHTML() +
      '<p class="modal-sub">Confira o texto, edite se quiser, e copie ou abra direto no WhatsApp.</p>' +'''),

  # polling também atualiza o banner
  ('''      applyState(state);
      renderCalendar();
      refreshModalList();''',
   '''      applyState(state);
      renderCalendar();
      refreshModalList();
      refreshWaBanner();'''),

  # clique na faixa
  ('''    } else if (action === "set-att-period") {''',
   '''    } else if (action === "toggle-week") {
      toggleWeek(el.getAttribute("data-person"));
    } else if (action === "set-att-period") {'''),
])
PY
grep -c "weekStripHTML" public/index.html
```
Expected: `2`.

- [ ] **Step 4: Rodar e ver passar; commit**

Rodar o Playwright com `tests/frontend-v2.spec.js` e `tests/frontend-static.spec.js`. Expected: todos passam. Se o teste do `title` falhar com hora diferente, confirme que `SERVER_NOW` do stub é `2026-10-27T15:00:00.000Z` (12:00 em São Paulo).

Run (prefixo): `ga public/index.html tests/frontend-v2.spec.js && gc "feat(L2): week strip, reopen notice and WhatsApp banner for Semana programada"`

---

### Task 25: [L3] Painel de administração: zerar senha, baixar backup e restaurar

**Files:**
- Modify: `public/index.html` (CSS, `renderAuth`, `renderAuthModal`, `onMeChanged`, novo bloco "administração", cliques)
- Test: `tests/frontend-v2.spec.js` (acrescentar)

**Interfaces:**
- Consumes: `POST /api/admin` com `listBackups`, `downloadBackup`, `resetPassword`, `restoreBackup` (T14; o stub da T19 já simula); `apiRequest`, `describeError`, `loadState`, `applyState`, `me`, `authMode`, `closeAuth` (T20/T22).
- Produces (DOM): item `[data-action="open-admin"]` ("Administração") no `#userMenu` **só para o administrador**; `#authModal` com `#adminPanel`; linhas `.admin-user[data-user]` (botão `[data-action="admin-reset"][data-user]`; sem botão para o próprio administrador); confirmação em linha com `[data-action="admin-reset-yes"]` e `[data-action="admin-cancel"]`; `[data-action="admin-download"]`; `.admin-backup[data-id]` com `[data-action="admin-restore"][data-id]`, `[data-action="admin-restore-yes"]`.
- Produces (JS): `authMode === "admin"`; `adminBackups` (`null` carregando), `adminBackupsError`, `adminConfirm` (`null | {kind:"reset"|"restore", id}`); `openAdmin()`, `loadBackups()`, `adminInnerHTML()`, `paintAdmin()`, `downloadBackupFile()`, `doAdminReset(id)`, `doAdminRestore(id)`.
- Regras: nenhuma ação destrutiva acontece sem o segundo clique na confirmação em linha (nada de `confirm()` do navegador). O toast de senha zerada **não** mostra a senha inicial. O arquivo baixado chama-se `agenda-obras-backup-AAAA-MM-DD.json` (data local) e contém `entries` e `weeks`, nunca usuários. Depois de restaurar, a página recarrega o estado e a lista de backups (o servidor cria um `backup-prerestore-*`).

- [ ] **Step 1: Escrever os testes que falham**

Run (prefixo):
```bash
cat >> tests/frontend-v2.spec.js <<'EOF'

// ---- Tarefa 25: administração -------------------------------------------------------------------

const BACKUPS = [
  {
    id: "backup-2026-10-26", kind: "daily", label: "Diário de 26/10/2026",
    entries: [{ id: "old1", date: DAY, person: "gustavo", obra: "tulipas", createdAt: "x" }], weeks: {}
  },
  { id: "backup-prerestore-2026-10-20T15-00-00-000Z", kind: "prerestore", label: "Antes de restaurar (20/10/2026 12:00)", entries: [], weeks: {} }
];

test("only the administrator sees the Administração item", async ({ page }) => {
  await openApp(page, { me: "jean" });
  await page.locator("#userBtn").click();
  await expect(page.locator("#userMenu")).toBeVisible();
  await expect(page.locator('#userMenu [data-action="open-admin"]')).toHaveCount(0);

  const admin = await page.context().newPage();
  await openApp(admin, { me: "pedro" });
  await admin.locator("#userBtn").click();
  await expect(admin.locator('#userMenu [data-action="open-admin"]')).toBeVisible();
});

test("the panel lists the people (no reset for yourself) and the backups", async ({ page }) => {
  await openApp(page, { me: "pedro", backups: BACKUPS });
  await page.locator("#userBtn").click();
  await page.locator('[data-action="open-admin"]').click();
  await expect(page.locator("#adminPanel")).toBeVisible();
  await expect(page.locator(".admin-user")).toHaveCount(5);
  await expect(page.locator('.admin-user[data-user="pedro"] [data-action="admin-reset"]')).toHaveCount(0);
  await expect(page.locator('.admin-user[data-user="jean"] [data-action="admin-reset"]')).toHaveCount(1);
  await expect(page.locator(".admin-backup")).toHaveCount(2);
  await expect(page.locator('.admin-backup[data-id="backup-2026-10-26"]')).toContainText("Diário de 26/10/2026");
});

test("resetting a password needs a second click and never shows the initial password", async ({ page }) => {
  const state = await openApp(page, { me: "pedro" });
  await page.locator("#userBtn").click();
  await page.locator('[data-action="open-admin"]').click();
  await page.locator('.admin-user[data-user="jean"] [data-action="admin-reset"]').click();
  await expect(page.locator('.admin-user[data-user="jean"]')).toContainText("Zerar a senha de Jean?");
  expect(state.resetUsers).toEqual([]);

  await page.locator('[data-action="admin-cancel"]').click();
  await expect(page.locator('.admin-user[data-user="jean"] [data-action="admin-reset"]')).toHaveCount(1);
  expect(state.resetUsers).toEqual([]);

  await page.locator('.admin-user[data-user="jean"] [data-action="admin-reset"]').click();
  await page.locator('[data-action="admin-reset-yes"]').click();
  await expect(page.locator("#toast")).toContainText("Senha de Jean zerada");
  await expect(page.locator("#toast")).not.toContainText("Mudar");
  expect(state.resetUsers).toEqual(["jean"]);
  await expect(page.locator('.admin-user[data-user="jean"] [data-action="admin-reset"]')).toHaveCount(1);
});

test("downloading the backup saves a dated JSON with entries and weeks, without users", async ({ page }) => {
  await openApp(page, { me: "pedro", entries: MIX, confirmations: { "2026-10-25": { jean: "2026-10-27T15:00:00.000Z" } } });
  await page.locator("#userBtn").click();
  await page.locator('[data-action="open-admin"]').click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator('[data-action="admin-download"]').click()
  ]);
  expect(download.suggestedFilename()).toBe("agenda-obras-backup-2026-10-27.json");
  const body = JSON.parse(require("fs").readFileSync(await download.path(), "utf8"));
  expect(body.entries).toHaveLength(2);
  expect(body.weeks["2026-10-25"].jean).toBeTruthy();
  expect(body.users).toBeUndefined();
});

test("restoring a backup asks first, then reloads the calendar", async ({ page }) => {
  const state = await openApp(page, { me: "pedro", entries: MIX, backups: BACKUPS });
  await page.locator("#userBtn").click();
  await page.locator('[data-action="open-admin"]').click();
  await page.locator('.admin-backup[data-id="backup-2026-10-26"] [data-action="admin-restore"]').click();
  await expect(page.locator('.admin-backup[data-id="backup-2026-10-26"]')).toContainText("substituídos");
  expect(state.restored).toBe(null);

  await page.locator('[data-action="admin-restore-yes"]').click();
  await expect(page.locator("#toast")).toHaveText("Backup restaurado.");
  expect(state.restored).toBe("backup-2026-10-26");

  await page.locator('#authModal [data-action="close-auth"]').click();
  await expect(page.locator("#authOverlay")).not.toHaveClass(/show/);
  const chips = page.locator('.day-card[data-date="' + DAY + '"] .entry-chip');
  await expect(chips).toHaveCount(1);
  await expect(chips.first()).toContainText("Gustavo");
});

test("a failed restore shows the server message and keeps the data", async ({ page }) => {
  const state = await openApp(page, { me: "pedro", entries: MIX, backups: BACKUPS });
  await page.locator("#userBtn").click();
  await page.locator('[data-action="open-admin"]').click();
  await page.locator('.admin-backup[data-id="backup-2026-10-26"] [data-action="admin-restore"]').click();
  state.backups = [];
  await page.locator('[data-action="admin-restore-yes"]').click();
  await expect(page.locator("#toast")).toHaveText("backup não encontrado");
  await expect(page.locator('.day-card[data-date="' + DAY + '"] .entry-chip')).toHaveCount(2);
});
EOF
echo ok
```
Rodar o Playwright com `tests/frontend-v2.spec.js`. Expected: os 6 testes novos falham (`open-admin` não existe).

- [ ] **Step 2: CSS e estado**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch
P = "public/index.html"
patch(P, [
  ("  .wa-banner.warn { background: rgba(230, 160, 30, 0.2); color: var(--ink); }",
   '''  .wa-banner.warn { background: rgba(230, 160, 30, 0.2); color: var(--ink); }
  .admin-row {
    display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
    padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13.5px;
  }
  .admin-confirm { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 12.5px; }
  .admin-note { font-size: 12px; color: var(--ink-faint); }
  .btn-mini.danger { background: #c0392b; border-color: transparent; color: #fff; }
  #authModal .admin-actions { margin: 8px 0 4px; }'''),
  # o administrador ganha o item no menu
  ('''      '<div class="user-menu" id="userMenu"' + (userMenuOpen ? "" : " hidden") + ">" +
      '<button data-action="open-change">Trocar senha</button>' +''',
   '''      '<div class="user-menu" id="userMenu"' + (userMenuOpen ? "" : " hidden") + ">" +
      (me.role === "admin" ? '<button data-action="open-admin">Administração</button>' : "") +
      '<button data-action="open-change">Trocar senha</button>' +'''),
  # sair da sessão fecha também o painel
  ('''    else if (!me && authMode === "change") authMode = null;''',
   '''    else if (!me && (authMode === "change" || authMode === "admin")) authMode = null;'''),
  # o modal de autenticação conhece o painel
  ('''    var wanted = authMode === "login" ? "loginForm" : "changeForm";
    if (!modal.querySelector("#" + wanted)) {
      modal.innerHTML = authMode === "login" ? loginHTML() : changeHTML();''',
   '''    var wanted = authMode === "login" ? "loginForm" : authMode === "admin" ? "adminPanel" : "changeForm";
    if (!modal.querySelector("#" + wanted)) {
      modal.innerHTML = authMode === "login" ? loginHTML() : authMode === "admin" ? adminHTML() : changeHTML();'''),
])
PY
echo ok
```

- [ ] **Step 3: Painel e ações**

Run (prefixo):
```bash
python3 - <<'PY'
import sys; sys.path.insert(0, ".git")
from patchlib import patch
P = "public/index.html"

patch(P, [
  ("  /* ---------------- toast ---------------- */",
'''  /* ---------------- administration ---------------- */
  var adminBackups = null;        // null = carregando
  var adminBackupsError = "";
  var adminConfirm = null;        // { kind: "reset" | "restore", id }

  function adminInnerHTML() {
    var people = TEAM.map(function (p) {
      var right;
      if (p.id === me.id) {
        right = '<span class="admin-note">você</span>';
      } else if (adminConfirm && adminConfirm.kind === "reset" && adminConfirm.id === p.id) {
        right = '<span class="admin-confirm">Zerar a senha de ' + h(p.name) + "? " +
          '<button type="button" class="btn-mini danger" data-action="admin-reset-yes" data-user="' + p.id + '">Sim, zerar</button>' +
          '<button type="button" class="btn-mini" data-action="admin-cancel">Cancelar</button></span>';
      } else {
        right = '<button type="button" class="btn-mini" data-action="admin-reset" data-user="' + p.id + '">Zerar senha</button>';
      }
      return '<div class="admin-row admin-user" data-user="' + p.id + '"><span>' + h(p.name) + "</span>" + right + "</div>";
    }).join("");

    var backups;
    if (adminBackups === null) {
      backups = '<p class="modal-sub">Carregando…</p>';
    } else if (adminBackupsError) {
      backups = '<p class="form-error">' + h(adminBackupsError) + "</p>";
    } else if (!adminBackups.length) {
      backups = '<p class="modal-sub">Ainda não há backups automáticos. O primeiro é criado na primeira alteração do dia.</p>';
    } else {
      backups = adminBackups.map(function (b) {
        var right;
        if (adminConfirm && adminConfirm.kind === "restore" && adminConfirm.id === b.id) {
          right = '<span class="admin-confirm">Os dados atuais serão substituídos (guardamos uma cópia antes). ' +
            '<button type="button" class="btn-mini danger" data-action="admin-restore-yes" data-id="' + h(b.id) + '">Sim, restaurar</button>' +
            '<button type="button" class="btn-mini" data-action="admin-cancel">Cancelar</button></span>';
        } else {
          right = '<button type="button" class="btn-mini" data-action="admin-restore" data-id="' + h(b.id) + '">Restaurar</button>';
        }
        return '<div class="admin-row admin-backup" data-id="' + h(b.id) + '"><span>' + h(b.label) + "</span>" + right + "</div>";
      }).join("");
    }

    return '<div class="modal-section-title">Pessoas</div>' + people +
      '<div class="modal-section-title">Backup</div>' +
      '<div class="admin-actions"><button type="button" class="btn-mini primary" data-action="admin-download">Baixar backup (JSON)</button></div>' +
      backups;
  }

  function adminHTML() {
    return '<div class="modal-head"><div><h2>Administração</h2></div><button class="close-x" data-action="close-auth" aria-label="Fechar">&times;</button></div>' +
      '<div id="adminPanel">' + adminInnerHTML() + "</div>";
  }
  function paintAdmin() {
    var box = document.getElementById("adminPanel");
    if (box && me && me.role === "admin") box.innerHTML = adminInnerHTML();
  }

  function loadBackups() {
    return apiRequest("POST", "/api/admin", { op: "listBackups" }).then(function (data) {
      adminBackups = data.backups || [];
      adminBackupsError = "";
    }).catch(function (err) {
      adminBackups = [];
      adminBackupsError = describeError(err, "Não foi possível listar os backups.");
    }).then(paintAdmin);
  }

  function openAdmin() {
    if (!me || me.role !== "admin") return;
    userMenuOpen = false;
    adminConfirm = null;
    adminBackups = null;
    adminBackupsError = "";
    authMode = "admin";
    renderAuth();
    renderAuthModal();
    loadBackups();
  }

  function downloadBackupFile() {
    apiRequest("POST", "/api/admin", { op: "downloadBackup" }).then(function (data) {
      var blob = new Blob([JSON.stringify(data.export, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "agenda-obras-backup-" + dateKey(new Date()) + ".json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      showToast("Backup baixado.");
    }).catch(function (err) {
      showToast(describeError(err, "Não foi possível baixar o backup agora."));
    });
  }

  function doAdminReset(id) {
    apiRequest("POST", "/api/admin", { op: "resetPassword", user: id }).then(function () {
      adminConfirm = null;
      paintAdmin();
      showToast("Senha de " + personById[id].name + " zerada. No próximo acesso, a pessoa define uma nova.");
    }).catch(function (err) {
      adminConfirm = null;
      paintAdmin();
      showToast(describeError(err, "Não foi possível zerar a senha agora."));
    });
  }

  function doAdminRestore(id) {
    apiRequest("POST", "/api/admin", { op: "restoreBackup", id: id }).then(function () {
      adminConfirm = null;
      return loadState().then(function (state) {
        applyState(state);
        render();
        showToast("Backup restaurado.");
        return loadBackups();
      });
    }).catch(function (err) {
      adminConfirm = null;
      paintAdmin();
      showToast(describeError(err, "Não foi possível restaurar agora."));
    });
  }

  /* ---------------- toast ---------------- */'''),

  # ações
  ('''    } else if (action === "toggle-week") {''',
   '''    } else if (action === "open-admin") {
      openAdmin();
    } else if (action === "admin-reset") {
      adminConfirm = { kind: "reset", id: el.getAttribute("data-user") };
      paintAdmin();
    } else if (action === "admin-restore") {
      adminConfirm = { kind: "restore", id: el.getAttribute("data-id") };
      paintAdmin();
    } else if (action === "admin-cancel") {
      adminConfirm = null;
      paintAdmin();
    } else if (action === "admin-reset-yes") {
      if (me && me.role === "admin") doAdminReset(el.getAttribute("data-user"));
    } else if (action === "admin-restore-yes") {
      if (me && me.role === "admin") doAdminRestore(el.getAttribute("data-id"));
    } else if (action === "admin-download") {
      if (me && me.role === "admin") downloadBackupFile();
    } else if (action === "toggle-week") {'''),
])
PY
grep -c "open-admin" public/index.html
```
Expected: `≥ 2`.

- [ ] **Step 4: Rodar e ver passar; commit**

Rodar o Playwright com `tests/frontend-v2.spec.js` e `tests/frontend-static.spec.js`. Expected: todos passam. Se o teste do download travar, confirme que o link `<a download>` é anexado ao `document.body` antes do `click()`.

Run (prefixo): `ga public/index.html tests/frontend-v2.spec.js && gc "feat(L3): admin panel with confirmed password reset, JSON backup download and restore"`

---

## Fase 5 — Lançamento

### Task 26: README, roteiro de lançamento e rollback, teste ao vivo com login, verificação final

**Files:**
- Modify (reescrever): `README.md`
- Create: `docs/RELEASE-v2.md`, `.env.example` já existe (Tarefa 0; só conferir)
- Modify (reescrever): `tests/frontend-live.spec.js`

**Interfaces:**
- Consumes: tudo das tarefas anteriores.
- Produces: documentação para o Pedro executar o lançamento sozinho; teste ao vivo opcional que entra com `AGENDA_USER`/`AGENDA_PASSWORD`.

- [ ] **Step 1: Reescrever o README**

Run (prefixo):
```bash
cat > README.md <<'EOF'
# Agenda de Obras

Calendário compartilhado da Blendi Engenharia para marcar quem está em qual obra, em qual dia. Site estático + functions serverless, hospedado no Netlify, com [Netlify Blobs](https://docs.netlify.com/blobs/overview/) como banco de dados — sem planilha, sem serviço externo.

## Como funciona

- **Ver é livre, alterar exige entrar.** Qualquer pessoa com o link vê a agenda. Para marcar, a pessoa entra com o próprio nome e senha e só altera as próprias marcações. O administrador (Pedro) altera qualquer pessoa, zera senhas e cuida dos backups.
- **Frontend** (`public/index.html`): calendário em semana (domingo a sábado) ou mês, com feriados nacionais/Curitiba, logos das obras e tema claro/escuro.
  - **Marcar presença:** escolhe obra(s) e um ou vários dias da semana de uma vez; comentário opcional e, se houver, **reunião com início e fim** (aparece no calendário, na imagem e na mensagem).
  - **Por pessoa / Por obra** (visão Semana).
  - **Semana programada:** cada pessoa fecha a própria semana; a marcação volta a "aberta" sozinha se ela mudar algo naquela semana. O modal da mensagem mostra quem ainda falta.
  - **Gerar mensagem** (visão Semana): texto para WhatsApp (pessoas separadas por uma linha em branco) e imagem da semana.
  - **Atenção por obra:** tabela obra × pessoa com `realizado / planejado`, última e próxima visita, destacando obras sem visita há mais de 14 dias ou sem plano.
  - **Administração** (só Pedro): zerar senha de alguém, baixar backup em JSON e restaurar um backup.
- **Backend** (`netlify/functions/`):
  - `entries.js` — `GET /api/entries` devolve `{entries, confirmations}`; `POST` aceita `add`, `addMany` (até 60, tudo ou nada), `update` (comentário/reunião), `remove`, `confirmWeek`, `unconfirmWeek`. Exige login e respeita o dono de cada marcação.
  - `auth.js` — `GET` devolve o usuário da sessão; `POST` com `login`, `logout`, `changePassword`.
  - `admin.js` — só administrador: `resetPassword`, `listBackups`, `downloadBackup`, `restoreBackup`.
  - `lib/` — regras puras e testadas (validação, semana programada, senhas, sessão, permissões, backup).

Pessoas e obras são listas fixas, validadas no backend.

## Segurança em poucas linhas

- Senhas guardadas com scrypt; sessão em cookie `agenda_session` (`HttpOnly`, `Secure`, `SameSite=Strict`) assinado com `SESSION_SECRET`, válido por 30 dias.
- 5 erros de senha seguidos bloqueiam a pessoa por 15 minutos.
- A senha inicial vem da variável `INITIAL_PASSWORD` (nunca fica no repositório); quem entra com ela é obrigado a trocar antes de marcar.
- Backup automático: o primeiro gravação de cada dia guarda `backup-AAAA-MM-DD` (mantém 30). Restaurar guarda antes uma cópia `backup-prerestore-*`.

## Rodando localmente

Requer [Node.js](https://nodejs.org/) (LTS).

```bash
npm install
npm test            # testes unitários (node --test)
```

Para abrir o site completo no seu computador, **sem tocar nos dados de produção**:

```bash
cp .env.example .env     # preencha SESSION_SECRET (32+ caracteres) e INITIAL_PASSWORD
npx netlify-cli dev --offline
```

Abra `http://localhost:8888`. O ambiente local usa uma loja própria (`agenda-obras-dev`), ignora `BLOBS_SITE_ID`/`BLOBS_TOKEN` e mostra a faixa "Ambiente de testes".

Os testes de navegador (Playwright) ficam em `tests/*.spec.js`; usam uma API simulada e não precisam de servidor. O `tests/frontend-live.spec.js` roda contra um servidor de verdade e só executa se `AGENDA_USER` e `AGENDA_PASSWORD` estiverem definidos (use um servidor local ou uma conta de teste, ele cria e remove uma marcação).

## Deploy

O site está ligado ao GitHub: **cada push na branch de produção gera um deploy de produção**. No plano Free do Netlify, cada deploy de produção custa **15 créditos** (300 por mês, ou seja, cerca de 20 deploys). Se os créditos acabam, o Netlify pausa os sites até o ciclo seguinte.

Por isso o trabalho em lote fica numa branch (`release/v2`) e vai para produção **uma única vez**. O passo a passo completo, com cópia de segurança antes e volta atrás (rollback), está em [`docs/RELEASE-v2.md`](docs/RELEASE-v2.md).

Variáveis de ambiente do site (Netlify → Site configuration → Environment variables, escopo **Functions**): `BLOBS_SITE_ID`, `BLOBS_TOKEN` (a conta não injeta o contexto do Blobs sozinha), `SESSION_SECRET`, `INITIAL_PASSWORD`.

Detalhes de arquitetura e decisões: [`docs/superpowers/specs/`](docs/superpowers/specs/).

## Estrutura

```
public/index.html                 frontend estático
public/lib/                       módulos puros do navegador (atenção, mensagem, reunião, agrupamento, imagem)
netlify/functions/entries.js      API das marcações e da semana programada
netlify/functions/auth.js         login, logout, troca de senha
netlify/functions/admin.js        administração (senha, backups)
netlify/functions/lib/            regras puras e testadas
tests/unit/                       testes unitários (node --test)
tests/*.spec.js                   testes de navegador (Playwright)
tests/helpers/stub-api.js         API simulada para os testes de navegador
docs/RELEASE-v2.md                roteiro de lançamento e rollback
netlify.toml                      config do Netlify (functions, redirects /api/*)
```
EOF
sed -i 's/o primeiro gravação/a primeira gravação/' README.md
git diff --stat README.md | tail -1
```
Expected: o diff mostra o README alterado.

- [ ] **Step 2: Criar `docs/RELEASE-v2.md`**

Run (prefixo):
```bash
cat > docs/RELEASE-v2.md <<'EOF'
# Lançamento da v2 e volta atrás

Tudo da v2 (aba Atenção, reunião, vários dias, semana programada, login, administração, backups) está na branch `release/v2`. A versão antiga está marcada com a tag `v1-antes-do-v2`. Produção só muda quando você juntar a branch na branch de produção e der o push — **um único deploy (15 créditos)**.

Comandos abaixo no PowerShell, dentro da pasta do repositório.

## 0. O que você precisa ter à mão

- O endereço do site (`https://SEU-SITE.netlify.app`).
- Acesso ao painel do Netlify (variáveis de ambiente e lista de deploys).
- A senha inicial que você quer dar a todo mundo (a mesma para as cinco pessoas; cada um troca no primeiro acesso).

## 1. Cópia de segurança dos dados de hoje (fora do Netlify)

```powershell
$dados = Invoke-RestMethod -Uri "https://SEU-SITE.netlify.app/api/entries"
$dados | ConvertTo-Json -Depth 10 | Out-File -Encoding utf8 "agenda-backup-antes-do-v2.json"
```

Guarde o arquivo fora da pasta do repositório (ele não deve ir para o GitHub). Abra-o e confira que tem as marcações.

## 2. Variáveis de ambiente no Netlify (não geram deploy)

Em *Site configuration → Environment variables*, com escopo **Functions**:

| Variável | Valor |
|---|---|
| `SESSION_SECRET` | texto aleatório com 48+ caracteres. Para gerar: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `INITIAL_PASSWORD` | a senha inicial combinada com a equipe |

`BLOBS_SITE_ID` e `BLOBS_TOKEN` continuam como estão. Trocar o `SESSION_SECRET` depois derruba todas as sessões (todos precisam entrar de novo); não afeta as senhas.

## 3. Testar no seu computador (sem tocar na produção)

```powershell
git switch release/v2
npm install
npm test
Copy-Item .env.example .env       # edite o .env: SESSION_SECRET e INITIAL_PASSWORD
npx netlify-cli dev --offline
```

Abra `http://localhost:8888`. Confira a faixa amarela "Ambiente de testes" e percorra:

1. Sem entrar, o calendário aparece e o modal do dia mostra "Entrar para marcar".
2. Entre como `Pedro` com a senha inicial: o site exige trocar a senha. Troque.
3. Marque dois dias e duas obras de uma vez; marque uma reunião com início e fim.
4. Feche a sua semana (faixa "Semana programada"); mude uma marcação e veja a semana reabrir com o aviso.
5. Abra *Gerar mensagem*: o banner mostra quem falta; o texto tem as pessoas separadas por linha em branco.
6. Aba *Atenção*: números por obra e pessoa.
7. Menu do seu nome → *Administração*: zere a senha de outra pessoa, baixe o backup, veja a lista de backups.
8. Saia, entre como outra pessoa (senha inicial → troca) e confirme que ela só consegue mexer no próprio nome.

Os dados desse teste ficam na loja `agenda-obras-dev` e não aparecem na produção.

## 4. Enviar a branch (não publica nada)

Antes, confira em *Site configuration → Build & deploy → Branches and deploy contexts* que **Branch deploys** está em *None* (senão a branch pode gerar deploy e gastar créditos).

```powershell
git push origin release/v2
git push origin v1-antes-do-v2
```

## 5. Publicar em produção (15 créditos, uma vez só)

Descubra o nome da branch de produção (o README antigo dizia `main`; a cópia local usa `master`):

```powershell
git remote show origin | Select-String "HEAD branch"
```

Troque `PRODUCAO` pelo nome que apareceu:

```powershell
git switch PRODUCAO
git pull
git merge --no-ff release/v2
git push origin PRODUCAO
```

O Netlify faz o deploy sozinho. Espere ficar *Published*.

## 6. Conferir depois do deploy

1. O site abre e mostra as marcações de antes.
2. Entre como Pedro (senha inicial → trocar senha).
3. Avise a equipe: cada um entra com o próprio nome e a senha inicial e escolhe uma nova.
4. Faça uma marcação de teste e remova.
5. Em *Administração*, depois da primeira alteração do dia, a lista mostra o backup diário.

## 7. Se algo der errado: voltar para a versão anterior

**Código (rápido, sem gastar crédito de build):** Netlify → *Deploys* → abra o último deploy bom de antes da v2 → **Publish deploy**. O site volta ao que era na hora.

Os dados continuam compatíveis: a v1 ignora as chaves novas (`weeks`, `users`, `backup-*`) e as marcações novas (com comentário/reunião) continuam aparecendo.

**Dados:** se alguma marcação for apagada por engano, entre como Pedro na v2 → *Administração* → *Restaurar* o backup do dia anterior (a restauração guarda antes uma cópia do estado atual). O arquivo do passo 1 é a cópia de segurança de fora do Netlify.

**Depois do rollback**, para tentar de novo: corrija na branch `release/v2` e repita os passos 3 a 5. O Git mantém a tag `v1-antes-do-v2` no ponto exato da versão antiga.

## 8. Perguntas comuns

- **Esqueci minha senha:** peça ao Pedro para zerar em *Administração*; você volta à senha inicial e escolhe outra.
- **O Pedro esqueceu a própria senha:** o administrador não consegue zerar a si mesmo. Apague a chave `users` da loja `agenda-obras` (Netlify CLI: `npx netlify-cli blobs:delete agenda-obras users --site SEU_SITE_ID`, ou peça ajuda). Na próxima requisição todos voltam à senha inicial e precisam trocar.
- **Pessoa bloqueada ("muitas tentativas"):** espere 15 minutos ou peça para zerar a senha.
EOF
echo ok
```

- [ ] **Step 3: Teste ao vivo com login**

Run (prefixo):
```bash
cat > tests/frontend-live.spec.js <<'EOF'
const { test, expect } = require("@playwright/test");

// Roda contra um servidor de verdade (por padrão `netlify dev` em localhost:8888).
// Defina AGENDA_USER (ex.: "gustavo") e AGENDA_PASSWORD (a senha atual dessa conta; ela não pode estar
// com troca de senha pendente). Use um servidor local ou uma conta de teste: o teste cria e remove
// uma marcação de Porto no dia de hoje para esse usuário.
const BASE = process.env.AGENDA_BASE_URL || "http://localhost:8888";
const USER = (process.env.AGENDA_USER || "").toLowerCase();
const PASSWORD = process.env.AGENDA_PASSWORD || "";

test.skip(!USER || !PASSWORD, "defina AGENDA_USER e AGENDA_PASSWORD para rodar contra o servidor real");

function todayKey() {
  const d = new Date();
  const pad = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

async function login(page) {
  await page.goto(BASE);
  await page.locator('[data-action="open-login"]').first().click();
  await page.locator('#loginForm select[name="user"]').selectOption(USER);
  await page.locator('#loginForm input[name="password"]').fill(PASSWORD);
  await page.locator("#authSubmit").click();
  await expect(page.locator("#userBtn")).toBeVisible();
  await expect(page.locator("#changeForm")).toHaveCount(0);
}

test("login, add through the form, see it after reload, remove", async ({ page }) => {
  const day = todayKey();
  await login(page);

  await page.locator('[data-action="open-day"][data-date="' + day + '"]').first().click();
  await page.locator('input[name="modal-obra"][value="porto"]').check();
  await page.locator("#addBtn").click();
  await expect(page.locator("#toast")).toContainText("marcação adicionada");

  await page.reload();
  await expect(page.locator("#userBtn")).toBeVisible();
  const list = await page.request.get(BASE + "/api/entries");
  const mine = (await list.json()).entries.filter(function (en) {
    return en.date === day && en.person === USER && en.obra === "porto";
  })[0];
  expect(mine).toBeTruthy();

  await page.locator('[data-action="open-day"][data-date="' + day + '"]').first().click();
  await page.locator('#modal .rm[data-id="' + mine.id + '"]').click();
  await expect(page.locator("#toast")).toContainText("removida");

  const after = await (await page.request.get(BASE + "/api/entries")).json();
  expect(after.entries.some(function (en) { return en.id === mine.id; })).toBe(false);
});

test("anonymous writes are rejected by the real API", async ({ request }) => {
  const res = await request.post(BASE + "/api/entries", {
    data: { op: "add", date: todayKey(), person: USER, obra: "porto" }
  });
  expect(res.status()).toBe(401);
});
EOF
echo ok
```

- [ ] **Step 4: Verificação final (toda a suíte)**

Run (prefixo): `npm test 2>&1 | tail -15`
Expected: `fail 0`; os testes unitários de todas as tarefas passam.

Rodar o Playwright (receita) com `tests/frontend-static.spec.js` e `tests/frontend-v2.spec.js`; o `frontend-live.spec.js` fica de fora (precisa de servidor). Expected: todos passam, sem `skipped` nos dois primeiros.

Checagens de higiene (prefixo):
```bash
git grep -n "Mudar@123" -- . ':!tests' ':!docs/superpowers' && echo "SENHA NO CODIGO!" || echo "ok: senha inicial só em testes"
git grep -n "modal-person\|text-transform: capitalize" -- public && echo "RESTO DO CODIGO ANTIGO" || echo "ok: sem restos do formulário antigo"
git status --short | head
git log --oneline v1-antes-do-v2..HEAD | wc -l
```
Expected: `ok` nas duas primeiras linhas, `git status` vazio (ou só os arquivos de ruído de CRLF que o `.gitattributes` já normaliza), e o número de commits da branch (tarefas + specs + plano).

- [ ] **Step 5: Commit**

Run (prefixo): `ga README.md docs/RELEASE-v2.md tests/frontend-live.spec.js && gc "docs(L1-L3): README, release and rollback guide, live spec with login"`

Entregar ao Pedro: `docs/RELEASE-v2.md` e o resumo "o que mudou". **Não** dar push de nada: o Pedro envia a branch e faz o merge na produção quando decidir.
