# Motor da sincronização — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ligar as peças do plano 08 ao vault: o estado por computador, a aplicação de
mudanças no disco com o efeito visível correto, o ciclo baixar → detectar → enviar, e o
agendador. Ao fim, dois "computadores" simulados em teste sincronizam um vault pelo servidor
falso, com conflito, exclusão e renomeação se comportando como o doc 17 manda.

**Architecture:** `src/sync/motor.ts` tem o ciclo como função que recebe tudo por parâmetro
(adaptador, servidor, chave, estado, efeitos, relógio) — testável sem Tauri. `src/estado/syncStore.ts`
é a casca: carrega o estado, agenda ciclos e expõe o status para a interface (plano 10).

**Tech Stack:** TypeScript, zustand, `@tauri-apps/plugin-store` (estado fora do vault, como
`src/indice/cache.ts`), vitest.

**Spec:** `docs/17-sincronizacao.md` (normativo) — seções 4.4, 5, 6 e 10. Depende do plano 08
(`src/sync/pacote.ts`, `formato.ts`, `decisoes.ts`, `ServicoSync.ts`, `ServicoSyncFake.ts`):
**leia esses arquivos reais antes de começar** — nomes podem ter mudado em relação ao plano 08.

## Global Constraints

- Português do Brasil em nomes e comentários. Caminhos com `/` e NFC.
- Testes só de módulos puros ou de stores com dependências mockadas (padrão de
  `src/estado/contaStore.test.ts`) — sem jsdom, sem `.test.tsx`. Todo teste novo é escrito
  ANTES e visto falhando.
- **Lição de 23/09 (obrigatória):** todo teste que grava arquivo verifica também o efeito
  visível — árvore recarregada, índice atualizado, aba aberta recarregada, autosave pendente
  cancelado antes da escrita. Teste que só olha o disco não basta.
- Toda escrita no vault pelo `VaultAdapter`. Nenhuma chave, senha ou conteúdo decifrado em log.
- **Guarda de higiene de commit:** trabalho não commitado do usuário em `src/editor/`,
  `src/layout/AbaDocumento.tsx`, arquivos não rastreados do glossário e documentos não
  rastreados em `docs/superpowers/`. Não toque. `git status --short` e
  `git diff --cached --stat` antes de cada commit; `git add` só com caminho explícito; nunca
  `git add -A`, `git add .` ou `git commit -a`. `index.lock`: espere e tente de novo.
- Não suba o app.

---

### Task 1: Efeitos de gravação compartilhados e adaptador em memória (sonnet, medium)

**Por quê:** a resolução de conflito (`src/estado/conflitosStore.ts`, `DepsResolucao` /
`depsReais`) já sabe fazer "cancelar autosave → gravar → recarregar árvore → reindexar →
recarregar aba". O motor precisa exatamente disso. Não pode haver duas cópias dessa regra.

**Files:** criar `src/vault/efeitosDeGravacao.ts` (+ teste) e `src/vault/VaultAdapterMemoria.ts`
(+ teste); modificar `src/estado/conflitosStore.ts` para usar o módulo novo (sem mudar
comportamento — os testes existentes dele têm que passar sem afrouxar).

- [ ] `efeitosDeGravacao.ts`: interface `EfeitosDeGravacao` (`cancelarAutosavePendente`,
  `recarregarArvore`, `reindexarArquivo`, `recarregarDoDisco`, e `moverParaLixeira(caminho)` que
  delega a `excluir` de `src/vault/lixeira.ts`) com `efeitosReais()`, e uma função
  `gravarComEfeitos(adaptador, efeitos, caminho, conteudo: string | Uint8Array)` que faz a
  sequência inteira (cancela antes, grava texto ou binário, e depois árvore/índice/aba). Uma
  variante em lote é bem-vinda (recarregar a árvore uma vez só para N arquivos).
- [ ] `conflitosStore` passa a usar isso; `DepsResolucao` vira (ou reexporta) `EfeitosDeGravacao`.
- [ ] `VaultAdapterMemoria`: implementação completa de `VaultAdapter` em memória (leia
  `src/vault/VaultAdapter.ts` inteiro), com `mtimeMs` crescente a cada escrita e `listar()`
  coerente. É usado pelos testes das Tasks 3–5. Teste o próprio adaptador (escrever/ler/mover/
  remover/listar/existe).
- [ ] Commit: `refactor(vault): efeitos de gravacao compartilhados e adaptador em memoria`.

### Task 2: Estado por computador (sonnet, low)

**Files:** criar `src/sync/estadoSync.ts` (+ teste).

- [ ] Tipo `EstadoSync` exatamente como o doc 17 §5 (inclui `hashesConhecidos` e
  `conflitosPendentes`). Persistência por vault em `plugin-store`, arquivo
  `sync-<hashVault(raiz)>.json` (reuse `hashVault` de `src/indice/cache.ts`), com versão de
  formato; ler devolve `null` se ausente ou versão diferente. `esquecer(raiz)` apaga o arquivo
  (usado por "parar de sincronizar").
- [ ] Nome do computador: `lerNomeDoComputador()` / `gravarNomeDoComputador()` em
  `settings.json` (padrão: `nomeUsuario` do comando Rust `nome_usuario` + " (este computador)" —
  veja como a tela Início já lê o nome do usuário e reuse).
- [ ] Testes com `plugin-store` mockado (padrão de `contaStore.test.ts`): ida e volta, versão
  errada vira `null`, esquecer apaga.
- [ ] Commit: `feat(sync): estado de sincronizacao por computador`.

### Task 3: Aplicar o que chegou (sonnet, medium)

**Files:** criar `src/sync/aplicar.ts` (+ teste).

- [ ] `aplicarLote(ctx, lote)` — para cada mudança, lê o hash local (usando
  `hashesConhecidos` para não reler arquivo que não mudou), consulta `acaoParaRemota` de
  `decisoes.ts` e executa: gravar/recriar com `gravarComEfeitos`; mover para a lixeira com
  `efeitos.moverParaLixeira`; conflito → grava em `estado.conflitosPendentes` e registra na
  `conflitosStore` (texto: nota ou desenho, com `dispositivo` e `criadoEm` do lote);
  **binário em conflito** → "manter as duas" automático: a versão remota é gravada ao lado com
  o nome de conflito (reuse `nomeDaCopiaDeConflito` de `src/sync/nomeDeConflito.ts` e
  `caminhoLivre`), a local fica, e `bases` passa a ser o hash remoto para o caminho original
  (o próximo ciclo reenvia a local por cima — é a regra "manter as duas"); só-atualizar-base;
  manter-local-e-reenviar (não toca o disco, não muda `bases`).
- [ ] Atualiza `bases` e `hashesConhecidos` conforme cada ação.
- [ ] Antes de aplicar, `documentosStore.flushTudo()` (via efeitos injetados) para o hash local
  refletir o que está na tela.
- [ ] Testes com `VaultAdapterMemoria` e efeitos falsos que registram chamadas: **uma por
  linha da tabela do doc 17 §6**, verificando disco E efeitos visíveis E `bases`; binário em
  conflito gera a cópia com o nome certo; conflito de texto vai para `conflitosPendentes` e
  para a fila da tela.
- [ ] Commit: `feat(sync): aplicar mudancas remotas no vault`.

### Task 4: O ciclo (sonnet, medium)

**Files:** criar `src/sync/motor.ts` (+ teste de integração com dois computadores).

- [ ] `executarCiclo(ctx)`, na ordem do doc 17 §5: baixar (retrato se vier, lotes em ordem,
  cada um `abrir` + `lerLote` + `aplicarLote`, avançando `cursor`); detectar
  (`mudancasLocais` sobre os hashes atuais, excluindo `conflitosPendentes`, arquivos acima de
  `TAMANHO_MAXIMO_SINCRONIZAVEL` — devolvidos numa lista `foraDaSincronizacao` para a tela);
  enviar (`dividirEmLotes` → `lacrar` com AAD da sequência esperada → `enviarLote(esperoUltima)`;
  em `fora-de-ordem`, volta ao baixar, no máximo 5 tentativas, depois erro); guardar.
  **Atenção ao AAD do lote:** a sequência só é conhecida depois que o servidor aceita. Resolva
  sem inventar protocolo: o AAD usa a sequência **esperada** (`esperoUltima + 1`), que é
  exatamente a que o servidor atribui quando aceita (e se recusar, o lote é refeito). Comente
  isso no código.
- [ ] Conflitos resolvidos: no começo do ciclo, todo caminho de `conflitosPendentes` que não está
  mais na `conflitosStore` sai de lá e tem `bases[caminho] = hashRemoto`.
- [ ] Retrato: depois de enviar, se o diário passou de 200 lotes ou 50 MiB desde o último
  retrato, monta o retrato do estado atual e envia em partes (AAD com índice).
- [ ] Início de vault novo no servidor: `iniciarVault(...)` — gera `chaveDoVault`, cifra nome e
  envelope (`envelopar`), `criarVault`, envia retrato inicial. Baixar para pasta vazia:
  `baixarVault(...)` — abre envelope, baixa retrato + lotes e grava tudo.
- [ ] Testes de integração com `ServicoSyncFake`, dois `VaultAdapterMemoria` (A e B), a mesma
  chave e efeitos falsos — **todos os casos do doc 17 §10**: criar em A aparece em B; editar em
  A atualiza B; editar nos dois vira conflito em B com as duas versões certas; resolver o
  conflito em B e o resultado chega a A; apagar em A com edição em B mantém a nota em B e ela
  volta para A; renomear em A aparece renomeado em B (e o antigo vai para a lixeira de B);
  A e B enviando "ao mesmo tempo" (forçar `fora-de-ordem`) não perdem nenhuma mudança;
  computador novo C recebe tudo de retrato + lotes; conflito pendente sobrevive a "fechar e
  abrir" (recarregar o estado) e não é sobrescrito; arquivo acima do limite fica fora e é
  listado; binário em conflito vira duas cópias.
- [ ] Commit: `feat(sync): ciclo de sincronizacao`.

### Task 5: Agendador e status (sonnet, medium)

**Files:** criar `src/estado/syncStore.ts` (+ teste).

- [ ] Estado exposto: `status: "desligado" | "sincronizado" | "sincronizando" | "sem-conexao" | "pausado" | { erro: CodigoFalhaSync }`,
  `ultimoCiclo`, `foraDaSincronizacao`.
- [ ] `iniciar(raiz)`: lê o estado; se não houver, `desligado`. Se houver: re-registra
  `conflitosPendentes` na `conflitosStore` e agenda. `parar()` ao trocar/fechar vault.
- [ ] Gatilhos: ao iniciar; 5 s depois de qualquer mudança no vault (descubra o sinal
  confiável: o watcher ignora as gravações do próprio app, mas todo salvamento chama
  `vaultStore.reindexarArquivo` — assinar mudanças do índice no `vaultStore` é o candidato;
  confirme lendo o código e documente a escolha); a cada 60 s; `sincronizarAgora()`. **Um ciclo
  por vez** — pedido durante um ciclo marca "rodar de novo ao terminar", não roda em paralelo.
- [ ] Falhas: `rede` → `sem-conexao` e tenta de novo no próximo gatilho; `sessao`, `plano`,
  `espaco` → `{ erro }` e para de agendar até algo mudar (novo login, `sincronizarAgora`).
- [ ] Sem chave disponível (plano 10 ainda não existe): o store recebe a `chaveDoVault` por
  parâmetro em `iniciar`; o plano 10 liga ao cofre.
- [ ] Testes com timers falsos: um ciclo por vez; pedido durante ciclo gera exatamente mais um;
  60 s dispara; mudança no índice dispara após 5 s (e várias mudanças seguidas geram um só);
  `rede` vira `sem-conexao` e se recupera; `plano` para de agendar.
- [ ] Commit: `feat(sync): agendador e status da sincronizacao`.

### Task 6: Documentação (sonnet, low)

- [ ] docs/05: módulos novos na árvore de `src/sync/`, `src/vault/`, `src/estado/`; tirar
  "(planejado)" do que o plano 08 entregou. docs/08 Fatia 15 e ADR-40: estado real = "motor
  pronto e testado com servidor falso; falta a tela e o servidor de verdade (plano 10)".
- [ ] Commit: `docs: motor da sincronizacao pronto (plano 09)`.

## Fora deste plano (plano 10)

Cofre da `chaveDeEnvelope`, seção Sincronização nas Configurações (ligar, baixar para pasta
vazia, parar, apagar do servidor, nome do computador, arquivos fora), ícone de estado no rodapé,
catálogo `sync.ts`, `ServicoSyncHttp`.
