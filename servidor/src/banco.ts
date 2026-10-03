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
  // Migração 3 (Task 5): sincronização. `vaults` pertence a uma conta (`conta_id`); um vault
  // de outra conta simplesmente não aparece nas consultas escopadas por conta (nunca é 404
  // por checagem explícita — é 404 porque a linha nunca é encontrada, doc 17 §9/18). Os bytes
  // de cada pacote (lote ou parte de retrato) vivem em arquivo, sob
  // `<dados>/pacotes/<vault>/…`; `tamanho` aqui é o tamanho em bytes do pacote (o que conta
  // pra cota de 5 GiB, doc 18 §3) e `caminho_arquivo` é o caminho absoluto do arquivo no
  // disco — nunca o conteúdo. `ultimo_retrato` é a `ateSequencia` do retrato atual do vault (0
  // se nunca houve um) — o mesmo valor que `ResultadoBaixar.ultimoRetrato` expõe ao cliente.
  (db) => {
    db.exec(`
      create table vaults (
        id text primary key,
        conta_id integer not null references contas(id) on delete cascade,
        nome_cifrado blob not null,
        envelope blob not null,
        ultimo_retrato integer not null default 0
      );
      create index idx_vaults_conta_id on vaults(conta_id);

      create table lotes (
        id integer primary key autoincrement,
        vault_id text not null references vaults(id) on delete cascade,
        sequencia integer not null,
        tamanho integer not null,
        caminho_arquivo text not null,
        unique(vault_id, sequencia)
      );
      create index idx_lotes_vault_id on lotes(vault_id);

      create table retrato_partes (
        id integer primary key autoincrement,
        vault_id text not null references vaults(id) on delete cascade,
        ate_sequencia integer not null,
        indice integer not null,
        tamanho integer not null,
        caminho_arquivo text not null,
        unique(vault_id, indice)
      );
      create index idx_retrato_partes_vault_id on retrato_partes(vault_id);
    `);
  },
  // Migração 4 (Task 1 do plano "sincronização mais simples e duas correções"): tolerância a
  // `renovar` chamado várias vezes com o mesmo token (várias janelas/efeitos do app ao
  // reabrir). `substituida_por` aponta para a sessão nova criada por essa renovação;
  // `substituida_em` é quando isso aconteceu (epoch em ms, mesma unidade de `expira_em`). A
  // sessão antiga continua guardada só com `token_hash` — nunca em texto — mesmo depois de
  // substituída; ver sessao.ts para a janela de graça de 120 s e o cache em memória do token
  // novo (que este nunca vai para o banco).
  (db) => {
    db.exec(`
      alter table sessoes add column substituida_por integer references sessoes(id);
      alter table sessoes add column substituida_em integer;
    `);
  },
  // Migração 5 (Task 1, `excalisidian-admin vaults <email>`): "última atividade" por vault —
  // a última vez que `gravar` (armazenamentoSync.ts) escreveu um lote ou um retrato. `0` para
  // vaults já existentes antes desta migração (nunca teve gravação registrada) — o comando
  // mostra isso como nunca atualizado, sem inventar uma data.
  (db) => {
    db.exec(`alter table vaults add column atualizado_em integer not null default 0;`);
  },
  // Migração 6 (IA do Excalisidian, doc 18 §5.2): a faixa de IA da conta (`padrao` = 3.000
  // créditos/mês, `superior` = 10.000; as duas são "premium" para o resto do produto) e o uso
  // por conta e por mês civil de Brasília (`periodo` = "AAAA-MM"). Só números — nunca texto
  // de mensagem. `custo_micro_usd` é o custo real acumulado do fornecedor em micro-dólares
  // inteiros; os créditos saem dele (1 crédito = 1000 micro-dólares).
  (db) => {
    db.exec(`
      alter table contas add column faixa_ia text not null default 'padrao';
      create table uso_ia (
        conta_id integer not null references contas(id) on delete cascade,
        periodo text not null,
        custo_micro_usd integer not null default 0,
        pedidos integer not null default 0,
        tokens_entrada integer not null default 0,
        tokens_saida integer not null default 0,
        primary key (conta_id, periodo)
      );
    `);
  },
  // Migração 7 (Marco Civil da Internet, art. 15; doc 18 §1 e §4, ADR-46): registros de acesso,
  // guardados por 6 meses. Aditiva — só cria tabela e índices, nada do que já existe muda.
  // `conta_id` NÃO é chave estrangeira e `email_conta` repete o e-mail do momento do acesso, de
  // propósito: o registro precisa sobreviver à exclusão da conta (`apagar-conta`) e continuar
  // achável pelo e-mail para atender uma ordem judicial. `instante` é epoch UTC em ms.
  (db) => {
    db.exec(`
      create table registros_acesso (
        id integer primary key autoincrement,
        conta_id integer not null,
        email_conta text not null,
        ip text not null,
        instante integer not null,
        evento text not null check (evento in ('criar-conta', 'entrar', 'renovar', 'uso'))
      );
      create index idx_registros_acesso_instante on registros_acesso(instante);
      create index idx_registros_acesso_email on registros_acesso(email_conta, instante);
      create index idx_registros_acesso_uso on registros_acesso(conta_id, ip, evento, instante);
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
