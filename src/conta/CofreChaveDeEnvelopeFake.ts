// Cofre da chave de envelope em memória: o que os testes usam. Mesmo molde de
// `CofreTokenFake.ts` — a flag `falhar` simula o cofre indisponível.
//
// Plano 12 Task 2: mesma regra de posse por e-mail do `CofreChaveDeEnvelopeSistema`, sem
// reproduzir o formato exato de bytes em disco. `bruto` é o estado interno, inspecionável e
// ajustável diretamente pelos testes: `null` (vazio), `{ email, chave }` (entrada válida) ou
// uma `string` qualquer (simula o formato antigo — base64 puro, sem e-mail).

import type { CofreChaveDeEnvelope } from "./cofreChaveDeEnvelope";
import { normalizarEmail } from "./derivacaoSenha";

export class CofreChaveDeEnvelopeFake implements CofreChaveDeEnvelope {
  bruto: { email: string; chave: Uint8Array } | string | null = null;

  /** Liga para simular cofre indisponível: os três métodos passam a rejeitar. */
  falhar = false;

  async ler(emailDaSessao: string): Promise<Uint8Array | null> {
    if (this.falhar) throw new Error("cofre indisponível");
    const entrada = this.bruto;
    if (entrada === null) return null;
    if (typeof entrada === "string" || normalizarEmail(entrada.email) !== normalizarEmail(emailDaSessao)) {
      // Formato antigo (string sem e-mail) ou e-mail diferente: descarta, nunca devolve.
      this.bruto = null;
      return null;
    }
    return entrada.chave;
  }

  async gravar(email: string, chave: Uint8Array): Promise<void> {
    if (this.falhar) throw new Error("cofre indisponível");
    this.bruto = { email: normalizarEmail(email), chave };
  }

  async apagar(): Promise<void> {
    if (this.falhar) throw new Error("cofre indisponível");
    this.bruto = null;
  }
}
