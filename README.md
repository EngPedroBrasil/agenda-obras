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
- Backup automático: a primeira gravação de cada dia guarda `backup-AAAA-MM-DD` (mantém 30). Restaurar guarda antes uma cópia `backup-prerestore-*`.

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
