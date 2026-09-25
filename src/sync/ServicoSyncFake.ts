// Servidor de sincronização em memória: o que os testes usam e o que roda enquanto o
// servidor HTTP (plano 10) não existe. Guarda só pacotes opacos — nunca decifra nada, não
// tem chave, igual o servidor real (doc 17 §9). Sem rede, sem disco.
//
// A lógica de vaults/sequência/retrato mora em NucleoServidorSync (task-6, plano 10), para
// ServicoSyncLocal.ts (armazenamento em arquivo, só DEV) reaproveitar sem duplicar. Este
// arquivo só acrescenta o armazenamento em memória e a falha simulada (plano 09).

import type { ServicoSync } from "./ServicoSync";
import { FalhaSync, type ResultadoBaixar, type VaultSincronizado } from "./tiposServidor";
import {
  NucleoServidorSync,
  type ArmazenamentoServidorSync,
  type VaultGuardado,
} from "./nucleoServidorSync";

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

/** Armazenamento do núcleo num `Map` em memória — vive só enquanto a instância existir. */
class ArmazenamentoEmMemoria implements ArmazenamentoServidorSync {
  private vaults = new Map<string, VaultGuardado>();

  async buscar(id: string): Promise<VaultGuardado | null> {
    return this.vaults.get(id) ?? null;
  }

  async listar(): Promise<VaultGuardado[]> {
    return [...this.vaults.values()];
  }

  async gravar(vault: VaultGuardado): Promise<void> {
    this.vaults.set(vault.id, vault);
  }

  async apagar(id: string): Promise<void> {
    this.vaults.delete(id);
  }
}

export class ServicoSyncFake implements ServicoSync {
  private readonly nucleo = new NucleoServidorSync(new ArmazenamentoEmMemoria());
  private falhar?: FalhaSimulada;

  constructor(opcoes: OpcoesServicoSyncFake = {}) {
    this.falhar = opcoes.falhar;
  }

  /** Só para teste: troca a falha simulada em tempo de execução, para os testes do motor
   * (plano 09) exercitarem "caiu a rede" e depois "voltou" sem criar um servidor novo (o que
   * perderia o estado em memória). `undefined` desliga a falha. Não faz parte de
   * `ServicoSync`. */
  simularFalha(falha: FalhaSimulada | undefined): void {
    this.falhar = falha;
  }

  private garantirSemFalhaGeral(): void {
    if (this.falhar === "rede") throw new FalhaSync("rede");
  }

  async listarVaults(): Promise<VaultSincronizado[]> {
    this.garantirSemFalhaGeral();
    return this.nucleo.listarVaults();
  }

  async criarVault(id: string, nomeCifrado: Uint8Array, envelope: Uint8Array): Promise<void> {
    this.garantirSemFalhaGeral();
    if (this.falhar === "plano") throw new FalhaSync("plano");
    return this.nucleo.criarVault(id, nomeCifrado, envelope);
  }

  async baixar(id: string, aposSequencia: number): Promise<ResultadoBaixar> {
    this.garantirSemFalhaGeral();
    return this.nucleo.baixar(id, aposSequencia);
  }

  async enviarLote(id: string, esperoUltima: number, bytes: Uint8Array): Promise<number> {
    this.garantirSemFalhaGeral();
    if (this.falhar === "plano") throw new FalhaSync("plano");
    if (this.falhar === "espaco") throw new FalhaSync("espaco");
    return this.nucleo.enviarLote(id, esperoUltima, bytes);
  }

  async enviarRetrato(id: string, ateSequencia: number, partes: Uint8Array[]): Promise<void> {
    this.garantirSemFalhaGeral();
    if (this.falhar === "espaco") throw new FalhaSync("espaco");
    return this.nucleo.enviarRetrato(id, ateSequencia, partes);
  }

  async apagarVault(id: string): Promise<void> {
    this.garantirSemFalhaGeral();
    return this.nucleo.apagarVault(id);
  }
}
