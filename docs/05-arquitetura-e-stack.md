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
| Build | Vite + React + TypeScript | Vite 8.2.2 · React 19.2.8 |
| Editor de texto | **CodeMirror 6** | `@codemirror/view` 6.43.9 · `@codemirror/lang-markdown` 6.5.2 · `@lezer/markdown` 1.7.2 |
| Canvas | `@excalidraw/excalidraw` | **0.18.1** |
| Abas e split | `dockview-react` | 8.2.0 |
| Parsing markdown | `unified` 11.0.5 + `remark-parse` 11.0.0 + `remark-gfm` 4.0.1 | |
| Frontmatter | `gray-matter` | 4.0.3 |
| Busca | `minisearch` | 7.2.0 |
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

**Atalho possível:** o pacote `@atomic-editor/editor` (0.6.2, MIT) é React + CM6 com live preview inline estilo Obsidian, incluindo wikilinks. Tem um mantenedor só e pouca tração — trate como **base para fork/vendor**, não como dependência de longo prazo. Vale gastar um dia testando com arquivos reais antes de decidir escrever do zero; se atender, corta semanas.

---

## 2. Estrutura de pastas

```
src/
├── main.tsx
├── app/
│   ├── App.tsx
│   ├── comandos/            registro de comandos + atalhos
│   └── atalhos.ts
├── vault/
│   ├── VaultAdapter.ts      interface: read, write, list, watch, move, delete
│   ├── TauriVaultAdapter.ts implementação sobre plugin-fs
│   ├── caminhos.ts          normalização NFC, "/" , validação Windows
│   ├── escritaAtomica.ts    tmp + rename + mapa anti-loop
│   └── lixeira.ts
├── indice/
│   ├── parser.ts            markdown -> FileMeta
│   ├── wikilink.ts          parser próprio de [[...]]
│   ├── cache.ts             load/save de index.json, reparse incremental
│   ├── resolucao.ts         resolver link -> caminho
│   └── backlinks.ts
├── busca/
│   └── minisearchIndex.ts
├── editor/
│   ├── EditorNota.tsx
│   └── extensoes/           livePreview, wikilink, embed, atalhos, tema
├── canvas/
│   ├── EditorDesenho.tsx
│   ├── formatoDesenho.ts    parse e serialize do .draw.md (draw-json e draw-json-lz)
│   ├── postit.ts
│   └── renderSvg.ts         para o embed em nota
├── layout/
│   ├── Workspace.tsx        dockview
│   └── persistencia.ts
├── ui/                      componentes do design system
├── estado/
│   ├── vaultStore.ts
│   ├── workspaceStore.ts
│   └── prefsStore.ts
└── estilos/
    └── globals.css          tokens

src-tauri/
├── src/
│   ├── main.rs
│   ├── vault.rs             escolher_vault, permitir_vault, walk_vault
│   └── watcher.rs
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
  existe(path: string): Promise<boolean>;
  observar(cb: (eventos: EventoArquivo[]) => void): () => void;
}
```

---

## 3. Ponte com o Rust

Quatro pontos de contato com o Rust, e não mais que isso sem uma boa razão:

| Comando | Assinatura | Por quê |
|---|---|---|
| `escolher_vault` | `() -> Option<String>` | abre o diálogo de pasta, concede escopo de FS ao caminho e devolve |
| `permitir_vault` | `(path: String) -> Result<()>` | reaplica o escopo no boot, para o vault salvo |
| `walk_vault` | `(path: String) -> Vec<EntradaArquivo>` | percorre a pasta inteira em uma chamada; devolve `path`, `mtimeMs`, `birthtimeMs`, `size`, `isDir` |
| `observar_vault` | `(path: String) -> Result<()>` + canal de eventos | file watcher com debounce, emitindo **lotes** para o front |
| `lixeira_sistema` | `(path: String) -> Result<()>` | só quando RF7.6 sair do P2 — ver a nota abaixo |

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

---

## 7. Estado

`zustand` 5.0.15, três stores:

| Store | Conteúdo | Persistência |
|---|---|---|
| `vaultStore` | raiz, árvore, índice, backlinks, status de indexação | `cache/index.json`, no idle |
| `workspaceStore` | layout do dockview, aba ativa, estado por documento | `workspace/<hash-do-vault>.json`, debounce 1 s |
| `prefsStore` | tema (`claro`/`escuro`/`sistema`), tamanho da janela, vaults recentes | `settings.json` via plugin-store |
| `vaultPrefsStore` | pasta de anexos, local de novas notas, formato de link, lixeira | `.excalisidian/vault.json`, **dentro do vault** |

Nada de conteúdo de arquivo no store global. O conteúdo vive dentro do estado do CodeMirror / Excalidraw da aba.

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
- `src-tauri/capabilities/main.json` declarando as permissões dos plugins fs, dialog e store. As permissões são declaradas ali; o **escopo** de caminho é concedido em runtime pelo `escolher_vault`.
- Assinatura de código no Windows: sem certificado, o SmartScreen avisa na primeira instalação. Decisão do usuário (2026-09-04): aceitável por ora, mesmo distribuindo — ver `docs/superpowers/specs/2026-09-04-github-release-e-autoupdate-design.md`.
- Updater: implementado (2026-09-04) via `tauri-plugin-updater`, assinatura minisign própria — ver o spec acima.
- Licenças: Excalidraw é MIT; as fontes copiadas do pacote (Excalifont incluída) são OFL-1.1 — ver `THIRD_PARTY_LICENSES.md`.
