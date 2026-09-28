# 18 — Servidor

**Normativo** para o servidor que o app usa: conta e sincronização. A IA própria entra num
plano seguinte, sobre esta mesma base. Os contratos que o servidor cumpre já estão fechados do
lado do app — este documento não os redefine, aponta para eles:

- Conta: `src/conta/ServicoContaHttp.ts` (rotas, códigos), ADR-38 (401 sessão / 403 plano),
  ADR-39 (o servidor recebe a prova de identidade, nunca a senha).
- Sincronização: `docs/17-sincronizacao.md` §9 e §9.1 (contrato e mapeamento HTTP).

Onde o servidor e esses contratos divergirem, o servidor está errado.

---

## 1. Em linguagem simples

- O servidor roda na VPS do dono do produto, no endereço `https://api.excalisidian.com`. Todas
  as rotas ficam sob `/v1` (o app usa `https://api.excalisidian.com/v1` como base, em
  `src/servico/base.ts`): `/v1/contas`, `/v1/sessoes`, `/v1/sync/vaults`, `/v1/saude`.
- Ele guarda três coisas: as contas (e-mail, plano e uma versão embaralhada da prova de
  identidade — nunca a senha), as sessões de quem está conectado, e os pacotes lacrados da
  sincronização. Nenhum desses pacotes ele consegue abrir.
- Os outros serviços que já rodam na VPS continuam como estão. Só as portas da web (80 e 443)
  passam a aceitar conexão de fora, e só para este servidor.
- Enquanto não existe cobrança, virar premium é um comando que o dono do produto roda na VPS.

## 2. Escolhas técnicas

| Escolha | Decisão | Por quê |
|---|---|---|
| Onde fica o código | pasta `servidor/` neste repositório | O servidor reaproveita o núcleo de `src/sync/nucleoServidorSync.ts` — as regras do diário (sequência, `fora-de-ordem`, retrato) ficam num lugar só, testadas uma vez. |
| Linguagem | Node 22 + TypeScript | Já instalado na VPS; mesma linguagem do app. |
| Servidor HTTP | Fastify 5 | Maduro, validação de corpo embutida, limite de tamanho por rota. |
| Banco | SQLite (`better-sqlite3`, binário pronto para Linux x64) | Uma pessoa, uma VPS: sem outro serviço para administrar. |
| Pacotes da sincronização | arquivos em `/var/lib/excalisidian/pacotes/`, metadados no SQLite | Pacotes de até 8 MiB não pertencem a um banco. |
| Prova de identidade guardada | `scrypt` do próprio Node, sal aleatório por conta | A prova já sai do app depois de Argon2id; aqui basta impedir que um vazamento do banco sirva para entrar. Sem dependência extra. |
| Sessão | token aleatório de 32 bytes; o banco guarda só o SHA-256 dele; validade de 30 dias; `renovar` troca o token (o antigo deixa de valer) | Vazamento do banco não entrega sessões vivas; o app já trata `renovar` como uso único. |
| HTTPS | Caddy, com certificado automático (Let's Encrypt) | Não há proxy na VPS; Caddy é um binário, sem configuração de certificado à mão. |
| Processo | serviço `systemd` `excalisidian-api`, usuário de sistema `excalisidian`, escutando só em `127.0.0.1:3100` | Sem Docker na VPS; porta 3100 está livre; só o Caddy fala com ele. |
| Firewall | `ufw`: abre 80 e 443; nada mais muda | O resto da VPS segue fechado. |

## 3. Regras que o servidor impõe

- **E-mail** normalizado (minúsculas, sem espaços), único. Criar conta com e-mail existente →
  409. Entrar com e-mail inexistente ou prova errada → o **mesmo** 401 (não revela quem tem
  conta).
- **Tentativas de entrar:** no máximo 10 por minuto por IP e 10 por minuto por e-mail;
  excesso → 429. O app mostra o erro genérico de servidor.
- **Plano:** conta nova nasce `gratis`. Rotas de sincronização exigem `premium` → 403.
- **Espaço:** 5 GiB de pacotes por conta premium; acima → 507.
- **Tamanho:** um lote ou parte de retrato acima de 8 MiB + 28 bytes → 413.
- **Logs:** método, rota sem parâmetros, status e duração. Nunca e-mail, token, prova, corpo ou
  id de vault.

## 4. Operação

- **Backup diário** às 03:00: cópia consistente do SQLite (`VACUUM INTO`) e dos pacotes para
  `/var/backups/excalisidian/<AAAA-MM-DD_HHMMSS>/`, guardando 7 dias (pela data de criação da
  pasta, não pelo nome). O nome inclui hora para que uma execução manual no mesmo dia (ex.: antes
  de uma atualização) não colida com o backup diário. É no mesmo disco — protege contra erro
  de software, não contra perder a VPS. Cópia fora da VPS fica como pendência declarada.
- **Administração**, na VPS: `excalisidian-admin premium <email>`,
  `excalisidian-admin gratis <email>`, `excalisidian-admin contas`,
  `excalisidian-admin vaults <email>` (id, bytes usados, número de lotes e última atividade de
  cada vault da conta — nunca o nome, que é cifrado) e
  `excalisidian-admin apagar-vault <email> <id>` (confere que o vault é dessa conta antes de
  apagar metadados e arquivos; os arquivos continuam em qualquer computador já sincronizado, só
  a cópia na nuvem some). Passo a passo no `servidor/LEIAME.md`.
- **Sessões:** `renovar` é tolerante a chamadas simultâneas com o mesmo token (várias
  janelas/efeitos do app ao reabrir) — a sessão antiga fica marcada como substituída por até
  120 s e um `renovar` repetido nessa janela devolve de novo a mesma sessão nova, em vez de
  401. Depois disso, ou se a sessão nova já foi ela mesma substituída, 401. `sair` encerra a
  sessão atual e as que ela substituiu.
- **Atualizar:** o app é empacotado nesta máquina, copiado pela rede privada (Tailscale) e o
  serviço é reiniciado. Passo a passo no `servidor/LEIAME.md`.
- O `Caddyfile` padrão que veio com o Caddy foi guardado em
  `/etc/caddy/Caddyfile.padrao-original` antes de ser substituído.

## 5. O que o app muda

- `BASE_URL_SERVICO` passa a ser `https://api.excalisidian.com`, e o escopo de rede do Tauri
  troca `api.excalisidian.app` por `api.excalisidian.com`.
- Em desenvolvimento, o padrão continua sendo a conta de teste e o servidor local (doc 17 §10).
  Com a variável `VITE_SERVIDOR=real`, o modo de desenvolvimento usa o servidor de verdade.
