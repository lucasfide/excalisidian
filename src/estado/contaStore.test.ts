import { describe, it, expect, beforeEach, vi } from "vitest";

const emitMock = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@tauri-apps/api/event", () => ({
  emit: (...args: unknown[]) => emitMock(...args),
}));

import { useContaStore } from "./contaStore";
import { ServicoContaFake } from "../conta/ServicoContaFake";
import type { ServicoConta } from "../conta/ServicoConta";
import { CofreTokenFake } from "../conta/CofreTokenFake";
import { CofreChaveDeEnvelopeFake } from "../conta/CofreChaveDeEnvelopeFake";
import { FalhaConta, type ResultadoLogin, type Sessao } from "../conta/tipos";
import { tokenDaSessaoAtual, definirTokenDaSessao } from "../servico/sessao";

/** Dublê cujo `renovar` só resolve quando o teste mandar — para controlar a ordem entre um
 * `carregar()` em andamento e um `entrar()`/`criar()` que termina antes dele. Os outros
 * métodos delegam para um `ServicoConta` de verdade (o fake em memória). */
class ServicoContaControlavel implements ServicoConta {
  private resolverRenovar!: (s: Sessao) => void;
  private rejeitarRenovar!: (e: unknown) => void;
  private resolverChamada!: () => void;
  /** Resolve assim que `renovar` é chamado, antes de resolver/rejeitar — dá ao teste um
   * ponto de sincronização sem usar temporizador. */
  chamada = new Promise<void>((r) => {
    this.resolverChamada = r;
  });

  private resolverSair!: () => void;
  private resolverChamadaSair!: () => void;
  /** Mesma ideia de `chamada`, mas para `sair` — usada pelo teste de `ocupado` (correção 6c). */
  chamadaSair = new Promise<void>((r) => {
    this.resolverChamadaSair = r;
  });

  constructor(private readonly base: ServicoConta) {}

  renovar(_token: string): Promise<Sessao> {
    const p = new Promise<Sessao>((resolve, reject) => {
      this.resolverRenovar = resolve;
      this.rejeitarRenovar = reject;
    });
    this.resolverChamada();
    return p;
  }

  resolverComo(sessao: Sessao): void {
    this.resolverRenovar(sessao);
  }

  rejeitarCom(erro: unknown): void {
    this.rejeitarRenovar(erro);
  }

  entrar(email: string, senha: string): Promise<ResultadoLogin> {
    return this.base.entrar(email, senha);
  }

  criar(email: string, senha: string): Promise<ResultadoLogin> {
    return this.base.criar(email, senha);
  }

  sair(_token: string): Promise<void> {
    const p = new Promise<void>((resolve) => {
      this.resolverSair = resolve;
    });
    this.resolverChamadaSair();
    return p;
  }

  resolverSairAgora(): void {
    this.resolverSair();
  }
}

const guardados: Record<string, unknown> = {};

vi.mock("@tauri-apps/plugin-store", () => ({
  load: async () => ({
    get: async (k: string) => guardados[k],
    set: async (k: string, v: unknown) => {
      guardados[k] = v;
    },
    delete: async (k: string) => {
      delete guardados[k];
    },
    save: async () => {},
  }),
}));

const comConta = () =>
  new ServicoContaFake({ "ana@exemplo.com": { senha: "segredo123", plano: "premium" } });

let cofre: CofreTokenFake;
let cofreChaveDeEnvelope: CofreChaveDeEnvelopeFake;

describe("contaStore", () => {
  beforeEach(() => {
    for (const k of Object.keys(guardados)) delete guardados[k];
    definirTokenDaSessao(null);
    emitMock.mockClear();
    useContaStore.setState({ sessao: null, carregado: false, ocupado: false, erro: null });
    useContaStore.getState().definirServico(comConta());
    cofre = new CofreTokenFake();
    useContaStore.getState().definirCofre(cofre);
    cofreChaveDeEnvelope = new CofreChaveDeEnvelopeFake();
    useContaStore.getState().definirCofreChaveDeEnvelope(cofreChaveDeEnvelope);
  });

  it("entrar emite o evento de sincronização entre janelas depois de gravar o token", async () => {
    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    expect(emitMock).toHaveBeenCalledWith("app://prefs-mudou");
  });

  it("sair emite o evento de sincronização entre janelas depois de apagar o token", async () => {
    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    emitMock.mockClear();
    await useContaStore.getState().sair();
    expect(emitMock).toHaveBeenCalledWith("app://prefs-mudou");
  });

  it("começa sem sessão", () => {
    expect(useContaStore.getState().sessao).toBeNull();
    expect(useContaStore.getState().plano()).toBe("gratis");
  });

  it("entrar guarda a sessão e espelha o token no porta-token", async () => {
    const ok = await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    expect(ok).toBe(true);
    expect(useContaStore.getState().sessao?.email).toBe("ana@exemplo.com");
    expect(useContaStore.getState().plano()).toBe("premium");
    expect(tokenDaSessaoAtual()).toBe(useContaStore.getState().sessao?.token);
  });

  it("entrar persiste só o token, nunca a senha nem o email", async () => {
    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    expect(cofre.token).toBe(useContaStore.getState().sessao?.token);
    expect(JSON.stringify(guardados)).not.toContain("segredo123");
    expect(JSON.stringify(guardados)).not.toContain("ana@exemplo.com");
  });

  it("entrar grava o token no cofre e o settings.json não recebe tokenConta", async () => {
    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    expect(cofre.token).toBe(useContaStore.getState().sessao?.token);
    expect(guardados.tokenConta).toBeUndefined();
  });

  it("entrar com o cofre falhando ainda devolve true, com sessão e porta-token", async () => {
    cofre.falhar = true;
    const ok = await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    expect(ok).toBe(true);
    expect(useContaStore.getState().sessao).not.toBeNull();
    expect(tokenDaSessaoAtual()).toBe(useContaStore.getState().sessao?.token);
  });

  it("entrar com senha errada guarda o código do erro e não abre sessão", async () => {
    const ok = await useContaStore.getState().entrar("ana@exemplo.com", "errada");
    expect(ok).toBe(false);
    expect(useContaStore.getState().erro).toBe("credenciais");
    expect(useContaStore.getState().sessao).toBeNull();
    expect(tokenDaSessaoAtual()).toBeNull();
  });

  it("sair limpa estado, disco e porta-token", async () => {
    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    await useContaStore.getState().sair();
    expect(useContaStore.getState().sessao).toBeNull();
    expect(cofre.token).toBeNull();
    expect(tokenDaSessaoAtual()).toBeNull();
  });

  it("sair apaga o token do cofre", async () => {
    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    await useContaStore.getState().sair();
    expect(cofre.token).toBeNull();
  });

  it("sair apaga também a chave de envelope deste computador", async () => {
    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    expect(cofreChaveDeEnvelope.bruto).not.toBeNull();
    await useContaStore.getState().sair();
    expect(cofreChaveDeEnvelope.bruto).toBeNull();
  });

  it("sair não trava se apagar a chave de envelope falhar (mesma postura do token)", async () => {
    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    cofreChaveDeEnvelope.falhar = true;
    await useContaStore.getState().sair();
    expect(useContaStore.getState().sessao).toBeNull();
    expect(useContaStore.getState().ocupado).toBe(false);
  });

  it("entrar grava a chaveDeEnvelope no cofre com o e-mail da conta", async () => {
    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    const chave = await useContaStore.getState().chaveDeEnvelopeAtual();
    expect(chave).not.toBeNull();
    expect(chave).toBeInstanceOf(Uint8Array);
  });

  it("entrar com a conta B depois da A (sem sair): chaveDeEnvelopeAtual devolve a chave de B, nunca a de A (Review Focus 1)", async () => {
    const servico = new ServicoContaFake({
      "ana@exemplo.com": { senha: "segredo123", plano: "premium" },
      "bia@exemplo.com": { senha: "outrasenha1", plano: "premium" },
    });
    useContaStore.getState().definirServico(servico);

    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    const chaveDeA = await useContaStore.getState().chaveDeEnvelopeAtual();
    expect(chaveDeA).not.toBeNull();

    // Troca de conta SEM sair — B entra por cima, sem nunca chamar sair().
    await useContaStore.getState().entrar("bia@exemplo.com", "outrasenha1");
    const chaveDeB = await useContaStore.getState().chaveDeEnvelopeAtual();

    expect(chaveDeB).not.toBeNull();
    expect(chaveDeB).not.toEqual(chaveDeA);
    expect(useContaStore.getState().sessao?.email).toBe("bia@exemplo.com");
  });

  it("falha do cofre ao gravar a chave não derruba o login (postura nunca rejeita)", async () => {
    cofreChaveDeEnvelope.falhar = true;
    const ok = await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    expect(ok).toBe(true);
    expect(useContaStore.getState().sessao?.email).toBe("ana@exemplo.com");
  });

  it("sessão restaurada por carregar/renovar (sem senha digitada) não tem chaveDeEnvelope: chaveDeEnvelopeAtual devolve null", async () => {
    const servico = comConta();
    useContaStore.getState().definirServico(servico);
    const { sessao: inicial } = await servico.entrar("ana@exemplo.com", "segredo123");
    cofre.token = inicial.token;

    await useContaStore.getState().carregar();

    expect(useContaStore.getState().sessao?.email).toBe("ana@exemplo.com");
    expect(await useContaStore.getState().chaveDeEnvelopeAtual()).toBeNull();
  });

  it("chaveDeEnvelopeAtual sem sessão devolve null", async () => {
    expect(useContaStore.getState().sessao).toBeNull();
    expect(await useContaStore.getState().chaveDeEnvelopeAtual()).toBeNull();
  });

  it("sair marca ocupado enquanto o sair do serviço não resolve", async () => {
    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    const servico = new ServicoContaControlavel(comConta());
    useContaStore.getState().definirServico(servico);

    const saindo = useContaStore.getState().sair();
    await servico.chamadaSair;
    expect(useContaStore.getState().ocupado).toBe(true);

    servico.resolverSairAgora();
    await saindo;
    expect(useContaStore.getState().ocupado).toBe(false);
  });

  it("carregar sem token salvo termina sem sessão e marca carregado", async () => {
    await useContaStore.getState().carregar();
    expect(useContaStore.getState().sessao).toBeNull();
    expect(useContaStore.getState().carregado).toBe(true);
  });

  it("carregar com token salvo renova e traz o plano do servidor", async () => {
    const servico = comConta();
    useContaStore.getState().definirServico(servico);
    const { sessao: inicial } = await servico.entrar("ana@exemplo.com", "segredo123");
    cofre.token = inicial.token;

    await useContaStore.getState().carregar();

    expect(useContaStore.getState().sessao?.plano).toBe("premium");
    expect(tokenDaSessaoAtual()).toBe(useContaStore.getState().sessao?.token);
  });

  it("carregar migra o token legado do settings.json para o cofre e apaga o legado", async () => {
    const servico = comConta();
    useContaStore.getState().definirServico(servico);
    const { sessao: inicial } = await servico.entrar("ana@exemplo.com", "segredo123");
    guardados.tokenConta = inicial.token; // só no legado; cofre começa vazio

    await useContaStore.getState().carregar();

    // O renovar troca o token (rotativo); o que importa é que o legado migrou e sumiu, e a
    // sessão foi carregada com sucesso — o cofre fica com o token atual da sessão, não com o
    // token legado original.
    expect(cofre.token).toBe(useContaStore.getState().sessao?.token);
    expect(guardados.tokenConta).toBeUndefined();
    expect(useContaStore.getState().sessao?.plano).toBe("premium");
  });

  it("carregar com token morto (expirada) limpa o disco em silêncio, sem erro na tela", async () => {
    cofre.token = "tok-que-nao-existe";
    const servico = new ServicoContaControlavel(comConta());
    useContaStore.getState().definirServico(servico);

    const carregando = useContaStore.getState().carregar();
    await servico.chamada;
    servico.rejeitarCom(new FalhaConta("expirada"));
    await carregando;

    expect(useContaStore.getState().sessao).toBeNull();
    expect(useContaStore.getState().erro).toBeNull();
    expect(cofre.token).toBeNull();
    expect(tokenDaSessaoAtual()).toBeNull();
  });

  it("carregar sem internet (falha de rede) mantém o token no cofre, sem deslogar em silêncio", async () => {
    cofre.token = "tok-offline";
    const servico = new ServicoContaControlavel(comConta());
    useContaStore.getState().definirServico(servico);

    const carregando = useContaStore.getState().carregar();
    await servico.chamada;
    servico.rejeitarCom(new FalhaConta("rede"));
    await carregando;

    expect(useContaStore.getState().sessao).toBeNull();
    expect(useContaStore.getState().carregado).toBe(true);
    expect(useContaStore.getState().erro).toBeNull();
    // O token PERMANECE no cofre: não é prova de que a sessão expirou, é só falta de rede.
    expect(cofre.token).toBe("tok-offline");
  });

  it("carregar com erro de servidor (ex.: token rotativo já consumido por outra janela) mantém o token no cofre", async () => {
    cofre.token = "tok-consumido-por-outra-janela";
    const servico = new ServicoContaControlavel(comConta());
    useContaStore.getState().definirServico(servico);

    const carregando = useContaStore.getState().carregar();
    await servico.chamada;
    servico.rejeitarCom(new FalhaConta("servidor"));
    await carregando;

    expect(useContaStore.getState().sessao).toBeNull();
    expect(useContaStore.getState().carregado).toBe(true);
    expect(cofre.token).toBe("tok-consumido-por-outra-janela");
  });

  it("sair durante um carregar() em andamento: o carregar que termina depois não restaura nada", async () => {
    cofre.token = "tok-velho";
    const servico = new ServicoContaControlavel(comConta());
    useContaStore.getState().definirServico(servico);

    const carregando = useContaStore.getState().carregar();
    await servico.chamada; // renovar foi chamado, ainda pendente

    await useContaStore.getState().sair();
    expect(useContaStore.getState().sessao).toBeNull();
    expect(cofre.token).toBeNull();
    expect(tokenDaSessaoAtual()).toBeNull();

    // O renovar do carregar() finalmente resolve, com uma sessão diferente da que o sair
    // apagou. Como o sair venceu (geração mais recente), o carregar não pode restaurar
    // sessão, regravar o token no cofre nem religar o porta-token.
    servico.resolverComo({
      token: "tok-velho-renovado",
      email: "outra@exemplo.com",
      plano: "gratis",
      expiraEm: Date.now() + 1000,
    });
    await carregando;

    expect(useContaStore.getState().sessao).toBeNull();
    expect(cofre.token).toBeNull();
    expect(tokenDaSessaoAtual()).toBeNull();
  });

  it("entrar bem-sucedido vence um carregar() em andamento cujo renovar resolve depois", async () => {
    cofre.token = "tok-velho";
    const servico = new ServicoContaControlavel(comConta());
    useContaStore.getState().definirServico(servico);

    const carregando = useContaStore.getState().carregar();
    await servico.chamada; // renovar foi chamado, ainda pendente

    const ok = await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    expect(ok).toBe(true);
    const tokenDoEntrar = useContaStore.getState().sessao?.token;

    // O renovar do carregar() finalmente resolve, com uma sessão diferente da do entrar.
    servico.resolverComo({
      token: "tok-velho-renovado",
      email: "outra@exemplo.com",
      plano: "gratis",
      expiraEm: Date.now() + 1000,
    });
    await carregando;

    expect(useContaStore.getState().sessao?.token).toBe(tokenDoEntrar);
    expect(cofre.token).toBe(tokenDoEntrar);
    expect(tokenDaSessaoAtual()).toBe(tokenDoEntrar);
  });

  it("entrar bem-sucedido sobrevive a um carregar() cujo renovar falha depois (token morto)", async () => {
    cofre.token = "tok-morto";
    const servico = new ServicoContaControlavel(comConta());
    useContaStore.getState().definirServico(servico);

    const carregando = useContaStore.getState().carregar();
    await servico.chamada;

    const ok = await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    expect(ok).toBe(true);
    const tokenDoEntrar = useContaStore.getState().sessao?.token;

    servico.rejeitarCom(new FalhaConta("expirada"));
    await carregando;

    expect(useContaStore.getState().sessao?.token).toBe(tokenDoEntrar);
    expect(cofre.token).toBe(tokenDoEntrar);
    expect(tokenDaSessaoAtual()).toBe(tokenDoEntrar);
  });

  it("entrar que falha com sessão ativa preserva a sessão anterior", async () => {
    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    const sessaoAnterior = useContaStore.getState().sessao;

    const ok = await useContaStore.getState().entrar("ana@exemplo.com", "errada");

    expect(ok).toBe(false);
    expect(useContaStore.getState().erro).toBe("credenciais");
    expect(useContaStore.getState().sessao).toEqual(sessaoAnterior);
    expect(tokenDaSessaoAtual()).toBe(sessaoAnterior?.token);
  });
});
