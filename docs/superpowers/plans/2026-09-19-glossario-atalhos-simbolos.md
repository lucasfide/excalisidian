# Glossário de atalhos e símbolos — plano de implementação

> **Para agentes:** SUB-SKILL: superpowers:subagent-driven-development. Passos em checkbox (`- [ ]`).
> Cada agente recebe UMA tarefa (A–E). Não faça commit. Não toque em arquivo fora da lista da
> sua tarefa — em especial `README.md`, `.github/workflows/release.yml`,
> `src/editor/EditorNota.tsx`, `src/layout/AbaDocumento.tsx` e `src/editor/extensoes/caminhoDaNota*`,
> que têm alterações do usuário em andamento.

**Objetivo:** uma tela, aberta pelas Configurações, que lista todos os atalhos de teclado do app
e todos os símbolos de formatação do texto, com filtro — cumpre o RF8.3 ("Tela de atalhos de
teclado, listando todos os comandos", doc 03).

**Arquitetura:** dois catálogos de dados puros (`src/app/glossario/`) com testes que impedem o
glossário de mentir — o de atalhos confere contra os keymaps reais do editor, o de símbolos
confere que cada sintaxe é mesmo reconhecida pelo parser markdown do editor. Um diálogo
(`DialogoGlossario.tsx`) empilhado sobre as Configurações desenha os dois, com o sistema de
design existente (doc 06). Nenhuma dependência nova.

**Stack:** React 19 + TypeScript, CodeMirror 6 (`@codemirror/lang-markdown` `markdownLanguage`),
Vitest (`environment: "node"`), Tailwind v4 com os tokens de `src/estilos/globals.css`.

**Tipos compartilhados (já existem, não altere sem motivo):** `src/app/glossario/tipos.ts` —
`ComboTeclas`, `Atalho`, `GrupoAtalho`, `Simbolo`, `GrupoSimbolo`, `TipoAmostra`. Leia antes
de começar.

## Restrições globais

- Português do Brasil em nomes de arquivo, variáveis, componentes e comentários (CLAUDE.md).
- Interface em pt-BR, sentence case, sem emoji.
- Nenhum valor de cor, fonte, espaçamento, raio ou sombra fora dos tokens de `globals.css`;
  nenhuma classe de cor padrão do Tailwind (`bg-background`, `text-foreground`...).
- Atalho é mostrado em `meta` (IBM Plex Mono, caixa alta), como a `PaletaComandos` ("CTRL O").
- O glossário só lista o que FUNCIONA hoje no código. Onde o doc diverge do código, vale o
  código, e a divergência é registrada (Tarefa E).
- Rodar testes com saída crua: `rtk proxy npx vitest run <caminho>`; tipos:
  `rtk proxy npx tsc --noEmit -p .`

---

## Experiência (decidido)

**Onde fica.** Nas Configurações, seção nova **"Atalhos e símbolos"**, logo depois de "Largura
da nota": uma linha de ajuda ("Tudo o que dá pra fazer pelo teclado e os símbolos que formatam
o texto.") e um `Botao` compacto **"Abrir glossário"**. O glossário abre como um segundo
`Dialog` por cima das Configurações — a pilha de diálogos já existe (`Dialog.tsx`, `fila`), então
Esc fecha só o glossário e devolve o foco ao botão.

**O que tem.**

```
┌ Atalhos e símbolos ──────────────────────────────────────────────┐
│ [ Filtrar por ação, tecla ou símbolo…                          ] │
│ [Atalhos] [Símbolos]                                             │
│                                                                  │
│ GERAL                                                            │
│ Abrir a paleta de comandos                          [CTRL] [P]   │
│ Buscar notas e desenhos                  [CTRL] [O]  ou  [CTRL] [SHIFT] [F] │
│ ...                                                              │
│ ABAS E DIVISÕES                                                  │
│ Novo desenho                                        [CTRL] [D]   │
│   NA ABA EM BRANCO                                               │
└──────────────────────────────────────────────────────────────────┘

Aba Símbolos:
│ TEXTO                                                            │
│ **texto**        texto(negrito)        Negrito          [CTRL][B]│
│ ==texto==        texto(realçado)       Destaque   [CTRL][SHIFT][H]│
```

- **Filtro** no topo, focado ao abrir (é o primeiro focável do diálogo). Filtra a aba ativa por
  descrição, grupo, sintaxe e rótulo das teclas; ignora acento e caixa ("negrito", "ctrl b",
  "==" e "destaque" acham a mesma linha). Sem resultado: "Nada encontrado para «x».", mesmo
  texto da paleta de comandos.
- **Duas abas** com `GrupoBotoes`: "Atalhos" (padrão) e "Símbolos". A aba escolhida não é
  persistida — abre sempre em "Atalhos".
- **Atalhos**: por grupo (título do grupo em `meta` `tinta-suave`). Cada linha: descrição à
  esquerda (`text-[13px]` `tinta`), teclas à direita como "teclas de máquina" (`kbd`, `meta`,
  hairline `regua`, `rounded-controle`, fundo `superficie`). Combinações alternativas separadas
  por "ou" (`text-pequeno tinta-suave`). Condição ("Na aba em branco") embaixo da descrição em
  `meta` `tinta-suave`. Gesto de mouse ("Clique triplo") vira um `kbd` com o texto do gesto.
- **Símbolos**: por grupo. Cada linha em três colunas: **o que se digita** (mono, `tinta-media`,
  exatamente como fica no arquivo), **como fica** (amostra desenhada com os mesmos estilos do
  editor), **descrição** + atalho equivalente quando existir (ex.: negrito mostra CTRL B).
  "Enquanto você digita" lista os símbolos que disparam comportamento (`[[` abre sugestões,
  ```` ``` ```` fecha o bloco, `| a | b |` + Enter cria tabela) — amostra `comportamento`, só texto.
- **Teclas por plataforma:** `Mod` mostra "Ctrl" no Windows/Linux e "⌘" no macOS
  (`navigator.userAgent` contém "Mac"). `Alt` vira "⌥" no macOS. Setas viram ↑ ↓ ← →.
- **Tamanho:** `Dialog` com `className="max-w-2xl"`; a lista rola dentro de
  `max-h-[60vh] overflow-y-auto`, filtro e abas ficam parados em cima.
- **Movimento/acessibilidade:** herda do `Dialog` (surgir 160ms, `prefers-reduced-motion`, foco
  preso). Lista de atalhos é `<dl>`: `<dt>` descrição, `<dd>` teclas; teclas em `<kbd>`. As abas
  usam `aria-pressed` (já no `GrupoBotoes`).

## Comportamento no código (decidido)

- **Ctrl+K no editor de nota** passa a inserir link (`inserirLink()` de `comandosMarkdown.ts`),
  cumprindo o RF2.11 — hoje não há binding nenhum e o glossário não pode listar um atalho morto.
- **Ctrl+E fica como código inline**, que é o que o código faz. O doc 03 (RF2.4 e RF2.11) diz
  Ctrl+E = modo leitura e Ctrl+` = código; a divergência é registrada no doc 09 (Tarefa E), sem
  mudar comportamento.
- O catálogo de atalhos NÃO gera os keymaps (refatorar Workspace/App pra ler dele é outra
  tarefa). Em troca, um teste de deriva falha se um keymap do editor ganhar uma tecla que o
  catálogo não tem.

---

## Arquivos

| Arquivo | Tarefa | Responsabilidade |
|---|---|---|
| `src/app/glossario/tipos.ts` | — (pronto) | tipos compartilhados |
| `src/app/glossario/teclas.ts` + `.test.ts` | C | combo → rótulos de tecla por plataforma |
| `src/app/glossario/filtrarGlossario.ts` + `.test.ts` | C | filtro sem acento/caixa |
| `src/app/glossario/catalogoAtalhos.ts` + `.test.ts` | A | lista de atalhos + teste de deriva |
| `src/editor/extensoes/atalhosFormatacao.ts` | A | exporta as teclas; adiciona Ctrl+K |
| `src/editor/extensoes/quebraDeBloco.ts`, `selecionarCorpoDaNota.ts` | A | só exportar as teclas (sem mudar comportamento) |
| `src/app/glossario/catalogoSimbolos.ts` + `.test.ts` | B | lista de símbolos + teste de parser |
| `src/ui/excalisidian/DialogoGlossario.tsx` | D | o diálogo |
| `src/ui/excalisidian/TeclasAtalho.tsx` | D | `kbd` de uma lista de combos |
| `src/ui/excalisidian/AmostraSimbolo.tsx` | D | amostra "como fica" |
| `src/ui/excalisidian/DialogoPreferencias.tsx` | D | seção e botão de abrir |
| `docs/03`, `docs/04`, `docs/06`, `docs/09` | E | textos, inventário, RF8.3, divergências |

Ordem: **A, B e C em paralelo** → **D** (usa os três) e **E** em paralelo → revisão.

---

### Tarefa A — Catálogo de atalhos e Ctrl+K (esforço médio)

**Interfaces:**
- Consome: `Atalho`, `GrupoAtalho` de `tipos.ts`.
- Produz: `export const CATALOGO_ATALHOS: readonly Atalho[]` e
  `export function atalhoPorId(id: string): Atalho | undefined` em `catalogoAtalhos.ts`;
  `export const TECLAS_FORMATACAO: readonly string[]` em `atalhosFormatacao.ts`;
  `export const TECLAS_QUEBRA_DE_BLOCO` em `quebraDeBloco.ts`;
  `export const TECLAS_SELECIONAR_CORPO` em `selecionarCorpoDaNota.ts`.

- [ ] **A1. Levantar a verdade.** Ler, sem supor: `src/layout/Workspace.tsx` (handler de abas,
  ~linha 145), `src/app/App.tsx` (Ctrl+\ e Ctrl+,), `src/editor/extensoes/atalhosFormatacao.ts`,
  `quebraDeBloco.ts`, `selecionarCorpoDaNota.ts`, `src/editor/atomico/AtomicCodeMirrorEditor.tsx`
  (keymap ~linha 346: `closeBracketsKeymap`, `historyKeymap`, `searchKeymap`, `markdownKeymap`,
  `indentWithTab`, `defaultKeymap`), `src/canvas/atalhosCanvas.ts`, doc 03 RF5.3 (teclas de
  ferramenta do Excalidraw) e doc 04 §6.1. Para os keymaps do CodeMirror, abrir o fonte em
  `node_modules/@codemirror/{commands,search}/dist/index.js` e confirmar cada tecla que for
  listar (ex.: `Alt-ArrowUp` = mover linha, `Mod-Shift-k`... confira o nome exato).
  Atenção: `Mod-i` do `defaultKeymap` é sobrescrito pelo itálico (Prec.high); `Mod-d` é
  "selecionar próxima ocorrência" no editor, e "novo desenho" só na aba em branco.
- [ ] **A2. Exportar as teclas dos keymaps próprios**, sem mudar comportamento. Em
  `atalhosFormatacao.ts`, montar os bindings a partir de uma lista e adicionar Ctrl+K:

```ts
import { envolver, inserirLink } from "./comandosMarkdown";

const BINDINGS = [
  { key: "Mod-b", run: envolver("**") },
  { key: "Mod-i", run: envolver("*") },
  { key: "Mod-e", run: envolver("`") },
  { key: "Mod-Shift-x", run: envolver("~~") },
  { key: "Mod-Shift-h", run: envolver("==") },
  // RF2.11: Ctrl+K insere link. Antes não havia binding nenhum (glossário, 19/09/2026).
  { key: "Mod-k", run: inserirLink() },
] as const;

/** Teclas deste keymap — lidas pelo teste de deriva do glossário (catalogoAtalhos.test.ts). */
export const TECLAS_FORMATACAO: readonly string[] = BINDINGS.map((b) => b.key);

export const atalhosFormatacao = Prec.high(
  keymap.of(BINDINGS.map((b) => ({ ...b, preventDefault: true }))),
);
```

  Em `quebraDeBloco.ts` exportar `TECLAS_QUEBRA_DE_BLOCO = ["Enter", "Shift-Enter"]` usado no
  próprio `keymap.of`; idem `TECLAS_SELECIONAR_CORPO = ["Mod-a"]`. Conferir em
  `comandosMarkdown.ts` que `inserirLink()` devolve `false` em somente leitura.
- [ ] **A3. Teste primeiro** (`catalogoAtalhos.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { CATALOGO_ATALHOS, atalhoPorId } from "./catalogoAtalhos";
import { TECLAS_FORMATACAO } from "../../editor/extensoes/atalhosFormatacao";
import { TECLAS_QUEBRA_DE_BLOCO } from "../../editor/extensoes/quebraDeBloco";
import { TECLAS_SELECIONAR_CORPO } from "../../editor/extensoes/selecionarCorpoDaNota";

const todasAsTeclas = new Set(CATALOGO_ATALHOS.flatMap((a) => a.teclas));

describe("catálogo de atalhos", () => {
  it("ids únicos", () => {
    const ids = CATALOGO_ATALHOS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("toda linha tem tecla ou gesto", () => {
    for (const a of CATALOGO_ATALHOS) expect(a.teclas.length > 0 || !!a.gesto).toBe(true);
  });
  it.each([
    ["formatação", TECLAS_FORMATACAO],
    ["quebra de bloco", TECLAS_QUEBRA_DE_BLOCO],
    ["selecionar corpo", TECLAS_SELECIONAR_CORPO],
  ])("deriva: toda tecla do keymap de %s está no glossário", (_, teclas) => {
    for (const t of teclas) expect(todasAsTeclas, t).toContain(t);
  });
  it("Ctrl+K insere link na nota", () => {
    expect(atalhoPorId("link")?.teclas).toContain("Mod-k");
  });
  it("combos seguem a ordem Mod, Alt, Shift", () => {
    for (const t of todasAsTeclas) {
      if (t === "Mod-1…9") continue;
      const mods = t.split("-").slice(0, -1);
      const ordem = ["Mod", "Alt", "Shift"];
      expect(mods, t).toEqual([...mods].sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b)));
    }
  });
});
```

  Rodar: `rtk proxy npx vitest run src/app/glossario/catalogoAtalhos.test.ts` → falha (módulo não existe).
- [ ] **A4. Escrever o catálogo.** No mínimo estas linhas (descrições são texto de interface —
  sentence case, infinitivo; ajustar só se A1 mostrar que o código faz outra coisa):

| id | grupo | descrição | teclas / gesto | condição |
|---|---|---|---|---|
| paleta | Geral | Abrir a paleta de comandos | Mod-p | |
| buscar | Geral | Buscar notas e desenhos | Mod-o, Mod-Shift-f | |
| configuracoes | Geral | Abrir as configurações | Mod-, | |
| salvar | Geral | Salvar agora | Mod-s | |
| painel-tarefas | Geral | Mostrar ou esconder as tarefas | Mod-\\ | |
| nova-aba | Abas e divisões | Abrir uma aba em branco | Mod-t | |
| nova-nota | Abas e divisões | Criar uma nota | Mod-t | Na aba em branco |
| novo-desenho | Abas e divisões | Criar um desenho | Mod-d | Na aba em branco |
| fechar-aba | Abas e divisões | Fechar a aba | Mod-w | |
| reabrir-aba | Abas e divisões | Reabrir a última aba fechada | Mod-Shift-t | |
| proxima-aba | Abas e divisões | Ir para a próxima aba | Mod-Tab | |
| aba-anterior | Abas e divisões | Ir para a aba anterior | Mod-Shift-Tab | |
| aba-por-numero | Abas e divisões | Ir para a aba pelo número | Mod-1…9 | |
| dividir-direita | Abas e divisões | Dividir à direita | Mod-Alt-ArrowRight | |
| dividir-abaixo | Abas e divisões | Dividir abaixo | Mod-Alt-ArrowDown | |
| negrito | Nota: formatação | Negrito | Mod-b | |
| italico | Nota: formatação | Itálico | Mod-i | |
| codigo | Nota: formatação | Código | Mod-e | |
| riscado | Nota: formatação | Riscado | Mod-Shift-x | |
| destaque | Nota: formatação | Destaque | Mod-Shift-h | |
| link | Nota: formatação | Inserir link | Mod-k | |
| nova-linha | Nota: edição | Nova linha, em bloco novo | Enter | |
| nova-linha-mesmo-bloco | Nota: edição | Nova linha no mesmo bloco | Shift-Enter | |
| recuar | Nota: edição | Aumentar ou diminuir o recuo | Tab, Shift-Tab | |
| selecionar-tudo | Nota: edição | Selecionar o texto da nota | Mod-a | (conferir o que `selecionarCorpo` faz com o título) |
| selecionar-bloco | Nota: edição | Selecionar o bloco | gesto "Clique triplo" | |
| mover-bloco | Nota: edição | Mover o bloco | gesto "Arrastar a alça ⠿" | |
| desfazer | Nota: edição | Desfazer | Mod-z | |
| refazer | Nota: edição | Refazer | Mod-y, Mod-Shift-z | |
| mover-linha | Nota: edição | Mover a linha para cima ou para baixo | Alt-ArrowUp, Alt-ArrowDown | |
| copiar-linha | Nota: edição | Duplicar a linha para cima ou para baixo | Alt-Shift-ArrowUp, Alt-Shift-ArrowDown | |
| apagar-linha | Nota: edição | Apagar a linha | Mod-Shift-k | |
| abrir-link-nova-aba | Nota: edição | Abrir o link numa aba nova | gesto "Ctrl+clique" | |
| localizar | Nota: localizar | Localizar na nota | Mod-f | |
| proxima-ocorrencia | Nota: localizar | Próxima ocorrência | Mod-g, F3 | |
| ocorrencia-anterior | Nota: localizar | Ocorrência anterior | Mod-Shift-g, Shift-F3 | |
| selecionar-proxima | Nota: localizar | Selecionar a próxima ocorrência da seleção | Mod-d | Numa nota |
| ir-para-linha | Nota: localizar | Ir para a linha | Mod-Alt-g | |
| ferramentas | Desenho | Seleção, mão, retângulo, losango, elipse, seta, linha, mão livre, texto, imagem, borracha | v, h, r, d, o, a, l, p, t, 9, e — uma linha por ferramenta (id `ferramenta-<nome>`) | |
| link-elemento | Desenho | Anexar link ao elemento | Mod-k | Com um elemento selecionado |
| duplicar-elemento | Desenho | Duplicar | Mod-d | Com um elemento selecionado |
| agrupar | Desenho | Agrupar / Desagrupar | Mod-g, Mod-Shift-g | (duas linhas) |
| zoom | Desenho | Aproximar, afastar, zoom 100% | Mod-=, Mod--, Mod-0 | (três linhas; conferir as teclas reais do Excalidraw 0.18.1 em node_modules) |

  Confira os três "conferir" antes de escrever; se uma tecla não existir no código, NÃO liste.
  Em cada linha, comentário curto com o arquivo de origem (`// Workspace.tsx`).
- [ ] **A5.** Rodar o teste até passar; rodar `rtk proxy npx vitest run src/editor` (nada
  quebrado) e `rtk proxy npx tsc --noEmit -p .`.
- [ ] **A6.** Relatório: lista de atalhos que o doc cita e o código não tem, e vice-versa.

### Tarefa B — Catálogo de símbolos (esforço médio)

**Interfaces:** Consome `Simbolo`, `GrupoSimbolo`, `TipoAmostra` de `tipos.ts`. Produz
`export const CATALOGO_SIMBOLOS: readonly Simbolo[]`. `atalhoEquivalente` usa ids da Tarefa A:
`negrito`, `italico`, `codigo`, `riscado`, `destaque`, `link`, `nova-linha-mesmo-bloco`.

- [ ] **B1. Levantar a verdade:** doc 02 (tabela de sintaxe, ~linha 111), doc 03 RF2.2/RF2.7/
  RF2.9/RF2.15/RF2.16, `src/editor/atomico/highlight.ts` (`==`), `edit-helpers.ts` (`* ` vira
  lista, `**` estende o par, ```` ``` ```` fecha sozinho), `src/editor/extensoes/tabelaMarkdown.ts`,
  `quebraDeBloco.ts` (Shift+Enter grava `  \n`), `wiki-links.ts` (autocomplete em `[[`).
  Callouts, footnotes e `[[## busca]]` estão fora do MVP (doc 02) — não listar.
- [ ] **B2. Teste primeiro** (`catalogoSimbolos.test.ts`). Para cada símbolo com amostra
  visual, o parser do editor tem que reconhecer a sintaxe — o glossário não pode ensinar algo
  que o editor não desenha:

```ts
import { describe, it, expect } from "vitest";
import { markdownLanguage } from "@codemirror/lang-markdown";
import { highlightMarkdown } from "../../editor/atomico/highlight"; // conferir o nome exportado
import { CATALOGO_SIMBOLOS } from "./catalogoSimbolos";

const parser = markdownLanguage.parser.configure(highlightMarkdown);
function nos(texto: string): Set<string> {
  const s = new Set<string>();
  parser.parse(texto).iterate({ enter: (n) => void s.add(n.name) });
  return s;
}

// Nó do lezer que prova que a sintaxe foi entendida. Links internos/embeds/comentário/id de
// bloco não têm nó no parser base (são decorações próprias) — ficam de fora deste mapa.
const NO_ESPERADO: Partial<Record<string, string>> = {
  negrito: "StrongEmphasis", italico: "Emphasis", riscado: "Strikethrough",
  destaque: "Highlight", codigo: "InlineCode", "titulo-1": "ATXHeading1",
  "titulo-2": "ATXHeading2", "titulo-3": "ATXHeading3", citacao: "Blockquote",
  lista: "BulletList", "lista-numerada": "OrderedList", tarefa: "Task",
  "tarefa-feita": "Task", "linha-horizontal": "HorizontalRule", "bloco-codigo": "FencedCode",
  tabela: "Table", "link-externo": "Link", "quebra-mesmo-bloco": "HardBreak",
};

describe("catálogo de símbolos", () => {
  it("ids únicos", () => {
    const ids = CATALOGO_SIMBOLOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it.each(CATALOGO_SIMBOLOS.filter((s) => NO_ESPERADO[s.amostra]).map((s) => [s.id, s]))(
    "%s: o parser do editor reconhece a sintaxe",
    (_, s) => {
      expect(nos(s.sintaxe)).toContain(NO_ESPERADO[s.amostra]);
    },
  );
  it("sintaxe sem espaço sobrando no fim, exceto a do Shift+Enter", () => {
    for (const s of CATALOGO_SIMBOLOS) {
      if (s.amostra === "quebra-mesmo-bloco" || s.grupo === "Enquanto você digita") continue;
      expect(s.sintaxe, s.id).toBe(s.sintaxe.trimEnd());
    }
  });
});
```

  (Se `sintaxe` for só o prefixo, como `- [ ] `, use no teste `s.sintaxe + (s.textoAmostra ?? "")`.)
- [ ] **B3. Escrever o catálogo**, no mínimo:
  - **Texto:** `**texto**` negrito; `*texto*` itálico; `~~texto~~` riscado; `==texto==`
    destaque; `` `texto` `` código.
  - **Blocos:** `# `/`## `/`### ` títulos; `> ` citação; `- ` lista; `1. ` lista numerada;
    `- [ ] ` tarefa; `- [x] ` tarefa feita; `---` linha horizontal; ```` ``` ```` bloco de
    código (sintaxe multilinha `"```\ncódigo\n```"`); tabela (`"| a | b |\n|---|---|\n| 1 | 2 |"`);
    dois espaços no fim da linha = quebra no mesmo bloco (`"linha  \nlinha"`, amostra
    `quebra-mesmo-bloco`, atalho `nova-linha-mesmo-bloco`).
  - **Links e embeds:** `[[Nota]]`, `[[Nota|texto]]`, `[[Nota#Título]]`, `[[Nota#^id]]`,
    `![[Nota]]`, `![[imagem.png|400]]`, `![[Desenho.draw.md]]`, `[texto](https://…)`,
    `^id` no fim do bloco, `%%comentário%%`.
  - **Enquanto você digita** (amostra `comportamento`): `[[` abre sugestões de nota; ```` ``` ````
    no começo da linha fecha o bloco de código; `* ` no começo da linha vira lista; `**` dentro
    de `*|*` vira par de negrito; `| a | b |` + Enter cria tabela; Enter em item de lista vazio
    sai da lista.
  Texto das descrições: curto, sentence case, sem ponto final (é rótulo).
- [ ] **B4.** Teste passando; `rtk proxy npx tsc --noEmit -p .`. Relatar qualquer sintaxe do doc
  02 que o parser NÃO reconheceu (é bug de glossário ou de editor — não esconda).

### Tarefa C — Teclas por plataforma e filtro (esforço baixo)

**Interfaces:** Produz, em `teclas.ts`:
`export function rotulosDoCombo(combo: ComboTeclas, mac: boolean): string[]` e
`export function ehMac(): boolean`; em `filtrarGlossario.ts`:
`export function normalizarBusca(texto: string): string` e
`export function filtrarGlossario<T extends { descricao: string; grupo: string }>(itens: readonly T[], consulta: string, textoExtra: (item: T) => string): T[]`.

- [ ] **C1. Teste primeiro** (`teclas.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { rotulosDoCombo } from "./teclas";

describe("rotulosDoCombo", () => {
  it("Mod vira Ctrl fora do Mac", () => expect(rotulosDoCombo("Mod-Shift-x", false)).toEqual(["Ctrl", "Shift", "X"]));
  it("Mod vira ⌘ e Alt vira ⌥ no Mac", () => expect(rotulosDoCombo("Mod-Alt-g", true)).toEqual(["⌘", "⌥", "G"]));
  it("setas viram símbolo", () => expect(rotulosDoCombo("Alt-ArrowUp", false)).toEqual(["Alt", "↑"]));
  it("teclas nomeadas", () => {
    expect(rotulosDoCombo("Enter", false)).toEqual(["Enter"]);
    expect(rotulosDoCombo("Shift-Tab", false)).toEqual(["Shift", "Tab"]);
    expect(rotulosDoCombo("F3", false)).toEqual(["F3"]);
  });
  it("hífen e vírgula como tecla", () => {
    expect(rotulosDoCombo("Mod--", false)).toEqual(["Ctrl", "-"]);
    expect(rotulosDoCombo("Mod-,", false)).toEqual(["Ctrl", ","]);
  });
  it("faixa numérica literal", () => expect(rotulosDoCombo("Mod-1…9", false)).toEqual(["Ctrl", "1…9"]));
  it("letra sozinha (ferramenta do desenho)", () => expect(rotulosDoCombo("v", false)).toEqual(["V"]));
});
```

- [ ] **C2. Implementar** `teclas.ts`:

```ts
import type { ComboTeclas } from "./tipos";

const NOMES: Record<string, string> = {
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
};

/** Rótulos das teclas de um combo, na ordem, prontos pra virar `<kbd>`. */
export function rotulosDoCombo(combo: ComboTeclas, mac: boolean): string[] {
  // A tecla final pode ser o próprio "-" ("Mod--"): separa pelo último hífen que tem algo antes.
  const partes: string[] = [];
  let resto = combo;
  for (;;) {
    const m = /^(Mod|Alt|Shift)-(.+)$/.exec(resto);
    if (!m) break;
    partes.push(m[1]);
    resto = m[2];
  }
  const mods = partes.map((p) => (p === "Mod" ? (mac ? "⌘" : "Ctrl") : p === "Alt" ? (mac ? "⌥" : "Alt") : "Shift"));
  const tecla = NOMES[resto] ?? (resto.length === 1 ? resto.toUpperCase() : resto);
  return [...mods, tecla];
}

export function ehMac(): boolean {
  return typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);
}
```

- [ ] **C3. Teste primeiro** (`filtrarGlossario.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { filtrarGlossario, normalizarBusca } from "./filtrarGlossario";

const itens = [
  { descricao: "Negrito", grupo: "Nota: formatação", extra: "**texto** ctrl b" },
  { descricao: "Fechar a aba", grupo: "Abas e divisões", extra: "ctrl w" },
  { descricao: "Destaque", grupo: "Texto", extra: "==texto==" },
];
const f = (q: string) => filtrarGlossario(itens, q, (i) => i.extra).map((i) => i.descricao);

describe("filtrarGlossario", () => {
  it("consulta vazia devolve tudo", () => expect(f("  ")).toHaveLength(3));
  it("ignora caixa e acento", () => {
    expect(f("FORMATACAO")).toEqual(["Negrito"]);
    expect(f("divisoes")).toEqual(["Fechar a aba"]);
  });
  it("acha por tecla, com ou sem +", () => {
    expect(f("ctrl w")).toEqual(["Fechar a aba"]);
    expect(f("ctrl+w")).toEqual(["Fechar a aba"]);
  });
  it("acha por símbolo", () => expect(f("==")).toEqual(["Destaque"]));
  it("todas as palavras precisam bater", () => expect(f("fechar negrito")).toEqual([]));
  it("normalizarBusca", () => expect(normalizarBusca(" Ação+Ctrl ")).toBe("acao ctrl"));
});
```

- [ ] **C4. Implementar** `filtrarGlossario.ts`: `normalizarBusca` = `NFD`, remove `\p{Diacritic}`,
  minúscula, troca `+` por espaço, colapsa espaços, `trim`. `filtrarGlossario` quebra a consulta
  normalizada em palavras e mantém o item se TODAS aparecem em
  `normalizarBusca(descricao + " " + grupo + " " + textoExtra(item))`. Símbolos puros como `==`
  continuam funcionando (não remover pontuação).
- [ ] **C5.** `rtk proxy npx vitest run src/app/glossario` e `tsc`.

### Tarefa D — Interface (esforço alto) — depois de A, B e C

**Interfaces:** Consome `CATALOGO_ATALHOS`, `atalhoPorId` (A), `CATALOGO_SIMBOLOS` (B),
`rotulosDoCombo`, `ehMac` (C), `filtrarGlossario` (C). Produz
`export default function DialogoGlossario({ onFechar }: { onFechar(): void })`.

- [ ] **D1.** Ler antes: `docs/06-design-system.md` inteiro (tokens, tipografia `meta`,
  `text-pequeno`, inventário), `src/ui/Dialog.tsx`, `src/ui/GrupoBotoes.tsx`, `src/ui/Campo.tsx`,
  `src/ui/excalisidian/SobreposicaoBusca.tsx` (item de lista, `meta` do atalho, mensagem vazia,
  `useEntradaSuave`), `DialogoPreferencias.tsx`, e `src/editor/atomico/atomic-theme.ts` +
  `styles/inline-preview.css` + `tokens-excalisidian.css` (estilos reais de negrito, destaque,
  código, citação, link, tarefa — a amostra tem que parecer o editor).
- [ ] **D2. `TeclasAtalho.tsx`**: recebe `teclas: ComboTeclas[]` e `gesto?: string`; para cada
  combo, um grupo de `<kbd>` (`rotulosDoCombo(combo, ehMac())`), separados entre combos por
  `<span className="text-pequeno text-tinta-suave">ou</span>`; gesto vira um `<kbd>` com o
  texto. `kbd`: `meta` + `rounded-controle border border-regua bg-superficie px-1.5 py-0.5
  text-tinta-media` — tudo token. Sem cor nova.
- [ ] **D3. `AmostraSimbolo.tsx`**: `switch (simbolo.amostra)` desenhando `textoAmostra` com as
  classes/tokens que o editor usa pra cada coisa (destaque = fundo `ocre` 22%, doc 06; link
  resolvido = `cristal`; código = fundo `lavagem` + mono; citação = barra `regua-forte` à
  esquerda; tarefa = `Checkbox` desabilitado de `src/ui`; linha horizontal = hairline `regua`).
  Se um estilo do editor não tiver equivalente claro nos tokens, use o mais próximo DO DOC 06 e
  anote no relatório — não invente valor. `comportamento` não desenha nada (a coluna fica vazia).
- [ ] **D4. `DialogoGlossario.tsx`**, seguindo a seção "Experiência" deste plano:
  `Dialog titulo="Atalhos e símbolos" className="max-w-2xl"`; primeiro filho é o `Campo`
  (rótulo "Filtrar", placeholder "Filtrar por ação, tecla ou símbolo…"); depois `GrupoBotoes`
  (rotuloGrupo "Mostrar", opções "Atalhos"/"Símbolos"); depois a lista rolável
  `max-h-[60vh] overflow-y-auto`. Agrupar mantendo a ordem do catálogo. Texto extra do filtro:
  atalhos → rótulos de todas as teclas + gesto + condição; símbolos → sintaxe + teclas do atalho
  equivalente. Vazio: "Nada encontrado para «{consulta}»." em `text-pequeno text-tinta-suave`
  centralizado. `<dl>` com `<dt>`/`<dd>` nos atalhos; símbolos em `grid` de três colunas
  (`grid-cols-[minmax(0,11rem)_minmax(0,10rem)_1fr]`), sintaxe multilinha em `<pre>` mono.
- [ ] **D5. Configurações:** em `DialogoPreferencias.tsx`, nova `<Secao titulo="Atalhos e símbolos">`
  logo depois de "Largura da nota": `<p className="text-pequeno text-tinta-media">Tudo o que dá
  pra fazer pelo teclado e os símbolos que formatam o texto.</p>` + `Botao tamanho="compacto"`
  "Abrir glossário", que liga um `useState` local e renderiza `<DialogoGlossario>` (fica por
  cima pela pilha do `Dialog`). Conferir: Esc fecha só o glossário.
- [ ] **D6.** `rtk proxy npx tsc --noEmit -p .` e `rtk proxy npx vitest run`. Não tente
  screenshot automatizado (memória do projeto: pegou janela errada, com conteúdo privado). O
  app roda com `npm run tauri dev` na porta 1420 com HMR — se já estiver rodando, não suba outro.
  No relatório, descreva o que o usuário deve olhar na verificação manual.

### Tarefa E — Documentação (esforço baixo) — em paralelo com D

- [ ] **E1. doc 03:** RF8.3 ganha "Implementado em `DialogoGlossario` (Configurações → Atalhos e
  símbolos), com filtro, atalhos e símbolos de formatação." Não mude prioridade.
- [ ] **E2. doc 04:** nova subseção (perto das Configurações/Preferências — procurar onde os
  textos das Configurações estão) com TODOS os textos de interface deste plano, exatos: título
  "Atalhos e símbolos", ajuda da seção, botão "Abrir glossário", rótulo "Filtrar", placeholder,
  abas "Atalhos"/"Símbolos", mensagem vazia, "ou" entre combinações, nomes dos grupos (de
  `tipos.ts`). E o comportamento: abre por cima das Configurações, Esc volta, filtro ignora
  acento/caixa, teclas por plataforma, Ctrl+K no editor insere link.
- [ ] **E3. doc 06:** inventário ganha `DialogoGlossario`, `TeclasAtalho` (tecla em `kbd`:
  `meta`, hairline `regua`, `rounded-controle`, fundo `superficie`) e `AmostraSimbolo`; na linha
  de `DialogoPreferencias`, mencionar a seção "Atalhos e símbolos".
- [ ] **E4. doc 09:** ADR novo "Glossário de atalhos e símbolos" (próximo número livre —
  conferir o último ADR): catálogos como dados puros com teste de deriva (e por que não gerar os
  keymaps do catálogo agora); Ctrl+K ligado no editor (RF2.11 não estava implementado);
  **divergência registrada, não resolvida:** doc 03 diz Ctrl+E = modo leitura (RF2.4) e
  Ctrl+` = código (RF2.11), o código usa Ctrl+E = código e não tem modo leitura nem Ctrl+`.
  O glossário mostra o que o código faz.

---

## Autorrevisão

- Cobertura: acesso pelas Configurações (D5), atalhos (A), edição por símbolos (B), interface
  (D), filtro/plataforma (C), textos e decisões nos docs (E). RF8.3 fechado.
- Tipos: todos os nomes usados em D vêm de A/B/C com a assinatura escrita acima; `tipos.ts`
  já existe.
- Pendência para o usuário: a divergência Ctrl+E (código × doc 03).
