# Contribuindo com o Excalisidian

## Pré-requisitos

Node 20+, Rust (via rustup), Visual Studio Build Tools com "Desktop development with C++",
WebView2 Runtime.

```
npm install
npm run tauri dev
```

## Antes de mexer no código

Leia, nesta ordem:

1. `docs/02-modelo-de-dados.md` — normativo. Formato dos arquivos, resolução de links.
2. `docs/05-arquitetura-e-stack.md` — stack e estrutura de pastas.
3. `docs/06-design-system.md` — normativo. Nenhuma cor, tamanho ou espaçamento fora dos
   tokens.
4. `docs/04-regras-de-negocio.md` — comportamento em erro e todos os textos de interface.

`CLAUDE.md`, na raiz, tem a lista completa de regras do projeto (nomes em português do
Brasil, nunca escrever direto no disco fora de `escritaAtomica.ts`, etc.).

## Antes de abrir um PR

```
npm run build
npm test
```

Os dois precisam passar. A CI roda a mesma coisa, mais `cargo check` no `src-tauri`.

## Releases

Só o mantenedor publica releases — veja o fluxo em
`docs/superpowers/specs/2026-09-04-github-release-e-autoupdate-design.md`.
