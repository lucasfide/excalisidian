// src/sync/ServicoSyncLocal.test.ts
import { describe, it, expect } from "vitest";

import { ServicoSyncLocal, TRAVA_VELHA_MS, type AdaptadorFsSync } from "./ServicoSyncLocal";
import { FalhaSync } from "./tiposServidor";

const bytes = (...vals: number[]) => new Uint8Array(vals);
const novoId = () => crypto.randomUUID();

/** Disco falso em memória: simula o filesystem real o bastante para provar o armazenamento
 * (pastas, tmp + rename, releitura, trava por `mkdir` exclusivo) sem depender do runtime
 * Tauri. Compartilhado entre duas instâncias de ServicoSyncLocal simula duas janelas do app
 * vendo o mesmo "servidor" — inclusive a mesma trava. */
function discoFalso(): AdaptadorFsSync & {
  arquivos: Map<string, string>;
  diretorios: Set<string>;
  chamadas: string[];
} {
  const arquivos = new Map<string, string>();
  const diretorios = new Set<string>();
  const chamadas: string[] = [];
  return {
    arquivos,
    diretorios,
    chamadas,
    async existeDiretorio(caminho) {
      chamadas.push(`existeDiretorio:${caminho}`);
      return diretorios.has(caminho);
    },
    async criarDiretorio(caminho) {
      chamadas.push(`criarDiretorio:${caminho}`);
      diretorios.add(caminho);
    },
    async criarDiretorioExclusivo(caminho) {
      chamadas.push(`criarDiretorioExclusivo:${caminho}`);
      // Mesmo comportamento do `mkdir` sem `recursive` do lado Rust (DirBuilder::create):
      // falha se a pasta já existir — é a exclusão mútua da trava.
      if (diretorios.has(caminho)) throw new Error(`diretório já existe: ${caminho}`);
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
    async apagarDiretorio(caminho) {
      chamadas.push(`apagarDiretorio:${caminho}`);
      if (!diretorios.has(caminho)) throw new Error(`diretório não existe: ${caminho}`);
      diretorios.delete(caminho);
      const prefixo = `${caminho}/`;
      for (const chave of [...arquivos.keys()]) {
        if (chave.startsWith(prefixo)) arquivos.delete(chave);
      }
    },
  };
}

/** Espera até `condicao()` ficar verdadeira (ou desiste depois de `tentativas` voltas) — usado
 * para sincronizar o teste de corrida com o laço real de `adquirirTrava` sem apostar em
 * temporizadores artificiais. */
async function esperarAte(condicao: () => boolean, tentativas = 400): Promise<void> {
  for (let i = 0; i < tentativas; i++) {
    if (condicao()) return;
    await new Promise((r) => setTimeout(r, 2));
  }
  throw new Error("condição nunca ficou verdadeira a tempo");
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

    // Só a escrita do próprio vault — a escrita do timestamp da trava (`.trava/desde.txt`)
    // não conta aqui, é testada à parte.
    const escritas = fs.chamadas.filter((c) => c.startsWith("escreverTexto:") && c.includes(".tmp-"));
    expect(escritas).toHaveLength(1);
    expect(escritas[0]).toMatch(/\.tmp-/);
    const renomeios = fs.chamadas.filter((c) => c.startsWith("renomear:"));
    expect(renomeios).toHaveLength(1);
    expect(renomeios[0]).toMatch(/\.tmp-.*->.*\.json$/);
  });

  it("cada operação adquire e libera a trava (a pasta .trava não fica presa depois)", async () => {
    const fs = discoFalso();
    const s = new ServicoSyncLocal(fs, PASTA);
    await s.criarVault(novoId(), bytes(1), bytes(2));
    expect(fs.diretorios.has(`${PASTA}/.trava`)).toBe(false);
  });

  it("a trava é liberada mesmo quando a operação lança (fora-de-ordem)", async () => {
    const fs = discoFalso();
    const s = new ServicoSyncLocal(fs, PASTA);
    const id = novoId();
    await s.criarVault(id, bytes(1), bytes(2));
    await expect(s.enviarLote(id, 5, bytes(1))).rejects.toThrow(FalhaSync);
    expect(fs.diretorios.has(`${PASTA}/.trava`)).toBe(false);
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

  describe("trava entre processos (revisão da task-6)", () => {
    it("duas instâncias enviando ao mesmo tempo: só uma pega a sequência nova, a outra vê fora-de-ordem, e nenhum lote some", async () => {
      const disco = discoFalso();
      const caminhoTrava = `${PASTA}/.trava`;

      // Cria o vault ANTES de ligar a pausa — a pausa é só para prender a janela A no meio
      // da escrita do LOTE (enviarLote), não na criação do vault (que também escreve um
      // ".tmp-").
      const preparo = new ServicoSyncLocal(disco, PASTA);
      const id = novoId();
      await preparo.criarVault(id, bytes(1), bytes(2));

      // Segura a janela A no meio da escrita do lote (depois de já ter a trava e já ter lido
      // o estado — exatamente o ponto onde, sem trava nenhuma, a janela B poderia ler o mesmo
      // estado velho e sobrescrever o que A está gravando).
      let liberarEscritaDeA!: () => void;
      const pausaEscritaDeA = new Promise<void>((r) => {
        liberarEscritaDeA = r;
      });
      const fs: AdaptadorFsSync = {
        ...disco,
        async escreverTexto(caminho, conteudo) {
          if (caminho.includes(".tmp-")) await pausaEscritaDeA;
          return disco.escreverTexto(caminho, conteudo);
        },
      };

      const janelaA = new ServicoSyncLocal(fs, PASTA);
      const janelaB = new ServicoSyncLocal(fs, PASTA);

      const promA = janelaA.enviarLote(id, 0, bytes(10));
      // Espera A realmente segurar a trava (a pasta existe) antes de soltar B — sem isso não
      // dá para garantir que B vai encontrar a trava ocupada.
      await esperarAte(() => disco.diretorios.has(caminhoTrava));

      const promB = janelaB.enviarLote(id, 0, bytes(20));
      // Dá tempo do laço de espera de B rodar pelo menos algumas voltas de verdade contra a
      // trava ocupada — prova que B está mesmo esperando, não passando direto.
      await new Promise((r) => setTimeout(r, 80));
      const tentativasDeBAntes = disco.chamadas.filter(
        (c) => c.startsWith("criarDiretorioExclusivo:") && c.includes(".trava"),
      ).length;
      expect(tentativasDeBAntes).toBeGreaterThan(1);

      liberarEscritaDeA();

      const seqA = await promA;
      expect(seqA).toBe(1);
      await expect(promB).rejects.toThrow(expect.objectContaining({ codigo: "fora-de-ordem" }));

      // O lote de A não sumiu, e o de B não foi gravado por cima dele (ele nunca chegou a
      // escrever: falhou antes, no núcleo, por causa do esperoUltima desatualizado).
      const { lotes } = await janelaA.baixar(id, 0);
      expect(lotes).toHaveLength(1);
      expect(lotes[0]).toEqual({ sequencia: 1, bytes: bytes(10) });
      expect(disco.diretorios.has(caminhoTrava)).toBe(false);
    });

    it("trava mais velha que TRAVA_VELHA_MS é considerada de um processo morto e é removida", async () => {
      const fs = discoFalso();
      const caminhoTrava = `${PASTA}/.trava`;
      // Simula uma trava deixada para trás por uma janela que fechou no meio de uma operação:
      // a pasta existe, com um timestamp já expirado.
      await fs.criarDiretorio(PASTA);
      await fs.criarDiretorioExclusivo(caminhoTrava);
      await fs.escreverTexto(`${caminhoTrava}/desde.txt`, String(Date.now() - TRAVA_VELHA_MS - 1_000));

      const s = new ServicoSyncLocal(fs, PASTA);
      const id = novoId();

      // Não trava para sempre: a operação segue depois de limpar a trava velha.
      await s.criarVault(id, bytes(1), bytes(2));

      expect(await s.listarVaults()).toHaveLength(1);
      expect(fs.diretorios.has(caminhoTrava)).toBe(false);
    });

    it("trava recente (não velha) faz a chamada esperar, não invadir", async () => {
      const fs = discoFalso();
      const caminhoTrava = `${PASTA}/.trava`;
      await fs.criarDiretorio(PASTA);
      await fs.criarDiretorioExclusivo(caminhoTrava);
      await fs.escreverTexto(`${caminhoTrava}/desde.txt`, String(Date.now()));

      const s = new ServicoSyncLocal(fs, PASTA);
      const id = novoId();
      const criando = s.criarVault(id, bytes(1), bytes(2));
      let terminou = false;
      void criando.then(() => {
        terminou = true;
      });

      // Ainda travado (e a chamada ainda pendente) um pouco depois — não invadiu uma trava
      // recente.
      await new Promise((r) => setTimeout(r, 40));
      expect(terminou).toBe(false);
      expect(fs.diretorios.has(caminhoTrava)).toBe(true);

      // Libera a trava "de fora" (como se a outra janela tivesse terminado) — a chamada
      // pendente segue e conclui.
      await fs.apagarDiretorio(caminhoTrava);
      await criando;
      expect(terminou).toBe(true);
      expect(await s.listarVaults()).toHaveLength(1);
    });
  });
});
