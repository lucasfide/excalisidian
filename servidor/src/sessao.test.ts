// servidor/src/sessao.test.ts
// `criarSessao` roda a cada entrar/renovar. Sessões vencidas da mesma conta nunca são
// usadas de novo (resolverSessao já ignora `expira_em` no passado) — mas, sem limpeza,
// elas ficam acumulando linhas na tabela `sessoes` para sempre. Este teste prova que criar
// uma sessão nova também apaga as vencidas da mesma conta, sem precisar de cron.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { abrirBanco, type BancoSqlite } from "./banco";
import { criarSessao, hashToken } from "./sessao";

let pastaTemporaria: string;
let banco: BancoSqlite;
let contaId: number;

beforeEach(() => {
  pastaTemporaria = fs.mkdtempSync(path.join(os.tmpdir(), "excalisidian-sessao-"));
  banco = abrirBanco(pastaTemporaria);
  const resultado = banco
    .prepare(
      `insert into contas (email, sal, hash, plano, criada_em) values ('conta@teste.com', x'00', x'00', 'gratis', ?)`,
    )
    .run(Date.now());
  contaId = Number(resultado.lastInsertRowid);
});

afterEach(() => {
  banco.close();
  fs.rmSync(pastaTemporaria, { recursive: true, force: true });
});

describe("criarSessao", () => {
  it("apaga as sessões já vencidas da mesma conta ao criar uma nova", () => {
    // Sessão vencida inserida direto no banco — como se tivesse sido criada há mais de 30
    // dias e nunca renovada nem apagada.
    banco
      .prepare(`insert into sessoes (conta_id, token_hash, expira_em) values (?, ?, ?)`)
      .run(contaId, hashToken("token-vencido"), Date.now() - 1_000);

    criarSessao(banco, contaId);

    const linhas = banco.prepare(`select token_hash from sessoes where conta_id = ?`).all(contaId) as Array<{
      token_hash: string;
    }>;
    expect(linhas).toHaveLength(1);
    expect(linhas[0].token_hash).not.toBe(hashToken("token-vencido"));
  });

  it("não apaga sessões de outra conta", () => {
    const outraConta = banco
      .prepare(
        `insert into contas (email, sal, hash, plano, criada_em) values ('outra@teste.com', x'00', x'00', 'gratis', ?)`,
      )
      .run(Date.now());
    const outraContaId = Number(outraConta.lastInsertRowid);
    banco
      .prepare(`insert into sessoes (conta_id, token_hash, expira_em) values (?, ?, ?)`)
      .run(outraContaId, hashToken("token-de-outra-conta-vencido"), Date.now() - 1_000);

    criarSessao(banco, contaId);

    const linhaDaOutra = banco
      .prepare(`select token_hash from sessoes where conta_id = ?`)
      .get(outraContaId) as { token_hash: string } | undefined;
    expect(linhaDaOutra?.token_hash).toBe(hashToken("token-de-outra-conta-vencido"));
  });
});
