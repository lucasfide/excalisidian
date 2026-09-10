// A linha 1 da nota é o título e é sempre um H1 (doc 04 §3.1): o prefixo `# ` não pode ser
// editado nem apagado. Selecionar a linha inteira e digitar troca só o texto depois do `# `;
// Backspace no começo do título não come o `#`; apagar todo o texto deixa `# ` (linha 1
// continua H1).
//
// Feito com `EditorState.transactionFilter` — e não `changeFilter` — porque `changeFilter` só
// SUPRIME trechos: uma mudança que encavala o prefixo (selecionar a linha 1 toda e digitar)
// perde o texto digitado junto. Aqui a mudança é recortada: a parte dentro de `[0, fim]` é
// descartada, o texto inserido é reancorado logo depois do `# `.
//
// Só age quando a linha 1 JÁ é um H1: não injeta `# ` em nota que não tem título (RNF7 — abrir
// uma nota não pode gerar diff). A sincronização título↔arquivo (sincronizarTituloComArquivo.ts
// / renomear.ts) reescreve o H1 por fora do editor (grava em disco e o painel remonta), então
// não passa por este filtro.

import {
  EditorState,
  Transaction,
  type ChangeSpec,
  type Extension,
  type TransactionSpec,
} from "@codemirror/state";

import { RE_HEADING } from "../../indice/sintaxe";

/**
 * Comprimento do prefixo protegido (`#` + espaços à esquerda) da linha 1, ou `null` quando a
 * linha 1 não é um H1 de nível 1 — mesma detecção de heading do índice (`RE_HEADING`), pra não
 * criar uma segunda definição do que é um título. Puro: recebe só o texto da linha 1.
 */
export function fimDoPrefixoTitulo(primeiraLinha: string): number | null {
  const h = RE_HEADING.exec(primeiraLinha);
  if (!h || h[1].length !== 1) return null;
  return /^#\s+/.exec(primeiraLinha)![0].length;
}

export const tituloSempreH1: Extension = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr;
  const fim = fimDoPrefixoTitulo(tr.startState.doc.lineAt(0).text);
  if (fim === null) return tr;

  let recortou = false;
  let ancora: number | null = null;
  const mudancas: ChangeSpec[] = [];

  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const texto = inserted.toString();

    if (fromA >= fim) {
      mudancas.push({ from: fromA, to: toA, insert: texto });
      ancora = fromA + texto.length;
      return;
    }

    // A mudança toca o prefixo `# `: nunca apaga antes de `fim`, e o texto digitado (se houver)
    // reancora logo depois do prefixo.
    recortou = true;
    if (toA <= fim) {
      if (texto.length > 0) {
        mudancas.push({ from: fim, to: fim, insert: texto });
        ancora = fim + texto.length;
      }
      return;
    }
    mudancas.push({ from: fim, to: toA, insert: texto });
    ancora = fim + texto.length;
  });

  if (!recortou) return tr;

  const spec: TransactionSpec = {
    changes: mudancas,
    scrollIntoView: tr.scrollIntoView,
  };
  if (ancora !== null) spec.selection = { anchor: ancora };
  const evento = tr.annotation(Transaction.userEvent);
  if (evento) spec.annotations = Transaction.userEvent.of(evento);
  return spec;
});
