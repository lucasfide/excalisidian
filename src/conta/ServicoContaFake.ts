// Conta em memória: é o que os testes usam e o que roda enquanto o servidor não existe.
// Nada aqui é seguro nem pretende ser — senha em texto puro, token sequencial. O ponto é
// exercitar todo o caminho de estado e de interface sem rede.

import type { ServicoConta } from "./ServicoConta";
import { FalhaConta, type PlanoAssinatura, type Sessao } from "./tipos";

const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

interface ContaGuardada {
  senha: string;
  plano: PlanoAssinatura;
}

const normalizar = (email: string) => email.trim().toLowerCase();

export class ServicoContaFake implements ServicoConta {
  private contas: Map<string, ContaGuardada>;
  private sessoes = new Map<string, string>(); // token → email
  private proximo = 1;

  constructor(contas: Record<string, ContaGuardada> = {}) {
    this.contas = new Map(
      Object.entries(contas).map(([email, dados]) => [normalizar(email), dados]),
    );
  }

  private abrirSessao(email: string): Sessao {
    const conta = this.contas.get(email);
    if (!conta) throw new FalhaConta("credenciais");
    const token = `tok-fake-${this.proximo++}`;
    this.sessoes.set(token, email);
    return { token, email, plano: conta.plano, expiraEm: Date.now() + DURACAO_SESSAO_MS };
  }

  async entrar(email: string, senha: string): Promise<Sessao> {
    const chave = normalizar(email);
    const conta = this.contas.get(chave);
    // Email inexistente e senha errada dão o MESMO erro de propósito: responder coisas
    // diferentes conta a um estranho quem tem conta aqui.
    if (!conta || conta.senha !== senha) throw new FalhaConta("credenciais");
    return this.abrirSessao(chave);
  }

  async criar(email: string, senha: string): Promise<Sessao> {
    const chave = normalizar(email);
    if (this.contas.has(chave)) throw new FalhaConta("emailEmUso");
    this.contas.set(chave, { senha, plano: "gratis" });
    return this.abrirSessao(chave);
  }

  async renovar(token: string): Promise<Sessao> {
    const email = this.sessoes.get(token);
    if (!email) throw new FalhaConta("expirada");
    this.sessoes.delete(token);
    return this.abrirSessao(email);
  }

  async sair(token: string): Promise<void> {
    this.sessoes.delete(token);
  }
}
