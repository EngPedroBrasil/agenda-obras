# Lançamento da 2.1 e volta atrás

A 2.1 acrescenta o **gestor** (Leonardo), o **quadro de notificações** e o **modo administrador** do Pedro. Está na branch `feature/gestor-modo-admin`, que parte da 2.0 já publicada. Produção só muda quando você enviar a branch para `main`: **um único deploy (15 créditos)**.

Comandos no PowerShell, dentro da pasta do repositório. **Não use `git switch`** (o OneDrive atrapalha a troca de branch): o roteiro abaixo evita isso.

## 0. O que você precisa ter à mão

- O endereço do site: `https://agenda-obras.netlify.app`.
- Acesso ao painel do Netlify (lista de deploys).
- Nada novo de variáveis de ambiente: o Leonardo usa a mesma `INITIAL_PASSWORD` das outras pessoas e é criado sozinho na primeira requisição depois do deploy.

## 1. Cópia de segurança dos dados de hoje (fora do Netlify)

~~~powershell
curl.exe -L -o "$HOME\Desktop\agenda-backup-antes-do-v2.1.json" "https://agenda-obras.netlify.app/api/entries"
~~~

Guarde fora da pasta do repositório. (Entram marcações e semanas; senhas e avisos não entram em cópia nenhuma.)

## 2. Testar no seu computador (sem tocar na produção)

A cópia local já está na branch `feature/gestor-modo-admin`.

~~~powershell
git branch --show-current
npm install
npm test
Copy-Item .env.example .env       # se ainda não existir; SESSION_SECRET e INITIAL_PASSWORD
npx netlify-cli dev --offline
~~~

Abra `http://localhost:8888` e use **Ctrl+F5**. Roteiro:

1. Entre como **Pedro** (senha inicial → trocar, se pedir). Ele aparece como pessoa comum: sem barra vermelha e, no menu do nome, só *Modo administrador*, *Trocar senha*, *Sair*.
2. Abra um dia: o Pedro só marca o próprio nome. Em *Modo administrador* a barra vermelha aparece com a hora em que volta ao comum; agora o dia mostra "Marcando como" com todos e o menu ganha *Administração*. *Desligar* na barra volta ao comum.
3. Com o modo ligado, abra *Administração* → zere a senha do **Leonardo**.
4. Saia e entre como **Leonardo** (senha inicial → trocar). Ele vê todas as semanas (mesmo não liberadas), Mês, Atenção e Gerar mensagem; o dia mostra "modo leitura"; os botões de *Semana programada?* ficam desativados.
5. Ainda como Leonardo, clique no **sino** → *Escrever*: marque duas pessoas (ou *Todos*), escreva e envie. Em *Enviadas* aparece "Não lido".
6. Saia e entre como uma das pessoas: o sino mostra o número de avisos novos; só o aviso dela aparece; clique **Li**. Volte como Leonardo: *Enviadas* mostra "Lido em dd/mm às HH:MM" (a tela atualiza sozinha em até 25 segundos).
7. Como Pedro **fora** do modo administrador: o sino abre só *Recebidas* (sem *Escrever*).
8. Como visitante (*Entrar como visitante*): não há sino.

## 3. Enviar a branch e marcar a versão anterior (não publica nada)

Confira em *Site configuration → Build & deploy → Branches and deploy contexts* que **Branch deploys** está em *None*.

~~~powershell
git tag v2.0 77f67a4
git push origin v2.0
git push origin feature/gestor-modo-admin
~~~

## 4. Publicar em produção (15 créditos, uma vez só)

Sem trocar de branch:

~~~powershell
git push origin feature/gestor-modo-admin:main
~~~

O Netlify faz o deploy sozinho. Espere ficar *Published*.

## 5. Conferir depois do deploy

1. O site abre e mostra as marcações de antes.
2. Entre como Pedro: ele começa **sem** a barra vermelha. Ligue o *Modo administrador*, abra *Administração* e confira a lista com 6 pessoas (inclui Leonardo).
3. Entre como **Leonardo** com a senha inicial: o site pede para trocar; depois ele vê a agenda em modo leitura.
4. Envie um aviso de teste do Leonardo para o Pedro; entre como Pedro, leia e marque **Li**.
5. Avise a equipe e o Leonardo (use os Release Notes da 2.1).

## 6. Se algo der errado: voltar para a 2.0

**Código (rápido, sem gastar crédito de build):** Netlify → *Deploys* → abra o deploy da 2.0 (o último antes desta publicação) → **Publish deploy**.

Os dados continuam compatíveis: a 2.0 ignora o Leonardo, o campo `elevatedUntil` e a chave `notices`. Na 2.0 o Pedro volta a ser administrador o tempo todo.

**Dados:** se alguma marcação for apagada por engano, entre como Pedro, ligue o *Modo administrador* → *Administração* → *Restaurar* o backup do dia anterior. O arquivo do passo 1 é a cópia de fora do Netlify.

## 7. Perguntas comuns

- **O Leonardo esqueceu a senha:** o Pedro liga o modo administrador e zera em *Administração*.
- **O Pedro tentou usar a Administração e deu "ligue o modo administrador":** é de propósito. Menu do nome → *Modo administrador*.
- **A barra vermelha sumiu sozinha:** passaram os 15 minutos (ou ele saiu/trocou a senha). Ligue de novo.
- **O Leonardo não consegue marcar presença:** é de propósito, ele acompanha. Quem marca é a equipe.
- **Aviso enviado para a pessoa errada:** não há como apagar; mande outro aviso.
