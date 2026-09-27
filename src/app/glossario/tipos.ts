// Tipos do glossário de atalhos e símbolos (RF8.3, plano em
// docs/superpowers/plans/2026-09-19-glossario-atalhos-simbolos.md). Dados puros: os catálogos
// (catalogoAtalhos.ts, catalogoSimbolos.ts) não importam React nem EditorView, pra serem
// testáveis em `environment: "node"`. Quem desenha é DialogoGlossario.tsx.

/**
 * Uma combinação de teclas na notação do CodeMirror: modificadores separados por `-`, na ordem
 * `Mod`, `Alt`, `Shift`, depois a tecla (`"Mod-Shift-x"`, `"Alt-ArrowUp"`, `"Enter"`). `Mod` é
 * Ctrl no Windows/Linux e ⌘ no macOS. A tecla final é o `KeyboardEvent.key` em minúscula quando
 * é letra. Faixa de teclas numéricas usa o texto literal `"Mod-1…9"`.
 */
export type ComboTeclas = string;

export type GrupoAtalho =
  | "Geral"
  | "Abas e divisões"
  | "Nota: formatação"
  | "Nota: edição"
  | "Nota: localizar"
  | "Desenho";

export interface Atalho {
  /** Estável, kebab-case: `"negrito"`, `"fechar-aba"`. Único no catálogo. */
  id: string;
  grupo: GrupoAtalho;
  /** O que acontece, em sentence case, verbo no infinitivo: "Fechar a aba". */
  descricao: string;
  /** Uma ou mais combinações equivalentes (ex.: refazer = `["Mod-y", "Mod-Shift-z"]`). */
  teclas: ComboTeclas[];
  /** Gesto de mouse em vez de (ou além de) teclas: "Clique triplo", "Ctrl+clique". */
  gesto?: string;
  /** Quando só vale em um lugar: "Na aba em branco", "Com um elemento selecionado". */
  condicao?: string;
}

export type GrupoSimbolo = "Texto" | "Blocos" | "Links e embeds" | "Enquanto você digita";

/**
 * Como a coluna "Fica assim" desenha o exemplo. Cada valor corresponde a um estilo que o editor
 * já aplica (inline-preview.ts / atomic-theme.ts) — AmostraSimbolo.tsx faz o switch.
 */
export type TipoAmostra =
  | "negrito"
  | "italico"
  | "riscado"
  | "destaque"
  | "codigo"
  | "titulo-1"
  | "titulo-2"
  | "titulo-3"
  | "citacao"
  | "lista"
  | "lista-numerada"
  | "tarefa"
  | "tarefa-feita"
  | "linha-horizontal"
  | "bloco-codigo"
  | "tabela"
  | "link-interno"
  | "link-externo"
  | "embed"
  | "comentario"
  | "id-bloco"
  | "quebra-mesmo-bloco"
  | "comportamento"; // sem amostra visual: a descrição diz o que o editor faz

export interface Simbolo {
  id: string;
  grupo: GrupoSimbolo;
  /** Exatamente o que se digita, como aparece no arquivo: `"**texto**"`, `"- [ ] "`. */
  sintaxe: string;
  descricao: string;
  amostra: TipoAmostra;
  /** Texto dentro da amostra ("texto", "Nota"). Ausente em `linha-horizontal`/`comportamento`. */
  textoAmostra?: string;
  /** `id` de um `Atalho` que faz a mesma coisa pelo teclado (ex.: negrito → "negrito"). */
  atalhoEquivalente?: string;
}
