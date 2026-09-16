# 12 — Múltiplos vaults

Plano de implementação do RF1.3 ampliado: criar vault novo, abrir pasta existente como vault,
lista de recentes, e **uma janela por vault**. Este documento é o contrato entre as tarefas
T1–T5 — nomes de comando, chaves de store e textos saem daqui.

Decisões do usuário (16/09/2026):

- Escopo: criar vault novo **e** abrir pasta existente, com lista de recentes.
- Cada vault abre na **sua própria janela**. Vários vaults abertos ao mesmo tempo.
- O seletor fica no **cabeçalho da sidebar, no lugar do logotipo**: o nome do vault é o
  botão. Nome longo não usa reticências — o final do botão some num **fade**.
- "Remover da lista" existe e só esquece o vault no app. Nunca apaga pasta nem arquivo.

## 1. Modelo

- Um vault = uma janela = um contexto JavaScript. Como cada webview tem o próprio realm, os
  stores zustand (`vaultStore`, `documentosStore`, `workspaceStore`, `tarefasStore`,
  `agenteStore`) continuam globais **por janela** sem refatoração.
- O mesmo vault nunca fica aberto em duas janelas (dois watchers e dois `documentosStore`
  gravando os mesmos arquivos gerariam conflito falso). Abrir um vault que já está aberto
  foca a janela dele.
- A janela `main` continua existindo e é a que abre no boot, com o último vault usado
  (RF1.2). Janelas adicionais têm label `vault-<hash>`. Não se restauram janelas extras no
  boot — fica para depois.
- Fechar a última janela encerra o app (padrão do Tauri).

## 2. Contrato Rust (T1)

Arquivo novo `src-tauri/src/janelas.rs`, registrado em `lib.rs`.

| Comando | Assinatura | Comportamento |
|---|---|---|
| `abrir_janela_vault` | `(app, path: String) -> Result<(), String>` | Se `path` não existe ou não é pasta: `Err("indisponivel")`. Se já há janela registrada para o vault: `unminimize` + `set_focus`, `Ok`. Senão concede o escopo de FS, cria `WebviewWindowBuilder` com label `vault-<fnv1a32 hex do path em minúsculas>`, URL `index.html?vault=<path url-encoded>`, título = nome da pasta, mesmo tamanho/mínimo da janela `main` em `tauri.conf.json`. |
| `registrar_janela_vault` | `(window: tauri::Window, path: String) -> Result<Option<String>, String>` | Cada janela chama ao abrir seu vault. Se outra janela já tem esse vault, devolve `Some(label_dela)` e não registra. Senão registra `path → window.label()`, devolve `None`. Uma janela que troca de vault (tela sem vault) substitui o próprio registro. |
| `focar_janela` | `(app, label: String) -> Result<(), String>` | `unminimize` + `set_focus` na janela do label. |
| `criar_vault` | `(app, pai: String, nome: String) -> Result<String, String>` | `nome.trim()`. Erros: `Err("nome_vazio")`, `Err("nome_invalido")` (contém `/ \ : * ? " < > |`, começa com `.`, ou é só pontos), `Err("pai_indisponivel")`, `Err("existe")`. Cria a pasta com `std::fs::create_dir`, concede o escopo, devolve o caminho absoluto. Não cria `.excalisidian/` — o app cria quando precisar. |

Registro: `EstadoJanelas(Mutex<HashMap<String, String>>)`, chave = path em minúsculas com `\`
trocado por `/` e sem barra final. Limpeza no `on_window_event` com `WindowEvent::Destroyed`:
remove o registro do label **e** o watcher do label.

Watcher (`watcher.rs`): `EstadoWatcher` vira `Mutex<HashMap<String /*label*/, WatcherInterno>>`.
`observar_vault` recebe `window: tauri::Window` e guarda por `window.label()`. Os eventos
`vault://eventos` e `vault://ressincronizar` passam a sair com `emit_to(label, …)`, nunca
`emit` global — senão toda janela recebe os eventos de todos os vaults.

Capabilities (`capabilities/main.json`): `"windows": ["main", "vault-*"]`. Conferir se
alguma permissão nova é necessária para o front ouvir eventos por janela.

ADR-5 fala em "quatro comandos Rust" como condição de reversão para Electron. Com isto
passam a ser nove. T5 registra isso no doc 09 — são comandos de janela, não lógica de
domínio, e não se aplica a condição (b).

## 3. Contrato TypeScript núcleo (T2)

### 3.1 `src/vault/vaultsRecentes.ts` (novo, com teste)

Store `settings.json`, chave `vaultsRecentes`:

```ts
export interface VaultRecente { caminho: string; abertoEm: number } // ms epoch
export const MAX_RECENTES = 20;
export async function listarRecentes(): Promise<VaultRecente[]>;      // abertoEm desc
export async function registrarAbertura(caminho: string): Promise<void>; // upsert + corta em 20 + grava vaultPath
export async function removerDosRecentes(caminho: string): Promise<void>;
export function nomeDoVault(caminho: string): string;                 // basename, aceita / e \
export function mesmoVault(a: string, b: string): boolean;            // compara normalizado, case-insensitive
```

- Migração: se `vaultsRecentes` não existe e `vaultPath` existe, semeia a lista com ele.
- `vaultPath` continua sendo "último vault usado" (boot da `main`, RF1.2).
- Várias janelas gravam o mesmo `settings.json`: toda operação relê a lista imediatamente
  antes de gravar (o plugin-store mantém o estado no processo Rust, compartilhado).
- Lógica pura (upsert, ordenação, corte, migração, `nomeDoVault`, `mesmoVault`) em funções
  exportadas testáveis sem Tauri.

### 3.2 `src/vault/janelas.ts` (novo)

Wrappers finos dos comandos da seção 2:

```ts
export type ResultadoAbrir = "ok" | "indisponivel";
export async function abrirVaultEmJanela(caminho: string): Promise<ResultadoAbrir>;
export async function criarVault(pai: string, nome: string): Promise<string>; // lança Error(código)
export async function escolherPasta(): Promise<string | null>;              // diálogo nativo, sem conceder escopo
```

### 3.3 `TauriVaultAdapter.ts`

- `doBoot()`: lê `?vault=` de `window.location.search`; se presente, usa ele; senão
  `vaultPath`. Depois `permitir_vault`.
- Novo `static async abrir(caminho: string): Promise<TauriVaultAdapter>` — `permitir_vault`
  e devolve o adapter (usado pela tela sem vault para abrir na própria janela).
- `escolher()` passa a usar `registrarAbertura` em vez de gravar `vaultPath` direto.
- `observar` e `aoPerderSincronia`: ouvir com `getCurrentWebviewWindow().listen`, não com
  `listen` global. Verificar em `node_modules/@tauri-apps/api` qual listen recebe
  `emit_to(label)` e deixar o motivo num comentário.
- Novo `src/vault/abrirNestaJanela.ts` exportando
  `abrirNestaJanela(adapter): Promise<"ok" | { outraJanela: string }>`: chama
  `registrar_janela_vault`; se outra janela tem o vault, chama `focar_janela` e devolve o
  label; senão `registrarAbertura`, `getCurrentWindow().setTitle(nomeDoVault)` e devolve
  `"ok"`. **Não** chama `definirAdapter` — isso continua no `App.tsx`.

## 4. Interface (T3)

### 4.1 Cabeçalho da sidebar

- `Logotipo` sai do cabeçalho. Entra `SeletorVault` (novo, `src/ui/excalisidian/`), ocupando o
  espaço flexível à esquerda (`min-w-0 flex-1`).
- O botão mostra `nomeDoVault(raiz)`, uma linha, `overflow-hidden whitespace-nowrap`, **sem
  `text-ellipsis`**. O final some com `mask-image: linear-gradient(to right, #000 calc(100% - X), transparent)`,
  aplicado só quando o texto transborda (medir com `scrollWidth > clientWidth`, via
  `ResizeObserver`). `X` = 24px, da escala base do doc 06 (escolha do usuário em
  16/09/2026). Máscara usa só alfa, então não introduz cor.
- `title` do botão = caminho absoluto completo.
- Tipografia, hover e foco: os de item de sidebar do doc 06. Não inventar.
- O botão de colapsar (`panel-left-close`) deixa de trocar de lugar com o logotipo no hover e
  fica sempre visível no fim do grupo de ícones do cabeçalho. Motivo: doc 06, "o alvo trocar
  de lugar sob o cursor". A prop `comMouse` de `ConteudoSidebar` deixa de ser usada para isso.

### 4.2 Menu do seletor

Usa `Menu`/`ItemMenu` de `src/ui/Menu.tsx`, ancorado sob o botão.

1. Recentes (`listarRecentes()`), nome do vault por linha, `title` = caminho.
   - O vault desta janela: ícone `check`, não clicável.
   - Clique nos outros: `abrirVaultEmJanela`. `"indisponivel"` → toast
     "A pasta deste vault não foi encontrada." com ação "Remover da lista".
   - Hover num item que não seja o atual mostra `BotaoIcone` `x`, título "Remover da lista".
2. Separador.
3. "Criar vault…" (`folder-plus`) → abre `DialogoCriarVault`.
4. "Abrir pasta como vault…" (`folder-open`) → `escolherPasta()` → `abrirVaultEmJanela`.

### 4.3 `DialogoCriarVault` (novo)

Mesmo padrão de `Dialog` de `DialogoPreferencias`.

- Título "Criar vault".
- Campo "Nome", foco inicial.
- "Local": caminho da pasta pai em texto `meta`, com botão "Escolher…" (`escolherPasta()`).
  Padrão: pasta pai do vault atual; na tela sem vault começa vazio.
- Rodapé: "Cancelar" e "Criar vault" (primário, desabilitado sem nome ou sem local).
- Erros inline sob o campo, pelos códigos da seção 2 (textos na seção 5).
- Sucesso: prop `onCriado(caminho)`. Na sidebar → `abrirVaultEmJanela`; na tela sem vault →
  abre na própria janela.

### 4.4 Tela sem vault (`App.tsx`)

- `EstadoVazio` com dois botões: "Criar vault" (primário) e "Abrir pasta".
- Se `listarRecentes()` não estiver vazio, lista os recentes abaixo; clicar abre **nesta
  janela** (`TauriVaultAdapter.abrir` + `abrirNestaJanela` + `definirAdapter` +
  `aoAbrirVault`). Se outra janela já tem o vault, esta janela continua na tela sem vault e a
  outra ganha foco.
- Todo caminho que chega a `definirAdapter` no `App.tsx` (boot, escolher, criar, recente)
  passa antes por `abrirNestaJanela`.
- `<Workspace key={raiz} />` para o dockview remontar se a janela trocar de vault.

## 5. Textos de interface (T5 grava no doc 04)

| Situação | Texto |
|---|---|
| Menu: criar | "Criar vault…" |
| Menu: abrir | "Abrir pasta como vault…" |
| Menu: remover | "Remover da lista" |
| Pasta sumiu | "A pasta deste vault não foi encontrada." |
| Diálogo: título | "Criar vault" |
| Diálogo: campo | "Nome" |
| Diálogo: local | "Local" / botão "Escolher…" |
| Diálogo: confirmar | "Criar vault" |
| Erro `nome_vazio` | "Dê um nome ao vault." |
| Erro `nome_invalido` | "O nome não pode ter / \ : * ? \" < > \| nem começar com ponto." |
| Erro `existe` | "Já existe uma pasta com esse nome nesse local." |
| Erro `pai_indisponivel` | "Não foi possível acessar o local escolhido." |
| Tela sem vault: título | "Nenhum vault aberto" (mantém) |
| Tela sem vault: apoio | "Crie um vault novo ou abra uma pasta que já tem suas notas." |
| Tela sem vault: botões | "Criar vault" / "Abrir pasta" |
| Tela sem vault: lista | "Recentes" |

## 6. Coordenação entre janelas (T4)

- **Atualização do app.** Hoje `aplicar()` do `atualizacaoStore` só drena a janela onde foi
  clicado; as outras perderiam edições no `relaunch`. Novo `src/app/flushEntreJanelas.ts`:
  - Toda janela, no boot, ouve `app://flush-pedido` (`{ id }`), roda
    `flusharTudoAntesDeSair()` e emite `app://flush-resposta` (`{ id, label, falhas, bloqueados, tarefasOk }`).
  - `flusharTodasAsJanelas()`: lista as janelas (`getAllWebviewWindows`), emite o pedido, drena
    a própria janela direto, espera uma resposta por janela com timeout de 5 s e agrega.
    Janela que não respondeu conta como falha, com o label.
  - `atualizacaoStore.aplicar()` passa a usar `flusharTodasAsJanelas()`.
- **Preferências da máquina.** Tema, largura da nota e sidebar colapsada são do
  `settings.json`, compartilhados. Ao mudar numa janela, emitir `app://prefs-mudou`; as
  outras chamam `usePrefsStore.getState().carregar()`. Mesmo para a config do agente, se
  couber sem mexer na lógica do agente.
- Conferir se `useAutosave` (close) e `useRessincronizarAoVoltar` usam
  `getCurrentWindow()` — usam — e não precisam de mudança. `JANELA_PRINCIPAL` não é usado
  fora de `constantes.ts`; manter.

## 7. Tarefas e dependências

| Tarefa | Arquivos (exclusivos) | Depende de |
|---|---|---|
| T1 Rust | `src-tauri/src/janelas.rs`, `watcher.rs`, `lib.rs`, `vault.rs` (se preciso), `capabilities/main.json`, `Cargo.toml` (se preciso) | — |
| T2 TS núcleo | `src/vault/vaultsRecentes.ts` (+test), `src/vault/janelas.ts`, `src/vault/abrirNestaJanela.ts`, `src/vault/TauriVaultAdapter.ts` | contrato §2 |
| T5 Docs | `docs/03`, `docs/04`, `docs/06`, `docs/09`, `docs/REQUISITOS-STATUS.md`, `docs/08` | — |
| T3 UI | `SeletorVault.tsx`, `DialogoCriarVault.tsx`, `ConteudoSidebar.tsx`, `App.tsx`, `ui/index.ts` se preciso | T2 |
| T4 Janelas | `src/app/flushEntreJanelas.ts`, `atualizacaoStore.ts`, `prefsStore.ts`, `agenteStore.ts` (só o evento) | T2 |

Ondas: T1 + T2 + T5 em paralelo; depois T3 + T4 em paralelo; depois integração
(`cargo check`, `npx tsc --noEmit`, `npm test`) e teste manual.

## 8. Teste manual (depois da integração)

1. Boot com vault salvo: a `main` abre o último vault, título da janela = nome do vault.
2. Menu → "Criar vault…" → nome + local → abre janela nova, vazia, com a Home.
3. Menu → vault recente → abre janela; de novo → só foca.
4. Editar nota na janela A por fora do app: só a janela A reage (watcher por janela).
5. Mesma pasta em "Abrir pasta como vault…" já aberta noutra janela → foca a outra.
6. Renomear/mover a pasta de um recente por fora → clique → toast "não encontrada" → remover.
7. Trocar tema na janela A → janela B acompanha.
8. Editar nas duas janelas sem esperar o autosave → aplicar atualização → nada se perde.
9. Nome longo de vault: fade no final, sem reticências; nome curto: sem máscara.
10. Fechar a `main` com outra janela aberta → o app continua; fechar a última → encerra.
