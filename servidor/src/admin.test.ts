// servidor/src/admin.test.ts
// Testes de excalisidian-admin em processo, contra um banco temporário (mesmo padrão de
// app.test.ts): cria conta direto no banco (como a rota POST /v1/contas faria) e confere que
// `premium`/`gratis`/`contas` fazem o esperado, sem passar por HTTP nem por process.argv.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { abrirBanco, type BancoSqlite } from "./banco";
import { ArmazenamentoSqlite } from "./armazenamentoSync";
import {
  apagarVaultDaConta,
  definirPlano,
  executarComando,
  listarContas,
  listarVaultsDaConta,
  usoDaConta,
} from "./admin";

let pastaTemporaria: string;
let banco: BancoSqlite;

function criarConta(email: string, plano: "gratis" | "premium" = "gratis"): number {
  const resultado = banco
    .prepare(`insert into contas (email, sal, hash, plano, criada_em) values (?, ?, ?, ?, ?)`)
    .run(email, Buffer.from("sal"), Buffer.from("hash"), plano, Date.now());
  return Number(resultado.lastInsertRowid);
}

beforeEach(() => {
  pastaTemporaria = fs.mkdtempSync(path.join(os.tmpdir(), "excalisidian-admin-"));
  banco = abrirBanco(pastaTemporaria);
});

afterEach(() => {
  banco.close();
  fs.rmSync(pastaTemporaria, { recursive: true, force: true });
});

describe("definirPlano", () => {
  it("premium troca o plano da conta existente", () => {
    criarConta("alguem@example.com", "gratis");

    const conta = definirPlano(banco, "alguem@example.com", "premium");

    expect(conta.plano).toBe("premium");
    const linha = banco.prepare(`select plano from contas where email = ?`).get("alguem@example.com") as {
      plano: string;
    };
    expect(linha.plano).toBe("premium");
  });

  it("gratis troca uma conta premium de volta", () => {
    criarConta("alguem@example.com", "premium");

    definirPlano(banco, "alguem@example.com", "gratis");

    const linha = banco.prepare(`select plano from contas where email = ?`).get("alguem@example.com") as {
      plano: string;
    };
    expect(linha.plano).toBe("gratis");
  });

  it("normaliza o e-mail (maiúsculas/espaços) antes de procurar", () => {
    criarConta("alguem@example.com", "gratis");

    const conta = definirPlano(banco, "  Alguem@Example.com  ", "premium");

    expect(conta.email).toBe("alguem@example.com");
  });

  it("e-mail inexistente é erro, não cria conta", () => {
    expect(() => definirPlano(banco, "fantasma@example.com", "premium")).toThrow(/nao encontrado/);
    const linhas = banco.prepare(`select count(*) as total from contas`).get() as { total: number };
    expect(linhas.total).toBe(0);
  });
});

describe("listarContas", () => {
  it("lista e-mail, plano e bytes usados, ordenado por e-mail", () => {
    const idA = criarConta("b@example.com", "premium");
    const idB = criarConta("a@example.com", "gratis");
    banco
      .prepare(`insert into vaults (id, conta_id, nome_cifrado, envelope) values (?, ?, ?, ?)`)
      .run("vault-a", idA, Buffer.from("n"), Buffer.from("e"));
    banco
      .prepare(`insert into lotes (vault_id, sequencia, tamanho, caminho_arquivo) values (?, ?, ?, ?)`)
      .run("vault-a", 1, 42, "/tmp/nao-importa");

    const linhas = listarContas(banco);

    expect(linhas).toEqual([
      { email: "a@example.com", plano: "gratis", faixa: "padrao", bytesUsados: 0 },
      { email: "b@example.com", plano: "premium", faixa: "padrao", bytesUsados: 42 },
    ]);
    void idB;
  });

  it("banco sem contas devolve lista vazia", () => {
    expect(listarContas(banco)).toEqual([]);
  });
});

describe("executarComando", () => {
  it("premium <email> devolve uma linha de confirmação", async () => {
    criarConta("alguem@example.com");
    await expect(executarComando(banco, pastaTemporaria, ["premium", "alguem@example.com"])).resolves.toBe(
      "alguem@example.com: premium (3000 creditos/mes)",
    );
  });

  it("gratis <email> devolve uma linha de confirmação", async () => {
    criarConta("alguem@example.com", "premium");
    await expect(executarComando(banco, pastaTemporaria, ["gratis", "alguem@example.com"])).resolves.toBe(
      "alguem@example.com: gratis",
    );
  });

  it("contas formata uma linha por conta com e-mail, plano e bytes", async () => {
    criarConta("alguem@example.com", "premium");
    const saida = await executarComando(banco, pastaTemporaria, ["contas"]);
    expect(saida).toBe("alguem@example.com\tpremium\tpadrao\t0 bytes");
  });

  it("contas sem nenhuma conta devolve uma mensagem, não uma tabela vazia", async () => {
    await expect(executarComando(banco, pastaTemporaria, ["contas"])).resolves.toBe("nenhuma conta.");
  });

  it("comando desconhecido é erro de uso", async () => {
    await expect(executarComando(banco, pastaTemporaria, ["voar"])).rejects.toThrow(/uso: excalisidian-admin/);
  });

  it("premium sem e-mail é erro de uso", async () => {
    await expect(executarComando(banco, pastaTemporaria, ["premium"])).rejects.toThrow(
      /uso: excalisidian-admin premium/,
    );
  });

  it("nunca imprime sal, hash ou token — só e-mail e plano", async () => {
    criarConta("segredo@example.com", "premium");
    const saida = await executarComando(banco, pastaTemporaria, ["contas"]);
    expect(saida).not.toMatch(/sal|hash/i);
  });
});

describe("listarVaultsDaConta", () => {
  it("lista id, bytes, lotes e última atividade dos vaults da conta", async () => {
    const contaId = criarConta("dona@example.com");
    const armazenamento = new ArmazenamentoSqlite(banco, pastaTemporaria, contaId);
    await armazenamento.gravar({
      id: "vault-1",
      nomeCifrado: new Uint8Array([1]),
      envelope: new Uint8Array([2]),
      lotes: [{ sequencia: 1, bytes: new Uint8Array([9, 9]) }],
    });

    const linhas = listarVaultsDaConta(banco, "dona@example.com");

    expect(linhas).toHaveLength(1);
    expect(linhas[0].id).toBe("vault-1");
    expect(linhas[0].bytesUsados).toBe(2);
    expect(linhas[0].lotes).toBe(1);
    expect(linhas[0].ultimaAtividade).toBeGreaterThan(0);
  });

  it("vault de outra conta não aparece", async () => {
    criarConta("dona@example.com");
    const outraContaId = criarConta("outra@example.com");
    const armazenamento = new ArmazenamentoSqlite(banco, pastaTemporaria, outraContaId);
    await armazenamento.gravar({
      id: "vault-da-outra",
      nomeCifrado: new Uint8Array([1]),
      envelope: new Uint8Array([2]),
      lotes: [],
    });

    expect(listarVaultsDaConta(banco, "dona@example.com")).toEqual([]);
  });

  it("e-mail sem conta é erro", () => {
    expect(() => listarVaultsDaConta(banco, "fantasma@example.com")).toThrow(/nao encontrado/);
  });

  it("nunca inclui o nome cifrado do vault — o servidor não consegue abrir", async () => {
    const contaId = criarConta("dona@example.com");
    const armazenamento = new ArmazenamentoSqlite(banco, pastaTemporaria, contaId);
    await armazenamento.gravar({
      id: "vault-1",
      nomeCifrado: new Uint8Array([1, 2, 3]),
      envelope: new Uint8Array([4, 5, 6]),
      lotes: [],
    });

    const linhas = listarVaultsDaConta(banco, "dona@example.com");

    expect(Object.keys(linhas[0]).sort()).toEqual(["bytesUsados", "id", "lotes", "ultimaAtividade"]);
  });
});

describe("apagarVaultDaConta", () => {
  it("apaga metadados e arquivos do vault da conta", async () => {
    const contaId = criarConta("dona@example.com");
    const armazenamento = new ArmazenamentoSqlite(banco, pastaTemporaria, contaId);
    await armazenamento.gravar({
      id: "vault-1",
      nomeCifrado: new Uint8Array([1]),
      envelope: new Uint8Array([2]),
      lotes: [{ sequencia: 1, bytes: new Uint8Array([9, 9]) }],
    });
    const caminhoLote = (
      banco.prepare(`select caminho_arquivo as caminho from lotes where vault_id = ?`).get("vault-1") as {
        caminho: string;
      }
    ).caminho;
    expect(fs.existsSync(caminhoLote)).toBe(true);

    await apagarVaultDaConta(banco, pastaTemporaria, "dona@example.com", "vault-1");

    const linha = banco.prepare(`select id from vaults where id = ?`).get("vault-1");
    expect(linha).toBeUndefined();
    expect(fs.existsSync(caminhoLote)).toBe(false);
  });

  it("vault de outra conta não é apagado — erro, sem tocar em nada", async () => {
    criarConta("dona@example.com");
    const outraContaId = criarConta("outra@example.com");
    const armazenamento = new ArmazenamentoSqlite(banco, pastaTemporaria, outraContaId);
    await armazenamento.gravar({
      id: "vault-da-outra",
      nomeCifrado: new Uint8Array([1]),
      envelope: new Uint8Array([2]),
      lotes: [],
    });

    await expect(apagarVaultDaConta(banco, pastaTemporaria, "dona@example.com", "vault-da-outra")).rejects.toThrow(
      /nao encontrado/,
    );

    const linha = banco.prepare(`select id from vaults where id = ?`).get("vault-da-outra");
    expect(linha).toBeDefined();
  });

  it("e-mail sem conta é erro", async () => {
    await expect(apagarVaultDaConta(banco, pastaTemporaria, "fantasma@example.com", "vault-1")).rejects.toThrow(
      /nao encontrado/,
    );
  });

  it("vault inexistente (mesmo com conta certa) é erro", async () => {
    criarConta("dona@example.com");
    await expect(apagarVaultDaConta(banco, pastaTemporaria, "dona@example.com", "vault-fantasma")).rejects.toThrow(
      /vault nao encontrado/,
    );
  });

  it("excalisidian-admin apagar-vault <email> <id> pelo executarComando", async () => {
    const contaId = criarConta("dona@example.com");
    const armazenamento = new ArmazenamentoSqlite(banco, pastaTemporaria, contaId);
    await armazenamento.gravar({
      id: "vault-1",
      nomeCifrado: new Uint8Array([1]),
      envelope: new Uint8Array([2]),
      lotes: [],
    });

    const saida = await executarComando(banco, pastaTemporaria, ["apagar-vault", "dona@example.com", "vault-1"]);

    expect(saida).toBe("dona@example.com: vault vault-1 apagado");
    const linha = banco.prepare(`select id from vaults where id = ?`).get("vault-1");
    expect(linha).toBeUndefined();
  });

  it("excalisidian-admin vaults <email> pelo executarComando", async () => {
    const contaId = criarConta("dona@example.com");
    const armazenamento = new ArmazenamentoSqlite(banco, pastaTemporaria, contaId);
    await armazenamento.gravar({
      id: "vault-1",
      nomeCifrado: new Uint8Array([1]),
      envelope: new Uint8Array([2]),
      lotes: [{ sequencia: 1, bytes: new Uint8Array([1, 2, 3, 4]) }],
    });

    const saida = await executarComando(banco, pastaTemporaria, ["vaults", "dona@example.com"]);

    expect(saida).toMatch(/^vault-1\t4 bytes\t1 lotes\t\d+$/);
  });

  it("excalisidian-admin vaults <email> sem vaults devolve uma mensagem", async () => {
    criarConta("dona@example.com");
    const saida = await executarComando(banco, pastaTemporaria, ["vaults", "dona@example.com"]);
    expect(saida).toBe("nenhum vault.");
  });
});

describe("faixa de IA e uso", () => {
  const AGORA = Date.UTC(2026, 8, 28, 12, 0, 0);
  const pasta = () => pastaTemporaria;

  beforeEach(() => {
    criarConta("a@x.com");
  });

  it("premium põe a faixa padrão; superior põe premium com faixa superior; gratis volta à padrão", async () => {
    await executarComando(banco, pasta(), ["superior", "a@x.com"], AGORA);
    expect(banco.prepare(`select plano, faixa_ia as faixa from contas where email = 'a@x.com'`).get()).toEqual({
      plano: "premium",
      faixa: "superior",
    });
    await executarComando(banco, pasta(), ["premium", "a@x.com"], AGORA);
    expect(banco.prepare(`select faixa_ia as faixa from contas where email = 'a@x.com'`).get()).toEqual({ faixa: "padrao" });
    await executarComando(banco, pasta(), ["superior", "a@x.com"], AGORA);
    await executarComando(banco, pasta(), ["gratis", "a@x.com"], AGORA);
    expect(banco.prepare(`select plano, faixa_ia as faixa from contas where email = 'a@x.com'`).get()).toEqual({
      plano: "gratis",
      faixa: "padrao",
    });
  });

  it("contas mostra a faixa", async () => {
    await executarComando(banco, pasta(), ["superior", "a@x.com"], AGORA);
    expect(await executarComando(banco, pasta(), ["contas"], AGORA)).toContain("a@x.com\tpremium\tsuperior\t");
  });

  it("uso mostra o mês atual: créditos, pedidos, tokens e custo em US$", async () => {
    const conta = banco.prepare(`select id from contas where email = 'a@x.com'`).get() as { id: number };
    banco
      .prepare(`insert into uso_ia (conta_id, periodo, custo_micro_usd, pedidos, tokens_entrada, tokens_saida) values (?, '2026-09', 1234567, 42, 900000, 80000)`)
      .run(conta.id);
    expect(usoDaConta(banco, "a@x.com", AGORA)).toEqual({
      periodo: "2026-09",
      usados: 1235,
      total: 3000,
      pedidos: 42,
      tokensEntrada: 900000,
      tokensSaida: 80000,
      custoUsd: 1.234567,
    });
    const texto = await executarComando(banco, pasta(), ["uso", "a@x.com"], AGORA);
    expect(texto).toContain("2026-09");
    expect(texto).toContain("1235/3000");
    expect(texto).toContain("US$ 1.2346");
  });

  it("uso de conta sem nenhum pedido no mês mostra zeros, não erro", () => {
    expect(usoDaConta(banco, "a@x.com", AGORA)).toMatchObject({ usados: 0, pedidos: 0, custoUsd: 0 });
  });

  it("uso e superior com e-mail inexistente são erro", async () => {
    await expect(executarComando(banco, pasta(), ["uso", "ninguem@x.com"], AGORA)).rejects.toThrow("e-mail nao encontrado");
    await expect(executarComando(banco, pasta(), ["superior", "ninguem@x.com"], AGORA)).rejects.toThrow("e-mail nao encontrado");
  });
});
