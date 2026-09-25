# 05 — Arquitetura e stack

Todas as versões abaixo foram verificadas no registry do npm em **28/08/2026**. Ao instalar, confirme de novo — e se alguma mudou de major, pare e reavalie antes de seguir.

---

## 1. Stack

| Camada | Escolha | Versão verificada |
|---|---|---|
| Shell desktop | **Tauri v2** | `@tauri-apps/api` 2.11.1 · `@tauri-apps/cli` 2.11.4 |
| Filesystem | `@tauri-apps/plugin-fs` | 2.5.1 |
| Diálogos nativos | `@tauri-apps/plugin-dialog` | 2.7.2 |
| Preferências | `@tauri-apps/plugin-store` | 2.4.4 |
| Atualização do app | `@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process` (relaunch) | 2.11.0 / 2.3.1 — ver seção 11 |
| Build | Vite + React + TypeScript | Vite 8.2.2 · React 19.2.8 |
| Editor de texto | **CodeMirror 6** — vendorizado em `src/editor/atomico/` (não é mais a dependência `@atomic-editor/editor`; ver nota abaixo) | `@codemirror/view` 6.43.9 · `@codemirror/lang-markdown` 6.5.2 · `@lezer/markdown` 1.7.2 |
| Blocos de código | Um `@codemirror/lang-*` por linguagem suportada no editor (`cpp`, `css`, `go`, `html`, `java`, `javascript`, `json`, `php`, `python`, `rust`, `sql`, `xml`, `yaml`) + `@codemirror/legacy-modes` para o resto, em `src/editor/atomico/code-languages.ts` | várias, todas `^6.x` |
| Canvas | `@excalidraw/excalidraw` | **0.18.1** |
| Abas e split | `dockview-react` | 8.2.0 |
| Parsing markdown | `unified` 11.0.5 + `remark-parse` 11.0.0 + `remark-gfm` 4.0.1 | |
| Frontmatter | `js-yaml` (miolo do YAML) direto, em `src/indice/frontmatter.ts` | 4.3.2 |
| Compressão da cena | `lz-string` (`draw-json-lz`, doc 02 §3) | 1.5.0 |
| Busca | `minisearch` | 7.2.0 |
| Rede HTTP (agente de IA, conta, serviço online) | `@tauri-apps/plugin-http` + `tauri-plugin-http` (Rust) | 2.6.0 / 2.6.0 — verificado 13/09/2026 no install; único transporte de rede do app (agente, `src/conta/`, `src/servico/`), escopado por host em `capabilities/main.json` (doc 11, doc 09 ADR-31) |
| Derivação da senha (conta, ADR-39) | `@noble/hashes` — HKDF e SHA-256 da derivação da senha | 2.4.0 |
| Derivação da senha (conta, ADR-39) | `hash-wasm` — Argon2id da derivação da senha, ADR-39 | 4.12.0 |
| Estado | `zustand` | 5.0.15 |
| Estilo | Tailwind v4 com os tokens do design system | |
| Ícones | `lucide-react` | |
| Virtualização | `@tanstack/react-virtual` | |
| Componentes base | próprios, em `src/ui/` + `sonner` para toasts | |
| Composição de classes | `clsx` + `tailwind-merge` (o helper `cn`) | |
| Fontes | Fraunces, Instrument Sans, IBM Plex Mono — empacotadas em `public/fontes/` | |

**Sobre os componentes base:** o plano original era instalar `shadcn/ui` e re-estilizar. Na
prática os componentes de que o produto precisa são poucos e todos pequenos (botão, superfície,
menu, diálogo, campo, grupo de botões, seletor de cor), e o doc 06 já define cada estado deles —
então eles são escritos aqui mesmo, sem trazer Radix nem o CLI do shadcn. `clsx` e
`tailwind-merge` entram porque o Tailwind resolve conflito por ordem no CSS, não por ordem na
string: sem o merge, um componente que aceita `className` por prop não consegue ser
sobrescrito de forma previsível.

### Por que Tauri e não Electron

Bundle de 3–10 MB contra 85–150 MB, e usa o WebView2 que já vem no Windows. O custo é ter que mexer em Rust em quatro lugares (registro de plugins, escolha do vault, walk do vault, watcher) e conviver com diferenças de engine se um dia houver Linux.

**Risco a validar na primeira semana** (spike da Fatia 0): montar o Excalidraw dentro do WebView2 com uma cena de 500 elementos e medir pan e zoom.

Uma ressalva sobre esse teste: **WebView2 é Chromium, e Electron também é.** Se o canvas engasgar, trocar de shell provavelmente não resolve — a causa estará na cena, no React ou nas flags de GPU, não no invólucro. O plano B real é reduzir a cena (limite de elementos, desmontar canvas fora de vista) e revisar o que provoca re-render. Trocar por Electron só faz sentido se o problema for especificamente a versão do WebView2 instalada na máquina, o que se diagnostica comparando com o Chrome no mesmo computador.

### Por que CodeMirror 6 e não ProseMirror

Milkdown e TipTap são ProseMirror: o documento em memória é uma árvore e o markdown é serializado na saída, então o round-trip não é fiel. No CodeMirror 6 a fonte da verdade é o texto markdown, e o live preview é feito com *decorations* que escondem tokens fora da linha do cursor — é o que o Obsidian faz. Justificativa completa no ADR-4 do documento 09.

**Decisão tomada:** o pacote `@atomic-editor/editor` (React + CM6 com live preview inline estilo Obsidian, incluindo wikilinks) foi vendorizado — não é mais uma dependência do `package.json`, é código do projeto em `src/editor/atomico/` (comentários e nomes de símbolo em inglês, do pacote original; a regra de nomes em português vale para o código do projeto propriamente dito, mesmo padrão adotado para os assets do Excalidraw no doc 06). A partir daí ganhou recursos próprios que o pacote não tinha: tabela (`table-model.ts`, `table-widget.ts`), blocos de código com syntax highlighting por linguagem (`code-languages.ts`, `highlight.ts`), progresso de task list (`tree-progress.ts`) e mais.

---

## 2. Estrutura de pastas

```
src/
├── main.tsx
├── app/
│   ├── App.tsx
│   ├── comandos/            registro de comandos: criação, exclusão, mover, galeria de anexos
│   ├── glossario/           catálogo de atalhos e símbolos (comando "Glossário")
│   ├── atalhos.ts
│   ├── atualizacao.ts       fluxo do updater (plugin-updater + plugin-process)
│   ├── capturaDeErros.ts
│   ├── constantes.ts        APP_ID e derivados (chave de frontmatter, pasta de config, ext. tmp)
│   ├── papel-de-parede-home.ts
│   ├── sistemaOperacional.ts
│   ├── useHojeLocal.ts
│   └── useRessincronizarAoVoltar.ts
├── vault/
│   ├── VaultAdapter.ts      interface: read, write, list, watch, move, delete (seção abaixo)
│   ├── TauriVaultAdapter.ts implementação sobre plugin-fs
│   ├── caminhos.ts          normalização NFC, "/" , validação Windows
│   ├── escritaAtomica.ts    tmp + rename + mapa anti-loop
│   ├── lixeira.ts
│   ├── configVault.ts       leitura/escrita de .excalisidian/vault.json (hoje só sortMode/customOrder — doc 02 §1)
│   ├── criar.ts, mover.ts, renomear.ts, anexos.ts, arvore.ts, ordenacao.ts, customOrder.ts
│   ├── vaultsRecentes.ts, janelas.ts, abrirNestaJanela.ts   múltiplos vaults (doc 12)
│   ├── efeitosDeGravacao.ts sequência compartilhada "cancelar autosave → gravar → recarregar árvore/índice/aba", usada por conflitosStore e pelo motor de sync
│   ├── VaultAdapterMemoria.ts implementação de VaultAdapter em memória, para teste (sync, conflitos)
│   └── galeria-anexos.ts
├── indice/
│   ├── parser.ts            markdown -> FileMeta
│   ├── wikilink.ts          parser próprio de [[...]]
│   ├── frontmatter.ts       YAML do frontmatter com js-yaml (não gray-matter — ver seção 1)
│   ├── cache.ts             load/save de index.json, reparse incremental
│   ├── resolucao.ts         resolver link -> caminho
│   ├── sugestoesLink.ts, sintaxe.ts
│   └── backlinks.ts
├── busca/
│   ├── minisearchIndex.ts
│   ├── buscaTitulos.ts, montarListaBusca.ts, normalizacao.ts
├── tarefas/                 painel de tarefas (doc 10-tarefas.md): formatoTarefas, agrupamento, ordem
├── i18n/                    tradução (doc 09, ADR-36)
│   ├── idioma.ts            tipo Idioma = "pt-BR" | "en", detecção pelo idioma do sistema
│   ├── tradutor.ts          resolução chave -> idioma pedido -> português -> a própria chave
│   ├── catalogo.ts          porta de entrada única; monta PT_BR e EN por espalhamento
│   ├── catalogo/            textos por domínio: vault.ts, prefs.ts, agente.ts, conta.ts
│   ├── useTexto.ts          hook para componente React
│   ├── traduzirAgora.ts     tradução fora de componente React (transporte, stores)
│   └── cobertura.test.ts    trava: toda chave em português tem que ter inglês
├── servico/                 cliente do serviço online (conta, créditos) — doc 09, ADR-31/34/35
│   ├── base.ts              BASE_URL_SERVICO, CONTA_DISPONIVEL
│   ├── sessao.ts             token de sessão em memória ("porta-token"); ver seção 7 abaixo
│   └── creditos.ts           interpreta o saldo de créditos que o servidor manda
├── conta/                   conta do usuário — doc 09, ADR-31/33/34
│   ├── tipos.ts
│   ├── ServicoConta.ts       contrato: entrar, criar, renovar, sair
│   ├── ServicoContaFake.ts   implementação em memória, para teste
│   └── ServicoContaHttp.ts   implementação real
├── sync/                    sincronização cifrada ponta a ponta — doc 17, ADR-32/40
│   ├── tipos.ts, cenaDeConflito.ts, colunasComparacao.ts, diffLinhas.ts,
│   │   nomeDeConflito.ts, resolucao.ts, simularConflito.ts   tela de conflitos (ADR-32), pronta
│   ├── pacote.ts             cifra AES-256-GCM com AAD, preenchimento em escada
│   ├── formato.ts            serialização de Lote e Retrato
│   ├── decisoes.ts           mudança local e ação para mudança remota
│   ├── tiposServidor.ts      tipos do contrato do servidor (Lote, Retrato, EnvelopeChave, códigos de falha)
│   ├── ServicoSync.ts, ServicoSyncFake.ts   contrato do servidor, igual padrão de ServicoConta
│   ├── estadoSync.ts         EstadoSync por computador, persistido em plugin-store; nome do computador
│   ├── aplicar.ts            aplica um lote remoto no vault (grava, move para lixeira, resolve conflito)
│   └── motor.ts              ciclo baixar → detectar → enviar → guardar, testável sem Tauri
├── agente/                    agente de IA opcional (doc 11) — único outro código que fala com rede
│   ├── tipos.ts
│   ├── provedores.ts          catálogo de provedores, dialetos, base URLs, preços
│   ├── cliente.ts             completar() nos dialetas sobre plugin-http
│   ├── orcamento.ts           tokens/custo, teto diário
│   ├── gatilhos.ts            disparo local: inatividade + diff mínimo
│   ├── gateiro.ts             análise inicial e convite
│   ├── assistente.ts          ciclo de sugestões estruturadas
│   ├── recuperacao.ts         top-k local (minisearch + backlinks)
│   └── memoria.ts             pasta de memória em %APPDATA% (escrita atômica)
├── editor/
│   ├── EditorNota.tsx
│   ├── editorAtivo.ts, useAutosave.ts
│   ├── atomico/             CodeMirror 6 vendorizado (ex-@atomic-editor/editor) — seção 1
│   └── extensoes/           wikilink, embed, atalhos, tabela, tema, corpo da nota
├── canvas/
│   ├── EditorDesenho.tsx
│   ├── formatoDesenho.ts    parse e serialize do .draw.md (draw-json e draw-json-lz)
│   ├── adotarImagens.ts, reidratarFiles.ts, linkElemento.ts, atalhosCanvas.ts
│   ├── paletaCanvas.ts      lê os tokens CSS (doc 06) — nunca hex literal
│   ├── selecaoFormaVazia.ts, flushCanvas.ts
│   └── renderSvg.ts         para o embed em nota
├── layout/
│   ├── Workspace.tsx        dockview
│   ├── AbaDocumento.tsx, AbaInicio.tsx, PainelDesenho.tsx, PainelDocumento.tsx, PainelInicio.tsx, PainelVazio.tsx, BotaoInicioAba.tsx
│   └── persistencia.ts
├── ui/                      componentes-base do design system (Botao, Campo, Dialog, Menu, Select, …)
│   │                        Dialog renderiza por portal em document.body — ver nota abaixo (doc 09, ADR-37)
│   └── excalisidian/        componentes específicos do produto (árvore, sidebar, diálogos, tarefas, agente, glossário, múltiplos vaults, …)
├── estado/
│   ├── vaultStore.ts, documentosStore.ts, workspaceStore.ts
│   ├── prefsStore.ts, agenteStore.ts, atualizacaoStore.ts, tarefasStore.ts, contaStore.ts
│   ├── dialogoStore.ts, sobreposicaoStore.ts, revelacaoStore.ts, papel-parede-home-store.ts
│   ├── syncStore.ts          casca do motor de sync: carrega o estado, agenda ciclos (ao iniciar, 5s após mudança, 60s, sob pedido) e expõe status para a interface (plano 10)
│   └── flushGeral.ts
└── estilos/
    └── globals.css          tokens

src-tauri/
├── src/
│   ├── main.rs, lib.rs
│   ├── vault.rs             escolher_vault, permitir_vault, walk_vault
│   ├── watcher.rs           observar_vault
│   ├── janelas.rs           abrir_janela_vault, registrar_janela_vault, focar_janela, criar_vault (doc 12)
│   ├── sistema.rs           nome_usuario, revelar_pasta
│   └── papel_parede.rs      papel de parede da Home (preparar/importar/remover)
└── capabilities/
```

### A interface `VaultAdapter`

Todo acesso a disco passa por ela. Isso paga por si mesmo em três momentos: testar sem tocar em disco, poder rodar um modo web com File System Access API, e trocar Tauri por Electron se o risco do canvas se materializar.

```ts
interface VaultAdapter {
  raiz(): string;
  listar(): Promise<EntradaArquivo[]>;              // walk completo, só metadados
  lerTexto(path: string): Promise<string>;
  lerBinario(path: string): Promise<Uint8Array>;
  escreverTexto(path: string, conteudo: string): Promise<void>;   // tmp + rename
  escreverBinario(path: string, dados: Uint8Array): Promise<void>;
  criarPasta(path: string): Promise<void>;
  mover(de: string, para: string): Promise<void>;
  remover(path: string): Promise<void>;             // exclusão PERMANENTE, só para esvaziar .trash/
  listarPasta(path: string): Promise<{ nome: string; isDir: boolean }[]>; // 1 nível, sem filtro de pasta-ponto — único jeito de ver dentro de .trash/
  existe(path: string): Promise<boolean>;
  observar(cb: (eventos: EventoArquivo[]) => void): () => void;
  aoPerderSincronia(cb: () => void): () => void;    // watcher perdeu eventos (overflow do SO); pede releitura completa
}
```

---

## 3. Ponte com o Rust

O plano original era de "quatro pontos de contato com o Rust, e não mais que isso sem uma
boa razão" — múltiplos vaults (doc 12) já levou isso a nove, e hoje, com a Home, o
updater e o cofre do token da conta (ADR-34), são dezesseis comandos registrados em `lib.rs`:

| Comando | Assinatura | Por quê |
|---|---|---|
| `escolher_vault` | `() -> Option<String>` | abre o diálogo de pasta, concede escopo de FS ao caminho e devolve |
| `permitir_vault` | `(path: String) -> Result<()>` | reaplica o escopo no boot, para o vault salvo |
| `walk_vault` | `(path: String) -> Vec<EntradaArquivo>` | percorre a pasta inteira em uma chamada; devolve `path`, `mtimeMs`, `birthtimeMs`, `size`, `isDir` |
| `observar_vault` | `(path: String) -> Result<()>` + canal de eventos | file watcher com debounce, emitindo **lotes** para o front |
| `abrir_janela_vault` | `(app, path: String) -> Result<(), String>` | abre um vault numa janela nova ou foca a que já está aberta (doc 12 §2) |
| `registrar_janela_vault` | `(window, path: String) -> Result<Option<String>, String>` | cada janela avisa qual vault está mostrando (doc 12 §2) |
| `focar_janela` | `(app, label: String) -> Result<(), String>` | `unminimize` + `set_focus` por label (doc 12 §2) |
| `criar_vault` | `(app, pai: String, nome: String) -> Result<String, String>` | cria a pasta de um vault novo no disco (doc 12 §2) |
| `nome_usuario` | `() -> String` | nome do usuário do SO; mora em `sistema.rs` |
| `revelar_pasta` | `(path: String) -> Result<()>` | abre uma pasta no Explorer do sistema (`explorer.exe`); usado por "Abrir pasta do agente" (doc 11 §6.3). Domínio de SO, mora em `sistema.rs` |
| `preparar_papel_parede_home` | `(app) -> Result<Option<PapelParedeArquivo>, String>` | papel de parede da tela Início; `papel_parede.rs` |
| `importar_papel_parede_home` | `(app, …) -> Result<..., String>` | idem |
| `remover_papel_parede_home` | `(app) -> Result<(), String>` | idem |
| `lixeira_sistema` | não implementado | só quando RF7.6 sair do P2 — ver a nota abaixo |
| `ler_token_conta` | `(app) -> Result<Option<String>, String>` | token da conta no cofre de senhas do Windows, em vez de texto puro (doc 09, ADR-34) |
| `gravar_token_conta` | `(app, token: String) -> Result<(), String>` | token da conta no cofre de senhas do Windows, em vez de texto puro (doc 09, ADR-34) |
| `apagar_token_conta` | `(app) -> Result<(), String>` | token da conta no cofre de senhas do Windows, em vez de texto puro (doc 09, ADR-34) |

Sobre o `observar_vault`: o `@tauri-apps/plugin-fs` já expõe `watch` e `watchImmediate` com `delayMs`, e para um watcher simples isso bastaria. O comando próprio existe por um motivo específico — a seção Watcher abaixo exige processar **lotes** de eventos (um `git checkout` gera milhares em um segundo), e agrupar do lado Rust evita atravessar o IPC uma vez por arquivo. Se na Fatia 5 o `watch` do plugin se mostrar suficiente, use-o e apague este comando: um ponto de contato a menos com o Rust é ganho, não perda.

**Armadilha documentada do Tauri v2:** o diálogo de escolher pasta **não concede** permissão de filesystem para aquele caminho. É preciso chamar `tauri_plugin_fs::FsExt::allow_directory(&path, true)` do lado Rust, e o escopo concedido em runtime **não persiste entre execuções** — tem que ser reaplicado a cada boot lendo o caminho salvo no `plugin-store`. Isso é a Fatia 0 do roadmap e é o item com maior chance de travar o projeto no primeiro dia.

**Sobre a lixeira do sistema:** o `@tauri-apps/plugin-fs` **não tem** função de lixeira. O `remove` dele é exclusão permanente, e o pedido de `trashItem` está aberto no Tauri desde 2022. O caminho é o crate `trash` (5.2.6, MIT, Windows/macOS/Linux) num comando de ~12 linhas. Registrado aqui para ninguém descobrir na Fatia 8 que o `plugin-fs` resolveria — não resolve. No MVP a lixeira é a pasta do vault (ADR-7) e este comando não existe.

**Por que `walk_vault` em Rust:** `readDir` recursivo via IPC, um diretório por chamada, é ordens de grandeza mais lento. Uma chamada que devolve `[{path, mtimeMs, size, isDir}]` de tudo resolve o boot.

---

## 4. Fluxo de dados

```
disco ──walk_vault──> índice em memória ──> sidebar, quick switcher, busca
  │                        ▲
  │                        │ reparse incremental
  └──watcher (debounce)────┘

aba ativa ──lerTexto──> CodeMirror / Excalidraw
   │
   └──edição──> debounce 800ms ──> escritaAtomica ──> disco
                                        │
                                        └─> registra no mapa anti-loop
```

### O bug número 1 deste tipo de app

O app grava, o watcher avisa que o arquivo mudou, o app recarrega e joga fora o que o usuário acabou de digitar. A mitigação vive em `escritaAtomica.ts` e a regra normativa está na seção 10 do documento 02. Em resumo: mapa de `path → hash` das gravações próprias, evento ignorado quando o path está no mapa e o conteúdo bate, entradas expirando em 2 segundos. Nem um flag booleano nem só o timestamp resolvem.

### Watcher

- debounce de 150 ms agrupando eventos;
- ignora qualquer pasta com ponto no início (inclui `.trash/`, `.excalisidian/`, `.git/`), a pasta `node_modules/`, e **arquivos com extensão `.excalisidian-tmp`** — sem isso, cada salvamento gera um par create/remove que atravessa o debounce e cai no reconciliador;
- um `git checkout` num vault versionado gera milhares de eventos em um segundo: o handler tem que ser capaz de processar um lote, não um evento por vez.

---

## 5. Excalidraw embutido

```ts
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
```

Pontos verificados na documentação e que **têm que ser feitos**:

1. **O CSS deixou de ser injetado automaticamente na 0.18** — o import acima é obrigatório. Muito tutorial na web ainda mostra `dist/excalidraw.min.css`, que é o caminho antigo.
2. **As fontes carregam de CDN por padrão.** Num app desktop offline isso quebra, e quebra em silêncio: sem rede, o texto some ou troca de fonte. Copie **o conteúdo** de `node_modules/@excalidraw/excalidraw/dist/prod/fonts` para a raiz de `public/` e defina `window.EXCALIDRAW_ASSET_PATH = "/"` **antes** de montar o componente. Copiar a pasta inteira em vez do conteúdo põe os arquivos em `/fonts/…` e exige `"/fonts/"` — é o erro mais comum aqui. Esses arquivos mantêm os nomes em inglês da biblioteca; a regra de nomes em português vale para o código do projeto, não para assets de terceiros.
3. **Não use `ref`.** Foi removido na 0.17; a forma atual de obter a API imperativa é a prop `excalidrawAPI`.
4. **O componente é não-controlado.** Você lê com `getSceneElements()`, `getAppState()`, `getFiles()` e escreve com `updateScene()`. O autosave é orquestrado por você, a partir do `onChange` com debounce.

   Detalhe da 0.18 que muda comportamento: `updateScene` trocou `commitToHistory: boolean` por `captureUpdate: CaptureUpdateAction`, e o default passou a ser `EVENTUALLY`. Consequência direta: recarregar do disco na faixa de conflito precisa de `CaptureUpdateAction.NEVER`, senão a recarga entra no histórico de desfazer.
5. **A UI nativa está ligada** (doc 09, ADR-20 — decisão revertida em relação a uma versão anterior deste documento). **Esconder ferramentas individuais da toolbar não tem API oficial** — é a issue #3012, aberta, e `UIOptions.tools` só cobre `image` (confirmado no `.d.ts` do pacote: qualquer outra chave é apagada na normalização interna) — não dá pra esconder frame/embed/laser/Mermaid mesmo querendo, sem depender de CSS sobre classes internas (frágil entre versões, e foi exatamente essa fragilidade que motivou construir uma UI própria a princípio; a decisão final foi que os recursos que a UI própria não conseguia igualar — camadas, espelhar, cantos, agrupar, alinhar/distribuir de verdade — pesavam mais). `UIOptions.canvasActions` continua controlando os itens do `MainMenu` (salvar, exportar, limpar, trocar tema).
6. **No máximo duas instâncias montadas ao mesmo tempo.** Um canvas em aba escondida é desmontado e reidratado ao voltar, o que **descarta o histórico de desfazer daquele desenho** — comportamento aceito, registrado em RF5.14.

   Com três ou mais painéis de canvas visíveis (o dockview permite), as duas instâncias vivas são as dos painéis usados mais recentemente. Os demais mostram o SVG estático do desenho com uma faixa "Clique para editar" e montam ao receber foco, trocando de lugar com a instância mais antiga.
7. **Bloqueie `Ctrl+Delete`** e reencaminhe os atalhos de aplicação: a regra completa está na seção 6.1 do documento 04. Desligar o item de menu por `UIOptions.canvasActions` não desliga o atalho de teclado.

### Serialização

`formatoDesenho.ts` faz a ponte entre a cena do Excalidraw e o `.draw.md`:

```ts
parseDesenho(md: string): {
  frontmatter: Record<string, unknown>;
  verso: string;                 // conteúdo livre do usuário, preservado
  textElements: Map<string,string>;
  elementLinks: Map<string,string>;
  embeddedFiles: Map<string,string>;
  cena: { elements: ExcalidrawElement[]; appState: Partial<AppState> };
}

serializarDesenho(dados): string   // ordem estável de elementos e de chaves
```

Na leitura, o mapa `files` é reidratado lendo cada arquivo referenciado em `## Embedded Files` e convertendo para data URL em memória. Na gravação, `files` sai vazio.

---

## 6. Layout com dockview

- `dockview-react` 8.2.0, sem dependências, com drag de aba para dividir e serialização por `api.toJSON()` / `api.fromJSON()`.
- Nos `params` de cada painel guarde **só o caminho do arquivo**, nunca o conteúdo. O conteúdo é reidratado do disco na montagem.
- `workspace/<hash-do-vault>.json` é gravado com debounce de 1 s a cada mudança de layout. Um arquivo por vault: trocar de vault não pode sobrescrever o layout do anterior.
- Se `fromJSON` falhar (arquivo corrompido, versão antiga), o app abre com layout vazio e avisa uma vez. Nunca trava por causa disso.

### 6.1 Diálogo sempre por portal

`src/ui/Dialog.tsx` renderiza **por portal em `document.body`**, não na posição em que o
componente aparece na árvore React (doc 09, ADR-37). Motivo: qualquer ancestral com
`transform` — inclusive um `translateX(0)` residual de uma animação com modo de preenchimento
`both` — vira bloco de contenção CSS e confina o `fixed inset-0` do diálogo dentro dele
(era o que deixava a tela "Criar vault" espremida dentro da sidebar). Regra derivada: **não
use animação com `both` em elemento que possa ter descendente `position: fixed`.**

O comentário de topo de `RaizDialogos.tsx` diz "nada além dele renderiza `Dialog`
diretamente", mas hoje cinco componentes renderizam `Dialog` fora dali. Com o portal, isso
deixou de causar o problema de posicionamento que a regra existia para evitar — a divergência
está registrada aqui, sem promessa de correção.

---

## 7. Estado

`zustand` 5.0.15, em `src/estado/`:

| Store | Conteúdo | Persistência |
|---|---|---|
| `vaultStore` | raiz, árvore, índice, backlinks, status de indexação | `cache/index.json`, no idle |
| `documentosStore` | documentos abertos, conteúdo em memória por aba, sincronização com o disco | não persiste sozinho — vive enquanto a aba existe |
| `workspaceStore` | layout do dockview, aba ativa, estado por documento | `workspace/<hash-do-vault>.json`, debounce 1 s |
| `prefsStore` | tema (`claro`/`escuro`/`sistema`), tamanho da janela | `settings.json` via plugin-store |
| `tarefasStore` | painel de tarefas (doc 10-tarefas.md) | `.excalisidian/tarefas.json` |
| `agenteStore` | config do agente de IA, participação, sugestões, uso de tokens | `settings.json` (config) + `%APPDATA%/Excalisidian/agente/<hash>/` (memória) — doc 11 |
| `atualizacaoStore` | estado do updater (verificação, download, aplicar) | não persiste |
| `dialogoStore`, `sobreposicaoStore`, `revelacaoStore` | diálogos e sobreposições de UI abertos no momento | não persistem |
| `papel-parede-home-store` | papel de parede da tela Início | `%APPDATA%/Excalisidian/` via `papel_parede.rs` |
| `contaStore` | estado da conta (usuário, plano, token) | só o **token** persiste, no cofre do Windows (doc 09, ADR-34); se o cofre falhar, a sessão vale só até fechar o app |

### 7.1 `contaStore` × porta-token

O token de sessão existe em dois lugares, deliberadamente:

- `contaStore` (zustand, reativo) — é o que a **interface** lê, porque componente React
  precisa de re-render quando a sessão muda.
- `src/servico/sessao.ts` — um módulo simples com estado próprio (a "porta-token"), não um
  store zustand, porque `src/agente/cliente.ts` roda fora do React e não pode usar hook. É o
  que o **transporte** (cliente HTTP do serviço e do agente) lê.

A duplicação é deliberada, não descuido: sincronizar os dois é responsabilidade do
`contaStore` ao entrar, renovar e sair.

`vaultsRecentes` (lista de vaults recentes, doc 12) mora em `settings.json` mas hoje é
funções puras em `src/vault/vaultsRecentes.ts`, não um store zustand. **Não existe**
`vaultPrefsStore`: as preferências por vault (pasta de anexos, local de nova nota, formato
de link, lixeira) fazem parte do desenho ainda não implementado do `vault.json` — ver doc
02 §1.

Nada de conteúdo de arquivo no store global de vault/workspace. O texto e a cena da aba
ativa vivem em `documentosStore`/no estado do CodeMirror e do Excalidraw.

---

## 8. Desempenho

- Walk inicial em Rust, uma chamada só.
- Leitura de conteúdo é preguiçosa: só ao abrir a aba.
- Parsing e indexação num Web Worker, para não travar a UI.
- Lista de arquivos virtualizada (`@tanstack/react-virtual`) — uma árvore com 5 000 nós renderizada inteira derruba o frame rate.
- Índice do minisearch persistido com `toJSON()` e atualizado por documento com `discard`/`replace`.

## 9. Armadilhas de plataforma

- **UTF-8:** ler e gravar sempre em UTF-8. Se o arquivo vier com BOM (comum em arquivos criados por ferramentas Windows), remova o `﻿` na leitura e **não** o reescreva.
- **Normalização Unicode:** normalize todo caminho e todo nome com `.normalize("NFC")` antes de comparar. Sem isso, `ação.md` não casa com `[[ação]]` dependendo de como o arquivo foi criado.
- **Separadores:** internamente sempre `/`; converta só na fronteira do filesystem.
- **Case:** no Windows a comparação de caminhos é case-insensitive. Guarde uma chave canônica em minúsculas.
- **MAX_PATH:** o limite de 260 caracteres do Windows é atingido mais cedo do que parece em vaults com pastas aninhadas e títulos longos. Valide em 240.

## 10. Testes mínimos

Não é para ter cobertura alta. É para ter estes:

1. `parseDesenho(serializarDesenho(x)) === x` para uma cena com texto, imagem, link e post-it.
2. Serializar duas vezes a mesma cena produz bytes idênticos.
3. Resolução de link com nomes duplicados em pastas diferentes escolhe o esperado, e `[[Arquitetura]]` resolve para a nota quando existem `Arquitetura.md` e `Arquitetura.draw.md`.
4. Rename atualiza links em nota e dentro de desenho.
5. Escrita atômica seguida de evento do watcher não dispara recarga.
6. Validação de nome recusa `CON.md`, `a:b.md` e nome terminado em ponto.
7. Restaurar da lixeira com colisão de nome gera `(restaurado)`.
8. `blockId` gerado a partir do id do elemento é estável e nunca contém `_`.
9. Texto de canvas contendo `%%`, três crases, uma linha `## Scene`, uma linha começando com `^` e uma linha em branco no meio sobrevive a um ciclo de gravação e leitura.
10. `Ctrl+Delete` dentro do canvas não apaga a cena.


---

## 11. Empacotamento

Fora do MVP funcional, mas precisa existir antes de instalar em outra máquina:

- `tauri.conf.json` com identificador, ícones e bundle `nsis` para Windows.
- `src-tauri/capabilities/main.json` declarando as permissões dos plugins fs, dialog e store. As permissões são declaradas ali; o **escopo** de caminho é concedido em runtime pelo `escolher_vault`. O plugin-http (agente de IA, doc 11) também é escopado ali — por host, não por caminho.
- Assinatura de código no Windows: sem certificado, o SmartScreen avisa na primeira instalação. Decisão do usuário (2026-09-04): aceitável por ora, mesmo distribuindo — ver `docs/superpowers/specs/2026-09-04-github-release-e-autoupdate-design.md`.
- Updater: implementado (2026-09-04) via `tauri-plugin-updater`, assinatura minisign própria — ver o spec acima.
- Licenças: Excalidraw é MIT; as fontes copiadas do pacote (Excalifont incluída) são OFL-1.1. As fontes do design system (Fraunces, Instrument Sans, IBM Plex Mono), embutidas em `public/fontes/`, também são OFL-1.1 — ver `THIRD_PARTY_LICENSES.md`.
