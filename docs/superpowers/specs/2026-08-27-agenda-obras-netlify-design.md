# Agenda de Obras — site Netlify com banco de dados próprio

## Contexto

O calendário compartilhado da Blendi (quem está em qual obra, em qual dia) passou por duas
arquiteturas antes desta: (1) Claude Artifact com edição direta na página — bloqueado porque
conceder permissão de edição a colegas exige plano Team/Enterprise; (2) Claude Artifact somente
leitura + planilha Excel no SharePoint como fonte de dados, sincronizada por mim sob pedido ou
por tarefa agendada. A (2) tornou o sistema frágil (peça extra no SharePoint, tarefa agendada cujo
sucesso eu não conseguia confirmar, e uma trava de rede que impedia eu reler a própria página
publicada). O Pedro pediu para simplificar radicalmente: um site autônomo, hospedado por ele no
Netlify, com banco de dados embutido — sem planilha, sem tarefa agendada, sem depender de mim no
dia a dia.

## Objetivo

Um site estático no Netlify (URL pública fixa) onde qualquer pessoa do time marca presença
diretamente na página (pessoa + obra(s) + dia) e vê as marcações de todos os outros, sem
planilha e sem pedir atualização a ninguém. Deploy inicial e futuras alterações de design feitos
por mim via token de acesso do Netlify que o Pedro vai gerar e me passar.

## Não-objetivos

- Não haverá login/autenticação — mesmo modelo de confiança de hoje (link interno, qualquer um
  com o link pode ler e escrever).
- Não haverá atualização "instantânea" via push (WebSocket/real-time). A propagação entre abas
  abertas é por sondagem (polling) a cada ~20-30s — decisão explícita do Pedro para evitar
  depender de um segundo serviço externo (ex.: Supabase).
- Não há migração automática contínua da planilha Excel — só uma importação única dos dados que
  já estão lá hoje, na hora do lançamento (ver "Migração" abaixo).
- Sem controle de concorrência forte (transações). Ver "Riscos aceitos".

## Arquitetura

Um único site Netlify com duas peças:

1. **Frontend estático** (`public/index.html`): o mesmo calendário visual já construído
   (semana/mês, filtros, feriados nacionais/Curitiba, logos das 6 obras), com a interface de
   adicionar/remover presença restaurada (ela existia antes de eu tirar para o modelo
   Excel-only, e volta agora porque o backend real substitui a planilha).
2. **Backend serverless** (`netlify/functions/entries.js`): uma function HTTP com três operações
   sobre um único documento JSON guardado no Netlify Blobs (banco chave-valor embutido no
   Netlify, sem serviço externo):
   - `GET /api/entries` → devolve o array atual de marcações
   - `POST /api/entries` → recebe `{date, person, obra}`, valida contra as listas fixas de
     pessoas/obras, anexa ao array (com dedupe: mesma pessoa+obra+dia não duplica), grava e
     devolve o array atualizado
   - `POST /api/entries/remove` (com `{id}`) → remove a marcação pelo id, grava e devolve o
     array atualizado

`netlify.toml` configura o diretório de functions e os redirects `/api/*` →
`/.netlify/functions/:splat`.

## Modelo de dados

Um blob único, chave `entries`, valor = array JSON:

```json
[{ "id": "string", "date": "AAAA-MM-DD", "person": "pedro|jean|haniel|gustavo|bruna",
   "obra": "almada|montebello|miraggio|palmeiras|tulipas|porto", "createdAt": "ISO-8601" }]
```

Sem tabelas, sem schema separado — as listas de pessoas e obras continuam fixas no código do
frontend e da function (mesmas 5 pessoas / 6 obras de hoje), validadas na function para rejeitar
lixo.

## Frontend — mudanças de comportamento

- Ao carregar, `fetch("/api/entries")` popula `entries` (em vez de ler de um
  `<script id="cal-data">` estático).
- O formulário "Adicionar presença" (pessoa + obra(s) por checkbox) volta ao modal do dia,
  agora fazendo `POST /api/entries` por obra marcada; ao sucesso, atualiza `entries` com a
  resposta e re-renderiza.
- O botão × de cada marcação volta a aparecer, chamando `POST /api/entries/remove`.
- Sondagem: a cada 25s, `fetch("/api/entries")` e re-renderiza se o conteúdo mudou (substitui o
  polling anterior que comparava a própria página publicada).
- Link "Abrir planilha" e nota de "última sincronização" são removidos — não fazem mais sentido
  neste modelo.
- Falha de rede/API: toast de erro, sem fechar o modal nem perder a seleção do usuário, para que
  ele possa tentar de novo.

## Riscos aceitos

- **Concorrência:** a function faz leitura-modificação-escrita do blob sem transação atômica. Se
  duas pessoas clicarem "adicionar" no mesmo segundo, a segunda escrita pode sobrescrever a
  primeira. Para 5 pessoas usando esporadicamente, o risco é baixo; não será mitigado nesta
  versão (documentado, não escondido).
- **Sem autenticação:** qualquer pessoa com a URL pode ler e escrever. Aceitável para uso interno
  de baixa sensibilidade (mesma exposição que o modelo anterior).

## Migração

Na primeira publicação, faço uma importação única das 6 marcações que já estão hoje na planilha
`agenda_de_obras.xlsx` (lidas via conector Microsoft 365) para o blob inicial, para não perder o
que já foi lançado. Depois disso a planilha deixa de ser tocada/lida — o Pedro pode arquivá-la ou
mantê-la como registro histórico, à vontade dele.

## Deploy e credenciais

O Pedro cria a conta Netlify e gera um Personal Access Token, que me passa. Eu uso esse token
(via Netlify CLI, a partir deste ambiente) para criar o site, configurar Blobs, e publicar tudo
— sem exigir que ele instale nada. O token só é necessário para deploys; não fica embutido no
site publicado nem exposto ao público.

## Teste antes de publicar

- Testes automatizados locais (Playwright, headless) do fluxo completo: abrir, ver marcações
  existentes, adicionar uma nova (pessoa+obra+dia), confirmar que aparece, remover, confirmar que
  some, alternar semana/mês, filtros.
- Teste manual pós-deploy: abrir a URL pública real, repetir o fluxo acima contra a function e o
  Blob de produção (não só localhost), antes de considerar concluído.

## Fora de escopo para depois (se o Pedro quiser no futuro)

- Autenticação simples (uma senha compartilhada) se a exposição pública incomodar.
- Atualização real-time via WebSocket/Supabase, se o polling de 25s parecer lento na prática.
