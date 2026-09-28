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

# 1. SQLite: VACUUM INTO grava uma cópia consistente e compactada num arquivo novo — o
# processo do servidor pode continuar escrevendo no original o tempo todo. Passa os caminhos
# por variável de ambiente (não por interpolação de shell dentro do script Node) para não
# depender de escapar aspas.
script_node='
const Database = require(process.env.PASTA_APP + "/node_modules/better-sqlite3");
const db = new Database(process.env.PASTA_DADOS + "/excalisidian.db", { readonly: true, fileMustExist: true });
db.prepare("VACUUM INTO ?").run(process.env.DESTINO_DB);
db.close();
'
PASTA_APP="$PASTA_APP" PASTA_DADOS="$PASTA_DADOS" DESTINO_DB="${destino}/excalisidian.db" \
	/usr/bin/node -e "$script_node"

# 2. Pacotes: cópia recursiva da pasta de arquivos (metadados já estão no VACUUM INTO acima).
if [ -d "${PASTA_DADOS}/pacotes" ]; then
	cp -a "${PASTA_DADOS}/pacotes" "${destino}/pacotes"
fi

# 3. Retenção: apaga pastas de backup com mais de RETENCAO_DIAS dias (pelo horário em que
# foram criadas, não pelo nome — funciona mesmo que o relógio da VPS mude de fuso).
find "$PASTA_BACKUPS" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENCAO_DIAS}" -exec rm -rf -- {} +

echo "backup concluido em ${destino}"
