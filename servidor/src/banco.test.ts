// servidor/src/banco.test.ts
// As migrações precisam ser idempotentes: abrir o mesmo banco duas vezes (processo de novo,
// ou o mesmo processo chamando abrirBanco/migrar outra vez) não pode dar erro nem duplicar
// nada.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { abrirBanco, migrar } from "./banco";

let pastaTemporaria: string;

beforeEach(() => {
  pastaTemporaria = fs.mkdtempSync(path.join(os.tmpdir(), "excalisidian-banco-"));
});

afterEach(() => {
  fs.rmSync(pastaTemporaria, { recursive: true, force: true });
});

describe("abrirBanco", () => {
  it("cria a tabela de versão e roda em modo WAL", () => {
    const db = abrirBanco(pastaTemporaria);

    const modo = db.pragma("journal_mode", { simple: true });
    expect(modo).toBe("wal");

    const linhas = db.prepare("select versao from migracoes_versao order by versao").all();
    expect(linhas).toEqual([{ versao: 1 }, { versao: 2 }, { versao: 3 }, { versao: 4 }, { versao: 5 }, { versao: 6 }, { versao: 7 }]);

    db.close();
  });

  it("migrar duas vezes no mesmo banco não dá erro nem duplica versões", () => {
    const db = abrirBanco(pastaTemporaria);

    expect(() => migrar(db)).not.toThrow();

    const linhas = db.prepare("select versao from migracoes_versao order by versao").all();
    expect(linhas).toEqual([{ versao: 1 }, { versao: 2 }, { versao: 3 }, { versao: 4 }, { versao: 5 }, { versao: 6 }, { versao: 7 }]);

    db.close();
  });

  it("migração 7 (registros de acesso) é aditiva: um banco na versão 6, com dados, ganha só a tabela nova", () => {
    const antigo = abrirBanco(pastaTemporaria);
    antigo
      .prepare(`insert into contas (email, sal, hash, plano, criada_em) values ('a@x.com', x'01', x'02', 'premium', 1)`)
      .run();
    antigo.exec(`drop table registros_acesso; delete from migracoes_versao where versao = 7;`);
    antigo.close();

    const novo = abrirBanco(pastaTemporaria);
    expect(novo.prepare(`select email, plano from contas`).all()).toEqual([{ email: "a@x.com", plano: "premium" }]);
    expect(novo.prepare(`select count(*) as n from registros_acesso`).get()).toEqual({ n: 0 });
    novo.close();
  });

  it("abrir o banco duas vezes (dois processos simulados) não dá erro", () => {
    const primeiro = abrirBanco(pastaTemporaria);
    primeiro.close();

    let segundo: ReturnType<typeof abrirBanco> | undefined;
    expect(() => {
      segundo = abrirBanco(pastaTemporaria);
    }).not.toThrow();
    segundo?.close();
  });
});
