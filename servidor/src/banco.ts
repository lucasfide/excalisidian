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
