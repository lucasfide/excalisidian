// servidor/src/apagarConta.test.ts
// `excalisidian-admin apagar-conta` (LGPD art. 18, VI) e `acessos` (Marco Civil, art. 15):
// apagar leva sessões, vaults (metadados e arquivos) e créditos, e preserva os registros de
// acesso; `acessos` acha os registros de uma conta já apagada pelo e-mail guardado.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { abrirBanco, type BancoSqlite } from "./banco";
import { ArmazenamentoSqlite } from "./armazenamentoSync";
import { executarComando } from "./admin";
import { criarSessao } from "./sessao";
import { registrarAcesso } from "./registrosAcesso";

let pasta: string;
let banco: BancoSqlite;

function criarConta(email: string): number {
  const r = banco
    .prepare(`insert into contas (email, sal, hash, plano, criada_em) values (?, ?, ?, 'premium', ?)`)
    .run(email, Buffer.from("sal"), Buffer.from("hash"), Date.now());
  return Number(r.lastInsertRowid);
}

async function gravarVault(contaId: number, id: string, bytes: number[]): Promise<string> {
  const armazenamento = new ArmazenamentoSqlite(banco, pasta, contaId);
  await armazenamento.gravar({
    id,
    nomeCifrado: new Uint8Array([1]),
    envelope: new Uint8Array([2]),
    lotes: [{ sequencia: 1, bytes: new Uint8Array(bytes) }],
  });
  return (banco.prepare(`select caminho_arquivo as c from lotes where vault_id = ?`).get(id) as { c: string }).c;
}

function contar(tabela: string, onde = "1=1", ...args: unknown[]): number {
  return (banco.prepare(`select count(*) as n from ${tabela} where ${onde}`).get(...args) as { n: number }).n;
}

beforeEach(() => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), "excalisidian-apagarconta-"));
  banco = abrirBanco(pasta);
});

afterEach(() => {
  banco.close();
  fs.rmSync(pasta, { recursive: true, force: true });
});

describe("apagar-conta", () => {
  it("com --confirmar apaga sessões, vaults, arquivos e créditos e preserva os registros de acesso", async () => {
    const id = criarConta("ana@x.com");
    const outra = criarConta("bia@x.com");
    criarSessao(banco, id);
    criarSessao(banco, outra);
    const arquivoA = await gravarVault(id, "vault-a", [1, 2, 3]);
    const arquivoB = await gravarVault(id, "vault-b", [4, 5]);
    const arquivoOutra = await gravarVault(outra, "vault-outra", [9]);
    banco
      .prepare(`insert into uso_ia (conta_id, periodo, custo_micro_usd, pedidos) values (?, '2026-10', 5000, 3)`)
      .run(id);
    banco.prepare(`insert into uso_ia (conta_id, periodo, custo_micro_usd, pedidos) values (?, '2026-10', 1, 1)`).run(outra);
    registrarAcesso(banco, { id, email: "ana@x.com" }, "203.0.113.1", "entrar", Date.now());
    registrarAcesso(banco, { id, email: "ana@x.com" }, "203.0.113.1", "uso", Date.now());

    const saida = await executarComando(banco, pasta, ["apagar-conta", "Ana@X.com", "--confirmar"]);

    expect(saida).toContain("ana@x.com: conta apagada (2 vault(s), 5 bytes)");
    expect(saida).toContain("2 registro(s) de acesso mantido(s)");
    expect(saida).not.toContain("203.0.113.1");
    expect(contar("contas", "id = ?", id)).toBe(0);
    expect(contar("sessoes", "conta_id = ?", id)).toBe(0);
    expect(contar("vaults", "conta_id = ?", id)).toBe(0);
    expect(contar("lotes", "vault_id in ('vault-a','vault-b')")).toBe(0);
    expect(contar("uso_ia", "conta_id = ?", id)).toBe(0);
    expect(fs.existsSync(arquivoA)).toBe(false);
    expect(fs.existsSync(arquivoB)).toBe(false);
    expect(contar("registros_acesso", "email_conta = 'ana@x.com'")).toBe(2);

    // A outra conta fica intacta.
    expect(contar("contas", "id = ?", outra)).toBe(1);
    expect(contar("sessoes", "conta_id = ?", outra)).toBe(1);
    expect(contar("vaults", "conta_id = ?", outra)).toBe(1);
    expect(contar("uso_ia", "conta_id = ?", outra)).toBe(1);
    expect(fs.existsSync(arquivoOutra)).toBe(true);
  });

  it("sem --confirmar não apaga nada e diz o que apagaria, sem conteúdo", async () => {
    const id = criarConta("ana@x.com");
    await gravarVault(id, "vault-a", [1, 2, 3]);

    await expect(executarComando(banco, pasta, ["apagar-conta", "ana@x.com"])).rejects.toThrow(
      /1 vault\(s\) e 3 bytes.*--confirmar/,
    );
    expect(contar("contas")).toBe(1);
    expect(contar("vaults")).toBe(1);
  });

  it("e-mail inexistente e uso sem e-mail são erro", async () => {
    await expect(executarComando(banco, pasta, ["apagar-conta", "fantasma@x.com", "--confirmar"])).rejects.toThrow(
      /nao encontrado/,
    );
    await expect(executarComando(banco, pasta, ["apagar-conta"])).rejects.toThrow(/uso: excalisidian-admin apagar-conta/);
    await expect(executarComando(banco, pasta, ["apagar-conta", "--confirmar"])).rejects.toThrow(/uso:/);
  });

  it("conta sem vaults também apaga; repetir o comando depois dá erro de e-mail inexistente", async () => {
    criarConta("ana@x.com");
    const saida = await executarComando(banco, pasta, ["apagar-conta", "ana@x.com", "--confirmar"]);
    expect(saida).toContain("0 vault(s), 0 bytes");
    await expect(executarComando(banco, pasta, ["apagar-conta", "ana@x.com", "--confirmar"])).rejects.toThrow(
      /nao encontrado/,
    );
  });

  it("apagar com sessão renovada (sessões encadeadas) não falha", async () => {
    const id = criarConta("ana@x.com");
    const { token } = criarSessao(banco, id);
    const { renovarSessao } = await import("./sessao");
    expect(renovarSessao(banco, token)).toBeDefined();
    await executarComando(banco, pasta, ["apagar-conta", "ana@x.com", "--confirmar"]);
    expect(contar("sessoes")).toBe(0);
  });
});

describe("acessos", () => {
  const T1 = Date.UTC(2026, 8, 1, 10, 0, 0);
  const T2 = Date.UTC(2026, 9, 1, 15, 30, 0);
  const T3 = Date.UTC(2026, 9, 2, 8, 0, 0);

  it("lista os registros da conta, mesmo depois de ela ser apagada", async () => {
    const id = criarConta("ana@x.com");
    registrarAcesso(banco, { id, email: "ana@x.com" }, "203.0.113.1", "criar-conta", T1);
    registrarAcesso(banco, { id, email: "ana@x.com" }, "203.0.113.2", "entrar", T2);
    await executarComando(banco, pasta, ["apagar-conta", "ana@x.com", "--confirmar"]);

    const saida = await executarComando(banco, pasta, ["acessos", "Ana@X.com"]);

    expect(saida).toContain("ana@x.com — 2 registro(s), horario UTC");
    expect(saida).toContain("2026-09-01T10:00:00.000Z\t203.0.113.1\tcriar-conta");
    expect(saida).toContain("2026-10-01T15:30:00.000Z\t203.0.113.2\tentrar");
  });

  it("filtra por desde e ate (data inclui o dia inteiro; instante é exato)", async () => {
    const id = criarConta("ana@x.com");
    registrarAcesso(banco, { id, email: "ana@x.com" }, "203.0.113.1", "criar-conta", T1);
    registrarAcesso(banco, { id, email: "ana@x.com" }, "203.0.113.2", "entrar", T2);
    registrarAcesso(banco, { id, email: "ana@x.com" }, "203.0.113.3", "uso", T3);

    const soOutubro = await executarComando(banco, pasta, ["acessos", "ana@x.com", "2026-10-01", "2026-10-01"]);
    expect(soOutubro).toContain("203.0.113.2");
    expect(soOutubro).not.toContain("203.0.113.1");
    expect(soOutubro).not.toContain("203.0.113.3");

    const exato = await executarComando(banco, pasta, ["acessos", "ana@x.com", "2026-10-01T15:30:00Z", "2026-10-01T15:30:00Z"]);
    expect(exato).toContain("203.0.113.2");

    const aPartir = await executarComando(banco, pasta, ["acessos", "ana@x.com", "2026-10-02"]);
    expect(aPartir).toContain("203.0.113.3");
    expect(aPartir).not.toContain("203.0.113.2");
  });

  it("outra conta não aparece; sem registros devolve mensagem; sem e-mail ou data ruim são erro", async () => {
    const a = criarConta("ana@x.com");
    const b = criarConta("bia@x.com");
    registrarAcesso(banco, { id: a, email: "ana@x.com" }, "203.0.113.1", "entrar", T1);
    registrarAcesso(banco, { id: b, email: "bia@x.com" }, "203.0.113.9", "entrar", T1);

    expect(await executarComando(banco, pasta, ["acessos", "ana@x.com"])).not.toContain("203.0.113.9");
    expect(await executarComando(banco, pasta, ["acessos", "ninguem@x.com"])).toBe("nenhum registro de acesso.");
    await expect(executarComando(banco, pasta, ["acessos"])).rejects.toThrow(/uso: excalisidian-admin acessos/);
    await expect(executarComando(banco, pasta, ["acessos", "ana@x.com", "ontem"])).rejects.toThrow(/data invalida/);
  });
});
