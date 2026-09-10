// Sincroniza a versão nos três arquivos que a carregam: package.json, tauri.conf.json e
// Cargo.toml. Sem isso divergem e a comparação de versão do updater quebra (spec
// 2026-09-04). Uso: node scripts/lancar-versao.mjs 0.2.0

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function substituirVersaoEmJson(conteudo, novaVersao) {
  const dados = JSON.parse(conteudo);
  dados.version = novaVersao;
  return JSON.stringify(dados, null, 2) + "\n";
}

export function versaoDoCargoToml(conteudo, novaVersao) {
  return conteudo.replace(/^version = "[^"]*"/m, `version = "${novaVersao}"`);
}

const ALVOS = [
  { caminho: "package.json", transformar: substituirVersaoEmJson },
  { caminho: "src-tauri/tauri.conf.json", transformar: substituirVersaoEmJson },
  { caminho: "src-tauri/Cargo.toml", transformar: versaoDoCargoToml },
];

function main() {
  const novaVersao = process.argv[2];
  if (!novaVersao || !/^\d+\.\d+\.\d+$/.test(novaVersao)) {
    console.error("Uso: node scripts/lancar-versao.mjs <versão semver, ex.: 0.2.0>");
    process.exit(1);
  }

  for (const { caminho, transformar } of ALVOS) {
    const conteudo = readFileSync(caminho, "utf8");
    writeFileSync(caminho, transformar(conteudo, novaVersao));
  }

  console.log(`Versão sincronizada em ${novaVersao}. Agora:`);
  console.log(`  git commit -am "v${novaVersao}"`);
  console.log(`  git tag v${novaVersao}`);
  console.log(`  git push && git push --tags`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
