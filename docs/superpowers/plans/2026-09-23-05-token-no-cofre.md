# Token da conta no cofre do sistema — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** tirar o token da conta do `settings.json` (texto puro) e guardá-lo no cofre de
credenciais do Windows, cumprindo o ADR-34 e a Fatia 14 do roadmap. Quem já tem o token em
texto puro é migrado sem perceber.

**Architecture:** três comandos Rust novos (`ler_token_conta`, `gravar_token_conta`,
`apagar_token_conta`) em `src-tauri/src/cofre.rs`, usando `keyring-core` com a loja nativa do
Windows. No TypeScript, uma interface `CofreToken` com implementação real (via `invoke`) e
fake (testes). O `contaStore` troca `gravarToken`/leitura do `settings.json` pelo cofre, e na
primeira leitura migra o token legado e apaga a chave `tokenConta` do `settings.json`.

**Tech Stack:** Rust (`keyring-core` 1.x, `windows-native-keyring-store`), Tauri 2 `invoke`,
TypeScript, zustand, vitest.

**Spec:** ADR-34 em `docs/09-decisoes-e-incertezas.md`; Fatia 14 em `docs/08-roadmap.md`.

## Pesquisa que sustenta o plano (23/09/2026)

- O crate `keyring` foi reorganizado na v4: o recomendado para aplicações é depender de
  `keyring-core` (1.0.0) e da loja específica de cada plataforma. Uso:
  `keyring_core::set_default_store(windows_native_keyring_store::Store::new()?)`, depois
  `Entry::new(servico, usuario)?` com `set_password`, `get_password`, `delete_credential`.
  Credencial inexistente devolve `Error::NoEntry`.
- A loja do Windows tem três tipos de persistência: `Session`, `Local` e `Enterprise`
  (**padrão**, e que viaja entre máquinas de um domínio corporativo). Queremos `Local`: a
  sessão pertence a esta máquina. A persistência é escolhida por um modificador na criação da
  entrada — **o implementador confirma a assinatura exata em docs.rs antes de escrever**, e
  registra no relatório o que encontrou.
- O Windows limita o segredo a `CRED_MAX_CREDENTIAL_BLOB_SIZE` = 2560 bytes. O servidor ainda
  não existe, então o tamanho do token não é conhecido; gravar um token maior falha, e essa
  falha segue a regra de "cofre indisponível" abaixo.
- O app só gera instalador para Windows (`bundle.targets = ["nsis"]`). Em outros sistemas os
  comandos compilam e devolvem erro "cofre indisponível", sem dependência de loja.
- A superfície Rust passa de 13 para 16 comandos. O ADR-5 já registra que o limite original
  de quatro foi ultrapassado e aceito (doc 05 §3); este plano só atualiza a tabela.

## Decisões de comportamento (tomadas aqui, registradas no ADR-34 pela Task 1)

1. **Nunca há volta para texto puro.** Se o cofre falhar ao gravar, a sessão vale só enquanto
   o app estiver aberto; na próxima abertura o usuário entra de novo. É o preço de a promessa
   "o token nunca aparece em texto puro em disco" não ter exceção.
2. **Falha do cofre não aparece como erro de login.** `entrar`/`criar` que deram certo no
   servidor continuam dando certo para o usuário, mesmo que gravar no cofre falhe. Só um
   `console.warn`, sem texto de interface novo.
3. **Migração silenciosa, uma vez.** Na primeira leitura: se `tokenConta` existe no
   `settings.json`, ele é gravado no cofre (se o cofre ainda não tiver um token) e **apagado
   do `settings.json` em qualquer caso** — mesmo que o cofre falhe. Nesse caso a sessão
   daquela abertura ainda funciona (o token está em memória) e a próxima pede login.
4. **Nome da entrada no cofre:** serviço = identificador do app no `tauri.conf.json`
   (`app.config().identifier`, hoje `com.excalisidian.app`), usuário = `sessao-conta`. Assim o
   nome sai de uma fonte única e acompanha uma eventual troca de nome do produto (ADR-9), sem
   repetir o `APP_ID` no Rust. O WebView **não escolhe** o nome da entrada: os comandos não
   recebem serviço nem usuário como parâmetro, então não servem para ler outras credenciais
   do Windows.
5. **Chaves de API dos seis provedores continuam como estão** (ADR-34, decisão do usuário).

## Global Constraints

- Português do Brasil em nomes de arquivo, funções, variáveis e comentários.
- Nenhum texto de interface novo (decisão 2). Se algum aparecer, entra no catálogo i18n.
- Testes só de módulos puros — sem jsdom, sem `.test.tsx`.
- O app funciona inteiro sem conta; nada disso roda para quem nunca entrou (o `carregar()`
  sem token não faz nada além de ler).
- **Guarda de higiene de commit:** há trabalho não commitado do usuário em `src/editor/`,
  `src/layout/AbaDocumento.tsx`, arquivos não rastreados do glossário e dois documentos não
  rastreados em `docs/superpowers/`. Não toque. Antes de cada commit, `git status --short` e
  `git diff --cached --stat`; `git add` só com caminho explícito; nunca `git add -A`,
  `git add .` ou `git commit -a`.
- Documentação antes do código (pedido do usuário): a Task 1 não toca em código.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src-tauri/src/cofre.rs` | Os três comandos. Único lugar que conhece `keyring-core`. |
| `src-tauri/src/lib.rs` | Registra o módulo e os três comandos. |
| `src-tauri/Cargo.toml` | `keyring-core` e, só em Windows, `windows-native-keyring-store`. |
| `src/conta/cofreToken.ts` | Interface `CofreToken` + `CofreTokenSistema` (via `invoke`). |
| `src/conta/CofreTokenFake.ts` | Implementação em memória, com modo "falha" para teste. |
| `src/conta/migracaoToken.ts` | Função pura `lerTokenComMigracao`. |
| `src/estado/contaStore.ts` | Troca o `settings.json` pelo cofre. |

---

### Task 1: Documentação (sonnet, low)

**Files:** `docs/09-decisoes-e-incertezas.md` (ADR-34), `docs/05-arquitetura-e-stack.md`
(§1 tabela de stack se listar crates, §3 tabela de comandos, §7 tabela de stores),
`docs/08-roadmap.md` (Fatia 14).

- [ ] ADR-34: acrescentar seção "Como será implementado (plano de 23/09/2026)" com as cinco
  decisões acima, em linguagem para quem não é técnico. Estado continua "NÃO implementado"
  até a Task 4; acrescente que existe plano escrito
  (`docs/superpowers/plans/2026-09-23-05-token-no-cofre.md`) e retire a frase "Não existe
  ainda um plano escrito".
- [ ] docs/05 §3: a frase "são treze comandos" passa a dizer dezesseis, e a tabela ganha as
  três linhas: `ler_token_conta` `(app) -> Result<Option<String>, String>`,
  `gravar_token_conta` `(app, token: String) -> Result<(), String>`, `apagar_token_conta`
  `(app) -> Result<(), String>`, com o "por quê": token da conta no cofre do Windows (ADR-34).
  Marque as três como "planejado" até a Task 4 terminar (a Task 4 remove a marca).
- [ ] docs/05 §7: a linha do `contaStore` passa a dizer "só o token persiste, no cofre do
  Windows (ADR-34); se o cofre falhar, a sessão vale só até fechar o app" — marcada como
  planejada até a Task 4.
- [ ] docs/08 Fatia 14: "Estado real: plano escrito, não começada".
- [ ] Commit: `docs: plano do token no cofre do sistema (ADR-34)`.

### Task 2: Comandos Rust (sonnet, medium)

**Files:** criar `src-tauri/src/cofre.rs`; modificar `src-tauri/src/lib.rs`,
`src-tauri/Cargo.toml`.

- [ ] Confirmar em docs.rs as versões atuais e a API de persistência de
  `windows-native-keyring-store` (como pedir `Local`). Registrar no relatório.
- [ ] `Cargo.toml`: `keyring-core = "1"` em `[dependencies]`; a loja em
  `[target.'cfg(windows)'.dependencies]`.
- [ ] `cofre.rs`:
  - Inicialização da loja uma única vez (`std::sync::OnceLock`), preguiçosa, no primeiro
    comando — não no `setup`, para não custar nada a quem nunca entra numa conta.
  - Função interna `entrada(app) -> Result<Entry, String>` com serviço =
    `app.config().identifier` e usuário = `"sessao-conta"`, persistência `Local`.
  - `ler_token_conta`: `NoEntry` → `Ok(None)`; outro erro → `Err(texto)`.
  - `gravar_token_conta(token)`: recusa token vazio com `Err`.
  - `apagar_token_conta`: `NoEntry` → `Ok(())` (apagar o que não existe não é erro).
  - Em `cfg(not(windows))`: os três devolvem `Err("cofre indisponível neste sistema")`.
  - Comentário no topo explicando por que os comandos não recebem serviço/usuário (decisão 4).
- [ ] `lib.rs`: `mod cofre;` e os três no `generate_handler!`.
- [ ] Verificar se comandos próprios exigem permissão em `capabilities/main.json` do jeito que
  os 13 atuais estão (seguir o mesmo padrão; não inventar).
- [ ] `cargo check` em `src-tauri` e `npm run build` limpos.
- [ ] Commit: `feat(conta): comandos rust do cofre de credenciais para o token`.

### Task 3: Interface TypeScript e migração pura (sonnet, medium)

**Files:** criar `src/conta/cofreToken.ts`, `src/conta/CofreTokenFake.ts`,
`src/conta/migracaoToken.ts`, `src/conta/migracaoToken.test.ts`.

- [ ] `CofreToken`: `ler(): Promise<string | null>`, `gravar(token: string): Promise<void>`,
  `apagar(): Promise<void>`. `CofreTokenSistema` chama os três comandos via
  `invoke` de `@tauri-apps/api/core`.
- [ ] `CofreTokenFake`: guarda em memória; flag pública `falhar` que faz os três rejeitarem.
- [ ] `lerTokenComMigracao(cofre, legado: { ler(): Promise<string | null>; apagar():
  Promise<void> }): Promise<string | null>` — decisão 3:
  1. lê o cofre; erro de leitura conta como "sem token no cofre";
  2. lê o legado; se houver, e o cofre estava vazio, tenta gravar no cofre (erro engolido);
  3. se havia legado, apaga o legado **sempre**;
  4. devolve o token do cofre, ou o legado, ou `null`.
- [ ] Testes escritos antes e vistos falhando: sem nada → null e nenhuma escrita; só cofre →
  devolve, legado intocado; só legado → grava no cofre, apaga legado, devolve; os dois → fica
  o do cofre, legado apagado, cofre não é regravado; cofre falhando na gravação → legado
  apagado mesmo assim, devolve o legado; cofre falhando na leitura com legado → devolve o
  legado e apaga legado.
- [ ] Commit: `feat(conta): cofre de token e migracao do settings.json`.

### Task 4: `contaStore` usa o cofre (sonnet, medium)

**Files:** `src/estado/contaStore.ts`, `src/estado/contaStore.test.ts`, docs da Task 1.

- [ ] Estado ganha `cofre: CofreToken` (padrão `CofreTokenSistema`) e
  `definirCofre(c: CofreToken)`, no mesmo molde de `servico`/`definirServico`.
- [ ] `gravarToken(token)` passa a usar o cofre (`gravar` ou `apagar`), e **nunca rejeita**:
  erro vira `console.warn` (decisão 2). O `settings.json` não recebe mais `tokenConta`.
- [ ] `carregar()` lê pelo `lerTokenComMigracao`, com o legado sendo a chave `tokenConta` do
  `settings.json` (`get`, e `delete` + `save` para apagar). Toda a lógica de geração,
  `expirada` e silêncio continua igual — o comentário sobre janelas passa a citar o cofre em
  vez do `settings.json` compartilhado (o cofre também é compartilhado entre janelas).
- [ ] Testes: os existentes continuam passando, adaptados para ler o token do
  `CofreTokenFake` em vez de `guardados.tokenConta`. Novos: depois de `entrar`, o cofre tem o
  token e `guardados.tokenConta` é `undefined`; `entrar` com cofre falhando devolve `true` e a
  sessão existe; `carregar()` com token só no legado migra e apaga o legado; `sair` apaga do
  cofre.
- [ ] Docs: tirar as marcas "planejado" da Task 1 no doc 05; ADR-34 e Fatia 14 passam a
  "implementado em <data>, commits <hashes>"; a Fatia 14 mantém a observação das chaves de
  API em texto puro.
- [ ] `npm test`, `npm run build`, `cargo check` limpos.
- [ ] Commit: `feat(conta): token da sessao passa a morar no cofre do windows`.

### Task 5: Verificação no Windows real (orquestrador, sem subagente)

- [ ] Com o app rodando pelo usuário (não subir outro servidor sem pedir), depois de entrar
  numa conta de teste: `cmdkey /list` mostra uma entrada com o identificador do app, e
  `settings.json` em `%APPDATA%` não contém `tokenConta`. Depois de sair: a entrada some.
- [ ] Hoje não existe servidor de conta; se não houver como entrar, esta task fica pendente e
  vai para a lista de conferência manual do usuário, dita com clareza no relatório.
