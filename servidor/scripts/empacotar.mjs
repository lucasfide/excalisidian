// servidor/scripts/empacotar.mjs
// Empacota o servidor num arquivo só (servidor/dist/servidor.js) com esbuild. `better-sqlite3`
// fica externo (é um binário nativo, não dá para embutir) — o `dist/` na VPS precisa do
// `node_modules/better-sqlite3` ao lado (via `npm ci --omit=dev`, Task 7). O
// `src/sync/nucleoServidorSync.ts` da raiz é importado por caminho relativo em `app.ts`/rotas
// futuras (Tasks 4/5) e entra embutido no bundle, como qualquer outro módulo TypeScript.

import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raizServidor = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pastaDist = path.join(raizServidor, "dist");

await build({
  entryPoints: [path.join(raizServidor, "src", "principal.ts")],
  outfile: path.join(pastaDist, "servidor.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  // CJS: as próprias dependências (fastify/avvio) usam `require()` de módulos internos do
  // Node, e o shim que o esbuild gera para isso em saída ESM quebra em runtime ("Dynamic
  // require... is not supported"). servidor/package.json é "type": "module" (o pacote em si
  // usa import/export nos fontes), então dist/package.json abaixo diz ao Node que só o
  // bundle empacotado é CommonJS.
  format: "cjs",
  sourcemap: true,
  external: ["better-sqlite3"],
  logLevel: "info",
});

fs.writeFileSync(path.join(pastaDist, "package.json"), JSON.stringify({ type: "commonjs" }, null, 2) + "\n");
