import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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

  consultar(token: string) {
    return this.base.consultar(token);
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

  it("carregar com sucesso emite prefs-mudou uma vez; com falha não emite", async () => {
    const servico = comConta();
    useContaStore.getState().definirServico(servico);
    const { sessao: inicial } = await servico.entrar("ana@exemplo.com", "segredo123");
    cofre.token = inicial.token;
    emitMock.mockClear();
    await useContaStore.getState().carregar();
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith("app://prefs-mudou");

    emitMock.mockClear();
    cofre.token = "tok-que-nao-existe";
    await useContaStore.getState().carregar();
    expect(emitMock).not.toHaveBeenCalled();
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

  describe("atualizarPlano", () => {
    it("plano muda de grátis para premium sem renovar nem trocar o token", async () => {
      const servico = comConta();
      useContaStore.getState().definirServico(servico);
      await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
      const token = useContaStore.getState().sessao!.token;
      useContaStore.setState({ sessao: { ...useContaStore.getState().sessao!, plano: "gratis" } });
      const renovar = vi.spyOn(servico, "renovar");
      await useContaStore.getState().atualizarPlano();
      expect(renovar).not.toHaveBeenCalled();
      expect(useContaStore.getState().plano()).toBe("premium");
      expect(useContaStore.getState().sessao?.token).toBe(token);
    });

    it("token trocado no meio da consulta descarta o resultado", async () => {
      await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
      const servico = useContaStore.getState().servico;
      let liberar!: (d: Omit<Sessao, "token">) => void;
      vi.spyOn(servico, "consultar").mockImplementation(() => new Promise((r) => { liberar = r; }));
      const atualizando = useContaStore.getState().atualizarPlano();
      const outra = { ...useContaStore.getState().sessao!, token: "tok-de-outra-janela" };
      useContaStore.setState({ sessao: outra });
      liberar({ email: "ana@exemplo.com", plano: "gratis", expiraEm: 1 });
      await atualizando;
      expect(useContaStore.getState().sessao).toEqual(outra);
    });

    it("expirada zera a sessão e o porta-token", async () => {
      await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
      vi.spyOn(useContaStore.getState().servico, "consultar").mockRejectedValue(new FalhaConta("expirada"));
      await useContaStore.getState().atualizarPlano();
      expect(useContaStore.getState().sessao).toBeNull();
      expect(tokenDaSessaoAtual()).toBeNull();
    });

    it("rede mantém a sessão e nunca rejeita", async () => {
      await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
      const antes = useContaStore.getState().sessao;
      vi.spyOn(useContaStore.getState().servico, "consultar").mockRejectedValue(new FalhaConta("rede"));
      await expect(useContaStore.getState().atualizarPlano()).resolves.toBeUndefined();
      expect(useContaStore.getState().sessao).toEqual(antes);
    });

    it("sem sessão não faz nada", async () => {
      const consultar = vi.spyOn(useContaStore.getState().servico, "consultar");
      await useContaStore.getState().atualizarPlano();
      expect(consultar).not.toHaveBeenCalled();
    });
  });

  it("cofre que falhou ao gravar: evento de outra janela não zera a sessão só em memória", async () => {
    cofre.falhar = true;
    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    cofre.falhar = false; // cofre volta, mas vazio
    await useContaStore.getState().sincronizarComCofre();
    expect(useContaStore.getState().sessao).not.toBeNull();
    expect(tokenDaSessaoAtual()).toBe(useContaStore.getState().sessao?.token);
  });

  it("depois de gravar no cofre com sucesso, cofre vazio volta a significar 'outra janela saiu'", async () => {
    cofre.falhar = true;
    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    cofre.falhar = false;
    await useContaStore.getState().sair();
    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    cofre.token = null;
    await useContaStore.getState().sincronizarComCofre();
    expect(useContaStore.getState().sessao).toBeNull();
  });

  it("adotar token do cofre desliga a marca em memória: logout real em outra janela volta a valer", async () => {
    const servico = comConta();
    useContaStore.getState().definirServico(servico);
    cofre.falhar = true;
    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    cofre.falhar = false;
    const { sessao: outra } = await servico.entrar("ana@exemplo.com", "segredo123");
    cofre.token = outra.token;
    await useContaStore.getState().sincronizarComCofre();
    expect(useContaStore.getState().sessao?.token).toBe(outra.token);
    cofre.token = null; // outra janela saiu
    await useContaStore.getState().sincronizarComCofre();
    expect(useContaStore.getState().sessao).toBeNull();
  });

  it("atualizarPlano com dados iguais mantém o mesmo objeto de sessão", async () => {
    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    const antes = useContaStore.getState().sessao;
    await useContaStore.getState().atualizarPlano();
    expect(useContaStore.getState().sessao).toBe(antes);
  });

  describe("sincronizarComCofre", () => {
    it("sem token no cofre zera a sessão e o porta-token", async () => {
      await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
      cofre.token = null; // outra janela saiu
      await useContaStore.getState().sincronizarComCofre();
      expect(useContaStore.getState().sessao).toBeNull();
      expect(useContaStore.getState().carregado).toBe(true);
      expect(tokenDaSessaoAtual()).toBeNull();
    });

    it("token igual ao da sessão atual não chama o servidor", async () => {
      await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
      const servico = useContaStore.getState().servico;
      const consultar = vi.spyOn(servico, "consultar");
      const renovar = vi.spyOn(servico, "renovar");
      await useContaStore.getState().sincronizarComCofre();
      expect(consultar).not.toHaveBeenCalled();
      expect(renovar).not.toHaveBeenCalled();
    });

    it("token diferente é consultado (sem renovar) e adotado", async () => {
      const servico = comConta();
      useContaStore.getState().definirServico(servico);
      await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
      const { sessao: outra } = await servico.entrar("ana@exemplo.com", "segredo123"); // outra janela
      cofre.token = outra.token;
      const renovar = vi.spyOn(servico, "renovar");

      await useContaStore.getState().sincronizarComCofre();

      expect(renovar).not.toHaveBeenCalled();
      expect(useContaStore.getState().sessao?.token).toBe(outra.token);
      expect(useContaStore.getState().plano()).toBe("premium");
      expect(tokenDaSessaoAtual()).toBe(outra.token);
      expect(cofre.token).toBe(outra.token);
    });

    it("token diferente expirado zera a sessão mas NÃO apaga o cofre", async () => {
      await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
      cofre.token = "tok-que-o-servidor-nao-conhece";
      await useContaStore.getState().sincronizarComCofre();
      expect(useContaStore.getState().sessao).toBeNull();
      expect(tokenDaSessaoAtual()).toBeNull();
      expect(cofre.token).toBe("tok-que-o-servidor-nao-conhece");
    });

    it("rede ou servidor fora do ar mantém a sessão atual", async () => {
      await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
      const antes = useContaStore.getState().sessao;
      cofre.token = "tok-novo-de-outra-janela";
      vi.spyOn(useContaStore.getState().servico, "consultar").mockRejectedValue(new FalhaConta("rede"));
      await useContaStore.getState().sincronizarComCofre();
      expect(useContaStore.getState().sessao).toEqual(antes);
      expect(tokenDaSessaoAtual()).toBe(antes?.token);
    });

    it("descarta o resultado se entrar/sair aconteceu no meio (geracao)", async () => {
      const servico = comConta();
      useContaStore.getState().definirServico(servico);
      const { sessao: outra } = await servico.entrar("ana@exemplo.com", "segredo123");
      cofre.token = outra.token;
      const sincronizando = useContaStore.getState().sincronizarComCofre();
      await useContaStore.getState().sair();
      await sincronizando;
      expect(useContaStore.getState().sessao).toBeNull();
      expect(tokenDaSessaoAtual()).toBeNull();
    });
  });

  describe("sincronizarComCofre concorrente com carregar() na mesma janela", () => {
    const T1: Sessao = { token: "tok-T1", email: "ana@exemplo.com", plano: "premium", expiraEm: Date.now() + 1000 };

    function montarCorrida() {
      const servico = new ServicoContaControlavel(comConta());
      let resolverConsulta!: (d: Omit<Sessao, "token">) => void;
      let rejeitarConsulta!: (e: unknown) => void;
      vi.spyOn(servico, "consultar").mockImplementation(
        () =>
          new Promise((res, rej) => {
            resolverConsulta = res;
            rejeitarConsulta = rej;
          }),
      );
      useContaStore.getState().definirServico(servico);
      cofre.token = "tok-T0";
      return { servico, resolverConsulta: (d: Omit<Sessao, "token">) => resolverConsulta(d), rejeitarConsulta: (e: unknown) => rejeitarConsulta(e) };
    }

    it("renovar termina primeiro e consultar(T0) dá 401: não desloga quem carregar() acabou de logar", async () => {
      const c = montarCorrida();
      const carregando = useContaStore.getState().carregar();
      await c.servico.chamada;
      const sincronizando = useContaStore.getState().sincronizarComCofre();
      await vi.waitFor(() => expect(c.servico.consultar).toHaveBeenCalled());

      c.servico.resolverComo(T1);
      await carregando;
      c.rejeitarConsulta(new FalhaConta("expirada"));
      await sincronizando;

      expect(useContaStore.getState().sessao?.token).toBe("tok-T1");
      expect(tokenDaSessaoAtual()).toBe("tok-T1");
    });

    it("renovar termina primeiro e consultar(T0) responde 200: não sobrescreve T1 com o T0 já rotacionado", async () => {
      const c = montarCorrida();
      const carregando = useContaStore.getState().carregar();
      await c.servico.chamada;
      const sincronizando = useContaStore.getState().sincronizarComCofre();
      await vi.waitFor(() => expect(c.servico.consultar).toHaveBeenCalled());

      c.servico.resolverComo(T1);
      await carregando;
      c.resolverConsulta({ email: "ana@exemplo.com", plano: "gratis", expiraEm: 1 });
      await sincronizando;

      expect(useContaStore.getState().sessao?.token).toBe("tok-T1");
      expect(tokenDaSessaoAtual()).toBe("tok-T1");
    });
  });

  describe("renovação automática antes de vencer (Review Focus 4)", () => {
    const DIA = 24 * 60 * 60 * 1000;
    const SEIS_HORAS = 6 * 60 * 60 * 1000;

    /** Serviço dublê: `entrar` devolve uma sessão que vence em `venceEm` ms; cada `renovar`
     * devolve um token novo com 30 dias de validade. */
    function montar(venceEm: number) {
      let n = 0;
      const servico = {
        entrar: vi.fn(async () => ({
          sessao: { token: "tok-0", email: "ana@exemplo.com", plano: "premium" as const, expiraEm: Date.now() + venceEm },
          chaveDeEnvelope: new Uint8Array(32),
        })),
        criar: vi.fn(),
        renovar: vi.fn(async (_t: string): Promise<Sessao> => ({
          token: `tok-${++n}`,
          email: "ana@exemplo.com",
          plano: "premium" as const,
          expiraEm: Date.now() + 30 * DIA,
        })),
        consultar: vi.fn(async (_t: string) => ({
          email: "ana@exemplo.com",
          plano: "premium" as const,
          expiraEm: Date.now() + 30 * DIA,
        })),
        sair: vi.fn(async () => {}),
      };
      useContaStore.getState().definirServico(servico as unknown as ServicoConta);
      return servico;
    }

    beforeEach(async () => {
      // Zera o timer que testes anteriores possam ter deixado (é do módulo, não do estado).
      await useContaStore.getState().sair();
      vi.useFakeTimers();
      emitMock.mockClear();
    });

    afterEach(async () => {
      await useContaStore.getState().sair();
      vi.useRealTimers();
    });

    it("sessão perto de vencer: renova logo ao entrar, grava no cofre e emite uma vez", async () => {
      const servico = montar(3 * DIA);
      await useContaStore.getState().entrar("ana@exemplo.com", "x");
      emitMock.mockClear();
      await vi.advanceTimersByTimeAsync(0);
      expect(servico.renovar).toHaveBeenCalledTimes(1);
      expect(servico.renovar).toHaveBeenCalledWith("tok-0");
      expect(cofre.token).toBe("tok-1");
      expect(useContaStore.getState().sessao?.token).toBe("tok-1");
      expect(tokenDaSessaoAtual()).toBe("tok-1");
      expect(emitMock).toHaveBeenCalledTimes(1);
      expect(emitMock).toHaveBeenCalledWith("app://prefs-mudou");
      // Agora longe de vencer: os tiques seguintes não voltam ao servidor.
      await vi.advanceTimersByTimeAsync(SEIS_HORAS * 4);
      expect(servico.renovar).toHaveBeenCalledTimes(1);
    });

    it("sessão longe de vencer: não chama o servidor; o tique dentro dos 7 dias renova", async () => {
      const servico = montar(30 * DIA);
      await useContaStore.getState().entrar("ana@exemplo.com", "x");
      await vi.advanceTimersByTimeAsync(20 * DIA);
      expect(servico.renovar).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(4 * DIA); // faltam ~6 dias
      expect(servico.renovar).toHaveBeenCalledTimes(1);
      expect(useContaStore.getState().sessao?.token).toBe("tok-1");
    });

    it("carregar várias vezes não duplica o timer", async () => {
      const servico = montar(30 * DIA);
      cofre.token = "tok-velho";
      await useContaStore.getState().carregar();
      await useContaStore.getState().carregar();
      await useContaStore.getState().carregar();
      expect(vi.getTimerCount()).toBe(1);
      expect(servico.renovar).toHaveBeenCalledTimes(3); // os três carregar; nenhum do timer
    });

    it("sair cancela o timer", async () => {
      montar(30 * DIA);
      await useContaStore.getState().entrar("ana@exemplo.com", "x");
      expect(vi.getTimerCount()).toBe(1);
      await useContaStore.getState().sair();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("falha de rede: mantém a sessão e tenta de novo no próximo tique", async () => {
      const servico = montar(3 * DIA);
      servico.renovar.mockRejectedValueOnce(new FalhaConta("rede"));
      await useContaStore.getState().entrar("ana@exemplo.com", "x");
      await vi.advanceTimersByTimeAsync(0);
      expect(useContaStore.getState().sessao?.token).toBe("tok-0");
      expect(cofre.token).toBe("tok-0");
      await vi.advanceTimersByTimeAsync(SEIS_HORAS);
      expect(servico.renovar).toHaveBeenCalledTimes(2);
      expect(useContaStore.getState().sessao?.token).toBe("tok-1");
    });

    it("expirada: mesmo tratamento do carregar (sem sessão, cofre apagado, timer parado)", async () => {
      const servico = montar(3 * DIA);
      servico.renovar.mockRejectedValueOnce(new FalhaConta("expirada"));
      await useContaStore.getState().entrar("ana@exemplo.com", "x");
      await vi.advanceTimersByTimeAsync(0);
      expect(useContaStore.getState().sessao).toBeNull();
      expect(tokenDaSessaoAtual()).toBeNull();
      expect(cofre.token).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("outra janela já renovou (cofre tem outro token): adota em vez de renovar o token velho", async () => {
      const servico = montar(3 * DIA);
      servico.renovar.mockRejectedValueOnce(new FalhaConta("rede")); // o check do entrar falha
      await useContaStore.getState().entrar("ana@exemplo.com", "x");
      await vi.advanceTimersByTimeAsync(0);
      expect(servico.renovar).toHaveBeenCalledTimes(1);
      cofre.token = "tok-da-outra-janela"; // a outra janela renovou e gravou
      await vi.advanceTimersByTimeAsync(SEIS_HORAS);
      expect(servico.renovar).toHaveBeenCalledTimes(1); // não tentou o token velho
      expect(useContaStore.getState().sessao?.token).toBe("tok-da-outra-janela");
    });

    it("expirada do token velho enquanto o cofre já tem o da outra janela: adota, não apaga o cofre", async () => {
      const servico = montar(3 * DIA);
      servico.renovar.mockImplementationOnce(async () => {
        cofre.token = "tok-da-outra-janela"; // a outra janela rotacionou no meio do caminho
        throw new FalhaConta("expirada");
      });
      await useContaStore.getState().entrar("ana@exemplo.com", "x");
      await vi.advanceTimersByTimeAsync(0);
      expect(cofre.token).toBe("tok-da-outra-janela");
      expect(useContaStore.getState().sessao?.token).toBe("tok-da-outra-janela");
    });

    it("cofre que falhou ao gravar (sessão só em memória): o timer renova o token da memória", async () => {
      const servico = montar(3 * DIA);
      cofre.falhar = true;
      await useContaStore.getState().entrar("ana@exemplo.com", "x");
      await vi.advanceTimersByTimeAsync(0);
      expect(servico.renovar).toHaveBeenCalledWith("tok-0");
      expect(useContaStore.getState().sessao?.token).toBe("tok-1");
      cofre.falhar = false;
    });

    it("sair com renovar em andamento descarta o resultado (contador geracao)", async () => {
      const servico = montar(3 * DIA);
      let resolver!: (s: Sessao) => void;
      servico.renovar.mockImplementationOnce(() => new Promise<Sessao>((r) => (resolver = r)));
      await useContaStore.getState().entrar("ana@exemplo.com", "x");
      await vi.advanceTimersByTimeAsync(0);
      await useContaStore.getState().sair();
      resolver({ token: "tok-tarde", email: "ana@exemplo.com", plano: "premium", expiraEm: Date.now() + 30 * DIA });
      await vi.advanceTimersByTimeAsync(0);
      expect(useContaStore.getState().sessao).toBeNull();
      expect(cofre.token).toBeNull();
      expect(tokenDaSessaoAtual()).toBeNull();
    });

    it("sair durante a gravação da renovação no cofre: não restaura a sessão e o cofre fica vazio", async () => {
      const servico = montar(3 * DIA);
      await useContaStore.getState().entrar("ana@exemplo.com", "x");
      // Deixa o check do entrar concluir com o cofre normal; agora segura só a próxima gravação.
      await vi.advanceTimersByTimeAsync(0);
      servico.renovar.mockClear();
      const atual = useContaStore.getState().sessao!;
      useContaStore.setState({ sessao: { ...atual, expiraEm: Date.now() + 2 * DIA } });
      servico.renovar.mockResolvedValueOnce({ token: "tok-tarde", email: "ana@exemplo.com", plano: "premium", expiraEm: Date.now() + 2 * DIA });
      let liberar!: () => void;
      const gravarOriginal = cofre.gravar.bind(cofre);
      cofre.gravar = async (t: string) => {
        await new Promise<void>((r) => (liberar = r));
        await gravarOriginal(t);
      };
      const tique = vi.advanceTimersByTimeAsync(SEIS_HORAS);
      await vi.waitFor(() => expect(liberar).toBeDefined());
      cofre.gravar = gravarOriginal;
      await useContaStore.getState().sair();
      liberar();
      await tique;
      await vi.advanceTimersByTimeAsync(0);
      expect(useContaStore.getState().sessao).toBeNull();
      expect(cofre.token).toBeNull();
      expect(tokenDaSessaoAtual()).toBeNull();
    });

    it("renovação que ainda deixa a sessão perto de vencer não gera tempestade: adoção logo depois não renova de novo", async () => {
      const servico = montar(3 * DIA);
      servico.renovar.mockImplementation(async (_t: string) => ({ token: "tok-curta", email: "ana@exemplo.com", plano: "premium" as const, expiraEm: Date.now() + 2 * DIA }));
      await useContaStore.getState().entrar("ana@exemplo.com", "x");
      await vi.advanceTimersByTimeAsync(0);
      expect(servico.renovar).toHaveBeenCalledTimes(1);
      cofre.token = "tok-de-outra-janela"; // outra janela gravou: esta adota e confere de novo
      servico.consultar.mockResolvedValueOnce({ email: "ana@exemplo.com", plano: "premium", expiraEm: Date.now() + 2 * DIA });
      await useContaStore.getState().sincronizarComCofre();
      await vi.advanceTimersByTimeAsync(0);
      expect(servico.renovar).toHaveBeenCalledTimes(1);
    });
  });
});
