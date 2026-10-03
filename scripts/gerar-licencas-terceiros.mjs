// Gera a parte automática de THIRD_PARTY_LICENSES.md: texto de licença de todo pacote npm de
// produção e de toda crate Rust compilada no app. Reproduzível: rodar duas vezes não muda nada.
//
// Uso: npm run licencas   (Node 20+, sem dependência nova; precisa de `cargo` e de node_modules)
//
// Tudo que está acima do marcador de início é escrito à mão e nunca é tocado.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arquivoSaida = join(raiz, "THIRD_PARTY_LICENSES.md");
const MARCA_INICIO = "<!-- LICENCAS-GERADAS:INICIO (gerado por scripts/gerar-licencas-terceiros.mjs; não edite à mão) -->";
const MARCA_FIM = "<!-- LICENCAS-GERADAS:FIM -->";

// Alvos distribuídos (ver .github/workflows e tauri.*.conf.json).
const ALVOS_RUST = ["x86_64-pc-windows-msvc", "x86_64-unknown-linux-gnu", "aarch64-apple-darwin"];

const PERMISSIVAS = new Set(
  [
    "MIT", "MIT-0", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "Unlicense", "CC0-1.0",
    "Zlib", "BSL-1.0", "Unicode-3.0", "Unicode-DFS-2016", "Python-2.0", "BlueOak-1.0.0", "OFL-1.1",
    "CC-BY-4.0", "LLVM-exception", "CDLA-Permissive-2.0", "WTFPL", "Apache-2.0 WITH LLVM-exception",
  ].map((s) => s.toLowerCase()),
);

const ARQUIVO_LICENCA = /^(licen[sc]e|licen[sc]ing|copying|notice|unlicense|copyright)([-_. ].*)?$/i;

// ---------- utilitários ----------

function normalizarTexto(t) {
  return t.replace(/^﻿/, "").replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

function lerArquivosDeLicenca(pasta) {
  if (!existsSync(pasta)) return [];
  const achados = [];
  for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
    if (!entrada.isFile() || !ARQUIVO_LICENCA.test(entrada.name)) continue;
    if (/\.(js|mjs|cjs|ts|json|rs|png|svg)$/i.test(entrada.name)) continue;
    const texto = normalizarTexto(readFileSync(join(pasta, entrada.name), "utf8"));
    if (texto) achados.push({ nome: entrada.name, texto });
  }
  return achados.sort((a, b) => a.nome.localeCompare(b.nome, "en"));
}

function expressaoPermissiva(expr) {
  if (!expr) return false;
  if (expr.startsWith("MIT (inferida")) return true;
  const limpa = expr.replace(/[()]/g, " ").replace(/\//g, " OR ");
  return limpa.split(/\s+OR\s+/i).some((alt) =>
    alt.split(/\s+AND\s+/i).every((termo) => {
      const t = termo.trim().replace(/\s+WITH\s+/i, " WITH ").toLowerCase();
      if (PERMISSIVAS.has(t)) return true;
      return t.includes(" with ") && PERMISSIVAS.has(t.split(" with ")[0]);
    }),
  );
}

function fenceSegura(texto) {
  const maior = Math.max(0, ...(texto.match(/`+/g) ?? []).map((s) => s.length));
  return "`".repeat(Math.max(3, maior + 1));
}

// ---------- npm ----------

function coletarNpm() {
  const lock = JSON.parse(readFileSync(join(raiz, "package-lock.json"), "utf8"));
  const pacotes = lock.packages;

  function resolver(de, nome) {
    let base = de;
    for (;;) {
      const caminho = (base ? base + "/" : "") + "node_modules/" + nome;
      if (pacotes[caminho]) return caminho;
      if (!base) return null;
      const i = base.lastIndexOf("/node_modules/");
      base = i >= 0 ? base.slice(0, i) : base.startsWith("node_modules/") ? "" : "";
    }
  }

  const pai = new Map([["", null]]);
  const fila = [""];
  while (fila.length) {
    const atual = fila.shift();
    const p = pacotes[atual];
    const deps = {
      ...(p.dependencies ?? {}),
      ...(p.optionalDependencies ?? {}),
      ...(p.peerDependencies ?? {}),
    };
    for (const nome of Object.keys(deps).sort()) {
      const alvo = resolver(atual, nome);
      if (alvo && !pai.has(alvo)) {
        pai.set(alvo, atual);
        fila.push(alvo);
      }
    }
  }

  const nomeDe = (caminho) =>
    caminho === "" ? lock.name : (pacotes[caminho].name ?? caminho.split("node_modules/").pop());
  const cadeia = (caminho) => {
    const nomes = [];
    for (let c = caminho; c !== null; c = pai.get(c)) nomes.unshift(nomeDe(c));
    return nomes.join(" > ");
  };

  const saida = [];
  for (const caminho of [...pai.keys()].filter((c) => c !== "")) {
    const p = pacotes[caminho];
    const pasta = join(raiz, caminho);
    const pkgJson = existsSync(join(pasta, "package.json"))
      ? JSON.parse(readFileSync(join(pasta, "package.json"), "utf8"))
      : null;
    const lista = Array.isArray(pkgJson?.licenses) ? pkgJson.licenses.map((l) => l.type ?? l).join(" OR ") : null;
    let licenca =
      typeof pkgJson?.license === "string"
        ? pkgJson.license
        : pkgJson?.license?.type ?? lista ?? (typeof p.license === "string" ? p.license : null);
    const arquivos = pkgJson ? lerArquivosDeLicenca(pasta) : [];
    if (!licenca && arquivos.some((a) => /permission is hereby granted, free of charge/i.test(a.texto))) {
      licenca = "MIT (inferida do texto; o manifesto não declara)";
    }
    saida.push({
      origem: "npm",
      nome: nomeDe(caminho),
      versao: p.version,
      licenca,
      arquivos,
      instalado: pkgJson !== null,
      autoria: [typeof pkgJson?.author === "string" ? pkgJson.author : pkgJson?.author?.name, typeof pkgJson?.repository === "string" ? pkgJson.repository : pkgJson?.repository?.url].filter(Boolean).join("; "),
      cadeia: cadeia(caminho),
    });
  }
  return saida;
}

// ---------- Rust ----------

function coletarRust() {
  const pastaTauri = join(raiz, "src-tauri");
  const cargo = existsSync(join(homedir(), ".cargo", "bin", "cargo.exe"))
    ? join(homedir(), ".cargo", "bin", "cargo.exe")
    : existsSync(join(homedir(), ".cargo", "bin", "cargo"))
      ? join(homedir(), ".cargo", "bin", "cargo")
      : "cargo";

  // União dos alvos distribuídos; só dependências "normais" (as de build não vão no binário).
  const porId = new Map();
  const nos = new Map();
  let idRaiz = null;
  for (const alvo of ALVOS_RUST) {
    const bruto = execFileSync(
      cargo,
      ["metadata", "--format-version", "1", "--locked", "--filter-platform", alvo],
      { cwd: pastaTauri, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
    );
    const meta = JSON.parse(bruto);
    for (const p of meta.packages) porId.set(p.id, p);
    idRaiz = meta.resolve.root;
    for (const n of meta.resolve.nodes) {
      const atual = nos.get(n.id) ?? new Set();
      for (const d of n.deps) if (d.dep_kinds.some((k) => k.kind === null)) atual.add(d.pkg);
      nos.set(n.id, atual);
    }
  }

  const pai = new Map([[idRaiz, null]]);
  const fila = [idRaiz];
  while (fila.length) {
    const atual = fila.shift();
    const filhos = [...(nos.get(atual) ?? [])].sort((a, b) => porId.get(a).name.localeCompare(porId.get(b).name, "en"));
    for (const f of filhos) {
      if (!pai.has(f)) {
        pai.set(f, atual);
        fila.push(f);
      }
    }
  }

  const cadeia = (id) => {
    const nomes = [];
    for (let c = id; c !== null; c = pai.get(c)) nomes.unshift(porId.get(c).name);
    return nomes.join(" > ");
  };

  const saida = [];
  for (const id of pai.keys()) {
    const p = porId.get(id);
    if (p.source === null) continue; // crates do próprio workspace
    const pasta = dirname(p.manifest_path);
    saida.push({
      origem: "crate",
      nome: p.name,
      versao: p.version,
      licenca: p.license ?? (p.license_file ? `(arquivo: ${p.license_file})` : null),
      autoria: [...(p.authors ?? []), p.repository].filter(Boolean).join("; "),
      arquivos: lerArquivosDeLicenca(pasta),
      instalado: true,
      cadeia: cadeia(id),
    });
  }
  return saida;
}

// ---------- geração ----------

function gerar() {
  const todos = [...coletarNpm(), ...coletarRust()].sort(
    (a, b) => a.nome.localeCompare(b.nome, "en") || a.versao.localeCompare(b.versao, "en") || a.origem.localeCompare(b.origem),
  );

  const grupos = new Map(); // hash do texto -> { texto, nomesArquivo, pacotes }
  const semArquivo = [];
  for (const pkg of todos) {
    if (pkg.arquivos.length === 0) {
      semArquivo.push(pkg);
      continue;
    }
    for (const arq of pkg.arquivos) {
      const chave = createHash("sha256").update(arq.texto).digest("hex");
      const g = grupos.get(chave) ?? { texto: arq.texto, pacotes: [] };
      g.pacotes.push({ ...pkg, arquivoNome: arq.nome });
      grupos.set(chave, g);
    }
  }

  const listaGrupos = [...grupos.values()]
    .map((g) => ({
      ...g,
      // Mesmo pacote pode aparecer duas vezes só se tiver dois arquivos de texto idêntico: deduplica.
      pacotes: g.pacotes.filter(
        (p, i, arr) => arr.findIndex((q) => q.origem === p.origem && q.nome === p.nome && q.versao === p.versao) === i,
      ),
    }))
    .sort(
      (a, b) =>
        b.pacotes.length - a.pacotes.length ||
        a.pacotes[0].nome.localeCompare(b.pacotes[0].nome, "en") ||
        a.pacotes[0].versao.localeCompare(b.pacotes[0].versao, "en"),
    );

  const linhas = [];
  const rotulo = (p) => `${p.nome} ${p.versao}`;
  const npmN = todos.filter((p) => p.origem === "npm").length;
  const crateN = todos.filter((p) => p.origem === "crate").length;

  linhas.push("## Todas as dependências incluídas no app");
  linhas.push("");
  linhas.push(
    `Lista gerada por \`npm run licencas\` (\`scripts/gerar-licencas-terceiros.mjs\`): ${npmN} pacotes npm de ` +
      `produção (a partir de \`package-lock.json\`, só o que \`dependencies\` alcança) e ${crateN} crates Rust ` +
      "compiladas no binário (a partir de `Cargo.lock`, só dependências normais para Windows, Linux e macOS " +
      "Apple Silicon; crates do próprio Excalisidian ficam de fora). Pacotes cujo arquivo de licença " +
      "é idêntico foram agrupados: o texto aparece uma vez, com a lista de quem o usa. Cada aviso de " +
      "copyright distinto tem a sua própria seção. Os arquivos `NOTICE` (Apache-2.0) estão reproduzidos " +
      "como seções à parte.",
  );
  linhas.push("");

  let n = 0;
  for (const g of listaGrupos) {
    n += 1;
    const declaradas = [...new Set(g.pacotes.map((p) => p.licenca ?? "sem licença declarada"))].sort();
    const nomesArq = [...new Set(g.pacotes.map((p) => p.arquivoNome))].sort();
    linhas.push(`### ${n}. ${declaradas.join("; ")}`);
    linhas.push("");
    linhas.push(`Arquivo de origem: ${nomesArq.map((s) => `\`${s}\``).join(", ")}. Usado por:`);
    linhas.push("");
    for (const p of g.pacotes) linhas.push(`- ${rotulo(p)} (${p.origem})`);
    linhas.push("");
    const fence = fenceSegura(g.texto);
    linhas.push(fence);
    linhas.push(g.texto);
    linhas.push(fence);
    linhas.push("");
  }

  if (semArquivo.length) {
    linhas.push("### Pacotes sem arquivo de licença no pacote publicado");
    linhas.push("");
    linhas.push(
      "Estes pacotes declaram a licença abaixo no próprio manifesto, mas não trazem um arquivo de " +
        "texto de licença. Vale a licença declarada.",
    );
    linhas.push("");
    for (const p of semArquivo) {
      linhas.push(
        `- ${rotulo(p)} (${p.origem}): ${p.licenca ?? "sem licença declarada"}${p.autoria ? ` — ${p.autoria}` : ""}${p.instalado ? "" : " (não instalado nesta máquina)"}`,
      );
    }
    linhas.push("");
  }

  // Relatório para o console (não vai no arquivo).
  const naoPermissivas = todos.filter((p) => !expressaoPermissiva(p.licenca));
  console.log(`npm: ${npmN} pacotes; crates: ${crateN}; grupos de texto: ${listaGrupos.length}; sem arquivo: ${semArquivo.length}`);
  if (semArquivo.length) {
    console.log("Sem arquivo de licença:");
    for (const p of semArquivo) console.log(`  ${rotulo(p)} (${p.origem}) [${p.licenca ?? "sem licença"}]${p.instalado ? "" : " NÃO INSTALADO"}`);
  }
  if (naoPermissivas.length) {
    console.log("ATENÇÃO — licenças que não são claramente permissivas:");
    for (const p of naoPermissivas) console.log(`  ${rotulo(p)} (${p.origem}) [${p.licenca ?? "sem licença"}]  via ${p.cadeia}`);
  } else {
    console.log("Nenhuma licença não permissiva encontrada.");
  }

  return linhas.join("\n");
}

const atual = readFileSync(arquivoSaida, "utf8").replace(/\r\n/g, "\n");
const iInicio = atual.indexOf(MARCA_INICIO);
const iFim = atual.indexOf(MARCA_FIM);
if (iInicio >= 0 && iFim < iInicio) throw new Error("Marcador de fim antes do de início em THIRD_PARTY_LICENSES.md");
const topo = (iInicio >= 0 ? atual.slice(0, iInicio) : atual.replace(/\s+$/, "") + "\n\n").replace(/\n*$/, "\n\n");
const resto = iFim >= 0 ? atual.slice(iFim + MARCA_FIM.length) : "";
const novo = `${topo}${MARCA_INICIO}\n\n${gerar()}\n${MARCA_FIM}${resto.trim() ? "\n" + resto.replace(/^\n*/, "\n") : "\n"}`;
writeFileSync(arquivoSaida, novo, "utf8");
console.log(`Escrito ${arquivoSaida} (${Buffer.byteLength(novo)} bytes)`);
