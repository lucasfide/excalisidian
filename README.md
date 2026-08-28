# Excalisidian

App desktop local-first para Windows: notas em Markdown com live preview e canvas de
desenho, no mesmo vault de arquivos no disco. Sem servidor, sem conta, sem plugin.

## Stack

Tauri v2 · Vite · React 19 · TypeScript · CodeMirror 6 · `@excalidraw/excalidraw` 0.18.1 ·
dockview · Tailwind v4 · zustand. Versões fixadas em `docs/05-arquitetura-e-stack.md`.

## Desenvolvimento

Pré-requisitos: Node 20+, Rust (rustup), Visual Studio Build Tools com "Desktop development
with C++", WebView2 Runtime.

```
npm install          # roda o postinstall que copia as fontes do Excalidraw para public/
npm run tauri dev
npm run tauri build
npm test
```

## Documentação

`docs/00-LEIA-PRIMEIRO.md` é o índice. `docs/02-modelo-de-dados.md` e
`docs/06-design-system.md` são normativos. `CLAUDE.md` tem as regras do projeto.
