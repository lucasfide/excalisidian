// Comandos de formatação markdown do editor de nota — reusados tanto pelos atalhos de
// teclado (atalhosFormatacao.ts) quanto pela barra flutuante (barraFlutuante.ts). Uma
// implementação só, pra não ter dois lugares decidindo como envolver/prefixar uma linha.

import { EditorSelection, type ChangeSpec } from "@codemirror/state";
import type { Command, EditorView } from "@codemirror/view";

import { focusTableCell } from "../atomico/table-widget";

/**
 * Envolve a seleção com `marcador` (negrito, itálico, riscado, código, destaque). Toggle
 * robusto: cada ponta é checada de forma independente, cobrindo o caso em que o live preview
 * esconde o marcador e a re-seleção do usuário fica "torta" — pega o marcador de uma ponta e
 * não o da outra. Se as duas pontas têm marcador, remove; senão, envolve.
 */
export function envolver(marcador: string): Command {
  const n = marcador.length;
  return (view) => {
    const total = view.state.doc.length;
    const trecho = (de: number, ate: number) =>
      view.state.sliceDoc(Math.max(0, de), Math.min(total, ate));

    const mudancas: ChangeSpec[] = [];
    const novasSelecoes = view.state.selection.ranges.map((r) => {
      const foraIni = trecho(r.from - n, r.from) === marcador;
      const dentroIni = trecho(r.from, r.from + n) === marcador;
      const dentroFim = trecho(r.to - n, r.to) === marcador;
      const foraFim = trecho(r.to, r.to + n) === marcador;

      const temIni = foraIni || dentroIni;
      const temFim = dentroFim || foraFim;

      if (temIni && temFim) {
        const iniFrom = foraIni ? r.from - n : r.from;
        const fimFrom = foraFim ? r.to : r.to - n;
        if (fimFrom >= iniFrom + n) {
          mudancas.push({ from: iniFrom, to: iniFrom + n, insert: "" });
          mudancas.push({ from: fimFrom, to: fimFrom + n, insert: "" });
          const novoFrom = iniFrom;
          const novoTo = Math.max(novoFrom, fimFrom - n);
          return EditorSelection.range(novoFrom, novoTo);
        }
      }

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

/** Números de linha (1-based, do CodeMirror) tocados por qualquer trecho da seleção. */
function linhasDaSelecao(view: EditorView): number[] {
  const linhas = new Set<number>();
  for (const r of view.state.selection.ranges) {
    const de = view.state.doc.lineAt(r.from).number;
    const ate = view.state.doc.lineAt(r.to).number;
    for (let n = de; n <= ate; n++) linhas.add(n);
  }
  return [...linhas].sort((a, b) => a - b);
}

const RE_HEADING_LINHA = /^(#{1,6})\s+/;

/**
 * Alterna heading nível 1/2/3 nas linhas selecionadas. Linha já nesse nível volta a
 * parágrafo comum; linha em outro nível troca; parágrafo comum vira heading.
 */
export function alternarHeading(nivel: 1 | 2 | 3): Command {
  const prefixoAlvo = `${"#".repeat(nivel)} `;
  return (view) => {
    const mudancas: ChangeSpec[] = [];
    for (const n of linhasDaSelecao(view)) {
      const linha = view.state.doc.line(n);
      const m = RE_HEADING_LINHA.exec(linha.text);
      if (m && m[0] === prefixoAlvo) {
        mudancas.push({ from: linha.from, to: linha.from + m[0].length, insert: "" });
      } else if (m) {
        mudancas.push({ from: linha.from, to: linha.from + m[0].length, insert: prefixoAlvo });
      } else {
        mudancas.push({ from: linha.from, insert: prefixoAlvo });
      }
    }
    view.dispatch({ changes: mudancas, scrollIntoView: true });
    return true;
  };
}

/**
 * Alterna um prefixo de linha (citação `"> "`, lista `"- "`, checkbox `"- [ ] "`).
 * `reconhecerTambem` são outras grafias que já contam como "ligado" (ex.: `"- [x] "` também
 * desliga o checkbox, não só `"- [ ] "` exato) — sem misturar isso com o toggle de lista com
 * marcador simples, que não reconhece linha de checkbox como sua (prefixos diferentes).
 */
export function alternarPrefixoLinha(prefixo: string, reconhecerTambem: string[] = []): Command {
  const candidatos = [prefixo, ...reconhecerTambem];
  return (view) => {
    const linhas = linhasDaSelecao(view);
    const acharPrefixo = (texto: string) => candidatos.find((p) => texto.startsWith(p));
    const todasTem = linhas.every((n) => acharPrefixo(view.state.doc.line(n).text));

    const mudancas: ChangeSpec[] = [];
    for (const n of linhas) {
      const linha = view.state.doc.line(n);
      const achado = acharPrefixo(linha.text);
      if (todasTem && achado) {
        mudancas.push({ from: linha.from, to: linha.from + achado.length, insert: "" });
      } else if (!todasTem && !achado) {
        mudancas.push({ from: linha.from, insert: prefixo });
      }
    }
    view.dispatch({ changes: mudancas, scrollIntoView: true });
    return true;
  };
}

const RE_LISTA_NUMERADA = /^\d+\.\s/;

/** Alterna lista numerada, renumerando 1., 2., 3.… nas linhas selecionadas. */
export function alternarListaNumerada(): Command {
  return (view) => {
    const linhas = linhasDaSelecao(view);
    if (linhas.length === 0) return true;
    const primeiraTemNumero = RE_LISTA_NUMERADA.test(view.state.doc.line(linhas[0]).text);

    const mudancas: ChangeSpec[] = [];
    let contador = 1;
    for (const n of linhas) {
      const linha = view.state.doc.line(n);
      const m = RE_LISTA_NUMERADA.exec(linha.text);
      if (primeiraTemNumero) {
        if (m) mudancas.push({ from: linha.from, to: linha.from + m[0].length, insert: "" });
      } else {
        mudancas.push({ from: linha.from, insert: `${contador}. ` });
        contador++;
      }
    }
    view.dispatch({ changes: mudancas, scrollIntoView: true });
    return true;
  };
}

// Foco em célula de tabela (doc 14 §2.2): a implementação mora no widget, que sabe achar a
// tabela pela posição e esperar o DOM ser recriado depois do dispatch. Reexportada aqui porque
// `tabelaMarkdown.ts` já importa daqui.
export { focusTableCell };

/**
 * Insere uma tabela 2×1 (mais cabeçalho) na posição do cursor (doc 14 §1.1): linha vazia é
 * substituída pela tabela; linha com texto ganha a tabela depois dela, separada por uma linha
 * em branco. Sempre garante uma linha em branco depois da tabela (senão o parser GFM gruda o
 * parágrafo seguinte nela). Uma transação só — um `Ctrl+Z` desfaz tudo. Foco vai para a célula
 * "Coluna 1" com o texto selecionado, pronto pra digitar por cima.
 */
export function inserirTabela(): Command {
  return (view) => {
    if (view.state.readOnly) return false;

    const sel = view.state.selection.main;
    const linha = view.state.doc.lineAt(sel.from);
    const linhaVaziaAtual = linha.text.length === 0;

    const cabecalho = "| Coluna 1 | Coluna 2 |";
    const delimitadora = "| --- | --- |";
    const linhaVaziaNova = "|  |  |";
    const tabela = `${cabecalho}\n${delimitadora}\n${linhaVaziaNova}`;

    // Linha com texto: entra depois dela, com uma linha em branco separando as duas.
    const prefixo = linhaVaziaAtual ? "" : "\n\n";
    const ponto = linhaVaziaAtual ? linha.from : linha.to;
    const tableFrom = ponto + prefixo.length;

    // Depois da tabela precisa sobrar uma linha em branco — só falta acrescentar se o que já
    // vem a seguir no documento não for, ela mesma, uma linha em branco.
    const proximoNumero = linha.number + 1;
    const jaTemLinhaEmBrancoDepois =
      proximoNumero <= view.state.doc.lines &&
      view.state.doc.line(proximoNumero).text.length === 0;
    const sufixo = jaTemLinhaEmBrancoDepois ? "" : "\n";

    view.dispatch({
      changes: { from: ponto, to: ponto, insert: prefixo + tabela + sufixo },
      selection: EditorSelection.cursor(tableFrom),
      scrollIntoView: true,
      userEvent: "input",
    });

    focusTableCell(view, tableFrom, -1, 0, { selectAll: true });
    return true;
  };
}

/**
 * Envolve a seleção (ou um placeholder, se vazia) como link markdown e seleciona a parte da
 * URL, pronta pra digitar por cima — mesma convenção de Notion/Medium, sem diálogo no meio.
 */
export function inserirLink(): Command {
  return (view) => {
    const mudancas: ChangeSpec[] = [];
    const novasSelecoes = view.state.selection.ranges.map((r) => {
      const texto = view.state.sliceDoc(r.from, r.to) || "link";
      mudancas.push({ from: r.from, to: r.to, insert: `[${texto}](url)` });
      const urlFrom = r.from + texto.length + 3; // "[" + texto + "]("
      return EditorSelection.range(urlFrom, urlFrom + 3); // seleciona "url"
    });
    view.dispatch({
      changes: mudancas,
      selection: EditorSelection.create(novasSelecoes),
      scrollIntoView: true,
    });
    return true;
  };
}
