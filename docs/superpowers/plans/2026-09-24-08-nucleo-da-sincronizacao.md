# Núcleo da sincronização — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** as peças puras da sincronização descrita em `docs/17-sincronizacao.md`: cifra dos
pacotes, formato de lote e retrato, as duas decisões (o que mudou aqui; o que fazer com o que
chegou) e o servidor falso. Nada de tela, nada de disco, nada de rede — tudo testável no vitest.

**Architecture:** módulos novos em `src/sync/` (a pasta já tem a tela de conflitos). Cada um é
puro ou recebe suas dependências por parâmetro. O plano 09 monta o motor com estas peças; o
plano 10 liga à interface.

**Tech Stack:** TypeScript, WebCrypto (`globalThis.crypto.subtle`, igual no WebView2 e no node
24 dos testes), `CompressionStream`/`DecompressionStream` (idem), vitest. **Nenhuma dependência
nova.**

**Spec:** `docs/17-sincronizacao.md` (normativo). Leia as seções 2, 3, 4, 6 e 9 antes de
qualquer tarefa.

## Global Constraints

- Português do Brasil em nomes de arquivo, funções, variáveis e comentários.
- Caminhos internos com `/` e NFC.
- Testes só de módulos puros — sem jsdom, sem `.test.tsx`. Todo teste novo é escrito ANTES da
  implementação e visto falhando.
- Nenhuma chave, conteúdo decifrado ou senha em `console`, log ou mensagem de erro.
- **Guarda de higiene de commit:** trabalho não commitado do usuário em `src/editor/`
  (modificados e `caminhoDaNota*.ts` não rastreados), `src/layout/AbaDocumento.tsx`, arquivos
  não rastreados do glossário e documentos não rastreados em `docs/superpowers/`. Não toque.
  Antes de cada commit, `git status --short` e `git diff --cached --stat`; `git add` só com
  caminho explícito; nunca `git add -A`, `git add .` ou `git commit -a`. Se o commit falhar por
  `index.lock`, espere e tente de novo; nunca apague o lock.
- Não suba o app.

---

### Task 1: Documentação (sonnet, low)

**Files:** `docs/17-sincronizacao.md` (já escrito pelo planejador — só commitar), 
`docs/09-decisoes-e-incertezas.md` (novo ADR-40), `docs/05-arquitetura-e-stack.md` (estrutura
de pastas, se listar `src/sync/`), `docs/08-roadmap.md` (Fatias 13 e 15).

- [ ] ADR-40 · "Sincronização como diário de pacotes lacrados", no estilo dos vizinhos,
  resumindo as decisões técnicas do doc 17: diário de lotes e retratos numerados pelo servidor;
  AES-256-GCM da WebCrypto com AAD; preenchimento em escada de 16 KiB a 8 MiB; uma
  `chaveDoVault` aleatória por vault, envelopada pela `chaveDeEnvelope`; cada computador com a
  própria lixeira; apagar nunca vence editar; binário em conflito vira "manter as duas";
  limites de 8 MiB por pacote e 7 MiB por arquivo (arquivo maior fica só local); retrato a cada 200 lotes ou 50 MiB.
  **Limite honesto** (seção 3 do doc 17): o servidor vê quantos pacotes, de que tamanho
  arredondado e quando — sabe aproximadamente quanto e quando a pessoa escreve, mas não o quê,
  nem quantas notas. Alternativas rejeitadas (as que o planejador de fato considerou — não
  invente outras): um pacote cifrado por arquivo (o número de pacotes revelaria quantas notas
  existem, contrariando o ADR-32); XChaCha20-Poly1305 via `@noble/ciphers` (dependência a mais
  sem ganho sobre a WebCrypto nativa, que já está no WebView2 e no node); sincronizar a lixeira
  (uma exclusão viraria duas mudanças que se cruzam no outro computador). Estado real: desenho
  fechado, núcleo em construção (este plano). Linguagem para quem não é técnico.
- [ ] ADR-32: na linha de estado, citar o doc 17 e o ADR-40 como o desenho da sincronização.
- [ ] docs/08: Fatia 13, a linha "Só o token é persistido, em `settings.json`, texto puro (ver
  Fatia 14)" está desatualizada — o token mora no cofre do Windows desde o plano 05; corrija.
  Fatia 15: estado real passa a citar o doc 17 e este plano ("núcleo em construção").
- [ ] docs/05: se houver árvore de pastas com `src/sync/`, acrescentar os módulos novos deste
  plano como planejados.
- [ ] Commit (inclui `docs/17-sincronizacao.md`): `docs: desenho da sincronizacao (doc 17, ADR-40)`.

### Task 2: Pacote lacrado (sonnet, medium)

**Files:** criar `src/sync/pacote.ts` e `src/sync/pacote.test.ts`.

Funções (nomes podem ser ajustados, a semântica não):

- `ESCADA` — tamanhos 16 KiB, 32 KiB, … 8 MiB. `preencher(bytes)` → `bytes ‖ 0x80 ‖ 0x00…`
  até o menor degrau que caiba (inclusive o `0x80`); lança se não couber em 8 MiB.
  `despreencher(bytes)` → remove do último `0x80` em diante; lança se o formato estiver errado.
- `gerarChaveDoVault(): Promise<Uint8Array>` — 32 bytes de `crypto.getRandomValues`.
- `lacrar(chave: Uint8Array, dados: Uint8Array, aad: Uint8Array): Promise<Uint8Array>` —
  preenche, AES-256-GCM com nonce aleatório de 12 bytes, devolve `nonce ‖ cifrado`.
- `abrir(chave, pacote, aad): Promise<Uint8Array>` — inverso; qualquer falha vira um erro
  próprio `PacoteInvalido` (sem detalhe que ajude um atacante, sem conteúdo).
- `aadDe(idDoVault, tipo: "lote" | "retrato" | "nome" | "envelope", indice?: number)` —
  bytes estáveis (ex.: UTF-8 de `excalisidian-sync-v1|<id>|<tipo>|<indice>`); o prefixo é
  literal congelado, não o `APP_ID` (mesmo motivo do sal no plano 06).
- `envelopar(chaveDeEnvelope, chaveDoVault, idDoVault)` / `abrirEnvelope(...)` — `lacrar`/`abrir`
  com AAD de tipo `envelope`. (O envelope não precisa de escada, mas usar `lacrar` simplifica;
  aceitável.)
- Importar a chave com `crypto.subtle.importKey("raw", …, "AES-GCM", false, [...])`.

Testes (antes, vistos falhando): ida e volta; tamanhos cifrados sempre = degrau + 12 + 16;
um byte trocado não abre; AAD de outro vault, outro tipo ou outro índice não abre; chave errada
não abre; `preencher` de exatamente o limite de um degrau sobe para o próximo; > 8 MiB lança;
duas lacradas do mesmo conteúdo dão bytes diferentes (nonce aleatório); `PacoteInvalido` não
carrega texto do conteúdo.

- [ ] Commit: `feat(sync): pacote lacrado com aes-gcm e preenchimento em escada`.

### Task 3: Formato de lote e retrato (sonnet, medium)

**Files:** criar `src/sync/formato.ts` e `src/sync/formato.test.ts`.

- Tipos `Lote`, `Mudanca`, `Retrato` exatamente como no doc 17 §4.1–4.2.
- `serializarLote(lote): Promise<Uint8Array>` / `lerLote(bytes)`: JSON com `conteudo` em
  base64, gzip via `CompressionStream`. `lerLote` valida a forma (versão 1, tipos certos,
  caminhos com `/`, hash em hex de 64) e lança erro próprio se inválido.
- `dividirEmLotes(mudancas, dispositivo, criadoEm): Lote[]` — agrupa para que cada lote
  serializado caiba num pacote de 8 MiB depois do gzip e do preenchimento. Como o gzip é
  imprevisível, use o tamanho **não comprimido** como limite conservador (≈ 7 MiB); uma única
  mudança maior que isso não pode existir: arquivos acima de 7 MiB ficam fora da sincronização
  (doc 17 §4.4). Exporte a constante `TAMANHO_MAXIMO_SINCRONIZAVEL = 7 * 1024 * 1024` e faça
  `dividirEmLotes` lançar se receber uma mudança maior (o chamador filtra antes).
- `serializarRetrato` / `lerRetrato` e `dividirRetrato(retrato): Retrato[]` em partes de até
  ≈ 7 MiB não comprimidos, cada parte com a mesma `ateSequencia`, para lacrar com índice.
- `hashDe(bytes): Promise<string>` — SHA-256 em hex minúsculo, via `crypto.subtle.digest`.

Testes (antes, vistos falhando): ida e volta de lote com texto (acentos, NFC) e binário;
`lerLote` recusa versão errada, hash malformado, caminho com `\`; `dividirEmLotes` nunca passa
do limite e preserva a ordem das mudanças; retrato grande sai em partes que remontam o original;
`hashDe` bate com um vetor conhecido (SHA-256 de "abc" =
`ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`).

- [ ] Commit: `feat(sync): formato de lote e retrato`.

### Task 4: As duas decisões (sonnet, medium)

**Files:** criar `src/sync/decisoes.ts` e `src/sync/decisoes.test.ts`.

- `mudancasLocais(atual: Map<string, string>, bases: Record<string,string>, emConflito: Set<string>)`
  → lista de `{ tipo: "gravar", caminho, base } | { tipo: "apagar", caminho, base }` sem
  conteúdo (o motor lê o conteúdo depois). `atual` = caminho → hash do disco. Ignora caminhos
  em conflito aberto. Ignora `.trash/…` e `*.excalisidian-tmp` (use a constante `EXT_TMP` de
  `src/app/constantes.ts`).
- `acaoParaRemota(mudanca: Mudanca, local: string | null, base: string | null, apagadoAquiDesdeBase: boolean)`
  → uma das ações: `"gravar"`, `"so-atualizar-base"`, `"conflito"`, `"mover-para-lixeira"`,
  `"manter-local-e-reenviar"`, `"recriar"`. Implementa **exatamente** a tabela do doc 17 §6.
  Leia a tabela linha a linha e cubra cada linha com um teste com o nome da linha.
- `ehBinario(caminho)` — `true` para tudo que não é `.md` (inclui `.draw.md` como texto).

Testes (antes, vistos falhando): um teste por linha da tabela do §6; `mudancasLocais` com
arquivo novo, editado, apagado, igual, em conflito, na lixeira e temporário.

- [ ] Commit: `feat(sync): decisoes de mudanca local e de mudanca remota`.

### Task 5: Contrato do servidor e servidor falso (sonnet, medium)

**Files:** criar `src/sync/ServicoSync.ts`, `src/sync/ServicoSyncFake.ts`,
`src/sync/ServicoSyncFake.test.ts`; erro `FalhaSync` com códigos (`"fora-de-ordem"`,
`"sessao"`, `"plano"`, `"espaco"`, `"rede"`, `"servidor"`, `"nao-encontrado"`) no mesmo arquivo
de tipos que fizer sentido (siga o padrão de `src/conta/tipos.ts`).

- Interface exatamente como o doc 17 §9.
- O fake guarda tudo em memória, numera lotes a partir de 1, e **recusa** `enviarLote` com
  `fora-de-ordem` se `esperoUltima` não for a última sequência. `enviarRetrato` descarta os
  lotes com sequência ≤ `ateSequencia`; `baixar(id, apos)` devolve o retrato quando `apos` é
  menor que a sequência do retrato (o cliente está atrás do que foi descartado), senão só os
  lotes depois de `apos`. Guarda cópias dos `Uint8Array` (o chamador pode mutar os dele).
- Construtor aceita opções para simular falha (`rede`, `plano`, `espaco`) nos testes do plano 09.
- O fake nunca decifra nada — ele não tem chave, igual ao servidor real.

Testes (antes, vistos falhando): sequência cresce; envio com `esperoUltima` velho é recusado e
não grava; baixar depois de um retrato devolve retrato + lotes posteriores; cópias defensivas;
listar/criar/apagar vault.

- [ ] Commit: `feat(sync): contrato do servidor e servidor falso`.

---

## Fora deste plano

- O motor (estado por computador, o ciclo, a aplicação no disco com o efeito visível, o
  agendamento): plano 09.
- Cofre para a `chaveDeEnvelope`, tela de Configurações, ícone de estado, `ServicoSyncHttp`:
  plano 10.
