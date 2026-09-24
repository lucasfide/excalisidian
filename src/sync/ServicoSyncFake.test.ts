// src/sync/ServicoSyncFake.test.ts
import { describe, it, expect } from "vitest";

import { ServicoSyncFake } from "./ServicoSyncFake";
import { FalhaSync } from "./tiposServidor";

const bytes = (...vals: number[]) => new Uint8Array(vals);

// O id do vault é gerado pelo cliente (UUID v4, crypto.randomUUID()) — o AAD do envelope e
// do nome cifrado usa esse id (src/sync/pacote.ts), então ele tem que existir antes de
// chamar criarVault. Aqui, cada teste gera o seu.
const novoId = () => crypto.randomUUID();

describe("ServicoSyncFake", () => {
  describe("vaults", () => {
    it("listarVaults começa vazio", async () => {
      const s = new ServicoSyncFake();
      expect(await s.listarVaults()).toEqual([]);
    });

    it("criarVault com o id escolhido pelo cliente aparece em listarVaults", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      const nomeCifrado = bytes(1, 2, 3);
      const envelope = bytes(4, 5, 6);
      await s.criarVault(id, nomeCifrado, envelope);
      const vaults = await s.listarVaults();
      expect(vaults).toHaveLength(1);
      expect(vaults[0].id).toBe(id);
      expect(vaults[0].nomeCifrado).toEqual(nomeCifrado);
      expect(vaults[0].envelope).toEqual(envelope);
    });

    it("criarVault com id já existente falha com ja-existe e não sobrescreve", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1, 2, 3), bytes(9));
      await expect(s.criarVault(id, bytes(9, 9, 9), bytes(8))).rejects.toThrow(
        expect.objectContaining({ codigo: "ja-existe" }),
      );
      const vaults = await s.listarVaults();
      expect(vaults).toHaveLength(1);
      expect(vaults[0].nomeCifrado).toEqual(bytes(1, 2, 3));
    });

    it("apagarVault remove da listagem", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1), bytes(2));
      await s.apagarVault(id);
      expect(await s.listarVaults()).toEqual([]);
    });

    it("apagarVault de id desconhecido não explode", async () => {
      const s = new ServicoSyncFake();
      await expect(s.apagarVault("id-que-nao-existe")).resolves.toBeUndefined();
    });
  });

  describe("enviarLote e sequência", () => {
    it("primeiro envio com esperoUltima 0 dá sequência 1", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1), bytes(2));
      const seq = await s.enviarLote(id, 0, bytes(9, 9));
      expect(seq).toBe(1);
    });

    it("sequência cresce a cada envio correto", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1), bytes(2));
      const seq1 = await s.enviarLote(id, 0, bytes(1));
      const seq2 = await s.enviarLote(id, seq1, bytes(2));
      const seq3 = await s.enviarLote(id, seq2, bytes(3));
      expect([seq1, seq2, seq3]).toEqual([1, 2, 3]);
    });

    it("envio com esperoUltima velho é recusado com fora-de-ordem e não grava", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1), bytes(2));
      await s.enviarLote(id, 0, bytes(1)); // sequência 1
      await expect(s.enviarLote(id, 0, bytes(99))).rejects.toThrow(
        expect.objectContaining({ codigo: "fora-de-ordem" }),
      );
      // não gravou: baixar do início só devolve o primeiro lote
      const { lotes } = await s.baixar(id, 0);
      expect(lotes).toHaveLength(1);
      expect(lotes[0].bytes).toEqual(bytes(1));
    });

    it("envio com esperoUltima maior que a última sequência também é recusado", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1), bytes(2));
      await expect(s.enviarLote(id, 5, bytes(1))).rejects.toThrow(
        expect.objectContaining({ codigo: "fora-de-ordem" }),
      );
    });

    it("enviarLote em vault desconhecido falha com nao-encontrado", async () => {
      const s = new ServicoSyncFake();
      await expect(s.enviarLote("id-que-nao-existe", 0, bytes(1))).rejects.toThrow(
        expect.objectContaining({ codigo: "nao-encontrado" }),
      );
    });
  });

  describe("baixar", () => {
    it("baixar sem retrato devolve só os lotes depois de aposSequencia", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1), bytes(2));
      await s.enviarLote(id, 0, bytes(1)); // seq 1
      await s.enviarLote(id, 1, bytes(2)); // seq 2
      await s.enviarLote(id, 2, bytes(3)); // seq 3

      const { retrato, lotes } = await s.baixar(id, 1);
      expect(retrato).toBeUndefined();
      expect(lotes.map((l) => l.sequencia)).toEqual([2, 3]);
      expect(lotes.map((l) => l.bytes)).toEqual([bytes(2), bytes(3)]);
    });

    it("baixar do início (aposSequencia 0) devolve todos os lotes", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1), bytes(2));
      await s.enviarLote(id, 0, bytes(1));
      await s.enviarLote(id, 1, bytes(2));

      const { lotes } = await s.baixar(id, 0);
      expect(lotes.map((l) => l.sequencia)).toEqual([1, 2]);
    });

    it("baixar em vault desconhecido falha com nao-encontrado", async () => {
      const s = new ServicoSyncFake();
      await expect(s.baixar("id-que-nao-existe", 0)).rejects.toThrow(
        expect.objectContaining({ codigo: "nao-encontrado" }),
      );
    });

    it("baixar sempre devolve ultimoRetrato: 0 quando nunca houve retrato", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1), bytes(2));
      await s.enviarLote(id, 0, bytes(1));

      const { ultimoRetrato } = await s.baixar(id, 0);
      expect(ultimoRetrato).toBe(0);
    });
  });

  describe("retrato", () => {
    it("enviarRetrato descarta lotes com sequência <= ateSequencia", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1), bytes(2));
      await s.enviarLote(id, 0, bytes(1)); // seq 1
      await s.enviarLote(id, 1, bytes(2)); // seq 2
      await s.enviarLote(id, 2, bytes(3)); // seq 3

      await s.enviarRetrato(id, 2, [bytes(100, 101)]);

      // baixar do início: cliente está atrás do retrato → recebe retrato + lotes depois dele
      const { retrato, lotes } = await s.baixar(id, 0);
      expect(retrato).toEqual({ ateSequencia: 2, partes: [bytes(100, 101)] });
      expect(lotes.map((l) => l.sequencia)).toEqual([3]);
    });

    it("baixar com aposSequencia igual ou maior que o retrato não devolve o retrato", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1), bytes(2));
      await s.enviarLote(id, 0, bytes(1));
      await s.enviarLote(id, 1, bytes(2));
      await s.enviarLote(id, 2, bytes(3));
      await s.enviarRetrato(id, 2, [bytes(100)]);

      const { retrato, lotes } = await s.baixar(id, 2);
      expect(retrato).toBeUndefined();
      expect(lotes.map((l) => l.sequencia)).toEqual([3]);
    });

    it("enviarRetrato em vault desconhecido falha com nao-encontrado", async () => {
      const s = new ServicoSyncFake();
      await expect(s.enviarRetrato("id-que-nao-existe", 1, [bytes(1)])).rejects.toThrow(
        expect.objectContaining({ codigo: "nao-encontrado" }),
      );
    });

    it("enviarRetrato com ateSequencia igual ao retrato já guardado é recusado e não altera nada", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1), bytes(2));
      await s.enviarLote(id, 0, bytes(1)); // seq 1
      await s.enviarLote(id, 1, bytes(2)); // seq 2
      await s.enviarLote(id, 2, bytes(3)); // seq 3
      await s.enviarRetrato(id, 2, [bytes(100)]);

      await expect(s.enviarRetrato(id, 2, [bytes(200)])).rejects.toThrow(
        expect.objectContaining({ codigo: "fora-de-ordem" }),
      );

      // nada mudou: o retrato continua o antigo, e os lotes que ele não cobre continuam lá
      const { retrato, lotes } = await s.baixar(id, 0);
      expect(retrato).toEqual({ ateSequencia: 2, partes: [bytes(100)] });
      expect(lotes.map((l) => l.sequencia)).toEqual([3]);
    });

    it("enviarRetrato com ateSequencia menor que o retrato já guardado é recusado e não altera nada", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1), bytes(2));
      await s.enviarLote(id, 0, bytes(1)); // seq 1
      await s.enviarLote(id, 1, bytes(2)); // seq 2
      await s.enviarLote(id, 2, bytes(3)); // seq 3
      await s.enviarRetrato(id, 2, [bytes(100)]);

      await expect(s.enviarRetrato(id, 1, [bytes(200)])).rejects.toThrow(
        expect.objectContaining({ codigo: "fora-de-ordem" }),
      );

      const { retrato, lotes } = await s.baixar(id, 0);
      expect(retrato).toEqual({ ateSequencia: 2, partes: [bytes(100)] });
      expect(lotes.map((l) => l.sequencia)).toEqual([3]);
    });

    it("enviarRetrato com ateSequencia além da última sequência do vault é recusado", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1), bytes(2));
      await s.enviarLote(id, 0, bytes(1)); // seq 1
      await s.enviarLote(id, 1, bytes(2)); // seq 2

      await expect(s.enviarRetrato(id, 5, [bytes(200)])).rejects.toThrow(
        expect.objectContaining({ codigo: "fora-de-ordem" }),
      );

      const { retrato, lotes } = await s.baixar(id, 0);
      expect(retrato).toBeUndefined();
      expect(lotes.map((l) => l.sequencia)).toEqual([1, 2]);
    });

    it("enviarRetrato com ateSequencia maior que o anterior e dentro da sequência continua funcionando", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1), bytes(2));
      await s.enviarLote(id, 0, bytes(1)); // seq 1
      await s.enviarLote(id, 1, bytes(2)); // seq 2
      await s.enviarLote(id, 2, bytes(3)); // seq 3
      await s.enviarRetrato(id, 1, [bytes(50)]);

      await s.enviarRetrato(id, 3, [bytes(100)]);

      const { retrato, lotes } = await s.baixar(id, 0);
      expect(retrato).toEqual({ ateSequencia: 3, partes: [bytes(100)] });
      expect(lotes).toEqual([]);
    });

    it("ultimoRetrato vem preenchido mesmo quando o cliente já está na frente do retrato (retrato ausente na resposta)", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1), bytes(2));
      await s.enviarLote(id, 0, bytes(1)); // seq 1
      await s.enviarLote(id, 1, bytes(2)); // seq 2
      await s.enviarRetrato(id, 2, [bytes(100)]);
      await s.enviarLote(id, 2, bytes(3)); // seq 3, depois do retrato

      // Cliente já baixou até a sequência 3 (na frente do retrato em 2): não recebe `retrato`
      // de volta, mas `ultimoRetrato` continua informando onde ficou o retrato atual — sem
      // isso o cliente não saberia "quantos lotes desde o último retrato" (doc 17 §9).
      const { retrato, lotes, ultimoRetrato } = await s.baixar(id, 3);
      expect(retrato).toBeUndefined();
      expect(lotes).toEqual([]);
      expect(ultimoRetrato).toBe(2);
    });
  });

  describe("cópias defensivas", () => {
    it("mutar o Uint8Array depois de criarVault não afeta o que ficou guardado", async () => {
      const s = new ServicoSyncFake();
      const nomeCifrado = bytes(1, 2, 3);
      await s.criarVault(novoId(), nomeCifrado, bytes(9));
      nomeCifrado[0] = 255;
      const vaults = await s.listarVaults();
      expect(vaults[0].nomeCifrado).toEqual(bytes(1, 2, 3));
    });

    it("mutar o array devolvido por listarVaults não afeta o servidor", async () => {
      const s = new ServicoSyncFake();
      await s.criarVault(novoId(), bytes(1, 2, 3), bytes(9));
      const vaults = await s.listarVaults();
      vaults[0].nomeCifrado[0] = 255;
      const vaults2 = await s.listarVaults();
      expect(vaults2[0].nomeCifrado).toEqual(bytes(1, 2, 3));
    });

    it("mutar os bytes depois de enviarLote não afeta o lote guardado", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1), bytes(2));
      const dados = bytes(7, 7, 7);
      await s.enviarLote(id, 0, dados);
      dados[0] = 0;
      const { lotes } = await s.baixar(id, 0);
      expect(lotes[0].bytes).toEqual(bytes(7, 7, 7));
    });

    it("mutar os bytes devolvidos por baixar não afeta o que fica guardado", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1), bytes(2));
      await s.enviarLote(id, 0, bytes(7, 7, 7));
      const { lotes } = await s.baixar(id, 0);
      lotes[0].bytes[0] = 0;
      const { lotes: lotes2 } = await s.baixar(id, 0);
      expect(lotes2[0].bytes).toEqual(bytes(7, 7, 7));
    });

    it("mutar as partes depois de enviarRetrato não afeta o retrato guardado", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1), bytes(2));
      await s.enviarLote(id, 0, bytes(1));
      const partes = [bytes(5, 5)];
      await s.enviarRetrato(id, 1, partes);
      partes[0][0] = 0;
      const { retrato } = await s.baixar(id, 0);
      expect(retrato?.partes[0]).toEqual(bytes(5, 5));
    });
  });

  describe("opções de falha simulada", () => {
    it("rede: true faz todo método lançar FalhaSync('rede')", async () => {
      const s = new ServicoSyncFake({ falhar: "rede" });
      await expect(s.listarVaults()).rejects.toThrow(FalhaSync);
      await expect(s.listarVaults()).rejects.toThrow(
        expect.objectContaining({ codigo: "rede" }),
      );
    });

    it("plano: true faz criarVault e enviarLote lançarem FalhaSync('plano')", async () => {
      const s = new ServicoSyncFake({ falhar: "plano" });
      await expect(s.criarVault(novoId(), bytes(1), bytes(2))).rejects.toThrow(
        expect.objectContaining({ codigo: "plano" }),
      );
    });

    it("espaco: true faz enviarLote e enviarRetrato lançarem FalhaSync('espaco')", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1), bytes(2));
      const comFalha = new ServicoSyncFake({ falhar: "espaco" });
      // vault criado num servidor sem falha simulada; simulamos a falha num servidor à parte
      // para verificar que enviarLote nele lança sem exigir estado prévio.
      await expect(comFalha.enviarLote(id, 0, bytes(1))).rejects.toThrow(
        expect.objectContaining({ codigo: "espaco" }),
      );
    });

    it("espaco: true faz enviarRetrato lançar FalhaSync('espaco')", async () => {
      const s = new ServicoSyncFake();
      const id = novoId();
      await s.criarVault(id, bytes(1), bytes(2));
      await s.enviarLote(id, 0, bytes(1));
      const comFalha = new ServicoSyncFake({ falhar: "espaco" });
      await expect(comFalha.enviarRetrato(id, 1, [bytes(1)])).rejects.toThrow(
        expect.objectContaining({ codigo: "espaco" }),
      );
    });

    it("simularFalha liga a falha em tempo de execução", async () => {
      const s = new ServicoSyncFake();
      await expect(s.listarVaults()).resolves.toEqual([]);
      s.simularFalha("rede");
      await expect(s.listarVaults()).rejects.toThrow(
        expect.objectContaining({ codigo: "rede" }),
      );
    });

    it("simularFalha(undefined) desliga a falha e o servidor volta a funcionar", async () => {
      const s = new ServicoSyncFake({ falhar: "rede" });
      await expect(s.listarVaults()).rejects.toThrow(
        expect.objectContaining({ codigo: "rede" }),
      );
      s.simularFalha(undefined);
      await expect(s.listarVaults()).resolves.toEqual([]);
    });
  });
});
