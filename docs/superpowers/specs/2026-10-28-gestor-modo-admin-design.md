# Agenda de Obras 2.1 — perfil Gestor (Leonardo), notificações privadas e modo administrador

## Contexto

A versão 2.0 está em produção (https://agenda-obras.netlify.app) com 5 pessoas (Pedro, Jean,
Haniel, Gustavo, Bruna), login por pessoa, administrador (Pedro) e acesso de visitante limitado às
semanas liberadas. Hoje só existem os papéis `admin` e `user`. O gestor Leonardo Costa precisa
acompanhar a agenda e falar com cada pessoa sem poder alterar marcações, e o Pedro quer operar no
dia a dia como pessoa comum, ligando os poderes de administrador só quando precisar.

## Objetivo

1. Perfil novo **gestor** (conta `leonardo`): vê toda a agenda em leitura e envia notificações
   privadas.
2. **Quadro de notificações**: avisos do gestor para cada pessoa, visíveis só para o destinatário,
   com "Li" e acompanhamento de leitura por quem enviou.
3. **Modo administrador ligável** para o Pedro: por padrão ele é uma pessoa comum; liga o modo
   admin por 15 minutos e o servidor confere em toda ação.

## Não-objetivos

- Resposta a notificações (mini-chat), e-mail ou push.
- O gestor marcar presença, confirmar semana ou aprovar a liberação de semanas.
- Observação por semana, por obra ou por marcação (decidido: só notificações por pessoa).
- Cadastro de usuários pela tela; o Leonardo vem de uma lista no código.
- Outros gestores, perfis ou níveis de permissão.

## Perfis e permissões

| Ação | Visitante | Pessoa | Pedro (comum) | Pedro (modo admin) | Leonardo (gestor) |
| --- | --- | --- | --- | --- | --- |
| Ver semanas liberadas | sim | sim | sim | sim | sim |
| Ver todas as semanas, Mês, Atenção e Gerar mensagem | não | sim | sim | sim | sim |
| Marcar presença | não | só a sua | só a sua | de qualquer pessoa | não |
| Semana programada | não | a sua | a sua | de qualquer pessoa | só ver |
| Receber notificações | não | sim | sim | sim | não |
| Enviar notificações | não | não | não | sim | sim |
| Administração (senha, backup) | não | não | não | sim | não |

Regras de conjunto:

- "Semana liberada" continua sendo as 5 pessoas confirmadas. O gestor não conta.
- O servidor é a autoridade: toda checagem usa o **papel efetivo**, nunca o que a tela mostra.
- O gestor é barrado em qualquer `POST` de `/api/entries` (403, "o gestor acompanha a agenda, mas
  não altera marcações").

## Modo administrador (abordagem B: o servidor guarda o prazo)

- Registro do usuário ganha o campo opcional `elevatedUntil` (milissegundos). Só o Pedro
  (`role: "admin"`) pode tê-lo.
- `effectiveRole(rec, agora)`: se `rec.role === "admin"` e `rec.elevatedUntil > agora` → `"admin"`;
  se `rec.role === "admin"` e o prazo venceu ou não existe → `"user"`; senão `rec.role`.
- `POST /api/auth`: `elevate` (define `elevatedUntil = agora + 15 min`) e `unelevate` (zera).
  Exigem sessão válida, `role === "admin"` e senha já trocada; outros recebem 403.
- O usuário público devolvido por `/api/auth` traz: `role` (efetivo), `canElevate` (true só para o
  Pedro), `elevatedUntil` (0 se desligado). Assim os testes `me.role === "admin"` da tela passam a
  significar "admin agora".
- `logout` e troca de senha zeram `elevatedUntil`.
- `admin.js` e as permissões de `entries.js` usam o papel efetivo. Pedro fora do modo admin recebe
  403 "ligue o modo administrador" nas funções de administração.
- Prazo fixo de 15 minutos, sem renovação automática; para estender, liga de novo.
- Tela: item "Modo administrador" no menu do nome (só quando `canElevate`); com o modo ligado,
  faixa vermelha no topo: "MODO ADMINISTRADOR — volta ao comum às HH:MM" + botão **Desligar**.
  Ao vencer, a tela busca o usuário de novo, volta ao comum e avisa por toast.

## Gestor (conta leonardo)

- Lista no código: `MANAGERS = [{ id: "leonardo", name: "Leonardo" }]` em `people.js`; papel
  `manager`. `PEOPLE` (5) não muda, então a regra de semana liberada e o `weekKeyOf` ficam iguais.
- `resolveUserId` aceita os 6 ids; a lista de login e o painel de Administração mostram os 6.
- **Criação na produção:** `loadUsers` passa a completar o que faltar: se o registro `users` já
  existe sem `leonardo`, cria só ele (senha inicial, `mustChange: true`) e grava uma vez. As 5
  contas existentes não são tocadas.
- Tela do gestor: sem formulário de marcar (mensagem "Você acompanha a agenda"), sem ✎/×, botões
  de semana programada desabilitados, com Semana, Mês, Atenção e Gerar mensagem liberados.

## Quadro de notificações

### Dados

Chave nova `notices` no Blobs: lista de
`{ id, from, to, text, createdAt, readAt }` (`readAt` é `null` até o destinatário marcar "Li").
Fora do backup e da restauração (restaurar um backup não apaga avisos).

### API (função nova `netlify/functions/notices.js`)

Exige login (diferente de `/api/entries`, não é pública) e senha já trocada.

| Chamada | Quem | O que faz |
| --- | --- | --- |
| `GET` | logado | `{ inbox }` com os avisos em que `to === eu`; se o papel efetivo é gestor ou admin, também `{ sent }` com os em que `from === eu`. Nunca devolve aviso alheio. |
| `POST send {to:[ids], text}` | gestor ou admin | Uma notificação por destinatário. `to`: 1 a 5 ids de `PEOPLE`, sem repetir e sem o próprio remetente; `text` aparado, 1 a 500 caracteres. |
| `POST markRead {id}` | só o destinatário | Define `readAt` na primeira vez; repetir não muda nada. |

Limpeza: ao enviar, remove avisos lidos há mais de 60 dias. Teto de 500 avisos no total (acima
disso, recusa com 400).

### Tela

- Sino no cabeçalho (só logados) com contador de não lidas; abre um painel lateral à direita (no
  celular, tela cheia).
- **Recebidas**: mais novas primeiro, com remetente, data/hora e texto; botão **Li**; lidas ficam
  apagadas e escondidas, com "Mostrar lidas".
- **Escrever** (gestor e Pedro em modo admin): caixas de seleção de pessoas com "Todos", área de
  texto com contador de 500 e botão **Enviar**.
- **Enviadas**: cada aviso com destinatário, data/hora e "Lido em dd/mm às HH:MM" ou "Não lido".
- O ciclo de atualização de 25 segundos passa a buscar também os avisos; chegou aviso novo →
  contador sobe e aparece um toast.
- Visitantes não veem sino nem painel.

## Erros e limites

- Mensagens do servidor em português, no mesmo formato das atuais (`{error}` com 400/401/403/404).
- `send` com destinatário inválido, vazio, repetido ou o próprio remetente → 400 com o motivo.
- `markRead` em aviso de outra pessoa → 404 (não revela que existe).
- Sessão expirada no painel → a tela pede login de novo, como no resto do site.
- Sem Blobs configurado, o ambiente local usa o armazenamento em arquivos já existente.

## Testes

- Unitários: `effectiveRole` e validade do prazo (relógio injetado); `elevate`/`unelevate`;
  logout e troca de senha zerando o prazo; matriz de permissões de `authorize` para os 5 perfis;
  criação do `leonardo` sem tocar nas contas existentes; privacidade e validações de `notices`
  (inbox só do destinatário, `sent` só do remetente, 5 destinatários no máximo, limpeza de 60 dias,
  `markRead` idempotente e restrito ao dono).
- Navegador (Playwright com o stub de API): gestor em leitura; sino, envio, "Li" e "Enviadas";
  liga/desliga do modo admin e vencimento após 15 minutos com o relógio avançado; Pedro em modo
  comum sem Administração e sem editar dos outros.
- O stub de API reproduz as mesmas regras do servidor (como já faz com a visão de visitante).

## Entrega

- Versão **2.1.0**, em uma branch (`feature/gestor-modo-admin`) a partir da `main` atual; um
  único deploy em produção, com o mesmo roteiro de `docs/RELEASE-v2.md` (backup antes, conferência
  depois, volta pelo Netlify em *Publish deploy*).
- Documentação: README (permissões, modo admin, notificações), roteiro de publicação e Release
  Notes 2.1 para o setor e para o Leonardo.
- Dados existentes (marcações, semanas, usuários) permanecem; o único registro novo é a conta
  `leonardo`, criada no primeiro login dele.
