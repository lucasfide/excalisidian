// servidor/src/banco.ts
// Abertura do SQLite (modo WAL) e migrações idempotentes controladas por uma tabela de
// versão. Nesta tarefa (Task 3) a única migração existente cria essa própria tabela — as
// tabelas de conta e de sincronização entram como novas migrações nas Tasks 4 e 5, sempre
// no fim da lista, nunca alterando as anteriores.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type BancoSqlite = InstanceType<typeof Database>;

type Migracao = (db: BancoSqlite) => void;

const TABELA_VERSAO = "migracoes_versao";

const MIGRACOES: readonly Migracao[] = [
  // Migração 1: só a tabela de versão (criada abaixo, antes do laço, porque o laço
  // depende dela para saber o que já rodou). Não há nada mais a fazer aqui.
  () => {},
  // Migração 2 (Task 4): contas e sessões. `email` já normalizado pelo servidor
  // (minúsculas, sem espaços — doc 18 §3) antes de chegar aqui; único garante que criar
  // conta com e-mail existente vira erro de constraint (mapeado para 409 nas rotas). `sal`
  // e `hash` são blobs do scrypt da prova de identidade (nunca a senha — ADR-39; nunca a
  // prova em texto — só o hash). `token_hash` guarda o SHA-256 do token de sessão, nunca o
  // token em si.
  (db) => {
    db.exec(`
      create table contas (
        id integer primary key autoincrement,
        email text not null unique,
        sal blob not null,
        hash blob not null,
        plano text not null default 'gratis',
        criada_em integer not null
      );
      create table sessoes (
        id integer primary key autoincrement,
        conta_id integer not null references contas(id) on delete cascade,
        token_hash text not null unique,
        expira_em integer not null
      );
      create index idx_sessoes_conta_id on sessoes(conta_id);
    `);
  },
];

export function abrirBanco(pastaDados: string): BancoSqlite {
  fs.mkdirSync(pastaDados, { recursive: true });
  const db = new Database(path.join(pastaDados, "excalisidian.db"));
  db.pragma("journal_mode = WAL");
  migrar(db);
  return db;
}

export function migrar(db: BancoSqlite): void {
  db.exec(`create table if not exists ${TABELA_VERSAO} (versao integer primary key)`);

  const linhas = db.prepare(`select versao from ${TABELA_VERSAO}`).all() as Array<{
    versao: number;
  }>;
  const aplicadas = new Set(linhas.map((linha) => linha.versao));

  const inserir = db.prepare(`insert into ${TABELA_VERSAO} (versao) values (?)`);

  MIGRACOES.forEach((aplicar, indice) => {
    const versao = indice + 1;
    if (aplicadas.has(versao)) return;
    aplicar(db);
    inserir.run(versao);
  });
}
