// servidor/src/admin.test.ts
// Testes de excalisidian-admin em processo, contra um banco temporário (mesmo padrão de
// app.test.ts): cria conta direto no banco (como a rota POST /v1/contas faria) e confere que
// `premium`/`gratis`/`contas` fazem o esperado, sem passar por HTTP nem por process.argv.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { abrirBanco, type BancoSqlite } from "./banco";
import { definirPlano, executarComando, listarContas } from "./admin";

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
      { email: "a@example.com", plano: "gratis", bytesUsados: 0 },
      { email: "b@example.com", plano: "premium", bytesUsados: 42 },
    ]);
    void idB;
  });

  it("banco sem contas devolve lista vazia", () => {
    expect(listarContas(banco)).toEqual([]);
  });
});

describe("executarComando", () => {
  it("premium <email> devolve uma linha de confirmação", () => {
    criarConta("alguem@example.com");
    expect(executarComando(banco, ["premium", "alguem@example.com"])).toBe("alguem@example.com: premium");
  });

  it("gratis <email> devolve uma linha de confirmação", () => {
    criarConta("alguem@example.com", "premium");
    expect(executarComando(banco, ["gratis", "alguem@example.com"])).toBe("alguem@example.com: gratis");
  });

  it("contas formata uma linha por conta com e-mail, plano e bytes", () => {
    criarConta("alguem@example.com", "premium");
    const saida = executarComando(banco, ["contas"]);
    expect(saida).toBe("alguem@example.com\tpremium\t0 bytes");
  });

  it("contas sem nenhuma conta devolve uma mensagem, não uma tabela vazia", () => {
    expect(executarComando(banco, ["contas"])).toBe("nenhuma conta.");
  });

  it("comando desconhecido é erro de uso", () => {
    expect(() => executarComando(banco, ["voar"])).toThrow(/uso: excalisidian-admin/);
  });

  it("premium sem e-mail é erro de uso", () => {
    expect(() => executarComando(banco, ["premium"])).toThrow(/uso: excalisidian-admin premium/);
  });

  it("nunca imprime sal, hash ou token — só e-mail e plano", () => {
    criarConta("segredo@example.com", "premium");
    const saida = executarComando(banco, ["contas"]);
    expect(saida).not.toMatch(/sal|hash/i);
  });
});
