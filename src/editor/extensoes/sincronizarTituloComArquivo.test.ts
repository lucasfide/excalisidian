import { describe, it, expect } from "vitest";

import { decidirRenomear } from "./sincronizarTituloComArquivo";

describe("decidirRenomear", () => {
  it("sair da linha 1 com título mudado renomeia", () => {
    const decisao = decidirRenomear(
      { tipo: "selecao", naLinha1Antes: true, naLinha1Depois: false },
      "Título Novo",
      "Título Velho",
      "notas/a.md",
    );
    expect(decisao).toEqual({
      renomear: true,
      caminho: "notas/a.md",
      titulo: "Título Novo",
    });
  });

  it("perder o foco na linha 1 com título mudado renomeia", () => {
    const decisao = decidirRenomear(
      { tipo: "foco-perdido", naLinha1: true },
      "Título Novo",
      "Título Velho",
      "notas/a.md",
    );
    expect(decisao).toEqual({
      renomear: true,
      caminho: "notas/a.md",
      titulo: "Título Novo",
    });
  });

  it("destruir com título mudado renomeia com o caminho capturado, mesmo com outro caminho ativo", () => {
    // O caminho capturado é o desta aba (notas/a.md); o parâmetro não recebe o
    // "caminhoAtivo" do momento do evento — que poderia ser outra aba (notas/outra.md).
    const decisao = decidirRenomear(
      { tipo: "destruicao", naLinha1: true },
      "Título Novo",
      "Título Velho",
      "notas/a.md",
    );
    expect(decisao).toEqual({
      renomear: true,
      caminho: "notas/a.md",
      titulo: "Título Novo",
    });
  });

  it("título igual ao último não renomeia", () => {
    const decisao = decidirRenomear(
      { tipo: "selecao", naLinha1Antes: true, naLinha1Depois: false },
      "Mesmo Título",
      "Mesmo Título",
      "notas/a.md",
    );
    expect(decisao.renomear).toBe(false);
  });

  it("sem rename duplo: sair da linha 1 renomeia, perder o foco depois (mesmo título) não renomeia de novo", () => {
    const primeira = decidirRenomear(
      { tipo: "selecao", naLinha1Antes: true, naLinha1Depois: false },
      "Título Novo",
      "Título Velho",
      "notas/a.md",
    );
    expect(primeira.renomear).toBe(true);

    // Depois do primeiro rename, `ultimoTitulo` passa a ser "Título Novo" — o chamador
    // real atualiza esse valor antes do próximo evento (ver sincronizarTituloComArquivo).
    const segunda = decidirRenomear(
      { tipo: "foco-perdido", naLinha1: true },
      "Título Novo",
      "Título Novo",
      "notas/a.md",
    );
    expect(segunda.renomear).toBe(false);
  });

  it("sem caminho capturado não renomeia", () => {
    const decisao = decidirRenomear(
      { tipo: "selecao", naLinha1Antes: true, naLinha1Depois: false },
      "Título Novo",
      "Título Velho",
      null,
    );
    expect(decisao.renomear).toBe(false);
  });

  it("título vazio não renomeia", () => {
    const decisao = decidirRenomear(
      { tipo: "selecao", naLinha1Antes: true, naLinha1Depois: false },
      null,
      "Título Velho",
      "notas/a.md",
    );
    expect(decisao.renomear).toBe(false);
  });

  it("evento que não é saída da linha 1, perda de foco na linha 1 nem destruição na linha 1 não renomeia", () => {
    // Seleção que não saiu da linha 1 (moveu dentro dela).
    expect(
      decidirRenomear(
        { tipo: "selecao", naLinha1Antes: true, naLinha1Depois: true },
        "Título Novo",
        "Título Velho",
        "notas/a.md",
      ).renomear,
    ).toBe(false);
    // Perda de foco fora da linha 1.
    expect(
      decidirRenomear(
        { tipo: "foco-perdido", naLinha1: false },
        "Título Novo",
        "Título Velho",
        "notas/a.md",
      ).renomear,
    ).toBe(false);
    // Destruição fora da linha 1.
    expect(
      decidirRenomear(
        { tipo: "destruicao", naLinha1: false },
        "Título Novo",
        "Título Velho",
        "notas/a.md",
      ).renomear,
    ).toBe(false);
  });
});
