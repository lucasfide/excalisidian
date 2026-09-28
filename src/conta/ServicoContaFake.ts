// Conta em memória: é o que os testes usam e o que roda enquanto o servidor não existe.
// Nada aqui é seguro nem pretende ser — senha em texto puro, token sequencial. O ponto é
// exercitar todo o caminho de estado e de interface sem rede.

import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

import type { ServicoConta } from "./ServicoConta";
import { FalhaConta, SENHA_MINIMA, type PlanoAssinatura, type ResultadoLogin, type Sessao } from "./tipos";

const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

interface ContaGuardada {
  senha: string;
  plano: PlanoAssinatura;
}

const normalizar = (email: string) => email.trim().toLowerCase();

/** Chave de envelope determinística e barata para os fakes (plano 12 Task 2): nunca a
 * derivação real (`derivarDaSenha`, Argon2id — lenta de propósito), que multiplicada pelos
 * testes seria inaceitável. Não pretende ser segura, só estável e distinta por conta. */
function chaveFake(emailNormalizado: string, senha: string): Uint8Array {
  return sha256(utf8ToBytes(`chave-fake|${emailNormalizado}|${senha}`));
}

interface SessaoGuardada {
  email: string;
  expiraEm: number;
}

export class ServicoContaFake implements ServicoConta {
  private contas: Map<string, ContaGuardada>;
  private sessoes = new Map<string, SessaoGuardada>(); // token → email + validade
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
    const expiraEm = Date.now() + DURACAO_SESSAO_MS;
    this.sessoes.set(token, { email, expiraEm });
    return { token, email, plano: conta.plano, expiraEm };
  }

  /** Só para teste: força uma sessão já vencida, para exercitar o caminho que o servidor
   * real vai ter — token existe mas o prazo passou. Não faz parte de `ServicoConta`. */
  expirarAgoraParaTeste(token: string): void {
    const sessao = this.sessoes.get(token);
    if (sessao) sessao.expiraEm = Date.now() - 1;
  }

  async entrar(email: string, senha: string): Promise<ResultadoLogin> {
    const chave = normalizar(email);
    const conta = this.contas.get(chave);
    // Email inexistente e senha errada dão o MESMO erro de propósito: responder coisas
    // diferentes conta a um estranho quem tem conta aqui.
    if (!conta || conta.senha !== senha) throw new FalhaConta("credenciais");
    return { sessao: this.abrirSessao(chave), chaveDeEnvelope: chaveFake(chave, senha) };
  }

  async criar(email: string, senha: string): Promise<ResultadoLogin> {
    // Mesma regra do ServicoContaHttp (decisão 7 do plano ADR-39), contando pontos de
    // código depois de NFC — este fake é a implementação usada para desenvolver sem
    // servidor, e o comportamento tem que bater com o real.
    if ([...senha.normalize("NFC")].length < SENHA_MINIMA) throw new FalhaConta("senhaCurta");
    const chave = normalizar(email);
    if (this.contas.has(chave)) throw new FalhaConta("emailEmUso");
    this.contas.set(chave, { senha, plano: "gratis" });
    return { sessao: this.abrirSessao(chave), chaveDeEnvelope: chaveFake(chave, senha) };
  }

  async renovar(token: string): Promise<Sessao> {
    const sessao = this.sessoes.get(token);
    this.sessoes.delete(token);
    // Token desconhecido e token vencido dão o mesmo código: o servidor real também não
    // consegue (nem deve) distinguir "nunca existiu" de "existiu mas passou do prazo".
    if (!sessao || Date.now() > sessao.expiraEm) throw new FalhaConta("expirada");
    return this.abrirSessao(sessao.email);
  }

  async sair(token: string): Promise<void> {
    this.sessoes.delete(token);
  }
}
