#!/usr/bin/env bash
# servidor/implantacao/backup.sh
# Backup diário (doc 18 §4): cópia consistente do SQLite (VACUUM INTO, nunca uma cópia bruta
# do arquivo — evita pegar o banco em meio a uma escrita) e cópia dos pacotes de
# sincronização, para /var/backups/excalisidian/<data>/. Mantém 7 dias; mais antigo que isso
# é apagado. Instalação e o timer que dispara isto às 03:00: ver servidor/LEIAME.md e
# excalisidian-backup.service/.timer, neste diretório.
#
# É no mesmo disco da VPS — protege contra erro de software (migração ruim, bug de gravação),
# não contra perder a VPS inteira. Cópia fora da VPS é pendência declarada (ADR-41).
set -euo pipefail

PASTA_APP="/opt/excalisidian"
PASTA_DADOS="/var/lib/excalisidian"
PASTA_BACKUPS="/var/backups/excalisidian"
RETENCAO_DIAS=7

data="$(date +%Y-%m-%d_%H%M%S)"
destino="${PASTA_BACKUPS}/${data}"

mkdir -p "$destino"

# O bloqueio de escrita do SQLite cobre o VACUUM INTO e um espelho temporário de hard links
# dos pacotes. Após liberar a trava, a cópia dos bytes é feita a partir desse espelho: um
# retrato novo pode apagar o arquivo original, mas o hard link mantém seus bytes disponíveis.
# Assim o backup permanece consistente sem pausar as escritas durante toda a cópia de arquivos.
script_node='
const Database = require(process.env.PASTA_APP + "/node_modules/better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");
const origemDb = path.join(process.env.PASTA_DADOS, "excalisidian.db");
const db = new Database(origemDb, { fileMustExist: true });
db.pragma("busy_timeout = 30000");
const pacotes = path.join(process.env.PASTA_DADOS, "pacotes");
const espelho = fs.mkdtempSync(path.join(process.env.PASTA_DADOS, ".backup-pacotes-"));
let tinhaPacotes = false;
function criarLinks(origem, destino) {
  fs.mkdirSync(destino, { recursive: true });
  for (const entrada of fs.readdirSync(origem, { withFileTypes: true })) {
    const arquivo = path.join(origem, entrada.name);
    const copia = path.join(destino, entrada.name);
    if (entrada.isDirectory()) criarLinks(arquivo, copia);
    else if (entrada.isFile()) fs.linkSync(arquivo, copia);
    else throw new Error("tipo de arquivo inesperado nos pacotes do backup");
  }
}
try {
  db.exec("BEGIN IMMEDIATE");
  try {
    const leitura = new Database(origemDb, { readonly: true, fileMustExist: true });
    try {
      leitura.prepare("VACUUM INTO ?").run(process.env.DESTINO_DB);
    } finally {
      leitura.close();
    }
    tinhaPacotes = fs.existsSync(pacotes);
    if (tinhaPacotes) criarLinks(pacotes, espelho);
    db.exec("COMMIT");
  } catch (erro) {
    db.exec("ROLLBACK");
    throw erro;
  }
  if (tinhaPacotes) fs.cpSync(espelho, path.join(process.env.DESTINO, "pacotes"), { recursive: true });
} finally {
  db.close();
  fs.rmSync(espelho, { recursive: true, force: true });
}
'
PASTA_APP="$PASTA_APP" PASTA_DADOS="$PASTA_DADOS" DESTINO="$destino" DESTINO_DB="${destino}/excalisidian.db" \
	/usr/bin/node -e "$script_node"

# Retenção: apaga pastas de backup com mais de RETENCAO_DIAS dias (pelo horário em que
# foram criadas, não pelo nome — funciona mesmo que o relógio da VPS mude de fuso).
find "$PASTA_BACKUPS" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENCAO_DIAS}" -exec rm -rf -- {} +

echo "backup concluido em ${destino}"
