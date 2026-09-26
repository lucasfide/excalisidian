// servidor/scripts/empacotar.mjs
// Empacota o servidor em dois arquivos com esbuild: servidor/dist/servidor.js (serviço HTTP,
// entra em src/principal.ts) e servidor/dist/admin.js (excalisidian-admin, entra em
// src/admin.ts — Task 6). `better-sqlite3` fica externo nos dois (é um binário nativo, não dá
// para embutir) — o `dist/` na VPS precisa do `node_modules/better-sqlite3` ao lado (via
// `npm ci --omit=dev`, Task 7). O `src/sync/nucleoServidorSync.ts` e `src/conta/*` da raiz são
// importados por caminho relativo e entram embutidos em cada bundle, como qualquer outro
// módulo TypeScript.

import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raizServidor = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pastaDist = path.join(raizServidor, "dist");

// CJS nos dois bundles: as próprias dependências (fastify/avvio, e tudo que elas arrastam) usam
// `require()` de módulos internos do Node, e o shim que o esbuild gera para isso em saída ESM
// quebra em runtime ("Dynamic require... is not supported"). servidor/package.json é
// "type": "module" (o pacote em si usa import/export nos fontes), então dist/package.json
// abaixo diz ao Node que só o que está em dist/ é CommonJS.
const opcoesComuns = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  external: ["better-sqlite3"],
  logLevel: "info",
};

await build({
  ...opcoesComuns,
  entryPoints: [path.join(raizServidor, "src", "principal.ts")],
  outfile: path.join(pastaDist, "servidor.js"),
});

await build({
  ...opcoesComuns,
  entryPoints: [path.join(raizServidor, "src", "admin.ts")],
  outfile: path.join(pastaDist, "admin.js"),
});

fs.writeFileSync(path.join(pastaDist, "package.json"), JSON.stringify({ type: "commonjs" }, null, 2) + "\n");
