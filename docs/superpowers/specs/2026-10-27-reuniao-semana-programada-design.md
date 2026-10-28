# Agenda de Obras — reunião com horário, vários dias e semana programada (Lote 2)

## Contexto

Segundo de três lotes definidos em 2026-10-27. O Lote 1
(`2026-10-27-atencao-por-obra-design.md`) entrega a aba "Atenção", 3 correções e ajustes de
interface, sem mudar a API. Este lote muda a API e o modelo de dados de forma compatível com o que
existe. O Lote 3 (`2026-10-27-login-admin-backup-design.md`: login por pessoa, administrador, backup e
lançamento único) sai no mesmo lançamento.

## Objetivo

1. **Reunião com horário na obra:** a pessoa informa que numa marcação tem uma reunião, com início
   e fim, para os outros saberem o período em que estará ocupada e decidirem se vale ir àquela obra.
2. **Marcar vários dias de uma vez**, no mesmo formulário.
3. **Semana programada:** cada pessoa marca a própria semana como fechada; ao gerar a mensagem, o
   usuário vê se todos já programaram ou quem falta.

## Não-objetivos

- Login por pessoa (Lote 3, mesmo lançamento). Com ele, cada um fecha só a própria semana e o
  administrador fecha ou reabre a de qualquer pessoa.
- Marcação "Sem obra" (férias, folga, escritório): fica para depois; quem não vai a obra alguma
  fecha a semana mesmo assim ("semana sem visitas").
- Comentários prontos por função, repetir semana/recorrência, aviso de sobreposição.
- Mais de uma reunião por marcação; o detalhe da reunião vai no comentário existente.

## Dados e API

Tudo compatível com os dados e o front atuais.

### Reunião

- A marcação ganha o campo opcional `meeting: { start: "HH:MM", end: "HH:MM" }`.
- Início e fim obrigatórios quando há reunião; horas válidas 00:00–23:59; `end` > `start`, mesmo dia.
- `add` e `addMany` aceitam `meeting`. `update` aceita `comment` (texto; vazio apaga) e `meeting`
  (objeto define; `null` limpa); só as chaves presentes no payload mudam.
- Remarcar a mesma pessoa+obra+dia (já existente): comentário e/ou reunião novos, não vazios e
  diferentes, substituem os atuais (mantém `id` e `createdAt`); ausentes mantêm o atual.

### Vários dias: `op: "addMany"`

- Payload: `{ op: "addMany", items: [{ date, person, obra, comment?, meeting? }] }`, no máximo 60
  itens.
- Validação e deduplicação iguais às do `add`. **Tudo ou nada:** se um item for inválido, responde
  400 e nada é salvo. Uma leitura e uma gravação.

### Semana programada

- Nova chave `weeks` no mesmo banco: `{ "AAAA-MM-DD": { "<pessoa>": "<ISO-8601 de quando fechou>" } }`,
  onde a chave da semana é o **domingo** (como o calendário já faz). A data precisa ser um domingo
  real.
- `op: "confirmWeek"` e `op: "unconfirmWeek"`, com `{ week, person }`.
- **Reabre sozinha:** `add`, `addMany`, `update` ou `remove` que alterem uma marcação da pessoa P
  numa semana W apagam a confirmação de P em W. Só conta quando algo de fato mudou.
- `GET /api/entries` passa a devolver `{ entries, confirmations }`. O campo novo é aditivo; o front
  antigo o ignora. As respostas dos `POST` também incluem `confirmations`.
- Marcações e confirmações são duas gravações em sequência (marcações primeiro). Pior caso: uma
  confirmação desatualizada por alguns instantes; aceito.

## Telas

### Modal do dia

- Em cada obra marcada, a opção **"Tem reunião"** mostra os campos início e fim (`<input
  type="time">`); o fim vem preenchido com início + 1h.
- Nova seção **"Dias"**: faixa dom–sáb da semana do dia clicado, com o dia clicado já marcado;
  setas para semana anterior/seguinte; a seleção persiste ao navegar. O envio faz uma única chamada
  `addMany` e informa "N marcações adicionadas". Com vários dias, a mesma reunião vale para todos.
- A edição de uma marcação passa a incluir o horário, além do comentário.

### Onde a reunião aparece

- Visão Semana: o chip ganha uma linha `14:00–15:30`; em "Por obra", o horário ao lado do nome.
  Visão Mês: só no detalhe do dia. Imagem da semana: horário abaixo do nome.
- Mensagem de WhatsApp: `Quarta (28) Porto, reunião 14h–15h30 (comentário)`; horas cheias sem
  minutos ("14h"), com minutos "15h30". O formatador fica em `public/lib/week-message.js` (criado no
  Lote 1).

### Faixa "Semana programada"

- Na visão Semana: as 5 pessoas, ✓ verde (fechada) ou ○ (aberta); clicar no nome alterna, sem
  pergunta. Contador "3 de 5 programadas". Dica ao passar o mouse: quem fechou e quando.
- Quando uma alteração reabre a semana de alguém, aviso: "Semana de Pedro reaberta, feche de novo
  quando terminar."
- Em "Gerar mensagem": aviso no topo do modal, verde ("Todos programaram a semana") ou âmbar
  ("Faltam: Bruna, Gustavo"). Não bloqueia o envio e **não entra no texto** da mensagem.
- O polling passa a comparar também `confirmations`.

## Testes

- Unitários escritos antes da implementação: validação de `meeting` (formato, intervalo, fim >
  início); `update` parcial (comentário e reunião independentes, `null` limpa); remarcação com
  reunião; `addMany` (sucesso, deduplicação, limite de 60, tudo ou nada); `confirmWeek` /
  `unconfirmWeek` (domingo válido, pessoa válida); reabertura automática em `add`, `addMany`,
  `update` e `remove`; formato da reunião na mensagem (`14h–15h30`).
- Manual no rascunho: marcar vários dias, reunião visível em Semana, Por obra, modal e mensagem;
  fechar/reabrir semana e conferir o aviso na mensagem.

## Entrega

Os Lotes 1, 2 e 3 saem juntos num **único lançamento**, com branch, backup e rollback
descritos em "Lançamento único" no spec `2026-10-27-login-admin-backup-design.md`.
