// Servidor de sincronização em memória: o que os testes usam e o que roda enquanto o
// servidor HTTP (plano 10) não existe. Guarda só pacotes opacos — nunca decifra nada, não
// tem chave, igual o servidor real (doc 17 §9). Sem rede, sem disco.

import type { ServicoSync } from "./ServicoSync";
import { FalhaSync, type ResultadoBaixar, type VaultSincronizado } from "./tiposServidor";

/** Qual chamada simular como falha, para os testes do motor (plano 09). */
export type FalhaSimulada = "rede" | "plano" | "espaco";

export interface OpcoesServicoSyncFake {
  /**
   * Faz o servidor falho recusar chamadas com o código dado, para os testes do motor
   * (plano 09) exercitarem os caminhos de erro sem precisar de um servidor de verdade:
   * - "rede": todo método lança `FalhaSync("rede")` — simula a conexão fora do ar.
   * - "plano": `criarVault` e `enviarLote` lançam `FalhaSync("plano")` — simula conta sem
   *   (ou que perdeu) o plano que a sincronização exige.
   * - "espaco": `enviarLote` e `enviarRetrato` lançam `FalhaSync("espaco")` — simula a conta
   *   sem espaço de armazenamento.
   */
  falhar?: FalhaSimulada;
}

interface LoteGuardado {
  sequencia: number;
  bytes: Uint8Array;
}

interface RetratoGuardado {
  ateSequencia: number;
  partes: Uint8Array[];
}

interface VaultGuardado {
  id: string;
  nomeCifrado: Uint8Array;
  envelope: Uint8Array;
  lotes: LoteGuardado[];
  retrato?: RetratoGuardado;
}

const copiar = (bytes: Uint8Array): Uint8Array => new Uint8Array(bytes);
const copiarPartes = (partes: Uint8Array[]): Uint8Array[] => partes.map(copiar);

export class ServicoSyncFake implements ServicoSync {
  private vaults = new Map<string, VaultGuardado>();
  private readonly falhar?: FalhaSimulada;

  constructor(opcoes: OpcoesServicoSyncFake = {}) {
    this.falhar = opcoes.falhar;
  }

  private garantirSemFalhaGeral(): void {
    if (this.falhar === "rede") throw new FalhaSync("rede");
  }

  private buscar(id: string): VaultGuardado {
    const vault = this.vaults.get(id);
    if (!vault) throw new FalhaSync("nao-encontrado");
    return vault;
  }

  private ultimaSequencia(vault: VaultGuardado): number {
    const ultimoLote = vault.lotes[vault.lotes.length - 1];
    if (ultimoLote) return ultimoLote.sequencia;
    return vault.retrato?.ateSequencia ?? 0;
  }

  async listarVaults(): Promise<VaultSincronizado[]> {
    this.garantirSemFalhaGeral();
    return [...this.vaults.values()].map((v) => ({
      id: v.id,
      nomeCifrado: copiar(v.nomeCifrado),
      envelope: copiar(v.envelope),
    }));
  }

  async criarVault(id: string, nomeCifrado: Uint8Array, envelope: Uint8Array): Promise<void> {
    this.garantirSemFalhaGeral();
    if (this.falhar === "plano") throw new FalhaSync("plano");
    if (this.vaults.has(id)) throw new FalhaSync("ja-existe");
    this.vaults.set(id, {
      id,
      nomeCifrado: copiar(nomeCifrado),
      envelope: copiar(envelope),
      lotes: [],
    });
  }

  async baixar(id: string, aposSequencia: number): Promise<ResultadoBaixar> {
    this.garantirSemFalhaGeral();
    const vault = this.buscar(id);
    const { retrato } = vault;
    // O cliente está atrás do que o retrato cobre: devolve o retrato e só os lotes depois
    // dele. Senão, o cliente já tem tudo até o retrato (ou não existe retrato) — só lotes
    // depois de aposSequencia.
    if (retrato && aposSequencia < retrato.ateSequencia) {
      return {
        retrato: { ateSequencia: retrato.ateSequencia, partes: copiarPartes(retrato.partes) },
        lotes: vault.lotes
          .filter((l) => l.sequencia > retrato.ateSequencia)
          .map((l) => ({ sequencia: l.sequencia, bytes: copiar(l.bytes) })),
      };
    }
    return {
      lotes: vault.lotes
        .filter((l) => l.sequencia > aposSequencia)
        .map((l) => ({ sequencia: l.sequencia, bytes: copiar(l.bytes) })),
    };
  }

  async enviarLote(id: string, esperoUltima: number, bytes: Uint8Array): Promise<number> {
    this.garantirSemFalhaGeral();
    if (this.falhar === "plano") throw new FalhaSync("plano");
    if (this.falhar === "espaco") throw new FalhaSync("espaco");
    const vault = this.buscar(id);
    if (esperoUltima !== this.ultimaSequencia(vault)) throw new FalhaSync("fora-de-ordem");
    const sequencia = esperoUltima + 1;
    vault.lotes.push({ sequencia, bytes: copiar(bytes) });
    return sequencia;
  }

  async enviarRetrato(id: string, ateSequencia: number, partes: Uint8Array[]): Promise<void> {
    this.garantirSemFalhaGeral();
    if (this.falhar === "espaco") throw new FalhaSync("espaco");
    const vault = this.buscar(id);
    vault.retrato = { ateSequencia, partes: copiarPartes(partes) };
    vault.lotes = vault.lotes.filter((l) => l.sequencia > ateSequencia);
  }

  async apagarVault(id: string): Promise<void> {
    this.garantirSemFalhaGeral();
    this.vaults.delete(id);
  }
}
