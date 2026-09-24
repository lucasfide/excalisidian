# Sincronização na tela — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a pessoa consegue ligar a sincronização de um vault, baixar um vault sincronizado
para uma pasta vazia, ver o estado e parar — tudo pelas Configurações, como o doc 17 §7–8
descreve. E o dono do produto consegue **testar de verdade** sem servidor: no modo de
desenvolvimento, um servidor de teste local grava os pacotes numa pasta do computador, e duas
janelas do app (dois vaults) sincronizam entre si.

**Architecture:** o cofre do Windows ganha a `chaveDeEnvelope` ao lado do token; o
`syncStore` (plano 09) é ligado ao ciclo de vida do vault aberto; a seção "Sincronização" nas
Configurações e um ícone no rodapé da barra lateral leem o `syncStore`. `ServicoSyncHttp` é
escrito contra o contrato do doc 17 §9 (ainda sem servidor real); em DEV, `ServicoSyncLocal`
substitui o servidor.

**Tech Stack:** Rust (`keyring-core`, já no projeto), TypeScript, React 19, zustand,
`@tauri-apps/plugin-http`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`, vitest.

**Spec:** `docs/17-sincronizacao.md` §2, §7, §8, §9; `docs/06-design-system.md` (normativo);
`docs/04-regras-de-negocio.md` (textos); ADR-31 (sem banner, sem aviso recorrente), ADR-33,
ADR-39. **Depende do plano 09 inteiro** — leia os arquivos reais de `src/sync/` e
`src/estado/syncStore.ts` antes de começar; nomes podem ter mudado.

## Global Constraints

- Português do Brasil em nomes e comentários. Todo texto de interface pelo catálogo
  (`src/i18n/catalogo/sync.ts`, novo, pt-BR e inglês), por `useTexto()`; nunca literal no JSX.
  Sentence case, sem emoji.
- Nenhum valor de cor, fonte, espaçamento, raio ou sombra fora dos tokens de `globals.css`;
  nenhuma classe de cor padrão do Tailwind. Componentes existentes (`Botao`, `BotaoIcone`,
  `Campo`, `Dialog`) em vez de novos. Ícones do `lucide-react`, como o resto do app.
- `Dialog` renderiza por portal; nada de animação com preenchimento `both`.
- Hooks sempre antes de qualquer `return` num componente.
- Testes só de módulos puros ou stores com mocks — sem jsdom, sem `.test.tsx`. Teste antes,
  visto falhando. **Lição de 23/09:** revisão de fluxo de tela enumera todos os caminhos de
  chegada (ex.: Configurações já abertas por baixo de outro diálogo).
- A senha nunca é persistida nem logada; a `chaveDeEnvelope` só existe em memória e no cofre.
- **Guarda de higiene de commit:** trabalho não commitado do usuário em `src/editor/`,
  `src/layout/AbaDocumento.tsx`, arquivos não rastreados do glossário e documentos não
  rastreados em `docs/superpowers/`. Não toque. Comite **com pathspec**
  (`git commit -m "..." -- <caminhos>`; arquivo novo: `git add -- <caminho>` antes e confira
  `git diff --cached --stat`). Nunca `git add -A`, `git add .`, `git commit -a`. `index.lock`:
  espere e tente de novo. Depois, `git show --stat HEAD` — só os seus arquivos.
- Não suba o app. O dono do produto testa.

---

### Task 1: Documentação primeiro (sonnet, low)

- [ ] `docs/17-sincronizacao.md` §9: acrescentar o mapeamento HTTP do contrato (decisão do
  planejador): `GET /sync/vaults`; `POST /sync/vaults` `{ id, nomeCifrado, envelope }`;
  `GET /sync/vaults/{id}/pacotes?apos={n}`; `POST /sync/vaults/{id}/lotes`
  `{ esperoUltima, bytes }`; `POST /sync/vaults/{id}/retratos` `{ ateSequencia, partes }`;
  `DELETE /sync/vaults/{id}`. Bytes em base64 no JSON. Autenticação `Bearer` com o token da
  sessão. Códigos: 401 → `sessao`; 403 → `plano`; 404 → `nao-encontrado`; 409 com
  `{ "codigo": "fora-de-ordem" | "ja-existe" }`; 413 ou 507 → `espaco`; outro → `servidor`;
  falha de conexão → `rede`.
- [ ] `docs/17` nova seção "Testar sem servidor (só desenvolvimento)" descrevendo a Task 6.
- [ ] `docs/06-design-system.md`: registrar o ícone de estado da sincronização no rodapé da
  barra lateral **usando só o que o doc 06 já tem** (tamanho e estilo do `BotaoIcone` do rodapé;
  cor por estado com tokens existentes — confira quais tokens o doc define para "atenção" e
  "erro"). Se o doc 06 não tiver um token adequado para algum estado, **pare e pergunte** ao
  planejador (status NEEDS_CONTEXT), não invente.
- [ ] `docs/04-regras-de-negocio.md`: textos da seção Sincronização (os mesmos do catálogo da
  Task 4), no padrão do doc.
- [ ] Commit: `docs: sincronizacao na tela, contrato http e teste local`.

### Task 2: Chave de envelope no cofre (sonnet, medium)

**Files:** `src-tauri/src/cofre.rs`, `src/conta/cofreToken.ts` (+ fake e testes existentes),
`src/estado/contaStore.ts` só se a assinatura mudar.

- [ ] Generalizar os três comandos do cofre para receber **qual segredo** como um enum serde
  fechado — `sessao-conta` ou `chave-de-envelope` — nunca uma string livre (a tela continua
  sem poder ler outra credencial do Windows; decisão 4 do plano 05). Mesmo serviço
  (`app.config().identifier`), usuário = nome do segredo, persistência `Local`.
- [ ] TS: `CofreToken` continua funcionando para o token (sem mudar o comportamento do
  `contaStore`; os testes dele passam sem afrouxar) e ganha um irmão `CofreChaveDeEnvelope`
  (`ler(): Uint8Array | null`, `gravar(Uint8Array)`, `apagar()`, base64 no cofre).
- [ ] `sair()` da conta apaga também a `chaveDeEnvelope` deste computador (quem sai não deixa
  a chave das notas para trás). Teste.
- [ ] `cargo check`, `npm test`, `npm run build`. Commit: `feat(sync): chave de envelope no cofre do windows`.

### Task 3: `ServicoSyncHttp` (sonnet, medium)

**Files:** `src/sync/ServicoSyncHttp.ts` (+ teste com dublê de `fetch`, no padrão de
`src/conta/ServicoContaHttp.ts` e seu teste).

- [ ] Implementa o contrato com o mapeamento HTTP da Task 1; token via porta-token
  (`src/servico/sessao.ts`); base URL `BASE_URL_SERVICO`. Um teste por código de erro e por
  método; bytes chegam iguais depois do base64 de ida e volta.
- [ ] Commit: `feat(sync): cliente http do servidor de sincronizacao`.

### Task 4: Seção "Sincronização" nas Configurações (sonnet, medium)

**Files:** `src/i18n/catalogo/sync.ts` (novo, registrado no catálogo), `src/ui/excalisidian/SecaoSincronizacao.tsx`
(novo) e o encaixe em `DialogoPreferencias.tsx`; lógica de fluxo em módulo puro testável
(ex.: `src/sync/fluxoLigar.ts`).

Estados que a seção mostra (doc 17 §7), um por vez:

1. Sem conta → uma frase e nada mais (ADR-31: sem convite insistente).
2. Conta grátis → uma frase dizendo que é do plano premium.
3. Premium, vault atual não sincronizado → "Sincronizar este vault" e "Baixar um vault
   sincronizado para uma pasta vazia".
4. Premium, este computador ainda sem `chaveDeEnvelope` → ao escolher qualquer uma das duas
   ações, pede a senha da conta (campo senha, mesmo `Campo` da seção Conta), confere com o
   servidor entrando de novo (`contaStore`/`ServicoConta.entrar` — reuse, não duplique a
   derivação) e guarda a `chaveDeEnvelope` no cofre. Senha errada → mensagem do catálogo, nada
   é guardado.
5. Vault sincronizado → estado atual (texto do `syncStore`), "Sincronizar agora", nome do
   computador (editável, grava no blur/Enter como o campo Nome das Configurações), lista de
   arquivos fora da sincronização (se houver), "Parar de sincronizar este vault" e
   "Apagar a cópia do servidor…".

- [ ] "Baixar para pasta vazia": lista os vaults da conta com o nome decifrado, escolhe a pasta
  pelo diálogo nativo (`@tauri-apps/plugin-dialog`), **recusa pasta que não esteja vazia**
  (mensagem do catálogo), baixa e abre o vault (use o mesmo caminho que "Abrir vault" usa hoje).
- [ ] "Apagar a cópia do servidor…": `Dialog` de confirmação com o nome do vault e a frase de
  que os arquivos em todos os computadores continuam intactos; só apaga no botão de confirmar.
- [ ] Erros de ação (`plano`, `espaco`, `sessao`) aparecem na seção, com texto do catálogo.
- [ ] Testes do módulo puro de fluxo: qual estado mostrar para cada combinação (sem conta,
  grátis, premium sem chave, premium com chave, sincronizado); senha errada não grava chave;
  pasta não vazia é recusada.
- [ ] Commit(s): `feat(sync): secao sincronizacao nas configuracoes`.

### Task 5: Ligar ao vault aberto e ícone de estado (sonnet, medium)

**Files:** onde o vault é aberto/fechado (ache em `vaultStore`/`App.tsx`), `App.tsx` (rodapé
da barra lateral), novo componente pequeno do ícone.

- [ ] Ao abrir um vault que tem `EstadoSync` neste computador e com `chaveDeEnvelope` no cofre e
  sessão premium: baixa a lista de vaults, abre o envelope do vault certo e chama
  `syncStore.iniciar(raiz, chaveDoVault, …)`. Ao fechar/trocar de vault: `parar()`. Ao entrar na
  conta depois (sessão chega tarde): tenta de novo. Sem sessão, sem chave ou sem rede: fica em
  estado que a seção explica, sem aviso fora dela.
- [ ] Ícone no rodapé ao lado de Configurações, só quando o vault atual está sincronizado:
  ícones do lucide por estado, `title` com o texto do catálogo, clique abre as Configurações na
  seção Sincronização (mesmo mecanismo `secaoInicial` usado pela seção Conta — atenção ao caso
  de Configurações já abertas, ver `chavePreferencias` em `App.tsx`).
- [ ] Teste do módulo puro que decide "iniciar ou não e por quê".
- [ ] Commit: `feat(sync): sincronizacao ligada ao vault aberto e icone de estado`.

### Task 6: Servidor de teste local, só em desenvolvimento (sonnet, medium)

**Por quê:** sem servidor de verdade, o dono do produto não tem como ver a sincronização
funcionando. Em DEV, os pacotes vão para uma pasta de teste no `%APPDATA%` e duas janelas do
app (dois vaults) sincronizam entre si.

**Files:** `src/sync/ServicoSyncLocal.ts` (+ teste com adaptador de disco falso), ponto de
escolha do serviço (DEV → local; produção → HTTP), e a conta de teste.

- [ ] `ServicoSyncLocal`: mesmo comportamento do `ServicoSyncFake` (inclusive as regras de
  `fora-de-ordem` e de retrato), mas guardando em arquivos numa pasta de teste do app data
  (`sync-teste/`), para que duas janelas (dois processos JS) vejam o mesmo "servidor". Grave
  com escrita atômica (tmp + rename). Reaproveite a lógica do fake (extraia o núcleo comum em
  vez de duplicar), testando o núcleo uma vez.
- [ ] Conta de teste em DEV: com `import.meta.env.DEV`, o `contaStore` usa um
  `ServicoContaFake` com uma conta premium conhecida (e-mail e senha fixos, escritos no doc 17
  seção de teste), para o dono do produto poder entrar sem servidor. **Cuidado com duas
  janelas:** cada janela tem o próprio fake em memória, mas o token fica no cofre do Windows,
  compartilhado. Se o `renovar` do fake recusar como `expirada` um token criado pela outra
  janela, o `contaStore` apaga o token do cofre e desloga a outra janela. O fake de DEV tem que
  aceitar o token da conta de teste venha de que janela vier (ex.: token determinístico
  derivado do e-mail de teste). Teste isso. Em produção, nada disso
  existe: confira depois de `npm run build` que `dist/` não contém a senha de teste, o e-mail de
  teste, `sync-teste` nem `ServicoSyncLocal`.
- [ ] Commit: `feat(sync): servidor de teste local para desenvolvimento`.

### Task 7: Fechamento (orquestrador + sonnet low)

- [ ] Docs: ADR-40, docs/08 Fatia 15, docs/05 (estrutura e comandos Rust — o cofre mudou de
  assinatura): estado real = "sincronização pronta no cliente e testável localmente em
  desenvolvimento; falta o servidor de verdade".
- [ ] Rodar os testes mínimos da seção 10 do docs/05 e a suíte inteira; build; busca em `dist/`.
- [ ] Roteiro de teste manual para o dono do produto (orquestrador escreve, linguagem simples,
  cada passo com "esperado" sem ambiguidade — inclusive quando o esperado é "nada acontece").
