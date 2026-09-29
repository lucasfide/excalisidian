// src/sync/nucleoServidorSync.ts
// Núcleo do servidor de sincronização (doc 17 §9): vaults, sequência dos lotes,
// "fora-de-ordem", a regra do retrato, `ultimoRetrato`, "ja-existe" e cópias defensivas.
// Extraído de ServicoSyncFake.ts (task-6, plano 10) para ser reaproveitado por
// ServicoSyncLocal.ts sem duplicar a lógica — a única coisa que muda entre as duas
// implementações é ONDE o vault mora (`ArmazenamentoServidorSync`): em memória
// (ServicoSyncFake) ou em arquivo (ServicoSyncLocal). Sem rede, sem chave, sem decifrar nada
// — igual ao servidor real: só pacotes opacos.
//
// Falha simulada ("rede"/"plano"/"espaco", plano 09) NÃO mora aqui: é um comportamento de
// teste do motor específico de ServicoSyncFake, não parte do contrato do servidor.

import { FalhaSync, type ResultadoBaixar, type VaultSincronizado } from "./tiposServidor";

export interface LoteGuardado {
  sequencia: number;
  bytes: Uint8Array;
}

export interface RetratoGuardado {
  ateSequencia: number;
  partes: Uint8Array[];
}

export interface VaultGuardado {
  id: string;
  nomeCifrado: Uint8Array;
  envelope: Uint8Array;
  lotes: LoteGuardado[];
  retrato?: RetratoGuardado;
}

/** Onde o núcleo guarda os vaults. Cada implementação decide o meio (memória, arquivo…); o
 * núcleo nunca mantém estado próprio além do que pede daqui — releitura a cada chamada é
 * responsabilidade de quem implementa (ver ServicoSyncLocal.ts: duas janelas precisam ver o
 * mesmo "servidor"). */
export interface ArmazenamentoServidorSync {
  buscar(id: string): Promise<VaultGuardado | null>;
  listar(): Promise<VaultSincronizado[]>;
  /** Operações otimizadas para o armazenamento persistente: evitam ler todo o diário. */
  existe?(id: string): Promise<boolean>;
  baixarPacotes?(id: string, aposSequencia: number): Promise<ResultadoBaixar | null>;
  anexarLote?(id: string, esperoUltima: number, bytes: Uint8Array): Promise<number>;
  substituirRetrato?(id: string, ateSequencia: number, partes: Uint8Array[]): Promise<void>;
  /** Grava (cria ou substitui) o vault inteiro. */
  gravar(vault: VaultGuardado): Promise<void>;
  apagar(id: string): Promise<void>;
}

export const copiarBytes = (bytes: Uint8Array): Uint8Array => new Uint8Array(bytes);
export const copiarPartes = (partes: Uint8Array[]): Uint8Array[] => partes.map(copiarBytes);

export class NucleoServidorSync {
  constructor(private readonly armazenamento: ArmazenamentoServidorSync) {}

  private async buscarOuFalhar(id: string): Promise<VaultGuardado> {
    const vault = await this.armazenamento.buscar(id);
    if (!vault) throw new FalhaSync("nao-encontrado");
    return vault;
  }

  private ultimaSequencia(vault: VaultGuardado): number {
    const ultimoLote = vault.lotes[vault.lotes.length - 1];
    if (ultimoLote) return ultimoLote.sequencia;
    return vault.retrato?.ateSequencia ?? 0;
  }

  async listarVaults(): Promise<VaultSincronizado[]> {
    const vaults = await this.armazenamento.listar();
    return vaults.map((v) => ({
      id: v.id,
      nomeCifrado: copiarBytes(v.nomeCifrado),
      envelope: copiarBytes(v.envelope),
    }));
  }

  async criarVault(id: string, nomeCifrado: Uint8Array, envelope: Uint8Array): Promise<void> {
    if (this.armazenamento.existe ? await this.armazenamento.existe(id) : await this.armazenamento.buscar(id)) {
      throw new FalhaSync("ja-existe");
    }
    await this.armazenamento.gravar({
      id,
      nomeCifrado: copiarBytes(nomeCifrado),
      envelope: copiarBytes(envelope),
      lotes: [],
    });
  }

  async baixar(id: string, aposSequencia: number): Promise<ResultadoBaixar> {
    if (this.armazenamento.baixarPacotes) {
      const resultado = await this.armazenamento.baixarPacotes(id, aposSequencia);
      if (!resultado) throw new FalhaSync("nao-encontrado");
      return resultado;
    }
    const vault = await this.buscarOuFalhar(id);
    const { retrato } = vault;
    // `ultimoRetrato` vem sempre preenchido (doc 17 §9) — 0 se nunca houve retrato — mesmo
    // quando a resposta não traz `retrato` porque o cliente já está na frente dele.
    const ultimoRetrato = retrato?.ateSequencia ?? 0;
    if (retrato && aposSequencia < retrato.ateSequencia) {
      return {
        retrato: { ateSequencia: retrato.ateSequencia, partes: copiarPartes(retrato.partes) },
        lotes: vault.lotes
          .filter((l) => l.sequencia > retrato.ateSequencia)
          .map((l) => ({ sequencia: l.sequencia, bytes: copiarBytes(l.bytes) })),
        ultimoRetrato,
      };
    }
    return {
      lotes: vault.lotes
        .filter((l) => l.sequencia > aposSequencia)
        .map((l) => ({ sequencia: l.sequencia, bytes: copiarBytes(l.bytes) })),
      ultimoRetrato,
    };
  }

  async enviarLote(id: string, esperoUltima: number, bytes: Uint8Array): Promise<number> {
    if (this.armazenamento.anexarLote) return this.armazenamento.anexarLote(id, esperoUltima, bytes);
    const vault = await this.buscarOuFalhar(id);
    if (esperoUltima !== this.ultimaSequencia(vault)) throw new FalhaSync("fora-de-ordem");
    const sequencia = esperoUltima + 1;
    vault.lotes.push({ sequencia, bytes: copiarBytes(bytes) });
    await this.armazenamento.gravar(vault);
    return sequencia;
  }

  async enviarRetrato(id: string, ateSequencia: number, partes: Uint8Array[]): Promise<void> {
    if (this.armazenamento.substituirRetrato) {
      await this.armazenamento.substituirRetrato(id, ateSequencia, partes);
      return;
    }
    const vault = await this.buscarOuFalhar(id);
    // Um retrato mais velho (ou igual) que o já guardado não pode substituí-lo: os lotes
    // entre os dois já foram descartados pelo retrato mais novo, e um computador novo nunca
    // mais receberia essas mudanças. Também recusa um retrato além do que o vault tem — não
    // há como cobrir sequências que não existem.
    if (ateSequencia <= (vault.retrato?.ateSequencia ?? 0)) throw new FalhaSync("fora-de-ordem");
    if (ateSequencia > this.ultimaSequencia(vault)) throw new FalhaSync("fora-de-ordem");
    vault.retrato = { ateSequencia, partes: copiarPartes(partes) };
    vault.lotes = vault.lotes.filter((l) => l.sequencia > ateSequencia);
    await this.armazenamento.gravar(vault);
  }

  async apagarVault(id: string): Promise<void> {
    await this.armazenamento.apagar(id);
  }
}
