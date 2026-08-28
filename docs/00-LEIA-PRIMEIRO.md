# Excalisidian — pacote de especificação

Documentação escrita em 28/08/2026 para ser executada com Claude Code.

## O que é

Um aplicativo desktop local-first que junta duas coisas em um único vault de arquivos no disco:

- um editor de notas em Markdown com pastas, links entre notas, abas e divisão de tela (o lado "Obsidian");
- um canvas de desenho à mão livre com formas, conectores, post-its e imagens (o lado "Excalidraw").

O ponto do produto não é ter as duas coisas lado a lado. É que **desenho e nota são o mesmo tipo de objeto**: um desenho pode referenciar uma nota, uma nota pode embutir um desenho, e os dois vivem na mesma pasta, em arquivos de texto que você consegue abrir no Bloco de Notas e versionar no Git.

## Ordem de leitura

| Arquivo | O que tem dentro |
|---|---|
| `01-visao-de-produto.md` | Para quem é, o que é e o que explicitamente não é. Princípios que resolvem discussão. |
| `02-modelo-de-dados.md` | Vault, formato dos arquivos, schema do `.draw.md`, resolução de links, cache de metadados. **É o documento mais importante.** |
| `03-requisitos-mvp.md` | RF numerados, testáveis, agrupados por módulo, com prioridade. |
| `04-regras-de-negocio.md` | Comportamentos, casos de borda, o que acontece quando dá errado. |
| `05-arquitetura-e-stack.md` | Stack verificada com versões, estrutura de pastas, IPC, riscos técnicos. |
| `06-design-system.md` | Normativo. Tokens, tipografia, componentes, adaptação do design system do Taskly. |
| `07-prompt-claude-design.md` | Prompt pronto para colar no Claude Design e gerar as telas. |
| `08-roadmap.md` | Ordem de construção em fatias verticais, com critério de pronto por fatia. |
| `09-decisoes-e-incertezas.md` | ADRs curtos e — importante — a lista do que foi **verificado em fonte** e do que é **suposição minha**. |
| `CLAUDE.md` | vai na raiz do repositório, não em `docs/`. É o que o Claude Code lê primeiro. |
| `HANDOFF.md` | também na raiz. A Fatia 0 passo a passo, com comandos e código. É por onde a primeira sessão de código começa. |

## Como usar amanhã

1. Abra o Claude Code na pasta do projeto.
2. Copie estes arquivos para `docs/` no repositório.
3. Copie o `CLAUDE.md` do pacote para a raiz do repositório (não para `docs/`).
4. Copie o `HANDOFF.md` para a raiz também, e diga ao Claude Code para começar por ele. Ele conduz a Fatia 0 inteira — o passo com maior risco de travar o projeto, e onde mora o spike de desempenho do canvas.

## Aviso de honestidade

O `09-decisoes-e-incertezas.md` separa o que foi confirmado em documentação oficial do que é decisão de produto minha ou suposição, e registra o que duas revisões críticas consertaram. Leia antes de tratar qualquer número deste pacote como verdade. Onde eu não tinha certeza, está escrito que não tinha.
