// src/conta/ServicoContaFakeDev.ts
// Conta de teste em DEV (doc 17 §10, plano 10 task-6): dá para entrar sem servidor de conta,
// com uma conta premium fixa — e-mail e senha também escritos em docs/17-sincronizacao.md §10.
// Só é usada atrás de `import.meta.env.DEV` (contaStore.ts) — eliminada do build de produção
// pelo mesmo mecanismo de simularConflito.ts/PaletaComandos.tsx (confira com grep em dist/
// depois de `npm run build`).
//
// Cuidado com duas janelas (achado do plano): cada janela deste app em DEV roda o próprio
// processo JS, com a própria instância deste fake em memória — mas o token da sessão fica no
// cofre do Windows, COMPARTILHADO entre as janelas. Se o token gravado por uma janela (emitido
// pela instância dela) fosse apresentado a `renovar` de OUTRA instância (outra janela), o
// `ServicoContaFake` comum recusaria como "expirada" (token que ela nunca emitiu) — e
// `contaStore.carregar()`, ao ver "expirada", apaga o token do cofre, deslogando a outra
// janela (ver o comentário sobre isso em contaStore.ts).
//
// Por isso a conta de teste emite um token DETERMINÍSTICO, derivado só do e-mail (não de quem
// emitiu nem de quando): qualquer instância deste fake, em qualquer janela, reconhece o token
// de qualquer outra instância para a mesma conta. `renovar` primeiro tenta o `ServicoContaFake`
// comum (cobre o caso de outra conta cadastrada nesta mesma instância) e, se ele recusar,
// confere se o token bate com o determinístico de alguma conta conhecida.

import type { ServicoConta } from "./ServicoConta";
import { ServicoContaFake } from "./ServicoContaFake";
import type { PlanoAssinatura, ResultadoLogin, Sessao } from "./tipos";

/** E-mail e senha da conta de teste em DEV — únicos, fixos, documentados em
 * docs/17-sincronizacao.md §10. Nunca usados fora de `import.meta.env.DEV`. */
export const EMAIL_CONTA_TESTE_DEV = "teste@excalisidian.local";
export const SENHA_CONTA_TESTE_DEV = "senha-de-teste-123";

const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias, igual ServicoContaFake

const normalizar = (email: string) => email.trim().toLowerCase();

/** Token determinístico: só função do e-mail normalizado. Qualquer instância deste fake, em
 * qualquer janela, chega ao mesmo token para a mesma conta — é isso que permite a janela B
 * reconhecer o token que a janela A gravou no cofre compartilhado. */
async function tokenDeterministico(emailNormalizado: string): Promise<string> {
  const bytes = new TextEncoder().encode(`excalisidian-dev-token:${emailNormalizado}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `tok-dev-${hex}`;
}

export class ServicoContaFakeDev implements ServicoConta {
  private readonly fake: ServicoContaFake;
  private readonly contas: Record<string, { senha: string; plano: PlanoAssinatura }>;

  constructor(contas: Record<string, { senha: string; plano: PlanoAssinatura }>) {
    this.contas = Object.fromEntries(
      Object.entries(contas).map(([email, dados]) => [normalizar(email), dados]),
    );
    this.fake = new ServicoContaFake(contas);
  }

  private async sessaoDeterministica(emailNormalizado: string): Promise<Sessao> {
    const conta = this.contas[emailNormalizado];
    const token = await tokenDeterministico(emailNormalizado);
    return { token, email: emailNormalizado, plano: conta.plano, expiraEm: Date.now() + DURACAO_SESSAO_MS };
  }

  async entrar(email: string, senha: string): Promise<ResultadoLogin> {
    // Valida a senha com a lógica comum (mesmo código de erro "credenciais"); descarta o
    // token sequencial que ela gera (`tok-fake-N`, só existe na memória desta instância) e
    // devolve o determinístico no lugar — o único que `renovar` reconhece vindo de qualquer
    // janela. A `chaveDeEnvelope` do fake já é determinística (função só de e-mail e senha,
    // doc 17 §2) — reaproveitada direto, sem derivar de novo.
    const { sessao, chaveDeEnvelope } = await this.fake.entrar(email, senha);
    return { sessao: await this.sessaoDeterministica(normalizar(sessao.email)), chaveDeEnvelope };
  }

  async criar(email: string, senha: string): Promise<ResultadoLogin> {
    const { sessao, chaveDeEnvelope } = await this.fake.criar(email, senha);
    return { sessao: await this.sessaoDeterministica(normalizar(sessao.email)), chaveDeEnvelope };
  }

  async renovar(token: string): Promise<Sessao> {
    try {
      return await this.fake.renovar(token);
    } catch (e) {
      for (const emailNormalizado of Object.keys(this.contas)) {
        if (token === (await tokenDeterministico(emailNormalizado))) {
          return this.sessaoDeterministica(emailNormalizado);
        }
      }
      throw e;
    }
  }

  async sair(token: string): Promise<void> {
    await this.fake.sair(token);
  }
}
