// Criar tabela digitando markdown (doc 14 §1.1/§2.4): numa linha fora de tabela, com o texto
// no formato `| a | b |` (começa e termina com `|`, pelo menos 2 células), `Enter` com o cursor
// no fim da linha insere a linha delimitadora e uma linha vazia, e o foco vai para a primeira
// célula da linha nova. `Shift+Enter` nunca converte — nem tem binding aqui, só "Enter".
//
// Precedência: em `Prec.highest`, igual `quebraDeBloco` — e precisa rodar ANTES dele quando a
// linha casa (uma linha `| a | b |` solta ainda é só um `Paragraph` pro parser, sem a
// delimitadora embaixo; se `quebraDeBloco` visse o Enter primeiro, trataria como parágrafo comum
// e a conversão nunca aconteceria). A ordem de registro em `EXTENSOES` (EditorNota.tsx) decide o
// desempate entre extensões do mesmo nível de precedência — `tabelaMarkdown` precisa vir antes de
// `quebraDeBloco` nesse array. Quando a linha não casa, devolve `false` e `quebraDeBloco` cuida.

import { EditorSelection, Prec } from "@codemirror/state";
import { keymap, type Command } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

import { blocoEm } from "./blocoMarkdown";
import { focusTableCell } from "./comandosMarkdown";

/**
 * Divide uma linha em células por `|`, respeitando pipe escapado (`\|`, que fica dentro da
 * célula, não separa). Sempre devolve um token a mais que o número de pipes reais — os dois
 * extremos são o que sobra fora do primeiro/último `|` (vazio numa linha bem formada).
 */
function dividirPorPipes(texto: string): string[] {
  const tokens: string[] = [];
  let atual = "";
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === "\\" && texto[i + 1] === "|") {
      atual += "\\|";
      i++;
      continue;
    }
    if (c === "|") {
      tokens.push(atual);
      atual = "";
      continue;
    }
    atual += c;
  }
  tokens.push(atual);
  return tokens;
}

/**
 * Detecta se `texto` é uma linha candidata a virar cabeçalho de tabela: começa e termina com
 * `|`, pelo menos 2 células. Devolve o texto de cada célula (aparado), ou `null` se não casar.
 * Pura — sem `EditorView`, testável direto.
 */
export function linhaViraTabela(texto: string): string[] | null {
  const t = texto.trim();
  if (!t.startsWith("|") || !t.endsWith("|")) return null;

  const tokens = dividirPorPipes(t);
  // Os dois extremos precisam ser vazios — é isso que garante que a linha começa/termina com
  // `|` de fato, e não só contém um em algum lugar (ex.: "a | b" não é linha de tabela).
  if (tokens[0] !== "" || tokens[tokens.length - 1] !== "") return null;

  const celulas = tokens.slice(1, -1).map((c) => c.trim());
  return celulas.length >= 2 ? celulas : null;
}

// Célula de delimitadora GFM: hífens com `:` opcional nas pontas (alinhamento). Aceita a linha
// com ou sem os pipes das pontas — é só pra decidir "essa linha já parece uma delimitadora",
// não pra validar a tabela inteira.
const RE_LINHA_DELIMITADORA = /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?$/;

/** A linha de baixo já é (ou já parece) uma linha delimitadora de tabela GFM. Pura. */
export function linhaEhDelimitadora(texto: string): boolean {
  const t = texto.trim();
  return t.length > 0 && RE_LINHA_DELIMITADORA.test(t);
}

const enterViraTabela: Command = (view) => {
  const sel = view.state.selection.main;
  if (!sel.empty) return false; // com seleção, deixa o Enter padrão substituir o trecho

  const linha = view.state.doc.lineAt(sel.from);
  if (sel.from !== linha.to) return false; // só converte com o cursor no fim da linha

  const celulas = linhaViraTabela(linha.text);
  if (!celulas) return false;

  // Fora de uma tabela já existente: dentro de uma tabela renderizada o Enter nem chega até
  // aqui (a célula é um `contenteditable` à parte, tratado em `table-widget.ts`) — esta checagem
  // cobre o meio-termo de uma tabela ainda sendo digitada, mas já reconhecida pelo parser.
  const bloco = blocoEm(syntaxTree(view.state), view.state.doc, sel.from);
  if (bloco?.tipo === "Table") return false;

  // Linha de baixo já delimitadora: a tabela já está se formando sozinha (usuário digitou as
  // duas linhas na mão) — Enter não faz nada de especial (doc 14 §1.1).
  const proximoNumero = linha.number + 1;
  if (
    proximoNumero <= view.state.doc.lines &&
    linhaEhDelimitadora(view.state.doc.line(proximoNumero).text)
  ) {
    return false;
  }

  const delimitadora = `|${" --- |".repeat(celulas.length)}`;
  const linhaVaziaNova = `|${"  |".repeat(celulas.length)}`;
  const inserir = `\n${delimitadora}\n${linhaVaziaNova}`;

  view.dispatch({
    changes: { from: sel.from, insert: inserir },
    selection: EditorSelection.cursor(sel.from + inserir.length),
    scrollIntoView: true,
    userEvent: "input",
  });

  focusTableCell(view, linha.from, 0, 0);
  return true;
};

export const tabelaMarkdown = Prec.highest(keymap.of([{ key: "Enter", run: enterViraTabela }]));
