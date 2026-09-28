// Testes de src/sync/listaDeVaults.ts (plano 13 Task 2, doc 17 §8, spec do dono do produto
// 29/09/2026: só três situações — Sincronizado, Só neste computador, Na nuvem).
// `montarListaDeVaults` é puro: sem Tauri, sem servidor — só junta as três fontes (recentes,
// EstadoSync por caminho, vaults da conta na nuvem) num item por vault. Escrito ANTES da
// implementação, visto falhando.
//
// "Pasta não encontrada" e "outra-senha" deixaram de ser estados próprios (plano 12): uma pasta
// sumida não aparece mais como item local — o vault volta a aparecer como "so-nuvem", coberto
// pela entrada da nuvem; "outra-senha" vira a flag `outraSenha` sobre o estado "sincronizado"
// (local, via `ultimoErro`) ou "so-nuvem" (nome não decifrado).
//
// Revisão pós-commit a4ce75f (achado do dono do produto): "pasta sumida" também acontece com uma
// pasta do OneDrive ainda não baixada ou um HD externo desligado — NUNCA é esquecida sozinha por
// `montarListaDeVaults` nem por quem chama esta função ao montar a lista; só "Baixar…" para um
// lugar novo esquece um vínculo órfão, com `vinculosOrfaos` (testada no fim deste arquivo).

import { describe, it, expect } from "vitest";

import { montarListaDeVaults, vinculosOrfaos } from "./listaDeVaults";
import type { EstadoSync } from "./estadoSync";
import type { EntradaRecente } from "./listaDeVaults";
import { chaveDeVault } from "./coordenacao";

function estado(overrides: Partial<EstadoSync> = {}): EstadoSync {
  return {
    idDoVault: "id-1",
    cursor: 0,
    bases: {},
    hashesConhecidos: {},
    conflitosPendentes: {},
    ...overrides,
  };
}

describe("montarListaDeVaults", () => {
  it("local com EstadoSync cujo id está na nuvem e a pasta existe: sincronizado, outraSenha false", () => {
    const itens = montarListaDeVaults({
      recentes: [{ caminho: "C:/Vaults/Casa", existe: true, estado: estado({ idDoVault: "id-1" }) }],
      nuvem: [{ id: "id-1", nome: "Casa" }],
    });

    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({
      chave: chaveDeVault("C:/Vaults/Casa"),
      nome: "Casa",
      caminho: "C:/Vaults/Casa",
      idNaNuvem: "id-1",
      estado: "sincronizado",
      conflitosPendentes: 0,
      outraSenha: false,
    });
  });

  it("local com EstadoSync cuja pasta não existe mais: não aparece como item local, mostra 'Na nuvem' (a nuvem cobre)", () => {
    const itens = montarListaDeVaults({
      recentes: [
        { caminho: "C:/Vaults/Sumiu", existe: false, estado: estado({ idDoVault: "id-2" }) },
      ],
      nuvem: [{ id: "id-2", nome: "Sumiu" }],
    });

    expect(itens).toHaveLength(1);
    expect(itens[0]!.estado).toBe("so-nuvem");
    expect(itens[0]!.caminho).toBe(null);
    expect(itens[0]!.idNaNuvem).toBe("id-2");
  });

  it("pasta que volta a existir (OneDrive terminou de baixar, HD externo ligado de novo): volta a 'sincronizado' sozinha", () => {
    // Mesmo EstadoSync de antes — nunca foi esquecido (`montarListaDeVaults` não tem I/O de
    // escrita; é só a mesma função, chamada de novo com `existe: true` agora).
    const estadoDoVault = estado({ idDoVault: "id-2" });

    const semAPasta = montarListaDeVaults({
      recentes: [{ caminho: "C:/Vaults/OneDrive", existe: false, estado: estadoDoVault }],
      nuvem: [{ id: "id-2", nome: "Trabalho" }],
    });
    expect(semAPasta[0]!.estado).toBe("so-nuvem");

    const comAPastaDeVolta = montarListaDeVaults({
      recentes: [{ caminho: "C:/Vaults/OneDrive", existe: true, estado: estadoDoVault }],
      nuvem: [{ id: "id-2", nome: "Trabalho" }],
    });
    expect(comAPastaDeVolta).toHaveLength(1);
    expect(comAPastaDeVolta[0]!.estado).toBe("sincronizado");
    expect(comAPastaDeVolta[0]!.caminho).toBe("C:/Vaults/OneDrive");
  });

  it("pasta sumida, mas OUTRO local com o mesmo id tem pasta existente: só o existente aparece, como sincronizado", () => {
    const itens = montarListaDeVaults({
      recentes: [
        { caminho: "C:/Vaults/Antigo", existe: false, estado: estado({ idDoVault: "id-2" }) },
        { caminho: "D:/Vaults/Novo", existe: true, estado: estado({ idDoVault: "id-2" }) },
      ],
      nuvem: [{ id: "id-2", nome: "Trabalho" }],
    });

    expect(itens).toHaveLength(1);
    expect(itens[0]!.estado).toBe("sincronizado");
    expect(itens[0]!.caminho).toBe("D:/Vaults/Novo");
  });

  it("local com EstadoSync cuja pasta não existe mais, e o vault não está (mais) na nuvem: não aparece", () => {
    const itens = montarListaDeVaults({
      recentes: [
        { caminho: "C:/Vaults/Sumiu", existe: false, estado: estado({ idDoVault: "id-2" }) },
      ],
      nuvem: [],
    });

    expect(itens).toHaveLength(0);
  });

  it("local sem EstadoSync e pasta existente: so-local", () => {
    const itens = montarListaDeVaults({
      recentes: [{ caminho: "C:/Vaults/Rascunho", existe: true, estado: null }],
      nuvem: [],
    });

    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({
      estado: "so-local",
      caminho: "C:/Vaults/Rascunho",
      idNaNuvem: null,
      outraSenha: false,
    });
  });

  it("local sem EstadoSync e pasta inexistente: não aparece na lista", () => {
    const itens = montarListaDeVaults({
      recentes: [{ caminho: "C:/Vaults/NuncaExistiu", existe: false, estado: null }],
      nuvem: [],
    });

    expect(itens).toHaveLength(0);
  });

  it("nuvem sem local: so-nuvem, com o nome decifrado, outraSenha false", () => {
    const itens = montarListaDeVaults({
      recentes: [],
      nuvem: [{ id: "id-3", nome: "Trabalho" }],
    });

    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({
      chave: "nuvem:id-3",
      caminho: null,
      idNaNuvem: "id-3",
      estado: "so-nuvem",
      outraSenha: false,
    });
  });

  it("nuvem cujo envelope não abre (nome null): so-nuvem com outraSenha true", () => {
    const itens = montarListaDeVaults({
      recentes: [],
      nuvem: [{ id: "id-4", nome: null }],
    });

    expect(itens).toHaveLength(1);
    expect(itens[0]!.estado).toBe("so-nuvem");
    expect(itens[0]!.outraSenha).toBe(true);
    expect(itens[0]!.chave).toBe("nuvem:id-4");
    expect(itens[0]!.nome).toBe("");
  });

  it("vault de outra senha convive com os demais, sem afetar a montagem deles", () => {
    const itens = montarListaDeVaults({
      recentes: [{ caminho: "C:/Vaults/Casa", existe: true, estado: estado({ idDoVault: "id-1" }) }],
      nuvem: [
        { id: "id-1", nome: "Casa" },
        { id: "id-4", nome: null },
      ],
    });

    expect(itens).toHaveLength(2);
    const casa = itens.find((i) => i.idNaNuvem === "id-1")!;
    const outraSenha = itens.find((i) => i.idNaNuvem === "id-4")!;
    expect(casa.estado).toBe("sincronizado");
    expect(casa.outraSenha).toBe(false);
    expect(outraSenha.estado).toBe("so-nuvem");
    expect(outraSenha.outraSenha).toBe(true);
  });

  it("local sincronizado com ultimoErro 'outra-senha': continua sincronizado, outraSenha true", () => {
    const itens = montarListaDeVaults({
      recentes: [
        {
          caminho: "C:/Vaults/Casa",
          existe: true,
          estado: estado({ idDoVault: "id-1", ultimoErro: "outra-senha" }),
        },
      ],
      nuvem: [{ id: "id-1", nome: "Casa" }],
    });

    expect(itens).toHaveLength(1);
    expect(itens[0]!.estado).toBe("sincronizado");
    expect(itens[0]!.ultimoErro).toBe("outra-senha");
    expect(itens[0]!.outraSenha).toBe(true);
  });

  it("a mesma pasta aparece uma vez: dois recentes com o mesmo caminho em grafias diferentes (mesmoVault)", () => {
    const itens = montarListaDeVaults({
      recentes: [
        { caminho: "C:/Vaults/Casa", existe: true, estado: null },
        { caminho: "c:\\vaults\\casa\\", existe: true, estado: estado({ idDoVault: "id-1" }) },
      ],
      nuvem: [{ id: "id-1", nome: "Casa" }],
    });

    expect(itens).toHaveLength(1);
    expect(itens[0]!.estado).toBe("sincronizado"); // a entrada com EstadoSync venceu, não a vazia
  });

  it("local com EstadoSync cujo id NÃO está na nuvem: continua sincronizado, preserva ultimoErro", () => {
    const itens = montarListaDeVaults({
      recentes: [
        {
          caminho: "C:/Vaults/Casa",
          existe: true,
          estado: estado({ idDoVault: "id-apagado", ultimoErro: "servidor", ultimoCicloEm: "2026-09-28T10:00:00.000Z" }),
        },
      ],
      nuvem: [], // o servidor não conhece mais este id (ou a lista falhou/ainda não chegou)
    });

    expect(itens).toHaveLength(1);
    expect(itens[0]!.estado).toBe("sincronizado");
    expect(itens[0]!.ultimoErro).toBe("servidor");
    expect(itens[0]!.ultimoCicloEm).toBe("2026-09-28T10:00:00.000Z");
    expect(itens[0]!.outraSenha).toBe(false);
  });

  it("conflitosPendentes conta as chaves do EstadoSync", () => {
    const itens = montarListaDeVaults({
      recentes: [
        {
          caminho: "C:/Vaults/Casa",
          existe: true,
          estado: estado({
            idDoVault: "id-1",
            conflitosPendentes: {
              "a.md": { hashRemoto: "h1", conteudo: "x", dispositivo: "PC", criadoEm: "2026-01-01T00:00:00.000Z" },
              "b.md": { hashRemoto: "h2", conteudo: "y", dispositivo: "PC", criadoEm: "2026-01-01T00:00:00.000Z" },
            },
          }),
        },
      ],
      nuvem: [{ id: "id-1", nome: "Casa" }],
    });

    expect(itens[0]!.conflitosPendentes).toBe(2);
  });

  it("ordenação: sincronizados, depois só-local, depois só-nuvem; por nome dentro de cada grupo", () => {
    const itens = montarListaDeVaults({
      recentes: [
        { caminho: "C:/Vaults/Zebra", existe: true, estado: estado({ idDoVault: "id-zebra" }) },
        { caminho: "C:/Vaults/Abelha", existe: true, estado: estado({ idDoVault: "id-abelha" }) },
        { caminho: "C:/Vaults/SoLocalZ", existe: true, estado: null },
        { caminho: "C:/Vaults/SoLocalA", existe: true, estado: null },
      ],
      nuvem: [
        { id: "id-zebra", nome: "Zebra" },
        { id: "id-abelha", nome: "Abelha" },
        { id: "id-nuvem-z", nome: "SoNuvemZ" },
        { id: "id-nuvem-a", nome: "SoNuvemA" },
        { id: "id-outra", nome: null },
      ],
    });

    expect(itens.map((i) => i.nome)).toEqual([
      "Abelha",
      "Zebra",
      "SoLocalA",
      "SoLocalZ",
      "", // outra-senha, nome desconhecido (a tela mostra "Vault sem nome") — ordena primeiro
      "SoNuvemA",
      "SoNuvemZ",
    ]);
    expect(itens.map((i) => i.estado)).toEqual([
      "sincronizado",
      "sincronizado",
      "so-local",
      "so-local",
      "so-nuvem",
      "so-nuvem",
      "so-nuvem",
    ]);
  });
});

describe("vinculosOrfaos", () => {
  // Só "Baixar…" para um lugar novo chama isto (`SecaoSincronizacao.tsx#aoBaixar`) — é a única
  // ação que esquece um vínculo local cuja pasta não existe agora; `montarListaDeVaults` nunca
  // esquece nada sozinha (revisão pós-commit a4ce75f).
  function recente(overrides: Partial<EntradaRecente> = {}): EntradaRecente {
    return { caminho: "C:/Vaults/Antigo", existe: false, estado: estado({ idDoVault: "id-1" }), ...overrides };
  }

  it("pasta que não existe com o mesmo idDoVault: é um vínculo órfão", () => {
    expect(vinculosOrfaos("id-1", [recente()])).toEqual(["C:/Vaults/Antigo"]);
  });

  it("pasta que existe: não é órfã, mesmo com o mesmo idDoVault", () => {
    expect(vinculosOrfaos("id-1", [recente({ existe: true })])).toEqual([]);
  });

  it("pasta que não existe, mas de OUTRO vault (id diferente): não é órfã deste vault", () => {
    expect(vinculosOrfaos("id-1", [recente({ estado: estado({ idDoVault: "id-2" }) })])).toEqual([]);
  });

  it("pasta que não existe e nunca teve EstadoSync: não é órfã (nada a esquecer)", () => {
    expect(vinculosOrfaos("id-1", [recente({ estado: null })])).toEqual([]);
  });

  it("vários vínculos órfãos do mesmo vault: todos voltam", () => {
    const orfaos = vinculosOrfaos("id-1", [
      recente({ caminho: "C:/Vaults/Antigo1" }),
      recente({ caminho: "C:/Vaults/Antigo2" }),
      recente({ caminho: "C:/Vaults/Existe", existe: true }),
    ]);
    expect(orfaos).toEqual(["C:/Vaults/Antigo1", "C:/Vaults/Antigo2"]);
  });
});
