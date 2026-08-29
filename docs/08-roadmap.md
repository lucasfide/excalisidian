# 08 — Roadmap de construção

Fatias verticais. Cada uma termina em algo que dá para usar. Não pule a ordem — a primeira existe justamente porque é a que mais trava projeto.

## Status em 29/08/2026 (revisão de merge)

**Fatias 0 a 7: concluídas e verificadas** (código + testes conferidos arquivo por arquivo,
não só pelo histórico do Git). Cada uma teve pelo menos um desvio de decisão registrado no
`docs/09` ao longo do caminho — nenhuma mudou de escopo, mas várias tiveram a implementação
corrigida depois de testada em tela (ver a lista de ADRs abaixo).

**Fatia 8: parcialmente concluída nesta revisão.** Feito: quick switcher, paleta de comandos,
persistência de tema, e o "Mover para..." de acessibilidade. Pendente: busca por conteúdo,
lixeira, e o restante das mensagens de erro/estados vazios do doc 04 §10 — ver o detalhamento
na seção da própria Fatia 8, abaixo.

**Fora do roadmap original, decidido e construído no meio do caminho** (não estava em nenhuma
fatia, entrou por pedido direto do usuário depois de testar o app em tela):

- **Tela de início** (`TelaInicio`/`PainelInicio`): aba fixa com saudação, atalhos de pasta e
  criar nota/desenho/pasta, acessível por um ícone fixo à esquerda de todas as abas. Ver
  doc 06 (componente `TelaInicio`) e doc 09 ADR-16.
- **Nome do arquivo e H1 da nota sincronizam nos dois sentidos** (doc 04 §3.1, doc 09
  ADR-14/15): editar um edita o outro; nome duplicado nunca mais recusa, sempre numera.
- **Correção de fundo no canvas**: o Excalidraw tem o próprio mecanismo de tema escuro (um
  filtro CSS de inversão), que colidia com a paleta própria do produto — corrigido, com as
  cores dos elementos agora acompanhando a troca de tema (doc 09 ADR-11/12).
- **Split de um arquivo já aberto**: a segunda vista abre travada pra edição, pra não perder
  conteúdo silenciosamente (doc 09 ADR-13) — sincronizar as duas vistas de verdade ainda não
  existe, ver a limitação registrada lá.

---

## Fatia 0 — Andaime e acesso ao disco

**Por que primeiro:** no Tauri v2 o diálogo de escolher pasta **não concede** permissão de filesystem ao caminho escolhido, e o escopo concedido em runtime não sobrevive ao reinício. Se isso não estiver resolvido, nada mais funciona.

- Projeto Tauri v2 + Vite + React + TypeScript rodando no Windows.
- Comando Rust `escolher_vault`: diálogo de pasta, `allow_directory`, devolve o caminho.
- Comando Rust `permitir_vault`: reaplica o escopo no boot a partir do caminho salvo.
- `plugin-store` guardando o último vault.
- Comando Rust `walk_vault` devolvendo `[{path, mtimeMs, size, isDir}]`.
- Tokens do design system no `globals.css` — incluindo os 14 tokens de canvas (`--color-traco-*`, `--color-fundo-*`, `--color-postit-*`) e as sombras do tema escuro. Fontes do app empacotadas em `public/fontes/`.
- **Spike de risco, meio dia:** montar o Excalidraw numa página vazia com uma cena de 500 elementos e medir pan e zoom no WebView2. Não é a Fatia 6 — é agora, porque é a medição que pode mudar decisões de arquitetura.

**Pronto quando:** o app abre, pede a pasta uma vez, nas próximas aberturas lista os arquivos sem pedir nada, e o número do spike do canvas está anotado.

---

## Fatia 1 — Ler e escrever uma nota

- `VaultAdapter` com a implementação Tauri.
- Escrita atômica (`.excalisidian-tmp` + rename) e o mapa anti-loop.
- Sidebar com a árvore de arquivos (sem arrastar ainda), virtualizada.
- Uma aba só, sem dockview: abre a nota num CodeMirror com markdown básico.
- Autosave com debounce de 800 ms + flush no blur e no fechamento.
- Barra de status com caminho e estado de salvamento.

**Pronto quando:** dá para abrir uma nota, digitar, fechar o app e o texto está lá. E abrir/fechar sem editar não gera diff no Git.

---

## Fatia 2 — Live preview

A fatia mais cara do projeto.

- Antes de escrever qualquer coisa: gastar meio dia testando `@atomic-editor/editor` 0.6.2 com arquivos reais. Se atender, fork/vendor e siga. Se não, escreva as decorations do zero.
- Cobertura mínima: headings, negrito, itálico, riscado, destaque, código inline, bloco de código com realce, listas, task lists, citação, linha horizontal, link markdown, imagem.
- Sintaxe visível na linha do cursor, oculta fora dela.
- Marginália: coluna de 76px com a hairline vertical contínua.
- Atalhos de formatação e continuação de lista.

**Pronto quando:** dá para escrever uma nota inteira sem ver um asterisco fora da linha em que você está.

---

## Fatia 3 — Links e índice

- Parser próprio de wikilink (`[[alvo#sub|alias]]` e `![[…]]`), usado tanto no `@lezer/markdown` quanto no indexador.
- `FileMeta`, cache em `index.json`, reparse incremental por `mtimeMs`+`size`.
- Resolução de link com a regra de desempate do documento 02.
- Renderização de link resolvido, não resolvido e clique para navegar.
- Autocomplete ao digitar `[[`.
- Criação de nota a partir de link não resolvido.
- Backlinks (painel simples).
- Rename com atualização de links em lote.

**Pronto quando:** renomear uma nota referenciada por outras cinco não quebra nenhum link.

---

## Fatia 4 — Abas e divisão de tela

- dockview-react, abas, `Ctrl+T`, `Ctrl+W`, `Ctrl+Shift+T`, `Ctrl+Tab`.
- Split vertical e horizontal, arrastar aba para dividir, zonas de soltura.
- `workspace/<hash-do-vault>.json` com o layout, restaurado no boot — um arquivo por vault.
- Estado por documento (limpo / sujo / salvando / erro) refletido na aba.

**Pronto quando:** você fecha o app com quatro abas em dois painéis e reabre exatamente assim.

---

## Fatia 5 — Watcher e conflitos

- Watcher em Rust com debounce e lista de ignorados.
- Reconciliação do índice em lote.
- Recarga silenciosa de aba limpa de texto, faixa de conflito em aba suja. Em desenho nunca há recarga silenciosa: sempre a faixa.
- Estado órfão para arquivo apagado externamente.

**Pronto quando:** você edita um arquivo no VS Code com o Excalisidian aberto e as duas pontas se comportam.

---

## Fatia 6 — Canvas

- Excalidraw embutido, CSS importado, fontes self-hosted, `EXCALIDRAW_ASSET_PATH` local.
- `formatoDesenho.ts`: parse e serialize do `.draw.md` com ordem estável, reconhecendo os fences `draw-json` e `draw-json-lz`.
- Autosave do desenho com o mesmo contrato das notas.
- Paletas restritas e tema aplicados, via `canvas/paletaCanvas.ts` lendo os tokens CSS — nunca hex literais no TypeScript.
- Fundo pontilhado.
- Toolbar e painel de propriedades próprios (ou CSS sobre os do Excalidraw, com versão pinada).
- Post-it como ferramenta, inserido por `updateScene` com `CaptureUpdateAction.IMMEDIATELY` para ser desfazível.
- Bloqueio de `Ctrl+Delete` e reencaminhamento dos atalhos de aplicação (seção 6.1 do documento 04).
- Colar imagem gravando arquivo no vault.

**Pronto quando:** um desenho salvo, fechado e reaberto é idêntico, e o `git diff` de mover uma caixa mostra poucas linhas.

**Validação de risco:** o spike de 500 elementos já foi feito na Fatia 0. Aqui o teste é com uma cena real do produto, com imagens e post-its.

---

## Fatia 7 — Integração nota ↔ desenho

- `renderSvg.ts` para o embed de desenho na nota.
- `![[Desenho.draw]]` renderizando, com largura opcional, clique para abrir, detecção de referência circular.
- Wikilink dentro de elemento de texto do canvas: renderização, clique, backlink.
- Rename atualizando links dentro de desenhos.

**Pronto quando:** uma nota mostra o desenho, o desenho aponta para a nota, e o painel de backlinks da nota lista o desenho.

---

## Fatia 8 — Busca, lixeira e acabamento

### Concluído (revisão de 29/08/2026)

- ~~Quick switcher (`Ctrl+O`)~~ — feito, reaproveitando o ranking de `sugestoesLink.ts`.
- ~~Paleta de comandos (`Ctrl+P`)~~ — feito.
- ~~Tema claro/escuro seguindo o sistema~~ — já seguia o sistema ao vivo; faltava persistir a
  escolha entre uma abertura e outra, feito via `prefsStore.ts` + `settings.json`.
- ~~Passada de acessibilidade, item "mover arquivo"~~ — "Mover para..." no menu de contexto,
  equivalente por teclado/menu do arrastar (doc 06, piso de qualidade).

### Pendente

- **Busca por conteúdo (`Ctrl+Shift+F`) com minisearch**, incluindo textos de desenhos. A
  dependência já está instalada (`minisearch` no `package.json`); falta tudo: índice
  incremental persistido, extração de texto de dentro de `.draw.md`, painel de resultados com
  trechos (doc 04 §8: no máximo 3 por arquivo). Maior peça pendente da Fatia 8 — não entrou
  nesta revisão por ser grande demais pra fazer com a mesma qualidade do resto do produto sem
  poder testar em tela junto com o usuário.
- **Lixeira**: mover pra `.trash/`, painel, restaurar, esvaziar, desfazer pelo toast (doc 02
  §7, doc 04 §9). Não iniciada — mexe em fluxo destrutivo (excluir), então merece uma rodada
  própria com confirmação explícita do usuário antes de codar, não uma decisão tomada sozinha
  numa revisão autônoma.
- **Preferências**: além do tema (já feito), não há painel de preferências nenhum. Tamanho de
  janela e vaults recentes (mencionados no comentário original de `prefsStore.ts`) continuam
  sem lugar — avaliar se ainda fazem falta antes de construir.
- **Restante das mensagens de erro/estados vazios do documento 04 §10**: faltam ainda as de
  permissão de pasta, nome reservado, caminho longo demais, falha ao salvar, imagem grande
  demais, desenho pesado, excluir com filhos, esvaziar lixeira, reindexando, vault vazio, sem
  resultado de busca por conteúdo, lixeira vazia. Boa parte depende de busca/lixeira existirem
  primeiro.
- **Passada de contraste dedicada**: a revisão de 29/08 conferiu manualmente os pares de cor
  dos botões contra o doc 06 (todos passam AA/3:1 com os hex atuais) e corrigiu um bug de
  comparação de cor (`SeletorCor.tsx`, maiúsculas/minúsculas), mas não existe uma verificação
  automatizada — se um hex do doc 06 mudar no futuro, nada acusa uma combinação que caiu
  abaixo do contraste mínimo.

**Pronto quando:** você consegue passar uma semana usando só o Excalisidian.

---

## Depois do MVP, em ordem de valor

1. Transclusão de elemento do desenho na nota (`#^id`).
2. Embutir nota renderizada dentro do desenho.
3. Biblioteca de elementos do canvas.
4. Tags e painel de tags.
5. Grade com encaixe no canvas.
6. Exportar nota para PDF.
7. Graph view.
8. Sincronização (provavelmente só documentar como usar Git).

---

## Riscos, em ordem de probabilidade de estragar o cronograma

| Risco | Sinal precoce | Plano B |
|---|---|---|
| Live preview consome semanas | fim da segunda semana da Fatia 2 sem tabelas e code blocks | reduzir a cobertura: entregar só headings/ênfase/listas/links e deixar o resto em sintaxe visível |
| Canvas lento no WebView2 | spike da Fatia 0 com engasgo | reduzir a cena e revisar re-renders — trocar de shell provavelmente não resolve, porque Electron também é Chromium (ver documento 05) |
| API do Excalidraw muda | build quebra num upgrade | versão pinada em 0.18.1; só subir com um dia dedicado |
| Serialização instável gerando diff falso | `git status` sujo depois de só abrir um desenho | teste 2 da lista de testes mínimos, feito na Fatia 6 |
| Loop watcher / autosave apagando texto | texto sumindo ao editar rápido | o mapa de hash é obrigatório desde a Fatia 1, não depois |
| Escopo crescendo | vontade de fazer tags, graph, templates | a lista "o que o produto NÃO é" do documento 01 |
