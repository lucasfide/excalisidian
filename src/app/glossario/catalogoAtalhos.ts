// Catálogo de atalhos do app (RF8.3, plano em
// docs/superpowers/plans/2026-09-19-glossario-atalhos-simbolos.md). Dados puros, sem React nem
// EditorView — testável em `environment: "node"` (ver catalogoAtalhos.test.ts). Cada linha só
// existe aqui se o teste de deriva confirmar (para os keymaps próprios do editor) ou se a
// tecla foi conferida na fonte listada no comentário de cada linha (Workspace.tsx, App.tsx,
// AtomicCodeMirrorEditor.tsx, @codemirror/commands, @codemirror/search, @excalidraw/excalidraw).

import type { Atalho } from "./tipos";

export const CATALOGO_ATALHOS: readonly Atalho[] = [
  // ---- Geral ----------------------------------------------------------------------------
  { id: "paleta", grupo: "Geral", descricao: "Abrir a paleta de comandos", teclas: ["Mod-p"] }, // Workspace.tsx
  {
    id: "buscar",
    grupo: "Geral",
    descricao: "Buscar notas e desenhos",
    teclas: ["Mod-o", "Mod-Shift-f"],
  }, // Workspace.tsx
  { id: "configuracoes", grupo: "Geral", descricao: "Abrir as configurações", teclas: ["Mod-,"] }, // App.tsx
  { id: "salvar", grupo: "Geral", descricao: "Salvar agora", teclas: ["Mod-s"] }, // Workspace.tsx
  {
    id: "painel-tarefas",
    grupo: "Geral",
    descricao: "Mostrar ou esconder as tarefas",
    teclas: ["Mod-\\"],
  }, // App.tsx

  // ---- Abas e divisões --------------------------------------------------------------------
  { id: "nova-aba", grupo: "Abas e divisões", descricao: "Abrir uma aba em branco", teclas: ["Mod-t"] }, // Workspace.tsx
  {
    id: "nova-nota",
    grupo: "Abas e divisões",
    descricao: "Criar uma nota",
    teclas: ["Mod-t"],
    condicao: "Na aba em branco",
  }, // Workspace.tsx
  {
    id: "novo-desenho",
    grupo: "Abas e divisões",
    descricao: "Criar um desenho",
    teclas: ["Mod-d"],
    condicao: "Na aba em branco",
  }, // Workspace.tsx
  { id: "fechar-aba", grupo: "Abas e divisões", descricao: "Fechar a aba", teclas: ["Mod-w"] }, // Workspace.tsx
  {
    id: "reabrir-aba",
    grupo: "Abas e divisões",
    descricao: "Reabrir a última aba fechada",
    teclas: ["Mod-Shift-t"],
  }, // Workspace.tsx
  { id: "proxima-aba", grupo: "Abas e divisões", descricao: "Ir para a próxima aba", teclas: ["Mod-Tab"] }, // Workspace.tsx
  {
    id: "aba-anterior",
    grupo: "Abas e divisões",
    descricao: "Ir para a aba anterior",
    teclas: ["Mod-Shift-Tab"],
  }, // Workspace.tsx
  {
    id: "aba-por-numero",
    grupo: "Abas e divisões",
    descricao: "Ir para a aba pelo número",
    teclas: ["Mod-1…9"],
  }, // Workspace.tsx
  {
    id: "dividir-direita",
    grupo: "Abas e divisões",
    descricao: "Dividir à direita",
    teclas: ["Mod-Alt-ArrowRight"],
  }, // Workspace.tsx
  {
    id: "dividir-abaixo",
    grupo: "Abas e divisões",
    descricao: "Dividir abaixo",
    teclas: ["Mod-Alt-ArrowDown"],
  }, // Workspace.tsx

  // ---- Nota: formatação -------------------------------------------------------------------
  { id: "negrito", grupo: "Nota: formatação", descricao: "Negrito", teclas: ["Mod-b"] }, // atalhosFormatacao.ts
  { id: "italico", grupo: "Nota: formatação", descricao: "Itálico", teclas: ["Mod-i"] }, // atalhosFormatacao.ts
  { id: "codigo", grupo: "Nota: formatação", descricao: "Código", teclas: ["Mod-e"] }, // atalhosFormatacao.ts
  { id: "riscado", grupo: "Nota: formatação", descricao: "Riscado", teclas: ["Mod-Shift-x"] }, // atalhosFormatacao.ts
  { id: "destaque", grupo: "Nota: formatação", descricao: "Destaque", teclas: ["Mod-Shift-h"] }, // atalhosFormatacao.ts
  { id: "link", grupo: "Nota: formatação", descricao: "Inserir link", teclas: ["Mod-k"] }, // atalhosFormatacao.ts

  // ---- Nota: edição -------------------------------------------------------------------------
  {
    id: "nova-linha",
    grupo: "Nota: edição",
    descricao: "Nova linha, em bloco novo",
    teclas: ["Enter"],
  }, // quebraDeBloco.ts
  {
    id: "nova-linha-mesmo-bloco",
    grupo: "Nota: edição",
    descricao: "Nova linha no mesmo bloco",
    teclas: ["Shift-Enter"],
  }, // quebraDeBloco.ts
  {
    id: "recuar",
    grupo: "Nota: edição",
    descricao: "Aumentar ou diminuir o recuo",
    teclas: ["Tab", "Shift-Tab"],
  }, // AtomicCodeMirrorEditor.tsx: indentWithTab
  {
    id: "selecionar-tudo",
    grupo: "Nota: edição",
    descricao: "Selecionar o texto da nota",
    teclas: ["Mod-a"],
  }, // selecionarCorpoDaNota.ts — exclui o H1 do título
  {
    id: "selecionar-bloco",
    grupo: "Nota: edição",
    descricao: "Selecionar o bloco",
    teclas: [],
    gesto: "Clique triplo",
  }, // blocoMarkdown.ts
  {
    id: "mover-bloco",
    grupo: "Nota: edição",
    descricao: "Mover o bloco",
    teclas: [],
    gesto: "Arrastar a alça ⠿",
  }, // moverBloco.ts
  { id: "desfazer", grupo: "Nota: edição", descricao: "Desfazer", teclas: ["Mod-z"] }, // @codemirror/commands: historyKeymap
  {
    id: "refazer",
    grupo: "Nota: edição",
    descricao: "Refazer",
    teclas: ["Mod-y", "Mod-Shift-z"],
  }, // @codemirror/commands: historyKeymap (Mod-y fora do Mac, Mod-Shift-z no Mac)
  {
    id: "mover-linha",
    grupo: "Nota: edição",
    descricao: "Mover a linha para cima ou para baixo",
    teclas: ["Alt-ArrowUp", "Alt-ArrowDown"],
  }, // @codemirror/commands: defaultKeymap (moveLineUp/moveLineDown)
  {
    id: "copiar-linha",
    grupo: "Nota: edição",
    descricao: "Duplicar a linha para cima ou para baixo",
    teclas: ["Alt-Shift-ArrowUp", "Alt-Shift-ArrowDown"],
  }, // @codemirror/commands: defaultKeymap (copyLineUp/copyLineDown)
  { id: "apagar-linha", grupo: "Nota: edição", descricao: "Apagar a linha", teclas: ["Mod-Shift-k"] }, // @codemirror/commands: defaultKeymap (deleteLine)
  {
    id: "abrir-link-nova-aba",
    grupo: "Nota: edição",
    descricao: "Abrir o link numa aba nova",
    teclas: [],
    gesto: "Ctrl+clique",
  }, // doc 04 §7

  // ---- Nota: localizar ----------------------------------------------------------------------
  { id: "localizar", grupo: "Nota: localizar", descricao: "Localizar na nota", teclas: ["Mod-f"] }, // @codemirror/search: searchKeymap
  {
    id: "proxima-ocorrencia",
    grupo: "Nota: localizar",
    descricao: "Próxima ocorrência",
    teclas: ["Mod-g", "F3"],
  }, // @codemirror/search: searchKeymap
  {
    id: "ocorrencia-anterior",
    grupo: "Nota: localizar",
    descricao: "Ocorrência anterior",
    teclas: ["Mod-Shift-g", "Shift-F3"],
  }, // @codemirror/search: searchKeymap
  {
    id: "selecionar-proxima",
    grupo: "Nota: localizar",
    descricao: "Selecionar a próxima ocorrência da seleção",
    teclas: ["Mod-d"],
    condicao: "Numa nota",
  }, // @codemirror/search: searchKeymap (selectNextOccurrence)
  {
    id: "ir-para-linha",
    grupo: "Nota: localizar",
    descricao: "Ir para a linha",
    teclas: ["Mod-Alt-g"],
  }, // @codemirror/search: searchKeymap (gotoLine)

  // ---- Desenho ------------------------------------------------------------------------------
  // RF5.3 / doc 09 ADR-20: teclas de ferramenta nativas do Excalidraw, uma linha por ferramenta.
  { id: "ferramenta-selecao", grupo: "Desenho", descricao: "Ferramenta: seleção", teclas: ["v"] },
  { id: "ferramenta-mao", grupo: "Desenho", descricao: "Ferramenta: mão", teclas: ["h"] },
  { id: "ferramenta-retangulo", grupo: "Desenho", descricao: "Ferramenta: retângulo", teclas: ["r"] },
  { id: "ferramenta-losango", grupo: "Desenho", descricao: "Ferramenta: losango", teclas: ["d"] },
  { id: "ferramenta-elipse", grupo: "Desenho", descricao: "Ferramenta: elipse", teclas: ["o"] },
  { id: "ferramenta-seta", grupo: "Desenho", descricao: "Ferramenta: seta", teclas: ["a"] },
  { id: "ferramenta-linha", grupo: "Desenho", descricao: "Ferramenta: linha", teclas: ["l"] },
  { id: "ferramenta-mao-livre", grupo: "Desenho", descricao: "Ferramenta: mão livre", teclas: ["p"] },
  { id: "ferramenta-texto", grupo: "Desenho", descricao: "Ferramenta: texto", teclas: ["t"] },
  { id: "ferramenta-imagem", grupo: "Desenho", descricao: "Ferramenta: imagem", teclas: ["9"] },
  { id: "ferramenta-borracha", grupo: "Desenho", descricao: "Ferramenta: borracha", teclas: ["e"] },
  {
    id: "link-elemento",
    grupo: "Desenho",
    descricao: "Anexar link ao elemento",
    teclas: ["Mod-k"],
    condicao: "Com um elemento selecionado",
  }, // @excalidraw/excalidraw: CtrlOrCmd+K (hyperlink)
  {
    id: "duplicar-elemento",
    grupo: "Desenho",
    descricao: "Duplicar",
    teclas: ["Mod-d"],
    condicao: "Com um elemento selecionado",
  }, // @excalidraw/excalidraw: CtrlOrCmd+D
  { id: "agrupar", grupo: "Desenho", descricao: "Agrupar", teclas: ["Mod-g"] }, // @excalidraw/excalidraw: CtrlOrCmd+G
  { id: "desagrupar", grupo: "Desenho", descricao: "Desagrupar", teclas: ["Mod-Shift-g"] }, // @excalidraw/excalidraw: CtrlOrCmd+Shift+G
  { id: "aproximar", grupo: "Desenho", descricao: "Aproximar", teclas: ["Mod-="] }, // @excalidraw/excalidraw: CtrlOrCmd++
  { id: "afastar", grupo: "Desenho", descricao: "Afastar", teclas: ["Mod--"] }, // @excalidraw/excalidraw: CtrlOrCmd+-
  { id: "zoom-100", grupo: "Desenho", descricao: "Zoom 100%", teclas: ["Mod-0"] }, // @excalidraw/excalidraw: CtrlOrCmd+0 (resetZoom)
];

export function atalhoPorId(id: string): Atalho | undefined {
  return CATALOGO_ATALHOS.find((a) => a.id === id);
}
