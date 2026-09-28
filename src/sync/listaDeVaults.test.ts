// Testes de src/sync/listaDeVaults.ts (plano 12 Task 4, doc 17 §8, spec §2). `montarListaDeVaults`
// é puro: sem Tauri, sem servidor — só junta as três fontes (recentes, EstadoSync por caminho,
// vaults da conta na nuvem) num item por vault. Escrito ANTES da implementação, visto falhando.

import { describe, it, expect } from "vitest";

import { montarListaDeVaults } from "./listaDeVaults";
import type { EstadoSync } from "./estadoSync";
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
  it("local com EstadoSync cujo id está na nuvem e a pasta existe: sincronizado", () => {
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
    });
  });

  it("local com EstadoSync cuja pasta não existe mais: pasta-nao-encontrada", () => {
    const itens = montarListaDeVaults({
      recentes: [
        { caminho: "C:/Vaults/Sumiu", existe: false, estado: estado({ idDoVault: "id-2" }) },
      ],
      nuvem: [{ id: "id-2", nome: "Sumiu" }],
    });

    expect(itens).toHaveLength(1);
    expect(itens[0]!.estado).toBe("pasta-nao-encontrada");
    expect(itens[0]!.caminho).toBe("C:/Vaults/Sumiu");
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
    });
  });

  it("local sem EstadoSync e pasta inexistente: não aparece na lista", () => {
    const itens = montarListaDeVaults({
      recentes: [{ caminho: "C:/Vaults/NuncaExistiu", existe: false, estado: null }],
      nuvem: [],
    });

    expect(itens).toHaveLength(0);
  });

  it("nuvem sem local: so-nuvem, com o nome decifrado", () => {
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
    });
  });

  it("nuvem cujo envelope não abre (nome null): outra-senha", () => {
    const itens = montarListaDeVaults({
      recentes: [],
      nuvem: [{ id: "id-4", nome: null }],
    });

    expect(itens).toHaveLength(1);
    expect(itens[0]!.estado).toBe("outra-senha");
    expect(itens[0]!.chave).toBe("nuvem:id-4");
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
    expect(outraSenha.estado).toBe("outra-senha");
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

  it("ordenação: sincronizados, depois só-local, depois só-nuvem, depois os demais; por nome dentro de cada grupo", () => {
    const itens = montarListaDeVaults({
      recentes: [
        { caminho: "C:/Vaults/Zebra", existe: true, estado: estado({ idDoVault: "id-zebra" }) },
        { caminho: "C:/Vaults/Abelha", existe: true, estado: estado({ idDoVault: "id-abelha" }) },
        { caminho: "C:/Vaults/SoLocalZ", existe: true, estado: null },
        { caminho: "C:/Vaults/SoLocalA", existe: true, estado: null },
        { caminho: "C:/Vaults/Sumiu", existe: false, estado: estado({ idDoVault: "id-sumiu" }) },
      ],
      nuvem: [
        { id: "id-zebra", nome: "Zebra" },
        { id: "id-abelha", nome: "Abelha" },
        { id: "id-sumiu", nome: "Sumiu" },
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
      "SoNuvemA",
      "SoNuvemZ",
      "", // outra-senha, nome desconhecido (a tela mostra "Vault sem nome")
      "Sumiu",
    ]);
    expect(itens.map((i) => i.estado)).toEqual([
      "sincronizado",
      "sincronizado",
      "so-local",
      "so-local",
      "so-nuvem",
      "so-nuvem",
      "outra-senha",
      "pasta-nao-encontrada",
    ]);
  });
});
