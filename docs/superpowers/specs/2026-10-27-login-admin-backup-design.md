# Agenda de Obras — login por pessoa, administrador, backup e lançamento único (Lote 3)

## Contexto

Terceiro de três lotes definidos em 2026-10-27, que **saem juntos num único lançamento**:

- Lote 1 — `2026-10-27-atencao-por-obra-design.md` (aba Atenção, 3 correções, ajustes de interface)
- Lote 2 — `2026-10-27-reuniao-semana-programada-design.md` (reunião com horário, vários dias,
  semana programada)
- Lote 3 — este documento.

Hoje a API é aberta: qualquer pessoa com o link lê, grava e apaga. O time quer que cada pessoa só
altere o próprio nome, com um administrador (Pedro) que possa editar tudo, mais backup para poder
voltar atrás se algo der errado.

## Objetivo

1. Login por pessoa (usuário + senha); cada um só altera as próprias marcações.
2. Perfil **administrador** (Pedro) com acesso total.
3. Backup automático diário, exportação e restauração (administrador).
4. Lançamento único, com caminho claro de volta (rollback).

## Não-objetivos

- Recuperação de senha por e-mail, 2FA, login Microsoft/SSO.
- Cadastro de novas pessoas ou obras pela tela (continuam fixas no código).
- Mais de um administrador (o modelo permite; só o Pedro é admin no lançamento).

## Modelo de acesso

- **Ver:** sem login. `GET /api/entries` continua público.
- **Alterar** (`add`, `addMany`, `update`, `remove`, `confirmWeek`, `unconfirmWeek`): exige login.
  - Usuário comum: só atua sobre o próprio `person` (nas marcações e na semana programada).
    Tentar outro nome → 403. Sem sessão → 401.
  - Administrador: atua sobre qualquer pessoa.
- Usuário com troca de senha pendente (`mustChange`) não grava nada até trocar a senha.

## Usuários e senhas

- Usuários = as 5 pessoas já existentes: `pedro` (admin), `jean`, `haniel`, `gustavo`, `bruna`.
- **Senha inicial `Mudar@123`** para todos, vinda da variável de ambiente `INITIAL_PASSWORD` (fora
  do repositório). Na primeira chamada de autenticação, se o registro `users` não existir, o
  sistema cria os 5 usuários com essa senha e `mustChange = true`.
- Primeiro login: troca obrigatória de senha. Nova senha: mínimo 8 caracteres e diferente da inicial.
- **Esqueci a senha:** o administrador "zera" a senha da pessoa, que volta a `INITIAL_PASSWORD` com
  `mustChange = true` e invalida as sessões dela.
- Armazenamento: só hash (`scrypt` do `node:crypto`, sal aleatório de 16 bytes, comparação com
  `timingSafeEqual`). Nunca senha em texto.
- Bloqueio: 5 senhas erradas seguidas bloqueiam o usuário por 15 minutos. Mensagem de erro
  genérica ("usuário ou senha inválidos").
- Risco aceito e documentado: como todos começam com a mesma senha conhecida, até o primeiro login
  de cada um alguém poderia entrar no nome dele. Mitigação: todos entram e trocam a senha logo após
  o lançamento (Pedro primeiro); se alguém tomar uma conta, o administrador zera.

## Sessão

- Cookie `agenda_session`: `HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=30 dias`.
- Conteúdo assinado com HMAC-SHA256 usando `SESSION_SECRET` (mínimo 32 caracteres aleatórios,
  variável do Netlify disponível para Functions): usuário, expiração e versão da senha. Trocar ou
  zerar a senha invalida as sessões antigas.
- `POST` exigem `content-type: application/json` (defesa extra contra CSRF, além do `SameSite`).
- Se `SESSION_SECRET` ou `INITIAL_PASSWORD` faltarem, as rotas de autenticação respondem 500 com
  mensagem clara; a leitura pública continua funcionando.

## API

- `GET /api/auth` → usuário logado (`{ id, name, role, mustChange }`) ou `null`.
- `POST /api/auth` → `login { user, password }`, `logout`, `changePassword { current, next }`.
- `POST /api/admin` (só administrador, senão 403):
  - `resetPassword { user }`
  - `listBackups`
  - `downloadBackup` (JSON atual `{ entries, weeks, exportedAt }`, **sem** dados de usuários)
  - `restoreBackup { id }`
- `entries.js` passa a ler a sessão e aplicar o modelo de acesso acima.
- Banco (Netlify Blobs, loja `agenda-obras`): chaves `entries` (continua um array), `weeks`,
  `users`, `backup-AAAA-MM-DD`. O formato de `entries` não muda além dos campos aditivos do Lote 2.

## Backup dentro do app

- **Snapshot diário:** na primeira gravação de cada dia (data em America/Sao_Paulo) o app guarda
  `backup-AAAA-MM-DD` com `{ entries, weeks, createdAt }` e mantém os 30 mais recentes.
- **Restaurar:** antes de aplicar, grava um snapshot `backup-prerestore-<ISO>` do estado atual, então
  a restauração também pode ser desfeita. Restaura `entries` e `weeks`; nunca `users`.

## Telas

- Cabeçalho: botão **Entrar**; logado, mostra o nome com menu (Trocar senha, Sair e, para o
  administrador, Administração).
- Modal de login: nome (lista das 5 pessoas) + senha. Troca obrigatória de senha no primeiro acesso.
- **Modal do dia, usuário comum logado:** sem a lista de pessoas. Mostra só "Marcando como
  <nome>" e a lista de **obras**. Sem login: botão "Entrar para marcar".
- **Modal do dia, administrador:** seletor "Marcando como" com as 5 pessoas, padrão ele mesmo.
- O × e a edição de cada marcação só aparecem para quem pode usá-los (dono ou administrador).
- Faixa "Semana programada": todos veem; só o dono (ou o administrador) clica.
- **Administração (modal, só admin):** zerar senha de cada pessoa; baixar backup; lista de
  snapshots com "Restaurar" (com confirmação).
- Ambiente local: faixa "AMBIENTE LOCAL DE TESTE" quando a página roda em localhost.

## Ambiente local seguro

`netlify dev` pode herdar as variáveis do site (`BLOBS_SITE_ID`, `BLOBS_TOKEN`) e apontar para o
banco de produção. O resolvedor de loja passa a **ignorar** essas credenciais quando detectar
ambiente local (`NETLIFY_DEV`), usando uma loja de teste isolada (`agenda-obras-dev`). A detecção
será verificada no plano de implementação, com teste. Localmente, `SESSION_SECRET` e
`INITIAL_PASSWORD` vêm de um `.env` fora do git.

## Testes

Unitários (`node --test`), escritos antes da implementação:
- hash/verificação de senha; assinatura, adulteração e expiração da sessão; invalidação ao trocar
  senha; bloqueio após 5 erros;
- semente dos 5 usuários; troca obrigatória;
- matriz de autorização (anônimo × usuário × administrador) para cada operação de escrita, incluindo
  403 ao agir em nome de outra pessoa e bloqueio com `mustChange`;
- snapshot diário (uma vez por dia, poda em 30), exportação sem hashes, restauração com snapshot
  prévio.
Manual local (`netlify dev`, banco de teste): fluxo completo com os 5 perfis.

## Lançamento único

1. Tag `v1-antes-do-v2` no último commit de código atual (`713e0c0`).
2. Todo o trabalho na branch `release/v2`, em commits separados por lote. O Pedro faz `git push` da
   **branch** (backup no GitHub). Não enviar a `master`/`main` até a hora do lançamento, pois cada
   push na branch de produção gera deploy (15 créditos). Conferir no painel do Netlify qual é a
   branch de produção e se deploys de branch estão desligados.
3. No Netlify, criar `SESSION_SECRET` (aleatório, ≥32 caracteres) e `INITIAL_PASSWORD`
   (`Mudar@123`), com escopo de Functions. Exportar um JSON dos dados atuais (um comando no
   PowerShell, fornecido no plano) e guardá-lo na pasta do projeto.
4. Testar tudo localmente com `netlify dev` (banco isolado). Um rascunho de deploy compartilha o
   banco de produção; se usado, serve só para olhar, sem gravar nada.
5. Merge na branch de produção → **um** deploy. Em seguida: todos entram e trocam a senha.
6. **Rollback:** no painel do Netlify, "Publish deploy" no deploy anterior devolve código e functions
   antigos. Os dados continuam compatíveis (só campos e chaves novos, ignorados pela versão antiga).
   Para desfazer dados: restaurar o snapshot (administrador) ou o JSON exportado no passo 3.
