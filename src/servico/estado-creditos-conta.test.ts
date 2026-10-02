import { describe, expect, it, vi } from "vitest";
import type { ContaAtualCreditos, EstadoCreditoApresentacao } from "../types/creditos-conta";
import {
  estadoInicialCreditosConta,
  falhaRecuperacaoCreditos,
  podeConcluirAgentePorCreditos,
  podeAplicarResultadoCreditos,
  recuperarSessaoApos401ComOperacoes,
  resultadoConsultaCreditos,
  estadoSeguroParaSessao,
} from "./estado-creditos-conta";

const sessaoPremium = { token: "token-a", email: "a@exemplo.test", plano: "premium" as const, expiraEm: 10 };
const contaPremium: ContaAtualCreditos = { carregado: true, sessao: sessaoPremium };
const saldo = { usados: 3, total: 3000, renovaEm: 1234 };

describe("estado de apresentação dos créditos", () => {
  it("distingue conta carregando, sem sessão, grátis e premium sem consulta local", () => {
    expect(estadoInicialCreditosConta({ ativo: true, carregado: false, sessao: null, servidorReal: true }).estado).toBe("verificando");
    expect(estadoInicialCreditosConta({ ativo: true, carregado: true, sessao: null, servidorReal: true }).estado).toBe("sem-sessao");
    expect(
      estadoInicialCreditosConta({
        ativo: true,
        carregado: true,
        sessao: { ...sessaoPremium, plano: "gratis" },
        servidorReal: true,
      }).estado,
    ).toBe("plano-insuficiente");
    expect(estadoInicialCreditosConta({ ativo: true, carregado: true, sessao: sessaoPremium, servidorReal: false })).toEqual({
      estado: "indisponivel-rede",
      saldo: null,
      identidadeSessao: "token-a",
    });
  });

  it("trata saldo zero como disponível e mantém a falha de rede sem saldo", () => {
    expect(resultadoConsultaCreditos("token-a", { ok: true, saldo: { usados: 10, total: 10, renovaEm: 1 } })).toEqual({
      estado: "disponivel",
      saldo: { usados: 10, total: 10, renovaEm: 1 },
      identidadeSessao: "token-a",
    });
    expect(resultadoConsultaCreditos("token-a", { ok: false, motivo: "rede" })).toEqual({
      estado: "indisponivel-rede",
      saldo: null,
      identidadeSessao: "token-a",
    });
  });

  it("só permite concluir com conta premium carregada e a identidade consultada", () => {
    const disponivel: EstadoCreditoApresentacao = {
      estado: "disponivel",
      saldo,
      identidadeSessao: "token-a",
    };
    const rede: EstadoCreditoApresentacao = {
      estado: "indisponivel-rede",
      saldo: null,
      identidadeSessao: "token-a",
    };
    expect(podeConcluirAgentePorCreditos(disponivel, contaPremium)).toBe(true);
    expect(podeConcluirAgentePorCreditos(rede, contaPremium)).toBe(true);
    expect(podeConcluirAgentePorCreditos({ ...disponivel, estado: "consultando", saldo: null }, contaPremium)).toBe(false);
    expect(podeConcluirAgentePorCreditos(disponivel, { ...contaPremium, sessao: { ...sessaoPremium, token: "token-b" } })).toBe(false);
    expect(podeConcluirAgentePorCreditos(rede, { carregado: true, sessao: null })).toBe(false);
    expect(podeConcluirAgentePorCreditos(rede, { ...contaPremium, sessao: { ...sessaoPremium, plano: "gratis" } })).toBe(false);
  });

  it("esconde saldo velho antes do efeito de reset e deixa vencer respostas fora de ordem", () => {
    const saldoAnterior = resultadoConsultaCreditos("token-a", { ok: true, saldo });
    const novoToken = { estado: "consultando" as const, saldo: null, identidadeSessao: "token-b" };
    expect(estadoSeguroParaSessao(saldoAnterior, novoToken)).toEqual(novoToken);
    expect(podeAplicarResultadoCreditos(true, true, true, {
      carregado: true,
      sessao: { ...sessaoPremium, token: "token-b" },
    }, saldoAnterior)).toBe(false);
    expect(estadoSeguroParaSessao(saldoAnterior, { estado: "inativo", saldo: null, identidadeSessao: null })).toEqual({
      estado: "inativo",
      saldo: null,
      identidadeSessao: null,
    });
  });

  it("consulta pendente invalida permissão e conta grátis substitui saldo premium", () => {
    const disponivel = resultadoConsultaCreditos("token-a", { ok: true, saldo });
    const pendente = { estado: "consultando" as const, saldo: null, identidadeSessao: "token-a" };
    expect(podeConcluirAgentePorCreditos(pendente, contaPremium)).toBe(false);
    expect(estadoSeguroParaSessao(disponivel, {
      estado: "plano-insuficiente",
      saldo: null,
      identidadeSessao: "token-a",
    })).toEqual({ estado: "plano-insuficiente", saldo: null, identidadeSessao: "token-a" });
  });

  it("offline oculta saldo, rejeita respostas em voo e preserva bloqueios de 401/403", () => {
    const disponivel = resultadoConsultaCreditos("token-a", { ok: true, saldo });
    expect(estadoSeguroParaSessao(disponivel, { estado: "consultando", saldo: null, identidadeSessao: "token-a" }, false)).toEqual({
      estado: "indisponivel-rede",
      saldo: null,
      identidadeSessao: "token-a",
    });
    expect(podeAplicarResultadoCreditos(true, true, false, contaPremium, disponivel)).toBe(false);
    for (const estado of ["acesso-nao-confirmado", "plano-insuficiente"] as const) {
      const bloqueio = { estado, saldo: null, identidadeSessao: "token-a" };
      expect(estadoSeguroParaSessao(bloqueio, { estado: "consultando", saldo: null, identidadeSessao: "token-a" }, false)).toEqual(bloqueio);
    }
    // A resposta 401 bloqueia antes de aguardar a sincronização; ficar offline durante essa
    // validação não pode transformar a recusa em permissão de salvar.
    const recusaPendente = falhaRecuperacaoCreditos("acesso-nao-confirmado", "token-a");
    expect(estadoSeguroParaSessao(recusaPendente, { estado: "consultando", saldo: null, identidadeSessao: "token-a" }, false)).toEqual(recusaPendente);
    expect(podeConcluirAgentePorCreditos(recusaPendente, contaPremium)).toBe(false);
  });

  it("desmontagem ou superfície inativa impede publicar consulta atrasada", () => {
    const resposta = resultadoConsultaCreditos("token-a", { ok: true, saldo });
    expect(podeAplicarResultadoCreditos(false, true, true, contaPremium, resposta)).toBe(false);
    expect(podeAplicarResultadoCreditos(true, false, true, contaPremium, resposta)).toBe(false);
  });
});

describe("recuperarSessaoApos401ComOperacoes", () => {
  it("classifica sessão expirada somente quando a recuperação confirma ausência", async () => {
    let atual: ContaAtualCreditos = contaPremium;
    const resultado = await recuperarSessaoApos401ComOperacoes("token-a", {
      sincronizarComCofre: async () => {
        atual = { carregado: true, sessao: null };
      },
      atualizarPlano: vi.fn(),
      contaAtual: () => atual,
    });
    expect(resultado).toEqual({ estado: "expirada" });
  });

  it("identifica token adotado e mantém recusa inconclusiva bloqueada", async () => {
    const nova = { ...sessaoPremium, token: "token-b" };
    let atual: ContaAtualCreditos = contaPremium;
    const trocou = await recuperarSessaoApos401ComOperacoes("token-a", {
      sincronizarComCofre: async () => {
        atual = { carregado: true, sessao: nova };
      },
      atualizarPlano: vi.fn(),
      contaAtual: () => atual,
    });
    expect(trocou).toEqual({ estado: "token-atualizado", sessao: nova });

    const inconclusiva = await recuperarSessaoApos401ComOperacoes("token-a", {
      sincronizarComCofre: vi.fn(),
      atualizarPlano: vi.fn(),
      contaAtual: () => contaPremium,
    });
    expect(inconclusiva).toEqual({ estado: "acesso-nao-confirmado", sessao: sessaoPremium });
  });

  it("limita a duração da recuperação inteira", async () => {
    vi.useFakeTimers();
    try {
      let atual = contaPremium;
      const recuperacao = recuperarSessaoApos401ComOperacoes(
        "token-a",
        {
          sincronizarComCofre: () => new Promise<void>(() => {}),
          atualizarPlano: vi.fn(),
          contaAtual: () => atual,
        },
        25,
      );
      await vi.advanceTimersByTimeAsync(25);
      await expect(recuperacao).resolves.toEqual({ estado: "acesso-nao-confirmado", sessao: sessaoPremium });
      atual = { carregado: true, sessao: null };
    } finally {
      vi.useRealTimers();
    }
  });
});
