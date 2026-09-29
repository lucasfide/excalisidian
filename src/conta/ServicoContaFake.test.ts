// src/conta/ServicoContaFake.test.ts
import { describe, it, expect } from "vitest";

import { ServicoContaFake } from "./ServicoContaFake";
import { FalhaConta } from "./tipos";

const fake = () =>
  new ServicoContaFake({ "ana@exemplo.com": { senha: "segredo123", plano: "premium" } });

describe("ServicoContaFake", () => {
  it("entrar com credenciais certas devolve sessão com o plano da conta", async () => {
    const { sessao: s } = await fake().entrar("ana@exemplo.com", "segredo123");
    expect(s.email).toBe("ana@exemplo.com");
    expect(s.plano).toBe("premium");
    expect(s.token).toBeTruthy();
    expect(s.expiraEm).toBeGreaterThan(Date.now());
  });

  it("entrar devolve uma chaveDeEnvelope determinística — barata, nunca a derivação real", async () => {
    const r1 = await fake().entrar("ana@exemplo.com", "segredo123");
    const r2 = await fake().entrar("ana@exemplo.com", "segredo123");
    expect(r1.chaveDeEnvelope).toBeInstanceOf(Uint8Array);
    expect(r1.chaveDeEnvelope.length).toBe(32);
    expect(r1.chaveDeEnvelope).toEqual(r2.chaveDeEnvelope);
  });

  it("contas diferentes (ou senhas diferentes) têm chaveDeEnvelope diferente", async () => {
    const servico = new ServicoContaFake({
      "ana@exemplo.com": { senha: "segredo123", plano: "premium" },
      "bia@exemplo.com": { senha: "outrasenha1", plano: "gratis" },
    });
    const deAna = await servico.entrar("ana@exemplo.com", "segredo123");
    const deBia = await servico.entrar("bia@exemplo.com", "outrasenha1");
    expect(deAna.chaveDeEnvelope).not.toEqual(deBia.chaveDeEnvelope);
  });

  it("entrar com senha errada falha com código de credenciais", async () => {
    await expect(fake().entrar("ana@exemplo.com", "errada")).rejects.toThrow(
      expect.objectContaining({ codigo: "credenciais" }),
    );
  });

  it("entrar com email desconhecido dá o mesmo erro, para não revelar quem tem conta", async () => {
    await expect(fake().entrar("ninguem@exemplo.com", "qualquer")).rejects.toThrow(
      expect.objectContaining({ codigo: "credenciais" }),
    );
  });

  it("email é comparado sem diferenciar maiúscula", async () => {
    const { sessao: s } = await fake().entrar("ANA@Exemplo.com", "segredo123");
    expect(s.email).toBe("ana@exemplo.com");
  });

  it("criar conta nova devolve sessão no plano grátis", async () => {
    const { sessao: s } = await fake().criar("nova@exemplo.com", "outrasenha12");
    expect(s.plano).toBe("gratis");
  });

  it("criar conta com senha de 11 caracteres falha com senhaCurta", async () => {
    await expect(fake().criar("nova@exemplo.com", "onzeletras1")).rejects.toThrow(
      expect.objectContaining({ codigo: "senhaCurta" }),
    );
  });

  it("criar conta com email já usado falha", async () => {
    await expect(fake().criar("ana@exemplo.com", "outrasenha12")).rejects.toThrow(
      expect.objectContaining({ codigo: "emailEmUso" }),
    );
  });

  it("renovar token válido devolve sessão nova com validade esticada", async () => {
    const servico = fake();
    const { sessao: antiga } = await servico.entrar("ana@exemplo.com", "segredo123");
    const nova = await servico.renovar(antiga.token);
    expect(nova.email).toBe("ana@exemplo.com");
    expect(nova.expiraEm).toBeGreaterThanOrEqual(antiga.expiraEm);
  });

  it("renovar token desconhecido falha como sessão expirada", async () => {
    await expect(fake().renovar("tok-invalido")).rejects.toThrow(
      expect.objectContaining({ codigo: "expirada" }),
    );
  });

  it("sair invalida o token", async () => {
    const servico = fake();
    const { sessao: s } = await servico.entrar("ana@exemplo.com", "segredo123");
    await servico.sair(s.token);
    await expect(servico.renovar(s.token)).rejects.toThrow(
      expect.objectContaining({ codigo: "expirada" }),
    );
  });

  it("renovar token com prazo vencido falha como sessão expirada", async () => {
    const servico = fake();
    const { sessao: s } = await servico.entrar("ana@exemplo.com", "segredo123");
    servico.expirarAgoraParaTeste(s.token);
    await expect(servico.renovar(s.token)).rejects.toThrow(
      expect.objectContaining({ codigo: "expirada" }),
    );
  });

  it("sair com token já inválido não explode", async () => {
    await expect(fake().sair("tok-invalido")).resolves.toBeUndefined();
  });

  it("consultar devolve os dados sem trocar o token", async () => {
    const f = fake();
    const { sessao } = await f.entrar("ana@exemplo.com", "segredo123");
    const dados = await f.consultar(sessao.token);
    expect(dados).toEqual({ email: "ana@exemplo.com", plano: sessao.plano, expiraEm: sessao.expiraEm });
    await expect(f.consultar(sessao.token)).resolves.toBeDefined();
  });

  it("consultar com token desconhecido dá expirada", async () => {
    await expect(fake().consultar("tok-invalido")).rejects.toMatchObject({ codigo: "expirada" });
  });

  it("FalhaConta é Error e carrega o código", () => {
    const e = new FalhaConta("rede");
    expect(e).toBeInstanceOf(Error);
    expect(e.codigo).toBe("rede");
    expect(e.name).toBe("FalhaConta");
  });
});
