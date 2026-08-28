import { describe, it, expect, vi } from "vitest";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock("../estado/vaultStore", () => ({ useVaultStore: { getState: () => ({}) } }));

import { atualizarLinksNoTexto } from "./renomear";
import { construirIndiceResolucao, resolverLink } from "../indice/resolucao";

describe("atualizarLinksNoTexto (rename em lote — roadmap teste 4)", () => {
  it("troca só o alvo, preservando alias e subcaminho, e mantém estilo de caminho", () => {
    const idx = construirIndiceResolucao([
      "Projetos/Arquitetura.md",
      "Notas/Diario.md",
    ]);
    const resolver = (alvo: string) => resolverLink(idx, alvo, "Notas/Diario.md");
    const texto = [
      "Ver [[Arquitetura]] e [[Arquitetura#Backend|o backend]].",
      "Caminho completo: [[Projetos/Arquitetura]].",
      "Não é link: Arquitetura solta.",
      "Outro alvo: [[Diario]].",
    ].join("\n");

    const novoBase = "Sistema";
    const novoPath = "Projetos/Sistema";
    const [saida, n] = atualizarLinksNoTexto(
      texto,
      resolver,
      "Projetos/Arquitetura.md",
      (escrito) => (escrito.includes("/") ? novoPath : novoBase),
    );

    expect(n).toBe(3);
    expect(saida).toContain("[[Sistema]]");
    expect(saida).toContain("[[Sistema#Backend|o backend]]");
    expect(saida).toContain("[[Projetos/Sistema]]");
    expect(saida).toContain("Arquitetura solta"); // texto normal não muda
    expect(saida).toContain("[[Diario]]"); // outro alvo não muda
  });

  it("não mexe em nada quando nenhum link aponta para o arquivo renomeado", () => {
    const idx = construirIndiceResolucao(["A.md", "B.md"]);
    const [saida, n] = atualizarLinksNoTexto(
      "Só [[B]] aqui.",
      (alvo) => resolverLink(idx, alvo, "A.md"),
      "Z.md",
      () => "X",
    );
    expect(n).toBe(0);
    expect(saida).toBe("Só [[B]] aqui.");
  });
});
