// Cofre da chave de envelope em memória: o que os testes usam. Mesmo molde de
// `CofreTokenFake.ts` — a flag `falhar` simula o cofre indisponível.

import type { CofreChaveDeEnvelope } from "./cofreChaveDeEnvelope";

export class CofreChaveDeEnvelopeFake implements CofreChaveDeEnvelope {
  /** Chave atual, inspecionável diretamente pelos testes. */
  chave: Uint8Array | null = null;

  /** Liga para simular cofre indisponível: os três métodos passam a rejeitar. */
  falhar = false;

  async ler(): Promise<Uint8Array | null> {
    if (this.falhar) throw new Error("cofre indisponível");
    return this.chave;
  }

  async gravar(chave: Uint8Array): Promise<void> {
    if (this.falhar) throw new Error("cofre indisponível");
    this.chave = chave;
  }

  async apagar(): Promise<void> {
    if (this.falhar) throw new Error("cofre indisponível");
    this.chave = null;
  }
}
