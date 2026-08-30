// Ctrl+A numa nota seleciona só o conteúdo, nunca o título (doc 04 §3.1: o H1 da linha 1 —
// depois do frontmatter, se houver — é o nome do arquivo, não é "conteúdo" pra selecionar
// junto). Sem H1 nenhum, cai no comportamento padrão do CodeMirror (selecionar tudo).

import { EditorSelection, Prec } from "@codemirror/state";
import { keymap, type Command } from "@codemirror/view";

import { lerFrontmatter } from "../../indice/frontmatter";
import { indiceDoH1 } from "../../vault/tituloNota";

const selecionarCorpo: Command = (view) => {
  const texto = view.state.doc.toString();
  const { linhas: inicioCorpo } = lerFrontmatter(texto);
  const todasLinhas = texto.split("\n");
  const iH1 = indiceDoH1(todasLinhas, inicioCorpo);

  // Sem H1: não tem título pra excluir — mantém o Ctrl+A de sempre (documento inteiro).
  if (iH1 === -1) {
    view.dispatch({ selection: EditorSelection.range(0, view.state.doc.length) });
    return true;
  }

  // Pula o H1 e, se a linha seguinte for a linha em branco que sempre vem depois dele
  // (criarNota.ts, sincronizarH1ComTitulo), pula ela também — começa direto no conteúdo.
  let primeiraLinhaDoCorpo = iH1 + 1;
  if (todasLinhas[primeiraLinhaDoCorpo] === "") primeiraLinhaDoCorpo++;

  const doc = view.state.doc;
  const numeroLinha = primeiraLinhaDoCorpo + 1; // CodeMirror numera linha a partir de 1
  const from = numeroLinha <= doc.lines ? doc.line(numeroLinha).from : doc.length;

  view.dispatch({ selection: EditorSelection.range(from, doc.length) });
  return true;
};

export const selecionarCorpoDaNota = Prec.high(
  keymap.of([{ key: "Mod-a", run: selecionarCorpo, preventDefault: true }]),
);
