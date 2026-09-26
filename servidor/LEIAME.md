# Excalisidian — servidor: instalação e operação

Guia para quem executa a implantação na VPS, comando por comando, na ordem. Normativo:
`docs/18-servidor.md`. Cada comando abaixo diz se muda a VPS ou não.

Convenções deste documento:

- `$` no início de uma linha é o prompt de quem está rodando o comando — não digite o `$`.
- Comandos marcados **[muda a VPS]** alteram algo persistente (arquivo, serviço, firewall).
  Os demais só leem ou só rodam nesta máquina (empacotar, copiar).
- Tudo pela rede privada do Tailscale — nunca pela internet pública.

## Pré-requisitos

1. **DNS**: o registro `A api.excalisidian.com → 192.3.146.179` já resolvendo (a cargo do
   dono do produto — ver plano, Task 7). Confira com `nslookup api.excalisidian.com` antes de
   pedir ao Caddy um certificado; sem isso, o Let's Encrypt falha.
2. **Acesso SSH pelo Tailscale**: este computador precisa estar no Tailscale e conseguir
   `ssh lucas@100.88.85.127`. O usuário `lucas` tem sudo sem senha na VPS.

## Instalação

Rode cada bloco na ordem. Os blocos marcados **[muda a VPS]** são executados *dentro* da
sessão SSH (`ssh lucas@100.88.85.127`); os outros, nesta máquina, na pasta `servidor/`.

### 1. Empacotar (nesta máquina)

```
$ npm ci
$ npm test
$ npx tsc --noEmit
$ npm run empacotar
```

Confere: `dist/servidor.js` e `dist/admin.js` existem, e `npm test` não teve falha.

### 2. Instalar o Caddy **[muda a VPS]**

Pelo repositório oficial do Caddy — siga a documentação oficial atual para Ubuntu
(`https://caddyserver.com/docs/install#debian-ubuntu-raspbian`) no momento da instalação; o
essencial, resumido:

```
$ ssh lucas@100.88.85.127
lucas@vps:~$ sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
lucas@vps:~$ curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
lucas@vps:~$ curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
lucas@vps:~$ sudo apt update
lucas@vps:~$ sudo apt install -y caddy
```

Confere: `systemctl status caddy` mostra `active (running)`. Caddy já sobe com um
`Caddyfile` vazio/padrão — ainda não fala com o nosso serviço (isso é o passo 6).

### 3. Criar usuário de sistema e pastas **[muda a VPS]**

```
lucas@vps:~$ sudo useradd --system --home-dir /opt/excalisidian --shell /usr/sbin/nologin excalisidian
lucas@vps:~$ sudo mkdir -p /opt/excalisidian /var/lib/excalisidian /var/backups/excalisidian
lucas@vps:~$ sudo chown -R excalisidian:excalisidian /opt/excalisidian /var/lib/excalisidian /var/backups/excalisidian
```

Confere: `id excalisidian` existe; `ls -ld /opt/excalisidian /var/lib/excalisidian` mostra o
dono `excalisidian`.

### 4. Copiar o pacote **[muda a VPS]**

Nesta máquina, na pasta `servidor/`:

```
$ scp -r dist package.json package-lock.json lucas@100.88.85.127:/tmp/excalisidian-pacote
$ ssh lucas@100.88.85.127 'sudo cp -r /tmp/excalisidian-pacote/* /opt/excalisidian/ && sudo chown -R excalisidian:excalisidian /opt/excalisidian && rm -rf /tmp/excalisidian-pacote'
```

### 5. Instalar dependências de produção **[muda a VPS]**

```
lucas@vps:~$ cd /opt/excalisidian
lucas@vps:/opt/excalisidian$ sudo -u excalisidian npm ci --omit=dev
```

Isso instala `node_modules/better-sqlite3` (o binário nativo, externo ao bundle — ver
`scripts/empacotar.mjs`) ao lado de `dist/servidor.js` e `dist/admin.js`.

**Confira o caminho do node antes de seguir**: `which node` (como `lucas` ou como
`excalisidian`, via `sudo -u excalisidian which node`). Se não for `/usr/bin/node`, edite
`ExecStart=` em `excalisidian-api.service` (e o caminho equivalente em
`excalisidian-admin`/`backup.sh`) antes do próximo passo.

### 6. Copiar e instalar os arquivos deste diretório (`servidor/implantacao/`) **[muda a VPS]**

Nesta máquina:

```
$ scp implantacao/excalisidian-api.service implantacao/Caddyfile implantacao/excalisidian-admin implantacao/backup.sh implantacao/excalisidian-backup.service implantacao/excalisidian-backup.timer lucas@100.88.85.127:/tmp/
```

Na VPS:

```
lucas@vps:~$ sudo cp /tmp/excalisidian-api.service /tmp/excalisidian-backup.service /tmp/excalisidian-backup.timer /etc/systemd/system/
lucas@vps:~$ sudo cp /tmp/backup.sh /opt/excalisidian/backup.sh
lucas@vps:~$ sudo chown excalisidian:excalisidian /opt/excalisidian/backup.sh
lucas@vps:~$ sudo chmod +x /opt/excalisidian/backup.sh
lucas@vps:~$ sudo cp /tmp/excalisidian-admin /usr/local/bin/excalisidian-admin
lucas@vps:~$ sudo chmod +x /usr/local/bin/excalisidian-admin
lucas@vps:~$ sudo cp /tmp/Caddyfile /etc/caddy/Caddyfile
```

**Não sobrescreva mais nada em `/etc/caddy/` nem em `/etc/systemd/system/`** além destes
arquivos nomeados — os outros serviços (`hermes-gateway`, `orca-runtime`, `xvfb-orca`) têm as
próprias unidades lá e não devem ser tocados.

```
lucas@vps:~$ rm /tmp/excalisidian-api.service /tmp/excalisidian-backup.service /tmp/excalisidian-backup.timer /tmp/backup.sh /tmp/excalisidian-admin /tmp/Caddyfile
```

### 7. Ativar os serviços **[muda a VPS]**

```
lucas@vps:~$ sudo systemctl daemon-reload
lucas@vps:~$ sudo systemctl enable --now excalisidian-api
lucas@vps:~$ sudo systemctl enable --now excalisidian-backup.timer
lucas@vps:~$ sudo systemctl reload caddy
```

Confere: `systemctl status excalisidian-api` mostra `active (running)`;
`systemctl list-timers excalisidian-backup.timer` mostra a próxima execução às 03:00;
`curl -s http://127.0.0.1:3100/v1/saude` (de dentro da VPS) responde `{"ok":true}`.

### 8. Abrir 80/443 no firewall **[muda a VPS]**

```
lucas@vps:~$ sudo ufw allow 80/tcp
lucas@vps:~$ sudo ufw allow 443/tcp
lucas@vps:~$ sudo ufw status
```

**Não rode mais nenhum outro comando de `ufw`** — a interface `tailscale0` continua
liberada como já estava; SSH (porta 22) continua só pelo Tailscale.

### 9. Confirmar que nada mais quebrou

```
lucas@vps:~$ systemctl is-active hermes-gateway orca-runtime xvfb-orca
```

Os três devem responder `active`. Se algum não responder, **pare aqui** e investigue antes de
seguir — nenhum passo anterior deveria ter tocado neles, então uma mudança de estado é sinal
de que algo saiu do esperado.

## Verificação (de fora da VPS)

```
$ curl -s https://api.excalisidian.com/v1/saude
```

Espera-se `{"ok":true}`, com certificado válido (o Caddy já deve ter obtido o Let's Encrypt no
passo 7 — se a resposta for erro de TLS, espere um minuto e tente de novo; se persistir,
confira o DNS do pré-requisito 1 e `sudo journalctl -u caddy -n 50`).

## Atualização

Depois de qualquer mudança no código do servidor:

1. Nesta máquina, na pasta `servidor/`: `npm test`, `npx tsc --noEmit`, `npm run empacotar`
   (mesmos comandos do passo 1 da instalação).
2. Copiar o pacote de novo **[muda a VPS]** (passo 4 da instalação, mesmos comandos).
3. Reinstalar dependências de produção **[muda a VPS]** (passo 5 — só necessário se
   `package.json`/`package-lock.json` mudaram; rodar sempre é seguro, mesmo sem mudança).
4. Reiniciar o serviço **[muda a VPS]**:
   ```
   lucas@vps:~$ sudo systemctl restart excalisidian-api
   ```
5. Verificar: `curl -s https://api.excalisidian.com/v1/saude` (seção acima).

Os arquivos de `servidor/implantacao/` (unidades systemd, Caddyfile, `backup.sh`,
`excalisidian-admin`) só precisam ser recopiados se eles próprios mudaram — não em toda
atualização de código do servidor.

## Voltar atrás (desinstalar)

**Aviso:** apagar `/var/lib/excalisidian` apaga as contas e todos os pacotes de
sincronização de todo mundo. Confirme que não é isso que você quer antes do último comando.

```
lucas@vps:~$ sudo systemctl disable --now excalisidian-api excalisidian-backup.timer
lucas@vps:~$ sudo rm /etc/systemd/system/excalisidian-api.service /etc/systemd/system/excalisidian-backup.service /etc/systemd/system/excalisidian-backup.timer
lucas@vps:~$ sudo systemctl daemon-reload
lucas@vps:~$ sudo rm /etc/caddy/Caddyfile
lucas@vps:~$ sudo systemctl reload caddy
lucas@vps:~$ sudo ufw delete allow 80/tcp
lucas@vps:~$ sudo ufw delete allow 443/tcp
lucas@vps:~$ sudo rm /usr/local/bin/excalisidian-admin
lucas@vps:~$ sudo rm -rf /opt/excalisidian /var/backups/excalisidian
# Só a linha abaixo apaga as contas e os pacotes de todo mundo — confirme antes:
lucas@vps:~$ sudo rm -rf /var/lib/excalisidian
lucas@vps:~$ sudo userdel excalisidian
```

Confira depois: `systemctl is-active hermes-gateway orca-runtime xvfb-orca` continuam
`active` (nenhum comando acima deveria ter os afetado).

## Tornar uma conta premium **[muda a VPS]**

```
lucas@vps:~$ excalisidian-admin premium email-da-pessoa@example.com
```

Devolve uma linha de confirmação (`email-da-pessoa@example.com: premium`), ou um erro se o
e-mail não tem conta criada (a conta só nasce pelo app, em `POST /v1/contas` — este comando
nunca cria conta, só troca o plano de uma que já existe).

Para voltar a conta a grátis: `excalisidian-admin gratis email-da-pessoa@example.com`.

Para conferir todas as contas (e-mail, plano, bytes usados):

```
lucas@vps:~$ excalisidian-admin contas
```
