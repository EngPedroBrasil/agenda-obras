# Agenda de Obras

Calendário compartilhado da Blendi Engenharia para marcar quem está em qual obra, em qual dia. Site estático + function serverless, hospedado no Netlify, com [Netlify Blobs](https://docs.netlify.com/blobs/overview/) como banco de dados — sem planilha, sem serviço externo.

## Como funciona

- **Frontend** (`public/index.html`): calendário em semana (domingo a sábado) ou mês, com feriados nacionais/Curitiba, logos das obras e tema claro/escuro. Marca presença por pessoa + obra(s) + dia, com um comentário opcional por obra.
  - **Por pessoa / Por obra** (visão Semana): "Por obra" mostra, em cada dia, um card por obra com os nomes de quem estará lá.
  - **Gerar mensagem** (visão Semana): texto para WhatsApp da semana exibida, agrupado por setor, e uma **imagem** da semana (copiar, baixar PNG ou compartilhar).
- **Backend** (`netlify/functions/entries.js`): function HTTP que lê/grava um único documento JSON no Netlify Blobs.
  - `GET /api/entries` — lista as marcações atuais
  - `POST /api/entries` com `{"op":"add", "date", "person", "obra", "comment"?}` — adiciona uma marcação (valida contra as listas fixas de pessoas/obras; não duplica mesma pessoa+obra+dia; comentário opcional de até 140 caracteres)
  - `POST /api/entries` com `{"op":"update", "id", "comment"}` — troca o comentário de uma marcação (vazio apaga; 404 se o id não existe)
  - `POST /api/entries` com `{"op":"remove", "id"}` — remove uma marcação

Pessoas e obras são listas fixas, validadas no backend. Sem autenticação — qualquer pessoa com o link lê e escreve (uso interno).

## Rodando localmente

Requer [Node.js](https://nodejs.org/) (LTS).

```bash
npm install
npm test
```

`npm test` roda os testes unitários (`node --test`): validação/adição/remoção/comentário, handlers da function, e os módulos puros de `public/lib` (agrupamento por obra e modelo da imagem da semana).

Para testar com o Blobs real localmente, use a [Netlify CLI](https://docs.netlify.com/cli/get-started/):

```bash
npx netlify-cli dev
```

## Deploy

O site está ligado ao GitHub: **cada push na `main` gera um deploy de produção**. No plano Free do Netlify, cada deploy de produção custa **15 créditos** (300 por mês, ou seja, cerca de 20 deploys), seja por git, CLI ou upload; deploys de rascunho (sem `--prod`) não custam. Se os créditos acabam, o Netlify pausa os sites até o ciclo seguinte.

Para controlar o gasto, agrupe as mudanças e publique uma vez por lote:

1. **Parar o deploy automático:** no painel do Netlify, *Site configuration → Build & deploy → Continuous deployment → Stop builds*.
2. **Rascunho (grátis)**, para testar numa URL de pré-visualização:
   ```bash
   npx netlify-cli deploy --dir=public --functions=netlify/functions --site <SITE_ID>
   ```
3. **Produção (15 créditos)**, só quando o rascunho estiver bom:
   ```bash
   npx netlify-cli deploy --prod --dir=public --functions=netlify/functions --site <SITE_ID>
   ```

Use um Personal Access Token do Netlify na variável de ambiente `NETLIFY_AUTH_TOKEN` (nunca no repositório). A function precisa das variáveis de ambiente do site `BLOBS_SITE_ID` e `BLOBS_TOKEN` (o Netlify não está injetando o contexto do Blobs automaticamente nesta conta).

Detalhes de arquitetura, decisões e riscos aceitos: [`docs/superpowers/specs/2026-08-27-agenda-obras-netlify-design.md`](docs/superpowers/specs/2026-08-27-agenda-obras-netlify-design.md).

## Estrutura

```
public/index.html              frontend estático
public/lib/grouping.js         agrupar entradas por obra (puro, testado)
public/lib/week-model.js       dados da imagem da semana (puro, testado)
public/lib/week-image.js       desenho da imagem em canvas (só navegador)
netlify/functions/entries.js   function serverless (API)
netlify/functions/lib/         lógica de validação/dados, testável isoladamente
tests/unit/                    testes unitários (node --test)
tests/*.spec.js                testes end-to-end (Playwright)
netlify.toml                   config do Netlify (functions, redirects /api/*)
```
