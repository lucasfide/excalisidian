// src/sync/ServicoSyncLocal.test.ts
import { describe, it, expect } from "vitest";

import { ServicoSyncLocal, type AdaptadorFsSync } from "./ServicoSyncLocal";
import { FalhaSync } from "./tiposServidor";

const bytes = (...vals: number[]) => new Uint8Array(vals);
const novoId = () => crypto.randomUUID();

/** Disco falso em memória: simula o filesystem real o bastante para provar o armazenamento
 * (pastas, tmp + rename, releitura) sem depender do runtime Tauri. Compartilhado entre duas
 * instâncias de ServicoSyncLocal simula duas janelas do app vendo o mesmo "servidor". */
function discoFalso(): AdaptadorFsSync & { arquivos: Map<string, string>; chamadas: string[] } {
  const arquivos = new Map<string, string>();
  const diretorios = new Set<string>();
  const chamadas: string[] = [];
  return {
    arquivos,
    chamadas,
    async existeDiretorio(caminho) {
      chamadas.push(`existeDiretorio:${caminho}`);
      return diretorios.has(caminho);
    },
    async criarDiretorio(caminho) {
      chamadas.push(`criarDiretorio:${caminho}`);
      diretorios.add(caminho);
    },
    async listarArquivos(caminho) {
      chamadas.push(`listarArquivos:${caminho}`);
      const prefixo = `${caminho}/`;
      return [...arquivos.keys()]
        .filter((c) => c.startsWith(prefixo) && !c.slice(prefixo.length).includes("/"))
        .map((c) => c.slice(prefixo.length));
    },
    async lerTexto(caminho) {
      chamadas.push(`lerTexto:${caminho}`);
      const conteudo = arquivos.get(caminho);
      if (conteudo === undefined) throw new Error(`arquivo não existe: ${caminho}`);
      return conteudo;
    },
    async escreverTexto(caminho, conteudo) {
      chamadas.push(`escreverTexto:${caminho}`);
      arquivos.set(caminho, conteudo);
    },
    async renomear(de, para) {
      chamadas.push(`renomear:${de}->${para}`);
      const conteudo = arquivos.get(de);
      if (conteudo === undefined) throw new Error(`arquivo tmp não existe: ${de}`);
      arquivos.delete(de);
      arquivos.set(para, conteudo);
    },
    async apagar(caminho) {
      chamadas.push(`apagar:${caminho}`);
      if (!arquivos.has(caminho)) throw new Error(`arquivo não existe: ${caminho}`);
      arquivos.delete(caminho);
    },
  };
}

const PASTA = "sync-teste-fake";

describe("ServicoSyncLocal", () => {
  it("listarVaults começa vazio", async () => {
    const s = new ServicoSyncLocal(discoFalso(), PASTA);
    expect(await s.listarVaults()).toEqual([]);
  });

  it("criarVault grava no disco falso e aparece em listarVaults, bytes intactos", async () => {
    const fs = discoFalso();
    const s = new ServicoSyncLocal(fs, PASTA);
    const id = novoId();
    await s.criarVault(id, bytes(1, 2, 3), bytes(4, 5, 6));

    const vaults = await s.listarVaults();
    expect(vaults).toHaveLength(1);
    expect(vaults[0].id).toBe(id);
    expect(vaults[0].nomeCifrado).toEqual(bytes(1, 2, 3));
    expect(vaults[0].envelope).toEqual(bytes(4, 5, 6));
  });

  it("criarVault com id repetido falha com ja-existe", async () => {
    const fs = discoFalso();
    const s = new ServicoSyncLocal(fs, PASTA);
    const id = novoId();
    await s.criarVault(id, bytes(1), bytes(2));
    await expect(s.criarVault(id, bytes(9), bytes(9))).rejects.toThrow(
      expect.objectContaining({ codigo: "ja-existe" }),
    );
  });

  it("grava por tmp + rename: nunca escreve direto no caminho final", async () => {
    const fs = discoFalso();
    const s = new ServicoSyncLocal(fs, PASTA);
    await s.criarVault(novoId(), bytes(1), bytes(2));

    const escritas = fs.chamadas.filter((c) => c.startsWith("escreverTexto:"));
    expect(escritas).toHaveLength(1);
    expect(escritas[0]).toMatch(/\.tmp-/);
    const renomeios = fs.chamadas.filter((c) => c.startsWith("renomear:"));
    expect(renomeios).toHaveLength(1);
    expect(renomeios[0]).toMatch(/\.tmp-.*->.*\.json$/);
  });

  it("enviarLote cresce a sequência e persiste entre chamadas (relê do disco)", async () => {
    const fs = discoFalso();
    const s = new ServicoSyncLocal(fs, PASTA);
    const id = novoId();
    await s.criarVault(id, bytes(1), bytes(2));
    const seq1 = await s.enviarLote(id, 0, bytes(9));
    const seq2 = await s.enviarLote(id, seq1, bytes(8));
    expect([seq1, seq2]).toEqual([1, 2]);

    const { lotes } = await s.baixar(id, 0);
    expect(lotes.map((l) => l.sequencia)).toEqual([1, 2]);
    expect(lotes.map((l) => l.bytes)).toEqual([bytes(9), bytes(8)]);
  });

  it("envio fora de ordem é recusado e não altera o disco", async () => {
    const fs = discoFalso();
    const s = new ServicoSyncLocal(fs, PASTA);
    const id = novoId();
    await s.criarVault(id, bytes(1), bytes(2));
    await s.enviarLote(id, 0, bytes(1)); // seq 1
    await expect(s.enviarLote(id, 0, bytes(99))).rejects.toThrow(
      expect.objectContaining({ codigo: "fora-de-ordem" }),
    );
    const { lotes } = await s.baixar(id, 0);
    expect(lotes).toHaveLength(1);
  });

  it("retrato descarta lotes cobertos, igual ServicoSyncFake", async () => {
    const fs = discoFalso();
    const s = new ServicoSyncLocal(fs, PASTA);
    const id = novoId();
    await s.criarVault(id, bytes(1), bytes(2));
    await s.enviarLote(id, 0, bytes(1)); // seq 1
    await s.enviarLote(id, 1, bytes(2)); // seq 2
    await s.enviarRetrato(id, 2, [bytes(100, 101)]);

    const { retrato, lotes, ultimoRetrato } = await s.baixar(id, 0);
    expect(retrato).toEqual({ ateSequencia: 2, partes: [bytes(100, 101)] });
    expect(lotes).toEqual([]);
    expect(ultimoRetrato).toBe(2);
  });

  it("apagarVault remove o arquivo; id desconhecido não explode", async () => {
    const fs = discoFalso();
    const s = new ServicoSyncLocal(fs, PASTA);
    const id = novoId();
    await s.criarVault(id, bytes(1), bytes(2));
    await s.apagarVault(id);
    expect(await s.listarVaults()).toEqual([]);
    await expect(s.apagarVault("id-que-nao-existe")).resolves.toBeUndefined();
  });

  it("baixar/enviarLote em vault desconhecido falha com nao-encontrado", async () => {
    const s = new ServicoSyncLocal(discoFalso(), PASTA);
    await expect(s.baixar("id-que-nao-existe", 0)).rejects.toThrow(
      expect.objectContaining({ codigo: "nao-encontrado" }),
    );
    await expect(s.enviarLote("id-que-nao-existe", 0, bytes(1))).rejects.toThrow(
      expect.objectContaining({ codigo: "nao-encontrado" }),
    );
  });

  it("duas janelas (duas instâncias) compartilhando o mesmo disco enxergam o mesmo servidor", async () => {
    const fs = discoFalso(); // um só "disco" — como a mesma pasta do app data
    const janelaA = new ServicoSyncLocal(fs, PASTA);
    const janelaB = new ServicoSyncLocal(fs, PASTA);

    const id = novoId();
    await janelaA.criarVault(id, bytes(1, 2), bytes(3, 4));
    // Janela B, instância nova, nunca viu este vault em memória — só existe no "disco".
    const vaultsB = await janelaB.listarVaults();
    expect(vaultsB).toHaveLength(1);
    expect(vaultsB[0].id).toBe(id);

    await janelaA.enviarLote(id, 0, bytes(9, 9)); // seq 1, feito pela janela A

    // Janela B baixa e vê o lote que A enviou, sem ter mantido cache nenhum.
    const { lotes } = await janelaB.baixar(id, 0);
    expect(lotes.map((l) => l.sequencia)).toEqual([1]);
    expect(lotes[0].bytes).toEqual(bytes(9, 9));

    // Janela B envia o próximo lote — servidor continua consistente para as duas.
    await janelaB.enviarLote(id, 1, bytes(7)); // seq 2
    const { lotes: lotesFinal } = await janelaA.baixar(id, 0);
    expect(lotesFinal.map((l) => l.sequencia)).toEqual([1, 2]);
  });

  it("mutar os bytes depois de enviarLote não afeta o que fica no disco (cópia defensiva do núcleo)", async () => {
    const fs = discoFalso();
    const s = new ServicoSyncLocal(fs, PASTA);
    const id = novoId();
    await s.criarVault(id, bytes(1), bytes(2));
    const dados = bytes(7, 7, 7);
    await s.enviarLote(id, 0, dados);
    dados[0] = 0;
    const { lotes } = await s.baixar(id, 0);
    expect(lotes[0].bytes).toEqual(bytes(7, 7, 7));
  });

  it("propaga FalhaSync (não engole em undefined) quando o núcleo recusa", async () => {
    const s = new ServicoSyncLocal(discoFalso(), PASTA);
    const id = novoId();
    await s.criarVault(id, bytes(1), bytes(2));
    let erro: unknown;
    try {
      await s.enviarLote(id, 5, bytes(1));
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(FalhaSync);
  });
});
