import { Fragment, type ReactNode } from "react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { PhrasingContent, Root, RootContent, TableRow } from "mdast";

// Converte Markdown em elementos React sem dangerouslySetInnerHTML. Cobre os nós que os textos
// legais usam (títulos, parágrafos, listas, ênfase, links, tabelas, separador) e mais alguns
// comuns (citação, código, tachado). HTML cru no Markdown aparece como texto, nunca é injetado.

export interface ItemSumario {
  id: string;
  texto: string;
}

export interface DocumentoConvertido {
  elementos: ReactNode[];
  /** Títulos de nível 2, na ordem em que aparecem. */
  sumario: ItemSumario[];
}

export function gerarIdTitulo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function textoPuro(no: { type: string; value?: string; children?: unknown[] }): string {
  if (typeof no.value === "string") return no.value;
  return (no.children ?? []).map(filho => textoPuro(filho as { type: string })).join("");
}

function ehExterno(url: string): boolean {
  return /^(https?:)?\/\//i.test(url);
}

function inline(nos: PhrasingContent[], chave: string): ReactNode[] {
  return nos.map((no, i) => {
    const k = `${chave}.${i}`;
    switch (no.type) {
      case "text":
        return <Fragment key={k}>{no.value}</Fragment>;
      case "strong":
        return <strong key={k}>{inline(no.children, k)}</strong>;
      case "emphasis":
        return <em key={k}>{inline(no.children, k)}</em>;
      case "delete":
        return <del key={k}>{inline(no.children, k)}</del>;
      case "inlineCode":
        return <code key={k}>{no.value}</code>;
      case "break":
        return <br key={k} />;
      case "link":
        return (
          <a key={k} href={no.url} {...(ehExterno(no.url) ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
            {inline(no.children, k)}
          </a>
        );
      case "image":
        return <Fragment key={k}>{no.alt ?? ""}</Fragment>;
      case "html":
        return <Fragment key={k}>{no.value}</Fragment>;
      default:
        return <Fragment key={k}>{textoPuro(no as { type: string })}</Fragment>;
    }
  });
}

function linhaTabela(linha: TableRow, chave: string, cabecalho: boolean, alinhamentos: (string | null)[] | null | undefined) {
  const Celula = cabecalho ? "th" : "td";
  return (
    <tr key={chave}>
      {linha.children.map((celula, i) => (
        <Celula key={i} style={alinhamentos?.[i] ? { textAlign: alinhamentos[i] as "left" | "right" | "center" } : undefined}>
          {inline(celula.children, `${chave}.${i}`)}
        </Celula>
      ))}
    </tr>
  );
}

export function converterMarkdown(markdown: string): DocumentoConvertido {
  const arvore = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;
  const sumario: ItemSumario[] = [];
  const idsUsados = new Map<string, number>();

  function idUnico(texto: string): string {
    const base = gerarIdTitulo(texto) || "secao";
    const usos = idsUsados.get(base) ?? 0;
    idsUsados.set(base, usos + 1);
    return usos === 0 ? base : `${base}-${usos + 1}`;
  }

  function bloco(no: RootContent, chave: string): ReactNode {
    switch (no.type) {
      case "heading": {
        const texto = textoPuro(no);
        const id = idUnico(texto);
        const Titulo = `h${no.depth}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
        if (no.depth === 2) sumario.push({ id, texto });
        return (
          <Titulo key={chave} id={id}>
            {inline(no.children, chave)}
          </Titulo>
        );
      }
      case "paragraph":
        return <p key={chave}>{inline(no.children, chave)}</p>;
      case "list": {
        const Lista = no.ordered ? "ol" : "ul";
        return (
          <Lista key={chave} {...(no.ordered && no.start != null && no.start !== 1 ? { start: no.start } : {})}>
            {no.children.map((item, i) => (
              <li key={i}>
                {item.checked != null && <input type="checkbox" checked={item.checked} disabled readOnly aria-hidden="true" />}
                {item.children.map((filho, j) => {
                  // Em item "apertado" o parágrafo vira só o conteúdo, sem <p> aninhado.
                  if (!item.spread && filho.type === "paragraph") return <Fragment key={j}>{inline(filho.children, `${chave}.${i}.${j}`)}</Fragment>;
                  return bloco(filho, `${chave}.${i}.${j}`);
                })}
              </li>
            ))}
          </Lista>
        );
      }
      case "blockquote":
        return <blockquote key={chave}>{no.children.map((filho, i) => bloco(filho, `${chave}.${i}`))}</blockquote>;
      case "code":
        return (
          <pre key={chave}>
            <code>{no.value}</code>
          </pre>
        );
      case "thematicBreak":
        return <hr key={chave} />;
      case "table": {
        const [cabecalho, ...corpo] = no.children;
        return (
          <div className="documento-legal__tabela" key={chave}>
            <table>
              <thead>{cabecalho && linhaTabela(cabecalho, `${chave}.h`, true, no.align)}</thead>
              <tbody>{corpo.map((linha, i) => linhaTabela(linha, `${chave}.${i}`, false, no.align))}</tbody>
            </table>
          </div>
        );
      }
      case "html":
        return <p key={chave}>{no.value}</p>;
      default:
        return null;
    }
  }

  return { elementos: arvore.children.map((no, i) => bloco(no, String(i))), sumario };
}
