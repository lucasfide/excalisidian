import { describe, it, expect } from "vitest";

import { decidirRenomear } from "./sincronizarTituloComArquivo";

describe("decidirRenomear", () => {
  it("sair da linha 1 com título mudado pelo usuário renomeia", () => {
    const decisao = decidirRenomear(
      { tipo: "selecao", naLinha1Antes: true, naLinha1Depois: false },
      "Título Novo",
      "Título Velho",
      "notas/a.md",
      true,
    );
    expect(decisao).toEqual({
      renomear: true,
      caminho: "notas/a.md",
      titulo: "Título Novo",
    });
  });

  it("perder o foco na linha 1 com título mudado pelo usuário renomeia", () => {
    const decisao = decidirRenomear(
      { tipo: "foco-perdido", naLinha1: true },
      "Título Novo",
      "Título Velho",
      "notas/a.md",
      true,
    );
    expect(decisao).toEqual({
      renomear: true,
      caminho: "notas/a.md",
      titulo: "Título Novo",
    });
  });

  it("destruir com título mudado pelo usuário renomeia com o caminho capturado, mesmo com outro caminho ativo", () => {
    // O caminho capturado é o desta aba (notas/a.md); o parâmetro não recebe o
    // "caminhoAtivo" do momento do evento — que poderia ser outra aba (notas/outra.md).
    const decisao = decidirRenomear(
      { tipo: "destruicao", naLinha1: true },
      "Título Novo",
      "Título Velho",
      "notas/a.md",
      true,
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
      true,
    );
    expect(decisao.renomear).toBe(false);
  });

  it("sem rename duplo: sair da linha 1 renomeia, perder o foco depois (mesmo título) não renomeia de novo", () => {
    const primeira = decidirRenomear(
      { tipo: "selecao", naLinha1Antes: true, naLinha1Depois: false },
      "Título Novo",
      "Título Velho",
      "notas/a.md",
      true,
    );
    expect(primeira.renomear).toBe(true);

    // Depois do primeiro rename, o chamador real zera `editouTitulo` e atualiza
    // `ultimoTitulo` para "Título Novo" (ver sincronizarTituloComArquivo.aplicarDecisao).
    const segunda = decidirRenomear(
      { tipo: "foco-perdido", naLinha1: true },
      "Título Novo",
      "Título Novo",
      "notas/a.md",
      false,
    );
    expect(segunda.renomear).toBe(false);
  });

  it("sem caminho capturado não renomeia", () => {
    const decisao = decidirRenomear(
      { tipo: "selecao", naLinha1Antes: true, naLinha1Depois: false },
      "Título Novo",
      "Título Velho",
      null,
      true,
    );
    expect(decisao.renomear).toBe(false);
  });

  it("título vazio não renomeia", () => {
    const decisao = decidirRenomear(
      { tipo: "selecao", naLinha1Antes: true, naLinha1Depois: false },
      null,
      "Título Velho",
      "notas/a.md",
      true,
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
        true,
      ).renomear,
    ).toBe(false);
    // Perda de foco fora da linha 1.
    expect(
      decidirRenomear(
        { tipo: "foco-perdido", naLinha1: false },
        "Título Novo",
        "Título Velho",
        "notas/a.md",
        true,
      ).renomear,
    ).toBe(false);
    // Destruição fora da linha 1.
    expect(
      decidirRenomear(
        { tipo: "destruicao", naLinha1: false },
        "Título Novo",
        "Título Velho",
        "notas/a.md",
        true,
      ).renomear,
    ).toBe(false);
  });

  // --- Casos da revisão: linha 1 mudou de texto, mas não foi o usuário digitando. ---

  it("mudança externa do H1 (editouTitulo false) seguida de perda de foco NÃO renomeia, mesmo com título diferente do último", () => {
    // Isola o efeito de `editouTitulo`: mesmo que `titulo` e `ultimoTitulo` NÃO sejam
    // iguais (então o bloqueio não vem do "sem rename duplo"), sem uma edição de verdade
    // do usuário não há o que renomear.
    const decisao = decidirRenomear(
      { tipo: "foco-perdido", naLinha1: true },
      "Título Depois Do Rename Externo",
      "Título De Antes Do Rename Externo",
      "notas/caminho-antigo.md",
      false,
    );
    expect(decisao.renomear).toBe(false);
  });

  it("mudança externa do H1 (editouTitulo false) seguida de destruição NÃO renomeia, mesmo com título diferente do último", () => {
    const decisao = decidirRenomear(
      { tipo: "destruicao", naLinha1: true },
      "Título Depois Do Rename Externo",
      "Título De Antes Do Rename Externo",
      "notas/caminho-antigo.md",
      false,
    );
    expect(decisao.renomear).toBe(false);
  });

  it("edição do usuário seguida de destruição renomeia", () => {
    const decisao = decidirRenomear(
      { tipo: "destruicao", naLinha1: true },
      "Título Editado Pelo Usuário",
      "Título Original",
      "notas/a.md",
      true,
    );
    expect(decisao).toEqual({
      renomear: true,
      caminho: "notas/a.md",
      titulo: "Título Editado Pelo Usuário",
    });
  });

  it("caso da sidebar: rename externo troca o caminho, e o fechamento da aba não regrava por cima do caminho antigo", () => {
    // Nota aberta com cursor na linha 1 (`naLinha1` true desde o início). O usuário
    // renomeia pela sidebar: renomear.ts reescreve o H1 e recarrega o editor — isso é
    // `editouTitulo = false` e `ultimoTitulo` resincronizado com o título novo (o
    // chamador real faz isso antes de qualquer decisão). O `caminhoCapturado` deste editor
    // continua sendo o caminho ANTIGO (não recapturamos numa mudança externa). Fechar a
    // aba agora (destroy, ainda na linha 1) não deve chamar renomearArquivo com esse
    // caminho antigo, porque não há edição pendente do usuário.
    const tituloAposRenameExterno = "Nome Novo Pela Sidebar";
    const decisao = decidirRenomear(
      { tipo: "destruicao", naLinha1: true },
      tituloAposRenameExterno,
      tituloAposRenameExterno,
      "notas/caminho-antigo.md",
      false,
    );
    expect(decisao.renomear).toBe(false);
  });
});
