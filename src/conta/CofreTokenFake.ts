// Cofre em memória: o que os testes usam. A flag `falhar` simula o cofre indisponível (loja
// do sistema ausente, permissão negada, token maior que o limite do Windows) — os três
// métodos rejeitam enquanto ela estiver ligada.

import type { CofreToken } from "./cofreToken";

export class CofreTokenFake implements CofreToken {
  /** Token atual, inspecionável diretamente pelos testes. */
  token: string | null = null;

  /** Liga para simular cofre indisponível: os três métodos passam a rejeitar. */
  falhar = false;

  async ler(): Promise<string | null> {
    if (this.falhar) throw new Error("cofre indisponível");
    return this.token;
  }

  async gravar(token: string): Promise<void> {
    if (this.falhar) throw new Error("cofre indisponível");
    this.token = token;
  }

  async apagar(): Promise<void> {
    if (this.falhar) throw new Error("cofre indisponível");
    this.token = null;
  }
}
