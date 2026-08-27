# Agenda de Obras

Calendário compartilhado da Blendi Engenharia para marcar quem está em qual obra, em qual dia. Site estático + function serverless, hospedado no Netlify, com [Netlify Blobs](https://docs.netlify.com/blobs/overview/) como banco de dados — sem planilha, sem serviço externo.

## Como funciona

- **Frontend** (`public/index.html`): calendário em semana/mês, com feriados nacionais/Curitiba e logos das obras. Marca presença por pessoa + obra(s) + dia.
- **Backend** (`netlify/functions/entries.js`): function HTTP que lê/grava um único documento JSON no Netlify Blobs.
  - `GET /api/entries` — lista as marcações atuais
  - `POST /api/entries` com `{"op":"add", "date", "person", "obra"}` — adiciona uma marcação (valida contra as listas fixas de pessoas/obras; não duplica mesma pessoa+obra+dia)
  - `POST /api/entries` com `{"op":"remove", "id"}` — remove uma marcação

Pessoas e obras são listas fixas, validadas no backend. Sem autenticação — qualquer pessoa com o link lê e escreve (uso interno).

## Rodando localmente

Requer [Node.js](https://nodejs.org/) (LTS).

```bash
npm install
npm test
```

`npm test` roda os testes unitários (`node --test`) sobre a lógica de validação/adição/remoção e os handlers da function.

Para testar com o Blobs real localmente, use a [Netlify CLI](https://docs.netlify.com/cli/get-started/):

```bash
npx netlify-cli dev
```

## Deploy

Deploy contínuo via GitHub — qualquer push na branch `main` publica automaticamente em produção.

Detalhes de arquitetura, decisões e riscos aceitos: [`docs/superpowers/specs/2026-08-27-agenda-obras-netlify-design.md`](docs/superpowers/specs/2026-08-27-agenda-obras-netlify-design.md).

## Estrutura

```
public/index.html              frontend estático
netlify/functions/entries.js   function serverless (API)
netlify/functions/lib/         lógica de validação/dados, testável isoladamente
tests/unit/                    testes unitários (node --test)
tests/*.spec.js                testes end-to-end (Playwright)
netlify.toml                   config do Netlify (functions, redirects /api/*)
```
