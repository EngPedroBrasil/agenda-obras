# Lançamento da v2 e volta atrás

Tudo da v2 (aba Atenção, reunião, vários dias, semana programada, login, administração, backups) está na branch `release/v2`. A versão antiga está marcada com a tag `v1-antes-do-v2`. Produção só muda quando você juntar a branch na branch de produção e der o push — **um único deploy (15 créditos)**.

Comandos abaixo no PowerShell, dentro da pasta do repositório.

## 0. O que você precisa ter à mão

- O endereço do site (`https://SEU-SITE.netlify.app`).
- Acesso ao painel do Netlify (variáveis de ambiente e lista de deploys).
- A senha inicial que você quer dar a todo mundo (a mesma para as cinco pessoas; cada um troca no primeiro acesso).

## 1. Cópia de segurança dos dados de hoje (fora do Netlify)

```powershell
curl.exe -L -o "$HOME\Desktop\agenda-backup-antes-do-v2.json" "https://SEU-SITE.netlify.app/api/entries"
```

Use o `curl.exe` (já vem no Windows): ele grava os bytes exatamente como o servidor enviou. O `Invoke-RestMethod` do Windows PowerShell 5.1 lê os acentos errado (`GestÃ£o` em vez de `Gestão`) e estragaria a cópia.

Guarde o arquivo fora da pasta do repositório (ele não deve ir para o GitHub). Abra-o no Bloco de Notas e confira que tem as marcações e que os acentos estão certos.

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

Os dados desse teste ficam em arquivos locais (`.netlify\local-data`) e não aparecem na produção.

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
6. Abra o link `https://agenda-obras.netlify.app/` numa janela anônima, escolha "Entrar como visitante": só deve aparecer a semana atual se as cinco pessoas tiverem confirmado; senão, a mensagem "Esta semana ainda não foi liberada". Sem botões de mês, Atenção ou gerar mensagem.

## 7. Se algo der errado: voltar para a versão anterior

**Código (rápido, sem gastar crédito de build):** Netlify → *Deploys* → abra o último deploy bom de antes da v2 → **Publish deploy**. O site volta ao que era na hora.

Os dados continuam compatíveis: a v1 ignora as chaves novas (`weeks`, `users`, `backup-*`) e as marcações novas (com comentário/reunião) continuam aparecendo.

**Dados:** se alguma marcação for apagada por engano, entre como Pedro na v2 → *Administração* → *Restaurar* o backup do dia anterior (a restauração guarda antes uma cópia do estado atual). O arquivo do passo 1 é a cópia de segurança de fora do Netlify.

**Depois do rollback**, para tentar de novo: corrija na branch `release/v2` e repita os passos 3 a 5. O Git mantém a tag `v1-antes-do-v2` no ponto exato da versão antiga.

## 8. Perguntas comuns

- **Esqueci minha senha:** peça ao Pedro para zerar em *Administração*; você volta à senha inicial e escolhe outra.
- **O Pedro esqueceu a própria senha:** o administrador não consegue zerar a si mesmo. Apague a chave `users` da loja `agenda-obras` (Netlify CLI: `npx netlify-cli blobs:delete agenda-obras users --site SEU_SITE_ID`, ou peça ajuda). Na próxima requisição todos voltam à senha inicial e precisam trocar.
- **Pessoa bloqueada ("muitas tentativas"):** espere 15 minutos ou peça para zerar a senha.
