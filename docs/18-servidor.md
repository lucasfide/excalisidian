# 18 — Servidor

**Normativo** para o servidor que o app usa: conta, sincronização e a IA do Excalisidian
(repasse ao fornecedor com créditos, §5). Os contratos que o servidor cumpre já estão fechados do
lado do app — este documento não os redefine, aponta para eles:

- Conta: `src/conta/ServicoContaHttp.ts` (rotas, códigos), ADR-38 (401 sessão / 403 plano),
  ADR-39 (o servidor recebe a prova de identidade, nunca a senha).
- Sincronização: `docs/17-sincronizacao.md` §9 e §9.1 (contrato e mapeamento HTTP).
- IA: `src/agente/cliente.ts` (dialeto OpenAI e códigos de erro) e `src/servico/creditos.ts`
  (formato do saldo), `docs/11-agente-ia.md` §3.2.

Onde o servidor e esses contratos divergirem, o servidor está errado.

---

## 1. Em linguagem simples

- O servidor roda na VPS do dono do produto, no endereço `https://api.excalisidian.com`. Todas
  as rotas ficam sob `/v1` (o app usa `https://api.excalisidian.com/v1` como base, em
  `src/servico/base.ts`): `/v1/contas`, `/v1/sessoes`, `/v1/sync/vaults`, `/v1/chat/completions`, `/v1/creditos`,
  `/v1/saude`.
- Ele guarda três coisas: as contas (e-mail, plano, faixa de IA e uma versão embaralhada da
  prova de identidade — nunca a senha), as sessões de quem está conectado, e os pacotes lacrados
  da sincronização. Nenhum desses pacotes ele consegue abrir. Para a IA, guarda só a conta de
  créditos de cada mês (números, nunca texto).
- Os pedidos de IA de contas premium passam por ele a caminho do fornecedor de IA: o texto das
  notas atravessa o servidor, mas não é guardado nem registrado em log (§5).
- Os outros serviços que já rodam na VPS continuam como estão. Só as portas da web (80 e 443)
  passam a aceitar conexão de fora, e só para este servidor.
- Enquanto não existe cobrança, virar premium (ou superior) é um comando que o dono do produto
  roda na VPS.

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
| IA | Repasse ao OpenRouter pelo `fetch` do próprio Node (dialeto OpenAI, sem streaming) | Sem dependência nova; o servidor só traduz o pedido, confere plano e créditos e debita. |
| Chave do fornecedor | Arquivo `/etc/excalisidian/ia.env` na VPS, lido pelo `systemd` | Nunca passa pelo repositório, pelo app nem pela conversa com o assistente (§5.3). |
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
- **Administração**, na VPS: `excalisidian-admin premium <email>` (premium com a faixa de IA
  `padrao`, 3.000 créditos), `excalisidian-admin superior <email>` (premium com a faixa
  `superior`, 10.000 créditos), `excalisidian-admin gratis <email>`,
  `excalisidian-admin contas` (agora mostra também a faixa),
  `excalisidian-admin uso <email>` (mês atual: créditos usados/total, pedidos, tokens de entrada
  e de saída e custo em US$),
  `excalisidian-admin vaults <email>` (id, bytes usados, número de lotes e última atividade de
  cada vault da conta — nunca o nome, que é cifrado) e
  `excalisidian-admin apagar-vault <email> <id>` (confere que o vault é dessa conta antes de
  apagar metadados e arquivos; os arquivos continuam em qualquer computador já sincronizado, só
  a cópia na nuvem some). Passo a passo no `servidor/LEIAME.md`.
- **Chave da IA:** `sudo excalisidian-configurar-ia`, na VPS, pede a chave sem mostrá-la na
  tela, grava `/etc/excalisidian/ia.env` e reinicia o serviço (§5.3).
- **Sessões:** `renovar` é tolerante a chamadas simultâneas com o mesmo token (várias
  janelas/efeitos do app ao reabrir) — a sessão antiga fica marcada como substituída por até
  120 s e um `renovar` repetido nessa janela devolve de novo a mesma sessão nova, em vez de
  401. Depois disso, ou se a sessão nova já foi ela mesma substituída, 401. `sair` encerra a
  sessão atual e as que ela substituiu.
- **Atualizar:** o app é empacotado nesta máquina, copiado pela rede privada (Tailscale) e o
  serviço é reiniciado. Passo a passo no `servidor/LEIAME.md`.
- O `Caddyfile` padrão que veio com o Caddy foi guardado em
  `/etc/caddy/Caddyfile.padrao-original` antes de ser substituído.

## 5. IA do Excalisidian

O servidor repassa pedidos de IA ao fornecedor e cobra em créditos. O contrato do lado do app
está em `src/agente/cliente.ts` e `src/servico/creditos.ts` (doc 11 §3.2); a decisão, em ADR-43 (fornecedor e cálculo do custo trocados pelo ADR-44).

### 5.1 Rotas

**`POST /v1/chat/completions`** — dialeto OpenAI, sem streaming. O corpo aceita `model`
(string), `messages` (lista não vazia de `{role: system|user|assistant, content: string}`) e,
opcional, `max_completion_tokens` (inteiro). Campos extras são ignorados e nunca repassados.
As verificações rodam nesta ordem, e a primeira que falhar responde (tamanho e formato do corpo
vêm antes da sessão porque o Fastify lê e valida o corpo antes do código da rota — mesmo padrão
das rotas de sincronização):

| # | Verificação | Resposta |
|---|---|---|
| 1 | Corpo acima de 256 KiB | 413 |
| 2 | Corpo inválido ou com `stream: true` | 400 |
| 3 | Sem sessão válida (Bearer) | 401 |
| 4 | Conta grátis | 403 |
| 5 | `model` fora de `leitura-rapida` e `acompanhamento` | 404 |
| 6 | Mais de 30 pedidos por minuto na conta | 429, corpo `{"codigo":"limite"}` |
| 6b | Mais de 3 pedidos em andamento na conta (checado logo antes de chamar o fornecedor, depois dos créditos e da chave) | 429, corpo `{"codigo":"limite"}` |
| 7 | Créditos do mês esgotados (usados ≥ total) | 429, corpo `{"codigo":"creditos"}` |
| 8 | Chave do fornecedor não configurada | 503 |
| 9 | Fornecedor falhou (rede, mais de 90 s, status não-2xx, resposta sem texto) | 502, nada é cobrado |
| 10 | Sucesso | 200, débito pelo custo informado na resposta (§5.2) |

Chamada ao fornecedor (passo 9): o modelo real sai de um mapeamento que existe num lugar só do
servidor (hoje os dois modelos lógicos apontam para o mesmo modelo); o fornecedor é o OpenRouter
(ADR-44); o raciocínio vai desligado (`reasoning: {enabled: false}`); só provedores que não guardam
nem treinam com os dados (`data_collection: deny`); e há teto de preço de US$ 0,30 por milhão de
tokens de entrada e US$ 1,20 de saída (`max_price`); o teto de saída é o `max_completion_tokens` pedido, limitado a 4096,
ou 2048 se ausente.

Resposta 200: `{object: "chat.completion", model: <id lógico pedido>, choices: [{index: 0,
message: {role: "assistant", content}, finish_reason}], usage: {prompt_tokens,
completion_tokens, total_tokens}}`. Nunca traz o nome do modelo real, o raciocínio interno nem
qualquer outro campo do fornecedor.

A checagem de créditos é antes da chamada ao fornecedor e o débito é depois. Para o excesso no fim
do mês não crescer, cada conta tem no máximo 3 pedidos em andamento (o 4º recebe 429
`{"codigo":"limite"}`); o excesso fica limitado a 3 pedidos — até ~270 créditos no pior caso
fabricado (corpo de 256 KiB, cobrado pelo teto de preço), poucos créditos no uso normal do app.

**`GET /v1/creditos`** → 200 `{usados, total, renovaEm}`, inteiros, `renovaEm` em milissegundos.
401 sem sessão; 403 conta grátis.

### 5.2 Créditos

- **Unidade:** 1 crédito = US$ 0,001 de custo real do fornecedor.
- **Cálculo:** o OpenRouter informa em cada resposta o custo cobrado (`usage.cost`, em US$).
  O custo real do pedido é esse valor × 1,055, porque o OpenRouter cobra 5,5% na compra de
  créditos. A conta é feita em nano-dólares inteiros e o resultado em micro-dólares, cada pedido
  arredondado para cima. `usados` = teto(micro-dólares acumulados / 1000). Promoções e o
  provedor escolhido entram sozinhos no custo. Sem `usage.cost` válido (ausente, não numérico,
  negativo ou não finito), cobra-se pelo teto de preço, sem desconto de cache: toda a entrada a
  US$ 0,30 por milhão e a saída a US$ 1,20, × 1,055 — nunca menos que o real, porque o teto de
  preço impede um provedor mais caro. Não há regra de horário de pico.
- **Constantes:** a taxa (1,055) e o teto de preço ficam em arquivos só do servidor
  (`creditosIa.ts` e `fornecedorIa.ts`); o preço de cada provedor não é mais tabelado.
- **Faixas:** a conta guarda a faixa de IA, `padrao` (3.000 créditos por mês) ou `superior`
  (10.000). A quantidade de cada faixa é constante no código do servidor: mudar é atualizar o
  servidor, sem atualizar o app. As duas faixas são "premium" para todo o resto (sincronização,
  app); o app só vê um total diferente no medidor.
- **Período:** mês civil no horário de Brasília (UTC−3 fixo, o Brasil não tem horário de verão
  desde 2019). Renova à meia-noite do dia 1º; `renovaEm` é esse instante.
- **O que se guarda**, por conta e por mês: custo em micro-dólares, número de pedidos, tokens de
  entrada e de saída. Nunca texto.

### 5.3 Chave do fornecedor

- Fica só na VPS, em `/etc/excalisidian/ia.env` (dono root, permissão 600), lido pelo `systemd`
  com `EnvironmentFile=-/etc/excalisidian/ia.env` (o hífen faz o serviço subir mesmo sem o
  arquivo). Variáveis: `EXCALISIDIAN_IA_CHAVE` (obrigatória para a IA), `EXCALISIDIAN_IA_URL`
  (padrão `https://openrouter.ai/api/v1`) e `EXCALISIDIAN_IA_MODELO` (padrão
  `deepseek/deepseek-v4.1-flash`).
- Quem grava é o dono do produto, com `sudo excalisidian-configurar-ia`. A chave nunca passa
  pelo repositório, pelo app nem pela conversa com o assistente.
- Sem chave, só as rotas de IA respondem 503; conta e sincronização seguem normais.
- A chave nunca vai para log. O nome do fornecedor nunca aparece na interface nem nas respostas.

### 5.4 Privacidade

O texto das notas passa pelo servidor e pelo OpenRouter, e por um provedor que não guarda nem
treina com os dados (`data_collection: deny`), mas não é guardado nem registrado em log no
servidor (o log segue como em §3: método, rota, status, duração). A pendência de GDPR segue
aberta (doc 09, Parte 3, item 31); não bloqueia o uso no Brasil.

---

## 6. O que o app muda

- `BASE_URL_SERVICO` passa a ser `https://api.excalisidian.com`, e o escopo de rede do Tauri
  troca `api.excalisidian.app` por `api.excalisidian.com`.
- Em desenvolvimento, o padrão continua sendo a conta de teste e o servidor local (doc 17 §10).
  Com a variável `VITE_SERVIDOR=real`, o modo de desenvolvimento usa o servidor de verdade.
