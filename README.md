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

Projeto em desenvolvimento ativo (MVP). Espere bugs.

## Instalação

Baixe o instalador mais recente (`Excalisidian_x.y.z_x64-setup.exe`) em
[Releases](https://github.com/lucasfide/excalisidian/releases). O instalador ainda não é
assinado digitalmente: o Windows mostra "O Windows protegeu o computador" na primeira
instalação — clique em "Mais informações" e depois em "Executar assim mesmo".

## Atualizações

O app verifica sozinho se há uma versão nova ao abrir e avisa quando encontra. Também dá
para checar na hora pelo comando "Verificar atualizações" (`Ctrl+P`) ou em
Configurações → Atualizações.

## Contribuindo

Veja `CONTRIBUTING.md`.

## Licença

MIT — veja `LICENSE`. Licenças de terceiros embutidos em `THIRD_PARTY_LICENSES.md`.

## Documentação

`docs/00-LEIA-PRIMEIRO.md` é o índice. `docs/02-modelo-de-dados.md` e
`docs/06-design-system.md` são normativos. `CLAUDE.md` tem as regras do projeto.
