# 08 — Roadmap de construção

Fatias verticais. Cada uma termina em algo que dá para usar. Não pule a ordem — a primeira existe justamente porque é a que mais trava projeto.

## Status em 29/08/2026 (revisão de merge)

**Fatias 0 a 7: concluídas e verificadas** (código + testes conferidos arquivo por arquivo,
não só pelo histórico do Git). Cada uma teve pelo menos um desvio de decisão registrado no
`docs/09` ao longo do caminho — nenhuma mudou de escopo, mas várias tiveram a implementação
corrigida depois de testada em tela (ver a lista de ADRs abaixo).

**Fatia 8: parcialmente concluída nesta revisão.** Feito: quick switcher, paleta de comandos,
persistência de tema, e o "Mover para..." de acessibilidade. Pendente: lixeira completa
(RF7.5/7.6), e o restante das mensagens de erro/estados vazios do doc 04 §10 — ver o
detalhamento na seção da própria Fatia 8, abaixo. A busca por conteúdo foi implementada em
12/09/2026 (ver a seção da própria Fatia 8).

**Status 13/09/2026 (v0.4.0):** busca por conteúdo entregue (Fatia 8); todos os P1 da
auditoria de 12/09 (01–10) e o P2 11 corrigidos com testes de regressão; Fatia 10 (agente
de IA, doc 11) com fases 1–4 construídas (web search, fase 5, segue pendente).

**Status 19/09/2026 (v0.5.6):** desde o v0.4.0, entraram múltiplos vaults completos (RF1.3,
`docs/12-multiplos-vaults.md`), entrada visível da busca unificada na sidebar (RF4.6/RF4.8/
RF4.12, `docs/13-busca.md`), tabelas com redimensionamento de coluna (RF2.16,
`docs/14-tabelas.md`), a tela de boas-vindas e o nome do usuário (RF1.13/RF8.5,
`docs/15-onboarding.md`), a tela de atalhos e símbolos (RF8.3, `DialogoGlossario.tsx`),
ordenação da árvore com um modo customizado por arrasto (RF4.2), mover bloco por arraste no
editor (RF2.19) e o caminho de pastas acima do título (RF2.18). `docs/REQUISITOS-STATUS.md`
foi revisado por inteiro nesta data — as fatias abaixo estavam desatualizadas em vários pontos.

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
- **Painel de tarefas** (`10-tarefas.md`): lista vertical estreita na lateral direita,
  agrupada por prazo em seis seções calculadas, persistida em `.excalisidian/tarefas.json`.
  Pedido direto do usuário depois do MVP; o doc 10 é autocontido (modelo, formato, UI, RF10.x,
  decisões).
- **Múltiplos vaults, uma janela por vault** (RF1.3a/b/c): criar vault, abrir pasta existente,
  recentes e uma janela por vault. **Concluído** — `SeletorVault.tsx`, `vault/janelas.ts` sobre
  os comandos Rust `criar_vault`/`abrir_janela_vault` (`src-tauri/src/janelas.rs`, que foca a
  janela já aberta em vez de abrir outra). Plano normativo em `docs/12-multiplos-vaults.md`
  (doc 09 ADR-24).
- **Ordenação da árvore** (RF4.2): quatro modos (customizada por arrasto, alfabética, data
  crescente/decrescente) pelo botão-dropdown ao lado da busca, com a ordem customizada
  persistida em `.excalisidian/vault.json` — primeiro uso desse arquivo no código
  (`vault/configVault.ts`). Pedido do usuário depois do MVP original, não estava em nenhuma
  fatia.
- **Glossário de atalhos e símbolos** (RF8.3): `DialogoGlossario.tsx` sobre
  `src/app/glossario/`, com teste de deriva que confere os atalhos dos keymaps próprios do
  editor contra o catálogo.
- **Mover bloco por arraste** (RF2.19, doc 09 ADR-18): alça `⠿` que arrasta um bloco entre os
  irmãos do mesmo nível no editor.

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
- Tema aplicado, via `canvas/paletaCanvas.ts` lendo os tokens CSS — nunca hex literais no TypeScript.
- Fundo pontilhado.
- ~~Toolbar e painel de propriedades próprios~~ **Superado**: acabou sendo a UI nativa do Excalidraw, ligada (a alternativa que esta linha já cogitava). Ver doc 09, ADR-20.
- ~~Post-it como ferramenta, inserido por `updateScene` com `CaptureUpdateAction.IMMEDIATELY` para ser desfazível.~~ **Removido** na mesma migração — decisão do usuário.
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

- ~~**Busca por conteúdo (`Ctrl+Shift+F`) com minisearch**, incluindo textos de desenhos.~~
  **Feito em 12/09/2026**: `busca/minisearchIndex.ts` (índice persistido em
  `busca-<hash>.json` no mesmo padrão do cache de metadados, atualização incremental por
  documento via `mtimeMs+size`, extração de texto de `.draw.md` pelo `parseDesenho` — verso,
  Text Elements e Element Links, nunca o JSON da cena), sobreposição `BuscaConteudo.tsx`
  (agrupada por arquivo, até 3 trechos por arquivo com número da linha e termo destacado,
  doc 04 §8), consulta com `"frase exata"` e `-termo`, atalho `Ctrl+Shift+F` e comando na
  paleta. Integração no `vaultStore`: boot via `sincronizarBusca` (fora do caminho crítico),
  save/watcher via `reindexarArquivo`. Testes em `busca/minisearchIndex.test.ts`.
  ~~Não testado em tela ainda.~~ **Entrada visível adicionada depois** (`CampoBuscaSidebar.tsx`,
  `Ctrl+Enter` abre ao lado, suporte a acento em `busca/normalizacao.ts`) — ver
  `docs/13-busca.md` e `docs/REQUISITOS-STATUS.md` (RF4.6/RF4.8/RF4.12).
- **Lixeira**: RF7.1–7.4 implementados (doc 09, ADR-7, status 01/09/2026 —
  `vault/lixeira.ts`, `PainelLixeira.tsx`). Pendentes: RF7.5 (desfazer pelo toast) e RF7.6
  (lixeira do sistema, crate `trash`).
- ~~**Preferências**~~ — feito em 30/08/2026: `DialogoPreferencias.tsx`, aberto por um ícone
  de engrenagem no rodapé da sidebar (ou `Ctrl+,`) — tema e largura da nota moraram só na
  paleta de comandos por um tempo, e o usuário relatou não achar (`Ctrl+P` não é um lugar
  óbvio pra configuração). Tamanho de janela e vaults recentes (mencionados no comentário
  original de `prefsStore.ts`) continuam sem lugar — avaliar se ainda fazem falta antes de
  construir.
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

## Fatia 10 — Agente de IA (doc 11)

Pedida pelo usuário em 12/09/2026, depois da revisão da Fatia 8. Spec normativa completa no
doc 11; ADR-22/23 no doc 09. Resumo do escopo:

- 100% opcional e desligado por padrão; sem configuração, nenhum traço na UI e nenhuma
  chamada de rede nova.
- Conexão por API key (OAuth adiado), catálogo com Anthropic, OpenAI, Gemini, OpenRouter
  (Zen/Go), Alibaba (DashScope) e Ollama; base URL editável.
- Dois modelos: gateiro (convite para participar da nota) e assistente (ciclos de sugestão
  disparados por inatividade + diff, nunca por linha).
- Recuperação local sem embeddings: minisearch (depende da busca da Fatia 8, pronta) +
  backlinks; resumos em cache invalidados por mtime+size.
- Memória em `%APPDATA%/Excalisidian/agente/<hash>/`, fora do Git; acesso e limpeza pelas
  configurações.
- Balão flutuante no canto inferior direito + painel com sugestões, conversa e medidor de
  tokens/custo; teto diário opcional (sem teto por padrão).
- Transporte por `@tauri-apps/plugin-http` com escopo de hosts em capabilities.

Ordem de construção (doc 11 §13): fase 1 infra + conversa manual → fase 2 gateiro + convite
→ fase 3 pipeline contínuo + orçamento → fase 4 memória + pasta do agente.

**Status 13/09/2026:** fases 1–4 construídas (fase 1 testada em tela pelo usuário; 2–4
aguardando validação em tela). Web search virou fase 5 e está escondida na UI até ser
implementada. Fase 5 pendente.

**Pronto quando:** uma nota com participação aceita gera sugestões úteis sem estourar o
orçamento configurado, e um app sem agente configurado é indistinguível do app anterior.

---

## Fatia 11 — Tradução (i18n)

Pedida pelo usuário; decisão em ADR-36 (`docs/09-decisoes-e-incertezas.md`). Todo texto de
interface sai de um catálogo por domínio, nunca literal no JSX; português do Brasil é a
fonte da verdade e define as chaves, inglês é a tradução; um teste trava toda chave em
português sem par em inglês.

- `src/i18n/idioma.ts`, `tradutor.ts`, `catalogo.ts` + `catalogo/<domínio>.ts`; `useTexto()`
  dentro de componente React, `traduzirAgora()` fora (transporte, stores).
- Preferência de idioma persistida em `prefsStore`; detecta o idioma do sistema na primeira
  abertura.

**Estado real:** a fundação está pronta e testada (cobertura por teste, resolução de
fallback). Mas só estão no catálogo as mensagens de erro de criar vault, o seletor de
idioma, os textos do agente de IA e a seção Conta — **o resto da interface continua em
português fixo no código.** Trocar o idioma hoje quase não muda nada visível. A migração das
telas restantes foi **adiada por decisão do usuário** (22/09/2026), para depois de conta e
sincronização.

**Status:** fundação pronta; migração das telas adiada pelo usuário.

**Pronto quando:** trocar o idioma muda visivelmente a interface inteira, não só uma fração
dela.

---

## Fatia 12 — IA do Excalisidian (provedor próprio)

Sétimo provedor do catálogo do agente (doc 11 §3.2), decisão em ADR-35. Autentica pela
sessão da conta em vez de chave digitada; identificadores lógicos de modelo, nunca o nome do
fornecedor na interface; cota mensal em créditos, contada no servidor.

- Assistente de configuração com passo de conta no lugar do passo de chave; listagem de
  modelos não vai à rede; campo "Avançado · Base URL" some; revisão esconde chave e limite
  de gasto.
- Medidor em créditos, não em tokens; "Testar conexão" verifica a sessão.
- Os seis provedores de chave própria continuam gratuitos e intactos; o agente continua
  desligado por padrão.

**Estado real:** pronta no cliente, depende do servidor. O domínio `api.excalisidian.app` é
placeholder e não está registrado (doc 09, incerteza), e o endpoint de saldo de créditos
ainda não existe — por isso o medidor de créditos **não renderiza** até haver saldo real.

**Status:** pronta no cliente; depende do servidor.

**Pronto quando:** o servidor existir, o domínio estiver registrado, e o medidor mostrar
saldo real em vez de ficar oculto.

---

## Fatia 13 — Conta

Entrar, criar, renovar, sair; seção "Conta" dentro de Configurações, em nenhum outro lugar —
sem banner, sem aviso, sem convite recorrente (D1/ADR-31). E-mail inexistente e senha errada
devolvem o mesmo erro, para não revelar quem tem conta.

- `src/conta/` (`ServicoConta.ts`, `ServicoContaFake.ts`, `ServicoContaHttp.ts`) e
  `src/estado/contaStore.ts`.
- Só o token é persistido, em `settings.json`, texto puro (ver Fatia 14); carrega na abertura
  sem bloquear a tela; só "sessão expirada" apaga o token — falha de rede ou de servidor
  preserva a sessão.

**Estado real:** pronta no cliente. As três pendências conhecidas da Fase B foram resolvidas:
as telas passaram a usar o indicador de carregamento da conta, então quem já tem conta não vê
mais "entre na sua conta" por alguns segundos na abertura, e o passo de conta do assistente de
configuração do agente ganhou um botão para entrar (commit `a417158`); e um 401 do provedor
próprio deixou de aparecer como "chave recusada", virando falha de sessão (commit `a974946`,
ver também ADR-38). Depende do servidor: sem ele, entrar e criar conta não completam de
verdade.

**Status:** pronta no cliente; depende do servidor.

**Pronto quando:** o servidor existir.

---

## Fatia 14 — Token no cofre do sistema

Decisão do usuário (22/09/2026, D4/ADR-34): o token da conta vai para o cofre do sistema
operacional (keyring do Windows), não fica em texto puro no `settings.json`.

**Estado real:** plano escrito, não começada. Hoje o token está em `settings.json`, em texto
puro. A migração é trabalho da Fase B e já tem plano escrito
(`docs/superpowers/plans/2026-09-23-05-token-no-cofre.md`). Inconsistência aceita
pelo usuário: as chaves de API dos seis provedores de chave própria do agente continuam em
texto puro no `settings.json` mesmo depois desta fatia.

**Status:** plano escrito, não começada.

**Pronto quando:** o token de sessão nunca aparecer em texto puro em disco.

---

## Fatia 15 — Sincronização

Vaults cifrados ponta a ponta; o servidor não lê nada — nem conteúdo, nem nome de arquivo,
nem quantidade de notas (D2/ADR-32). Conflito (mesma nota editada em dois computadores) nunca
funde sozinho: vira uma tela com três saídas (ficar com esta, ficar com aquela, manter as
duas); desenho compara como duas telas lado a lado, não como texto.

**Estado real:** tela de conflitos pronta (plano `2026-09-21-04-conflitos-de-sync.md`,
commits `fd9e4e9..3e0da31`) — faixa de aviso, comparador de notas lado a lado e comparador de
desenhos, todos operando sobre "duas versões do mesmo arquivo", sem depender de servidor. Para
ver a tela sem sincronização de verdade existir, há um comando só de desenvolvimento, "Simular
conflito de sincronização", na paleta de comandos. A sincronização em si — observar o vault,
cifrar, enviar e receber — ainda não começou.

**Status:** tela de conflitos pronta; sincronização não começada.

**Pronto quando:** existir um servidor de sincronização cifrada e a tela de conflitos
estiver integrada a ele.

---

## Depois do MVP, em ordem de valor

1. Transclusão de elemento do desenho na nota (`#^id`).
2. Embutir nota renderizada dentro do desenho.
3. Biblioteca de elementos do canvas.
4. Tags e painel de tags.
5. Grade com encaixe no canvas.
6. Exportar nota para PDF.
7. Graph view.
8. Sincronização — virou serviço pago, cifrado ponta a ponta. Ver Fatia 15 e ADR-32.

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
