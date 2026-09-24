// A fronteira com o servidor de sincronização (doc 17 §9). Uma implementação falsa em
// memória (esta pasta, para os testes e o desenvolvimento) e uma HTTP (plano 10) — o mesmo
// padrão de src/conta/ServicoConta.ts. O servidor nunca vê chave nem conteúdo decifrado:
// tudo aqui é pacote opaco (Uint8Array).

import type { ResultadoBaixar, VaultSincronizado } from "./tiposServidor";

export interface ServicoSync {
  listarVaults(): Promise<VaultSincronizado[]>;
  /** O cliente escolhe o `id` (UUID v4, `crypto.randomUUID()`): o AAD do envelope e do nome
   * cifrado usa o `idDoVault` (`src/sync/pacote.ts`), então ele tem que existir antes de
   * chamar `criarVault`. Lança `FalhaSync("ja-existe")` se o id já existir na conta. */
  criarVault(id: string, nomeCifrado: Uint8Array, envelope: Uint8Array): Promise<void>;
  /** Pacotes depois de `aposSequencia`: o retrato (se o cliente estiver atrás do que foi
   * descartado) e os lotes seguintes, em ordem. `ResultadoBaixar.ultimoRetrato` vem sempre
   * preenchido, mesmo sem `retrato` na resposta (doc 17 §9). */
  baixar(id: string, aposSequencia: number): Promise<ResultadoBaixar>;
  /** Devolve a nova sequência. Lança `FalhaSync("fora-de-ordem")` — sem gravar nada — se
   * `esperoUltima` não for a última sequência atual do vault. */
  enviarLote(id: string, esperoUltima: number, bytes: Uint8Array): Promise<number>;
  /** O servidor pode descartar lotes com sequência ≤ `ateSequencia` depois disso. Lança
   * `FalhaSync("fora-de-ordem")` — sem gravar nada — se `ateSequencia` for menor ou igual ao
   * retrato já guardado (retrato mais velho não pode substituir o mais novo: perderia os
   * lotes entre os dois, já descartados) ou maior que a última sequência do vault. */
  enviarRetrato(id: string, ateSequencia: number, partes: Uint8Array[]): Promise<void>;
  apagarVault(id: string): Promise<void>;
}
