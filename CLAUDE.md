# Excalisidian

App desktop local-first: notas em Markdown + canvas de desenho no mesmo vault de arquivos.

## Comece aqui

Se o projeto ainda não tem código rodando, leia **`HANDOFF.md`** primeiro: ele tem a Fatia 0 passo a passo, os comandos, o código Rust do acesso ao vault e as quatro perguntas a fazer antes de começar.

## Antes de escrever qualquer código

Leia, nesta ordem:

1. `docs/02-modelo-de-dados.md` — **normativo.** Formato dos arquivos, resolução de links, escrita em disco. Nada no disco pode divergir deste documento.
2. `docs/05-arquitetura-e-stack.md` — stack, versões fixadas, estrutura de pastas, ponte com o Rust.
3. `docs/06-design-system.md` — **normativo.** Nenhum valor visual pode ser inventado: se uma cor, um tamanho ou um espaçamento não estiver lá, pergunte antes de escolher.
4. `docs/04-regras-de-negocio.md` — comportamento em caso de erro e todos os textos de interface.
5. `docs/09-decisoes-e-incertezas.md` — o que foi verificado e o que é suposição. Leia antes de confiar em qualquer número.

`docs/03-requisitos-mvp.md` tem os RF numerados. `docs/08-roadmap.md` tem a ordem de construção em fatias verticais — siga a ordem.

## Regras do projeto

- Português do Brasil em nomes de arquivo, componentes, variáveis e comentários, seguindo o que já está em `docs/05`.
- Interface em português do Brasil, sentence case, sem emoji.
- Nenhum valor de cor, fonte, espaçamento, raio ou sombra fora dos tokens de `globals.css`.
- Nenhuma classe de cor padrão do Tailwind (`bg-background`, `text-foreground`, `border-input`).
- Toda gravação em disco passa por `escritaAtomica.ts`. Nunca chame `writeTextFile` direto.
- Cores do canvas saem de `canvas/paletaCanvas.ts`, que lê os tokens CSS. Nunca hex literal no TypeScript.
- Toda leitura e escrita de arquivo do vault passa por `VaultAdapter`.
- Caminhos internos sempre com `/` e normalizados com `.normalize("NFC")`.
- `@excalidraw/excalidraw` fica pinado em 0.18.1. Não atualize sem uma tarefa dedicada.
- Desenhos são `.draw.md`. A extensão `.excalidraw` não é usada em lugar nenhum do produto.
- O identificador do app (`excalisidian`) sai de uma constante única `APP_ID`, usada pela chave de frontmatter, pela pasta de config do vault e pela extensão temporária. O nome do produto ainda não está fechado — ver ADR-9.
- Ao terminar uma fatia do roadmap, rode os testes mínimos da seção 10 do `docs/05`.

## Comandos

```
npm run tauri dev
npm run tauri build
npm test
```
