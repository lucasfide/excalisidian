# 14 — Tabelas

Plano de implementação de criação e edição de tabelas na nota, no nível do Obsidian. Este
documento é o contrato entre as tarefas T1–T5 — nomes, textos e comportamento saem daqui.

## 0. Ponto de partida (16/09/2026)

Já existe no editor vendorizado (`src/editor/atomico/table-widget.ts`, upstream
`@atomic-editor/editor` 0.6.2):

- Tabela GFM digitada em markdown vira uma grade com células editáveis; o disco continua
  markdown puro.
- Formatação inline na célula (negrito, itálico, riscado, destaque, link, imagem).
- `Tab`/`Shift+Tab` e `Enter` andam entre células; passar da última cria linha.
- Clique direito numa célula: inserir linha acima/abaixo, excluir linha, inserir coluna à
  esquerda/direita, excluir coluna.
- Tabela é apagada como unidade.

Problemas:

1. **Não há como criar tabela** sem saber a sintaxe.
2. **Menu em inglês**, montado em DOM puro, com visual próprio fora do doc 06
   (`.cm-atomic-table-menu` em `styles/inline-preview.css`, sombra e raio que não são tokens).
3. **Sem controles visíveis**: adicionar linha/coluna só pelo clique direito.
4. **Alinhamento** (`:---:`) é lido e descartado no serialize — editar uma célula de uma
   tabela alinhada **apaga o alinhamento do arquivo**.
5. Sem mover linha/coluna nem excluir a tabela pelo menu.

Decisões do usuário (16/09/2026):

- Criar por: **digitação markdown**, **paleta de comandos** e **botão na barra de formatação**.
- **A barra de formatação passa a aparecer também sem seleção, flutuando acima do cursor.**
- Controles na tabela: **"+" no hover**, **menu no padrão do app** e **alças de linha e coluna**.
- Menu ganha: **excluir tabela**, **mover linha/coluna**, **alinhar coluna**.
- Tabela nova: **2 colunas, 1 linha** (mais o cabeçalho).

## 1. Experiência

### 1.1 Criar

**Digitando.** Numa linha fora de tabela, com o texto no formato `| a | b |` (começa e termina
com `|`, pelo menos 2 células), `Enter` com o cursor no fim da linha insere a linha
delimitadora e uma linha vazia, e o foco vai para a primeira célula da linha nova. Se a linha
de baixo já é uma delimitadora, `Enter` não faz nada de especial. `Shift+Enter` nunca converte.

**Paleta de comandos.** "Inserir tabela" (ícone `table`). Age na nota ativa; sem nota ativa,
toast "Abra uma nota para inserir uma tabela.". Vista somente leitura: mesmo toast.

**Barra de formatação.** Botão "Tabela" (ícone `table`) num grupo próprio, no fim da barra.

Inserção (paleta e barra):

```
| Coluna 1 | Coluna 2 |
| --- | --- |
|  |  |
```

- Linha do cursor vazia: a tabela ocupa essa linha.
- Linha com texto: a tabela entra depois dela, com uma linha em branco entre as duas.
- Sempre fica uma linha em branco depois da tabela (senão o parser GFM gruda o parágrafo
  seguinte nela).
- Foco na célula "Coluna 1" com o texto todo selecionado — digitar substitui.
- Uma transação só: `Ctrl+Z` desfaz a inserção inteira.

### 1.2 Barra de formatação sem seleção

> A regra ampla original (barra acima do cursor em **qualquer** linha, com ou sem seleção)
> foi **revertida em 16/09/2026** a pedido do usuário: cobria a linha de cima enquanto se
> digitava. A regra que ficou é mais restrita e vive em `barraFlutuante.ts` — o texto
> normativo do comportamento atual é o doc 04 §3.4.

- Sem seleção, a barra só aparece quando a linha do cursor está **vazia** — é a mesma linha
  que se está prestes a começar a escrever, então não há texto embaixo pra cobrir. Assim que a
  primeira letra é digitada a linha deixa de estar vazia e a barra some no mesmo instante. Numa
  linha com conteúdo, sem seleção, a barra não aparece.
- Com seleção, fica acima da seleção (como hoje), em qualquer linha, com ou sem conteúdo.
- Some quando o foco sai do editor, na vista somente leitura, quando a barra acoplada
  (`PainelDocumento`) está ligada, e quando o foco está dentro de uma célula de tabela (a
  célula é outro campo editável; a barra apontaria para o lugar errado).
- Sem seleção, os botões agem na posição do cursor: negrito/itálico/riscado/código inserem o
  par de marcadores com o cursor no meio; título, citação, listas e checkbox agem na linha; link
  insere o modelo de link.
- Não recria o tooltip a cada tecla: só quando a posição de ancoragem muda (linha do cursor,
  mudança de foco ou de seleção). Digitar na mesma linha vazia não pode piscar a barra.

### 1.3 Na tabela

**"+" no hover.** Com o mouse sobre a tabela aparecem duas faixas:

- à direita da última coluna, na altura da tabela: "+" centralizado, título "Adicionar coluna";
- abaixo da última linha, na largura da tabela: "+", título "Adicionar linha".

Clicar adiciona no fim e põe o foco na primeira célula nova. Faixa com 16px de espessura
(escala do doc 06), fundo transparente, `lavagem` no hover da faixa, ícone `plus` 16px em
`tinta-suave`. Não aparecem na vista somente leitura.

**Alças.** Com o mouse sobre uma linha, uma alça `grip-vertical` aparece à esquerda dela; sobre
uma coluna, uma alça `grip-horizontal` aparece acima dela (16px, `tinta-suave`, mesmo gesto da
alça de bloco ⠿ em `moverBloco`).

- **Clicar** na alça abre o menu da linha (ou da coluna), ancorado na alça.
- **Arrastar** reordena: indicador de 2px em `cristal` na posição de destino (mesmo indicador
  do mover bloco), a linha/coluna arrastada fica com `sombra-ficha`. Solta → move. `Esc`
  cancela. Arraste por eventos de ponteiro, nunca Drag-and-Drop HTML5 (falha no WebView2,
  ver `Workspace.tsx`).
- A linha de cabeçalho não tem alça de linha e não pode ser movida; colunas movem com o
  cabeçalho junto.
- Todo arraste tem equivalente no menu (doc 06: "toda ação de arraste tem equivalente").

**Menu.** Mesmo componente visual do `Menu`/`ItemMenu` do app (`src/ui/Menu.tsx`), com ícones.
Aberto por clique direito numa célula ou clique numa alça.

| Origem | Itens |
|---|---|
| Célula do corpo (clique direito) | seção linha + separador + seção coluna + separador + Excluir tabela |
| Célula do cabeçalho | seção coluna + separador + Excluir tabela |
| Alça de linha | seção linha + separador + Excluir tabela |
| Alça de coluna | seção coluna + separador + Excluir tabela |

Seção linha: Inserir linha acima (`between-horizontal-start`), Inserir linha abaixo
(`between-horizontal-end`), Mover linha para cima (`arrow-up`), Mover linha para baixo
(`arrow-down`), Excluir linha (`trash-2`).

Seção coluna: Inserir coluna à esquerda (`between-vertical-start`), Inserir coluna à direita
(`between-vertical-end`), Mover coluna para a esquerda (`arrow-left`), Mover coluna para a
direita (`arrow-right`), Alinhar à esquerda (`align-left`), Centralizar (`align-center`),
Alinhar à direita (`align-right`), Excluir coluna (`trash-2`).

Excluir tabela: `trash-2`, `destrutivo`.

Desabilitados: mover para cima na primeira linha do corpo, para baixo na última; mover coluna
nas bordas; excluir coluna quando só há uma; o alinhamento atual da coluna aparece marcado
(ícone `check` no lugar do ícone, ou desabilitado — o que o `ItemMenu` suportar sem mudança
de visual; se precisar mudar `ItemMenu`, perguntar antes).

Ações: todas numa transação só (um `Ctrl+Z` desfaz). Excluir tabela remove o bloco e a linha em
branco que sobrar, deixando o cursor onde a tabela começava. Inserir linha/coluna põe o foco na
primeira célula nova.

### 1.5 Largura das colunas

**Comportamento.** A linha vertical entre duas colunas é uma alça de redimensionar. Arrastar muda a largura: a coluna da esquerda ganha ou perde largura, a da direita perde ou ganha (soma zero — a tabela sempre ocupa 100% da largura da coluna de leitura, sem rolagem lateral). A borda externa direita não é alça (ali fica a faixa "+").

Largura mínima por coluna: 64px.

No primeiro arrasto de uma tabela que era automática (todas as colunas com no máximo 3 traços), a largura atual em tela viram proporções, gravadas na linha delimitadora. Depois disso a tabela tem "larguras" — só com larguras é que o menu oferece "Largura automática" para voltar ao padrão.

Durante o arrasto, só a tela muda. Soltar grava numa transação só: `Ctrl+Z` desfaz; `Esc` cancela e volta ao que era. Clique duplo na linha volta à largura automática (se a tabela tem larguras — senão é no-op).

Ao mover coluna, a largura vai junto. Excluir coluna redistribui as larguras proporcionalmente. Inserir coluna dá à nova a largura média das outras e renormaliza.

Vista somente leitura mostra as larguras em uso, sem alça de redimensionar.

**Visual.** Zona de pega de 8px centrada na borda (escala 4/8), cursor `col-resize`. No hover da zona e durante o arrasto: linha de 2px em `cristal` sobre a borda — mesma linguagem do indicador de soltura do mover bloco.

**Título da alça:** "Arraste para ajustar a largura. Clique duas vezes para largura automática."

**Equivalente no menu.** Seção coluna do menu da tabela ganha o item "Largura automática" (ícone `move-horizontal`), que só aparece quando a tabela tem larguras. Clique restaura a largura automática de todas as colunas de uma vez.

### 1.4 Alinhamento

`:---` esquerda, `:---:` centro, `---:` direita, `---` sem alinhamento (renderiza à esquerda).
Parse → modelo → serialize preserva o alinhamento de cada coluna, inclusive ao editar células,
inserir, mover e excluir colunas. Célula renderiza com `text-align` da coluna.

## 2. Contratos de código

O diretório `src/editor/atomico/` é vendorizado (ver `LEIA-ME.md` lá): nomes em inglês, toda
alteração marcada com `// [excalisidian]`.

### 2.1 Modelo e operações (T1)

`src/editor/atomico/table-model.ts` (novo, puro, com teste `table-model.test.ts`):

```ts
export type ColumnAlign = "left" | "center" | "right" | null;
export interface TableModel { header: string[]; aligns: ColumnAlign[]; rows: string[][] }
export function parseTableText(text: string): TableModel | null; // a partir do markdown da tabela
export function serializeTable(model: TableModel): string;
export function insertRow(m: TableModel, index: number): TableModel;      // index no corpo
export function deleteRow(m: TableModel, index: number): TableModel;
export function moveRow(m: TableModel, from: number, to: number): TableModel;
export function insertColumn(m: TableModel, index: number): TableModel;
export function deleteColumn(m: TableModel, index: number): TableModel;   // no-op se sobrar 0
export function moveColumn(m: TableModel, from: number, to: number): TableModel;
export function setAlign(m: TableModel, col: number, align: ColumnAlign): TableModel;
```

Imutáveis (devolvem modelo novo). `table-widget.ts` passa a usar este modelo e estas funções
(inclusive `readModelFromDom`, que precisa carregar `aligns`), e o parse a partir da árvore
lezer lê o alinhamento da linha delimitadora.

### 2.2 Menu no app (T1)

- `table-widget.ts` para de montar menu em DOM. Expõe um facet
  `tableMenuFacet: Facet<(req: TableMenuRequest) => void>` e chama o handler no clique direito
  (e, depois, nas alças — T2):

```ts
export type TableMenuScope = "cell-body" | "cell-header" | "row-handle" | "column-handle";
export interface TableMenuRequest {
  scope: TableMenuScope;
  x: number; y: number;                 // coordenadas de tela para ancorar
  row: number; col: number;             // row = -1 no cabeçalho / alça de coluna
  model: TableModel;                    // estado atual (para desabilitar itens)
  apply(next: TableModel, focus?: { row: number; col: number }): void; // 1 transação
  deleteTable(): void;
}
```

- `src/editor/extensoes/menuTabela.tsx` (novo, código do projeto, português): extensão
  `menuTabela` que fornece o handler e renderiza `Menu`/`ItemMenu` do app num root React em
  `document.body`, com os itens, ícones, textos e regras de desabilitar da §1.3. Fecha em
  clique fora, `Esc`, perda de foco da janela (o `Menu` já faz).
- Remover o CSS `.cm-atomic-table-menu*` que deixar de ser usado.
- Registro: adicionar `menuTabela` ao array `EXTENSOES` de `EditorNota.tsx`.
- Exportar `focusTableCell(view: EditorView, tableFrom: number, row: number, col: number, opts?: { selectAll?: boolean }): void`
  (row = -1 é o cabeçalho) — usado por T2 e T3.
- Alinhamento renderizado nas células (`text-align`).

### 2.3 Controles no hover (T2)

Em `table-widget.ts` (DOM do widget) e `styles/inline-preview.css`: faixas "+", alças, arraste
de linha/coluna, conforme §1.3, usando as operações de §2.1 e o `tableMenuFacet` com escopos
`row-handle`/`column-handle`. Títulos ("Adicionar coluna", "Adicionar linha", alças) vêm de um
facet de textos `tableLabelsFacet` com padrão em inglês no vendorizado e valores em português
fornecidos por `menuTabela.tsx` — o vendorizado não carrega texto em português.
Cores, raios e sombras só por variáveis `--atomic-editor-*` já mapeadas em
`tokens-excalisidian.css` ou por `var(--color-*)`/`var(--shadow-*)` dos tokens; nada de hex.

### 2.4 Criação (T3)

- `src/editor/extensoes/comandosMarkdown.ts`: `inserirTabela(): Command` (§1.1). Foco na
  célula via `focusTableCell` de T1 — se ainda não existir ao rodar, implementar um fallback
  local pelo DOM (`.cm-atomic-table` / `.cm-atomic-table-cell-source`) e reportar.
- `src/editor/extensoes/tabelaMarkdown.ts` (novo, com teste da função pura de detecção):
  keymap de `Enter` da §1.1. Precedência: antes do `Enter` de `quebraDeBloco`/`blocoMarkdown`
  só quando a linha casa; senão devolve `false`.
- `src/editor/editorAtivo.ts` (novo): extensão `rastrearEditorAtivo` que registra a última
  `EditorView` de nota focada (limpa ao destruir) e `editorAtivo(): EditorView | null`.
- `EditorNota.tsx`: registrar `tabelaMarkdown` e `rastrearEditorAtivo` em `EXTENSOES`.
- `PaletaComandos.tsx`: comando "Inserir tabela" (ícone `Table`), com o toast da §1.1.

### 2.5 Barra de formatação (T4)

- `src/editor/extensoes/barraFlutuante.ts`: regras da §1.2 (foco, sem seleção, célula de
  tabela, não piscar ao digitar).
- `src/ui/excalisidian/BarraFlutuanteFormatacao.tsx`: grupo novo com "Tabela" → `inserirTabela()`.
- Comandos de `comandosMarkdown.ts` com seleção vazia: conferir e corrigir **só** o que
  estiver errado, sem mudar o comportamento com seleção (T3 também edita este arquivo — T4
  roda depois de T3).

## 3. Textos (T5 grava no doc 04)

| Situação | Texto |
|---|---|
| Paleta | "Inserir tabela" |
| Botão na barra | "Tabela" |
| Sem nota ativa / somente leitura | "Abra uma nota para inserir uma tabela." |
| Cabeçalho padrão | "Coluna 1", "Coluna 2" |
| Faixa direita | "Adicionar coluna" |
| Faixa de baixo | "Adicionar linha" |
| Alça de linha | "Arraste para mover a linha. Clique para mais opções." |
| Alça de coluna | "Arraste para mover a coluna. Clique para mais opções." |
| Menu | "Inserir linha acima", "Inserir linha abaixo", "Mover linha para cima", "Mover linha para baixo", "Excluir linha", "Inserir coluna à esquerda", "Inserir coluna à direita", "Mover coluna para a esquerda", "Mover coluna para a direita", "Alinhar à esquerda", "Centralizar", "Alinhar à direita", "Excluir coluna", "Excluir tabela" |

## 4. Tarefas

| Tarefa | Arquivos | Depende de |
|---|---|---|
| T1 Modelo + menu | `atomico/table-model.ts` (+test), `atomico/table-widget.ts`, `atomico/styles/inline-preview.css` (só remover o menu antigo e alinhamento), `extensoes/menuTabela.tsx`, `EditorNota.tsx` (uma linha em `EXTENSOES`) | — |
| T3 Criação | `extensoes/comandosMarkdown.ts`, `extensoes/tabelaMarkdown.ts` (+test), `editor/editorAtivo.ts`, `EditorNota.tsx` (linhas em `EXTENSOES`), `PaletaComandos.tsx` | contrato de `focusTableCell` |
| T5 Docs | `docs/03`, `docs/04`, `docs/06`, `docs/09`, `docs/REQUISITOS-STATUS.md` | — |
| T2 Controles | `atomico/table-widget.ts`, `atomico/styles/inline-preview.css`, `extensoes/menuTabela.tsx` (textos do facet) | T1 |
| T4 Barra | `extensoes/barraFlutuante.ts`, `BarraFlutuanteFormatacao.tsx`, `extensoes/comandosMarkdown.ts` (só seleção vazia) | T3 |

Ondas: T1 + T3 + T5; depois T2 + T4; depois integração (`npx tsc --noEmit`, `npm test`) e
teste manual.

## 5. Teste manual

1. Digitar `| Nome | Status |` + Enter → vira tabela, foco na célula de baixo.
2. Paleta "Inserir tabela" em linha vazia e em linha com texto; `Ctrl+Z` desfaz tudo de uma vez.
3. Barra de formatação aparece com o cursor parado, sem seleção; não pisca ao digitar; some
   ao clicar fora do editor e ao entrar numa célula; botão "Tabela" insere.
4. Negrito sem seleção insere `****` com cursor no meio.
5. Hover na tabela: "+" à direita adiciona coluna; "+" embaixo adiciona linha.
6. Alça de linha: clique abre menu; arrastar move; `Esc` cancela. Mesmo para coluna.
7. Clique direito em célula do corpo e do cabeçalho: menu em português, visual do app, itens
   desabilitados nas bordas.
8. Alinhar coluna ao centro → arquivo ganha `:---:`; editar outra célula não perde.
9. Excluir tabela → some inteira; `Ctrl+Z` volta.
10. Linha entre colunas: hover muda cursor pra `col-resize`, linha de 2px em `cristal` aparece; arrastar redimensiona soma-zero; solta grava; `Esc` cancela; clique duplo volta automático.
11. Primeiro arrasto de tabela automática: arquivo ganha traços; reabre e largura voltou.
12. Menu: "Largura automática" só aparece com larguras; clique restaura automático.
13. Mover coluna com alça: a largura vai junto.
14. Vista somente leitura (split): sem "+", sem alças (incluindo a de largura), sem menu, sem barra.
