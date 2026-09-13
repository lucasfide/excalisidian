// Doc 11 §12, itens 4 e 5: montagem do prompt com tetos e interpretação desconfiada.
import { describe, it, expect } from "vitest";

import {
  montarPrompt,
  interpretarCiclo,
  systemAssistente,
  NOTA_TETO_CHARS,
  DIFF_TETO_CHARS,
  RESUMO_TETO_CHARS,
} from "./assistente";

const material = {
  caminho: "Projetos/Nota.md",
  nota: "x".repeat(20_000),
  diff: "linha nova importante",
  relacionadas: [
    { path: "A.md", titulo: "A", texto: "y".repeat(5000) },
    { path: "B.draw.md", titulo: "B", texto: "z".repeat(5000) },
  ],
  fatos: ["f1", "f2"],
};

describe("assistente — prompt", () => {
  it("respeita os tetos: nota pela cauda, resumo e diff cortados", () => {
    const p = montarPrompt(material);
    expect(p).toContain("f1");
    expect(p).toContain("A.md");
    // nota: entram só os últimos NOTA_TETO_CHARS; o começo gigante não
    expect(p.length).toBeLessThan(
      NOTA_TETO_CHARS + DIFF_TETO_CHARS + 2 * RESUMO_TETO_CHARS + 2000,
    );
    expect(montarPrompt({ ...material, diff: "" })).toContain("(nada novo)");
  });

  it("o system proíbe escrever no arquivo e inventar caminho", () => {
    const s = systemAssistente("Projetos/Nota.md");
    expect(s).toContain("NÃO edita");
    expect(s).toContain("Nunca invente caminho");
    expect(s).toContain("Projetos/Nota.md");
  });
});

describe("assistente — interpretação", () => {
  it("sugestões válidas viram itens com id", () => {
    const r = interpretarCiclo(
      '{"sugestoes":[{"tipo":"pergunta","texto":"Falta o prazo?"},{"tipo":"gap","texto":"Contradição com A.md"}],"novosFatos":["chama o backend de Core"]}',
      () => true,
    );
    expect(r?.sugestoes).toHaveLength(2);
    expect(r?.sugestoes[0].tipo).toBe("pergunta");
    expect(r?.novosFatos).toEqual(["chama o backend de Core"]);
  });

  it("notaRelacionada com caminho fora do índice é descartada (nunca inventa link)", () => {
    const r = interpretarCiclo(
      '{"sugestoes":[{"tipo":"notaRelacionada","texto":"ver","caminhoNota":"Fantasma.md"}],"novosFatos":[]}',
      (c) => c === "Real.md",
    );
    expect(r?.sugestoes).toEqual([]);
  });

  it("notaRelacionada com caminho válido é mantida", () => {
    const r = interpretarCiclo(
      '{"sugestoes":[{"tipo":"notaRelacionada","texto":"ver","caminhoNota":"Real.md"}],"novosFatos":[]}',
      (c) => c === "Real.md",
    );
    expect(r?.sugestoes[0].caminhoNota).toBe("Real.md");
  });

  it("achadoWeb é descartado enquanto a web search não existe (P2)", () => {
    const r = interpretarCiclo(
      '{"sugestoes":[{"tipo":"achadoWeb","texto":"x"}]}',
      () => true,
    );
    expect(r?.sugestoes).toEqual([]);
  });

  it("mais de 4 sugestões são cortadas; tipo/texto inválidos caem", () => {
    const bruto = {
      sugestoes: Array.from({ length: 6 }, (_, i) => ({
        tipo: "conteudo",
        texto: `s${i}`,
      })).concat([{ tipo: "x", texto: "inválida" }, { tipo: "gap", texto: "  " }]),
    };
    const r = interpretarCiclo(JSON.stringify(bruto), () => true);
    expect(r?.sugestoes).toHaveLength(4);
  });

  it("resposta que não é JSON vira null sem lançar", () => {
    expect(interpretarCiclo("claro, aqui vai...", () => true)).toBeNull();
  });

  it("sugestoes ausente ou não-array é null", () => {
    expect(interpretarCiclo('{"novosFatos":[]}', () => true)).toBeNull();
  });
});
