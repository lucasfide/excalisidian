// Teste do catálogo de símbolos (Tarefa B, plano
// docs/superpowers/plans/2026-09-19-glossario-atalhos-simbolos.md). Para cada símbolo com
// amostra visual, confere que o parser markdown do editor (mesma config de
// AtomicCodeMirrorEditor.tsx: markdownLanguage + highlightMarkdown) reconhece a sintaxe — o
// glossário não pode ensinar algo que o editor não desenha.

import { describe, it, expect } from "vitest";
import { markdownLanguage } from "@codemirror/lang-markdown";
import type { MarkdownParser } from "@lezer/markdown";
import type { SyntaxNodeRef } from "@lezer/common";
import { highlightMarkdown } from "../../editor/atomico/highlight";
import { CATALOGO_SIMBOLOS } from "./catalogoSimbolos";

// markdownLanguage.parser é tipado como Parser (base genérica); em runtime é sempre um
// MarkdownParser, que é quem tem .configure() pra plugar highlightMarkdown — a mesma
// configuração de AtomicCodeMirrorEditor.tsx (markdown({ base: markdownLanguage, extensions:
// highlightMarkdown })).
const parser = (markdownLanguage.parser as MarkdownParser).configure(highlightMarkdown);
function nos(texto: string): Set<string> {
  const s = new Set<string>();
  parser.parse(texto).iterate({ enter: (n: SyntaxNodeRef) => void s.add(n.name) });
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
  it("atalhoEquivalente só usa ids reais da Tarefa A", () => {
    const idsValidos = new Set([
      "negrito", "italico", "codigo", "riscado", "destaque", "link", "nova-linha-mesmo-bloco",
    ]);
    for (const s of CATALOGO_SIMBOLOS) {
      if (s.atalhoEquivalente) expect(idsValidos, s.id).toContain(s.atalhoEquivalente);
    }
  });
});
