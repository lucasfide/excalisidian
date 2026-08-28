// Atalhos de formatação inline (doc 06 / Fatia 2). Envolvem a seleção com o marcador
// markdown; sem seleção, inserem o par e deixam o cursor no meio.
//
// Toggle robusto: cada ponta da seleção é checada de forma independente. Um marcador conta
// se estiver logo ANTES da borda (fora da seleção) OU logo DENTRO dela. Isso cobre o caso
// em que o live preview esconde os `**` e a re-seleção do usuário fica "torta" — pega o
// marcador de uma ponta e não o da outra. Se as duas pontas têm marcador, remove; senão,
// envolve.
//
// A continuação de lista já vem do `markdownKeymap` do pacote — não é reimplementada aqui.

import { EditorSelection, Prec, type ChangeSpec } from "@codemirror/state";
import { keymap, type Command } from "@codemirror/view";

function envolver(marcador: string): Command {
  const n = marcador.length;
  return (view) => {
    const total = view.state.doc.length;
    const trecho = (de: number, ate: number) =>
      view.state.sliceDoc(Math.max(0, de), Math.min(total, ate));

    const mudancas: ChangeSpec[] = [];
    const novasSelecoes = view.state.selection.ranges.map((r) => {
      // Marcador junto ao início: fora [from-n, from] ou dentro [from, from+n].
      const foraIni = trecho(r.from - n, r.from) === marcador;
      const dentroIni = trecho(r.from, r.from + n) === marcador;
      // Marcador junto ao fim: dentro [to-n, to] ou fora [to, to+n].
      const dentroFim = trecho(r.to - n, r.to) === marcador;
      const foraFim = trecho(r.to, r.to + n) === marcador;

      const temIni = foraIni || dentroIni;
      const temFim = dentroFim || foraFim;

      if (temIni && temFim) {
        // Toggle off: remove um marcador de cada ponta, nas posições exatas encontradas.
        const iniFrom = foraIni ? r.from - n : r.from;
        const fimFrom = foraFim ? r.to : r.to - n;
        // Evita remover o mesmo marcador duas vezes numa seleção degenerada.
        if (fimFrom >= iniFrom + n) {
          mudancas.push({ from: iniFrom, to: iniFrom + n, insert: "" });
          mudancas.push({ from: fimFrom, to: fimFrom + n, insert: "" });
          const novoFrom = iniFrom;
          const novoTo = Math.max(novoFrom, fimFrom - n);
          return EditorSelection.range(novoFrom, novoTo);
        }
      }

      // Caso normal: envolve.
      mudancas.push({ from: r.from, insert: marcador });
      mudancas.push({ from: r.to, insert: marcador });
      return EditorSelection.range(r.from + n, r.to + n);
    });

    view.dispatch({
      changes: mudancas,
      selection: EditorSelection.create(novasSelecoes),
      scrollIntoView: true,
    });
    return true;
  };
}

export const atalhosFormatacao = Prec.high(
  keymap.of([
    { key: "Mod-b", run: envolver("**"), preventDefault: true },
    { key: "Mod-i", run: envolver("*"), preventDefault: true },
    { key: "Mod-e", run: envolver("`"), preventDefault: true },
    { key: "Mod-Shift-x", run: envolver("~~"), preventDefault: true },
    { key: "Mod-Shift-h", run: envolver("=="), preventDefault: true },
  ]),
);
