# Agenda de Obras — aba "Atenção por obra", 3 correções e ajustes de interface (Lote 1)

## Contexto

A Agenda de Obras está em produção (https://agenda-obras.netlify.app) com ~160 marcações das 5
pessoas nas 6 obras. A análise de 2026-10-27 não encontrou problema vivido pelo time até agora.
O Pedro quer entender **quantas vezes cada pessoa foi a cada obra**, para perceber se alguma obra
está recebendo menos atenção que as outras. Aproveitamos o mesmo lote para corrigir 3 bugs pequenos e fazer ajustes de interface pedidos em
2026-10-27. Este é o **Lote 1** de três: o Lote 2 (reunião com horário, vários dias, semana
programada) tem spec próprio em `2026-10-27-reuniao-semana-programada-design.md`; o Lote 3
(login por pessoa, administrador, backup e lançamento único) está em
`2026-10-27-login-admin-backup-design.md`.

## Objetivo

1. Nova visão "Atenção" no site, com contagem pessoa × obra (realizado vs planejado), última e
   próxima visita por obra, e destaque das obras que ficaram para trás.
2. Corrigir: (a) formulário do modal que reseta durante o polling, (b) comentário descartado ao
   remarcar a mesma pessoa+obra+dia, (c) datas inexistentes aceitas pela API.
3. Ajustes de interface: cabeçalho estável entre as visões, rótulos sem "De" capitalizado e
   mensagem de WhatsApp com linha em branco entre pessoas.

## Não-objetivos (decididos fora desta rodada, sem dor real até agora)

- Autenticação / login por pessoa (Lote 3, spec próprio, mesmo lançamento).
- Reunião com horário, marcar vários dias, semana programada (Lote 2).
- Backup/snapshot dos dados.
- Um blob por marcação (mitigação de concorrência).
- Cadastro de pessoas/obras fora do código.
- Meta mensal de visitas por obra (candidata a segunda etapa, depois de ver os números reais).
- Nenhuma mudança de contrato da API (continua `GET/POST /api/entries`).

## Aba "Atenção"

Terceiro botão no seletor de visão (Semana / Mês / Atenção), reutilizando tema e filtros do site.

Tabela: uma linha por obra (logo + nome curto); colunas = 5 pessoas + Total + Última visita +
Próxima; linha de totais por pessoa no fim. Cada célula mostra `realizado / planejado`
(ex.: `4 / 2`); zeros esmaecidos. Nota fixa na tela: os números medem presença **planejada**, não
confirmada.

Filtro de período (só afeta o realizado): Este mês (padrão), 30, 60 ou 90 dias.

### Regras de contagem

- Uma marcação (pessoa + obra + dia) = uma visita.
- **Realizado:** `periodStart <= data <= hoje` (hoje conta como realizado).
- **Planejado:** `data > hoje`, tudo que já está marcado, sem limite de período.
- **Última visita:** maior data `<= hoje` da obra, ignorando o filtro de período; exibida como
  "hoje" / "há X dias" / "—" (nunca visitada).
- **Próxima:** menor data `> hoje`; "Nada planejado" se não houver.
- **Destaque:** obra com última visita há mais de 14 dias (ou nunca) ou sem nada planejado.
  O limite (`staleDays = 14`) é um parâmetro com valor padrão no módulo.
- Datas comparadas como texto `AAAA-MM-DD`; diferença em dias via `Date.UTC`. Sem fuso.
- Marcações com pessoa/obra desconhecida são ignoradas.

## Arquitetura

Novo módulo puro `public/lib/attention.js` (padrão UMD, igual a `grouping.js`/`week-model.js`):

```
buildAttention({ entries, today, periodStart, obraOrder, personOrder, staleDays = 14 })
  -> { rows: [{ obra, byPerson: { [personId]: { done, planned } },
                done, planned, lastVisit, daysSinceLast, nextVisit, stale, noPlan }],
       personTotals: { [personId]: { done, planned } } }
```

`public/index.html` ganha só o botão da visão e o desenho da tabela; toda regra fica no módulo.
Sem mudança no backend para este recurso.

## Correções

1. **Modal resetando no polling.** `pollForUpdates` deixa de chamar `renderModal()` por inteiro
   com o modal aberto: atualiza o calendário e apenas o conteúdo de `.current-list`. Se
   `editingEntryId` estiver ativo, a lista também não é reescrita. O formulário "Adicionar
   presença" nunca é reconstruído por polling.
2. **Remarcação com comentário.** `addEntry`: se já existe pessoa+obra+dia e o comentário novo é
   não vazio e diferente, o comentário é atualizado (mantém `id` e `createdAt`); se igual ou
   vazio, nada muda. Limpar comentário continua sendo via `op: "update"`.
3. **Data inexistente.** `validateEntry` rejeita datas que não fazem round-trip em `Date.UTC`
   (ex.: `2026-99-99`, `2026-02-30`) com a mesma mensagem de data inválida.

## Ajustes de interface

1. **Cabeçalho estável.** Hoje os controles exclusivos da visão Semana ("Por pessoa / Por obra" e
   "Gerar mensagem") são escondidos com `display:none` nas outras visões, e o resto do cabeçalho
   muda de posição. Passam a ocupar o espaço sempre e ficar apenas invisíveis
   (`visibility:hidden`) em Mês e Atenção, de modo que Semana/Mês/Atenção, "Hoje" e o rótulo do
   período fiquem sempre no mesmo lugar.
2. **Rótulos sem capitalizar.** O `text-transform: capitalize` do rótulo do período e do título do
   modal transforma "de" em "De" ("25–31 De Outubro De 2026"). Passa a ser "25–31 de outubro de
   2026"; só a primeira letra é maiúscula quando a frase começa pelo mês ("Outubro de 2026").
3. **Mensagem de WhatsApp com respiro.** Linha em branco entre pessoas do mesmo setor (hoje
   Haniel e Jean saem grudados). O montador da mensagem, que hoje fica dentro do `index.html` e
   não tem teste, vai para o módulo puro `public/lib/week-message.js` (UMD, como os demais) e passa
   a ser testado. Formato de cada pessoa: nome, linhas por dia, linha em branco.

## Testes

- Unitários (`node --test`), escritos antes da implementação: `tests/unit/attention.test.js`
  (períodos, hoje = realizado, obra nunca visitada, sem planejado, virada de mês/ano, ids
  desconhecidos) e casos novos em `entries-logic.test.js` para as correções 2 e 3.
- `tests/unit/week-message.test.js`: linha em branco entre pessoas e entre setores, ordem dos
  setores e dos dias, comentário entre parênteses, semana sem marcações.
- Correção 1 verificada manualmente no rascunho (duas abas; marcar numa enquanto preenche na
  outra) e coberta, se viável, por um caso em `tests/frontend-static.spec.js`.
- Conferir a aba "Atenção" no rascunho com os dados reais de produção.

## Entrega

Os Lotes 1, 2 e 3 saem juntos num **único lançamento**, com branch, backup e rollback
descritos em "Lançamento único" no spec `2026-10-27-login-admin-backup-design.md`.
