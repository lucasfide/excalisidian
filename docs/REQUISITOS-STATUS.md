# Requisitos do Excalisidian — status de implementação

**Gerado em 03/09/2026, revisado em 19/09/2026 por nova auditoria do código.** Cópia derivada de
[`03-requisitos-mvp.md`](03-requisitos-mvp.md), que continua sendo a **fonte da verdade** dos
requisitos em si. Este arquivo acrescenta uma coluna: o que existe hoje no código.

A revisão de 19/09 encontrou vários módulos que avançaram bastante desde 03/09 sem que este
arquivo fosse atualizado (múltiplos vaults, busca com entrada visível, ordenação da árvore,
tabelas com redimensionamento de coluna, tela de boas-vindas, imagem por caminho relativo) —
provavelmente por terem sido construídos em sequência rápida (`9d4c0ac` até `e9255bb`, v0.4.0 a
v0.5.6) sem revisitar este documento a cada entrega.

Cada linha marcada foi verificada abrindo o arquivo citado. Onde está escrito PENDENTE, foi
feita busca ativa pelos termos e arquivos onde a funcionalidade estaria — não é ausência
presumida.

**Prioridade:** P0 = sem isso não existe produto · P1 = MVP completo · P2 = projetado, não
construído agora.

**Status:** ✅ FEITO · 🟡 PARCIAL · ⬜ PENDENTE · ⛔ REMOVIDO por decisão

---

## Resumo

| Módulo | ✅ | 🟡 | ⬜ | ⛔ |
|---|---|---|---|---|
| 1 — Vault e arquivos | 8 | 3 | 2 | — |
| 2 — Editor de notas | 9 | 6 | 4 | — |
| 3 — Abas e divisão de tela | 9 | — | 1 | — |
| 4 — Sidebar e navegação | 6 | 4 | 2 | — |
| 5 — Canvas | 14 | 3 | 2 | 2 |
| 6 — Integração nota ↔ desenho | 3 | 1 | 3 | — |
| 7 — Lixeira | 4 | — | 2 | — |
| 8 — Aparência e preferências | 3 | 2 | — | — |
| **Total** | **56** | **19** | **16** | **2** |

**Dos 16 pendentes, 8 são P2** (projetados para depois, não atrasados). Os P0 e P1 pendentes
ou parciais estão listados na seção "O que falta para o MVP fechar", no fim.

Módulos 2 (RF2.18, RF2.19) e 4 (RF4.2, RF4.6, RF4.8, RF4.12) mudaram de 🟡/⬜ para ✅ nesta
revisão: múltiplos vaults, ordenação/arrasto na árvore, busca com entrada visível, tabelas com
redimensionamento de coluna, onboarding (RF1.13/RF8.5), o glossário de atalhos e símbolos
(RF8.3), o caminho acima do título (RF2.18) e o mover-bloco por arraste (RF2.19) foram todos
construídos depois da última revisão deste arquivo e nunca tinham sido registrados aqui.

---

## Módulo 1 — Vault e arquivos

| ID | Requisito | P | Status | Situação |
|---|---|---|---|---|
| RF1.1 | Escolher pasta do vault por diálogo nativo | P0 | ✅ | `TauriVaultAdapter.ts:62` |
| RF1.2 | Reabrir o último vault ao iniciar | P0 | ✅ | `TauriVaultAdapter.ts:53` (`doBoot`) |
| RF1.3a/b/c | Criar vault, abrir pasta existente, recentes com "remover da lista", uma janela por vault | P1 | ✅ | `SeletorVault.tsx` (recentes + "remover da lista"), `vault/janelas.ts` (`criarVault`, `abrirVaultEmJanela`) sobre os comandos Rust `criar_vault` e `abrir_janela_vault` em `src-tauri/src/janelas.rs`, que foca a janela já aberta em vez de abrir outra. `vault/vaultsRecentes.ts` guarda a lista (`MAX_RECENTES = 20`). Plano normativo em `docs/12-multiplos-vaults.md` |
| RF1.4 | Indexar na abertura, progresso acima de 500 ms | P0 | 🟡 | Indexa sim. Falta o limiar de 500 ms e o progresso real ("N de M") — hoje é um texto fixo "reindexando…" |
| RF1.5 | Detectar mudanças de outros programas | P0 | ✅ | `watcher.rs:74` → `vaultStore.ts:190`. Cobre também perda de sincronia |
| RF1.6 | Ignorar pastas-ponto, `node_modules/`, `.tmp` | P0 | ✅ | `vault.rs:108`, replicado em `watcher.rs:39` |
| RF1.7 | Criar nota, desenho e pasta (botão e menu) | P0 | ✅ | `BarraFerramentasSidebar.tsx` + `ArvoreArquivos.tsx:253` |
| RF1.8 | Renomear com `F2`, atualizando links | P0 | 🟡 | Rename e reescrita de links completos, inclusive dentro de desenhos. **A tecla `F2` não existe** — só menu de contexto |
| RF1.9 | Mover arrastando, atualizando links | P1 | 🟡 | Arquivo sim. **Pasta não** — `ArvoreArquivos.tsx:148` bloqueia |
| RF1.10 | Recusar nomes inválidos com motivo | P0 | ✅ | `caminhos.ts:82` — inclui nomes reservados do Windows |
| RF1.11 | Duplicar arquivo | P2 | ⬜ | Não existe |
| RF1.12 | Abrir pasta no Explorer | P1 | ⬜ | Não existe, e falta a base: nenhum plugin nem comando Rust para isso |
| RF1.13 | Tela de boas-vindas com sugestão pronta e conteúdo de exemplo no primeiro vault | P1 | ✅ | `TelaBoasVindas.tsx` + `vault/conteudoInicial.ts` (grava "Boas-vindas.md" e "Primeiro desenho.draw.md" linkados entre si). Detalhamento em `docs/15-onboarding.md` |

## Módulo 2 — Editor de notas

| ID | Requisito | P | Status | Situação |
|---|---|---|---|---|
| RF2.1 | Live preview | P0 | ✅ | `inline-preview.ts:205` |
| RF2.2 | Renderizar 12 tipos de markdown | P0 | ✅ | Os 12 renderizam. Imagem por caminho relativo do vault corrigida (`embedImagem.ts`, lida pelo `VaultAdapter` e servida como blob URL). Tabelas completas — ver RF2.16 |
| RF2.3 | Modo de código puro | P1 | ⬜ | Não existe |
| RF2.4 | Modo de leitura (`Ctrl+E`) | P1 | ⬜ | O motor suporta, mas não há comando. **`Ctrl+E` está ocupado** por código inline |
| RF2.5 | Autosave 800 ms + flush | P0 | 🟡 | Debounce, fechar app e trocar de aba OK. **Falta "ao perder foco da janela"** |
| RF2.6 | Salvar com `Ctrl+S` | P0 | ✅ | `Workspace.tsx:190` |
| RF2.7 | Autocompletar `[[` com criação inline | P0 | ✅ | `wikilinksExcalisidian.ts:22` |
| RF2.8 | Navegar por wikilink; `Ctrl+clique` nova aba | P0 | 🟡 | Clique navega (`wiki-links.ts` → `wikilinksExcalisidian.ts`). **`Ctrl+clique` ainda não abre em nova aba** — `onOpen` não recebe o evento, só o alvo do link, então não há como diferenciar o clique normal do `Ctrl+clique`. ⚠️ **Possível bug de documentação**: `catalogoAtalhos.ts` (glossário de atalhos, RF8.3) lista o item "abrir-link-nova-aba" com o gesto "Ctrl+clique" como se já funcionasse — o glossário mostra ao usuário uma ação que a UI não faz |
| RF2.9 | Embeds de nota, seção, bloco, imagem, desenho | P1 | 🟡 | **Desenho e imagem** (`embedImagem.ts`, com redimensionar pela alça e arrastar pra juntar imagens na mesma linha). Nota, seção e bloco ainda ficam como texto cru |
| RF2.10 | Frontmatter como bloco de propriedades | P1 | ⬜ | Existe parser, mas nada renderiza |
| RF2.11 | `Ctrl+B`, `Ctrl+I`, `Ctrl+K`, `` Ctrl+` `` | P1 | 🟡 | B, I e **agora `Ctrl+K` (inserir link)** OK — `atalhosFormatacao.ts` (comentário: "antes não havia binding nenhum"). **`` Ctrl+` `` continua sem registro**: código inline segue em `Ctrl+E` (`Mod-e`), que é o mesmo atalho que RF2.4 quer para o modo de leitura |
| RF2.12 | Colar imagem no editor | P1 | 🟡 | `extensoes/colarImagem.ts` + `vault/anexos.ts`. Grava em `anexos/` e insere `![[…]]` (doc 04 §3.6). Não testado em tela ainda |
| RF2.13 | Colar URL sobre seleção vira link | P2 | ⬜ | Não existe |
| RF2.14 | Desfazer/refazer por documento | P0 | ✅ | Isolado por arquivo, e **sobrevive à troca de aba** — verificado no código do dockview: esconder uma aba só desanexa o nó do DOM, não desmonta o React (o conteúdo vive num portal) |
| RF2.15 | Continuar lista com Enter | P1 | ✅ | `inline-preview.ts:1133`, inclusive sair em item vazio |
| RF2.16 | Criar e editar tabela (digitação, paleta, barra, faixas "+", alças, menu, alinhamento preservado, redimensionar coluna) | P1 | ✅ | `table-model.ts` (modelo + `resizeColumns`), `table-widget.ts` (faixas, alças, menu), criação por digitação, palheta ("Inserir tabela") e barra de formatação. Detalhamento em `docs/14-tabelas.md` |
| RF2.17 | Barra de formatação (flutuante com seleção, ou acoplada) | P1 | 🟡 | A versão sem seleção foi revertida em 16/09/2026; flutuante só com seleção, barra acoplada sempre visível |
| RF2.18 | Caminho de pastas acima do título | P2 | ✅ | `extensoes/caminhoDaNota.ts`, widget de bloco do CodeMirror |
| RF2.19 | Mover bloco por arraste (alça `⠿`) | P2 | ✅ | `extensoes/moverBloco.ts` + `AlcaBloco.tsx`. Sem equivalente por teclado — ver RF8.4 |

## Módulo 3 — Abas e divisão de tela

| ID | Requisito | P | Status | Situação |
|---|---|---|---|---|
| RF3.1 | Abas; `Ctrl+T` abre aba em branco | P0 | ✅ | `workspaceStore.ts:79` |
| RF3.2 | `Ctrl+W` fecha; `Ctrl+Shift+T` reabre | P0 | ✅ | Pilha dos últimos 20. `AbaDocumento.tsx` também fecha no clique do meio, como um navegador |
| RF3.3 | `Ctrl+Tab`, `Ctrl+1..9` | P1 | ✅ | `Ctrl+9` vai à última aba (convenção do Obsidian) |
| RF3.4 | Dividir vertical e horizontal | P0 | ✅ | Menu, atalho e paleta |
| RF3.5 | Arrastar aba para a borda cria divisão | P0 | ✅ | Dockview com estratégia de ponteiro |
| RF3.6 | Arrastar aba entre grupos | P0 | ✅ | Nativo do dockview |
| RF3.7 | Redimensionar painéis | P0 | ✅ | Nativo do dockview |
| RF3.8 | Restaurar layout ao reabrir | P0 | ✅ | `Workspace.tsx:101`, por vault |
| RF3.9 | Indicador de não salvo | P1 | ✅ | `AbaDocumento.tsx:11` |
| RF3.10 | Fixar aba | P2 | ⬜ | Não existe |

## Módulo 4 — Sidebar e navegação

| ID | Requisito | P | Status | Situação |
|---|---|---|---|---|
| RF4.1 | Árvore com estado preservado entre sessões | P0 | 🟡 | Árvore e expandir/recolher OK. **Não persiste** — pastas abertas voltam ao padrão a cada abertura |
| RF4.2 | Ordenar por nome/modificação/criação | P1 | ✅ | `vault/ordenacao.ts` + `BotaoOrdenacao.tsx` (dropdown ao lado da busca), `customOrder` gravado em `.excalisidian/vault.json` (`configVault.ts`). **Escopo entregue é menor que o texto original**: não há modo por data de *criação* (`birthtimeMs`) nem alfabética decrescente — no lugar entrou um quarto modo, "customizada", com arrastar-para-reordenar e separadores. RF2.16 do doc 03 já foi ajustado pra refletir isso |
| RF4.3 | Revelar arquivo ativo (ligável/desligável) | P1 | 🟡 | Revela sempre. **Não dá para desligar** |
| RF4.4 | Menu de contexto com 8 itens | P0 | 🟡 | **5 de 8** na árvore. Faltam duplicar (já existe no menu da aba, `comandoDuplicar`), revelar no Explorer e copiar caminho |
| RF4.5 | Arrastar arquivo para pasta | P1 | ✅ | `ArvoreArquivos.tsx` + `alvoSoltura.ts` (decisão pura do alvo), agora com indicador visual de onde o item cai. Pasta também pode ser arrastada, mas só para reordenar entre irmãs (modo customizado) — mover pasta inteira pra dentro de outra no disco continua fora de escopo (comentário em `ArvoreArquivos.tsx`: "vault/mover.ts") |
| RF4.6 | Busca unificada `Ctrl+O` / `Ctrl+Shift+F` | P0 | ✅ | Entrada visível pelo campo da sidebar (RF4.12) e pelos atalhos, `Ctrl+Enter` abre ao lado (`workspaceStore.ts`, `criacao.ts`, comentário cita doc 13 §1.4), consulta sem título exato cria nota na raiz. Detalhamento em `docs/13-busca.md` |
| RF4.7 | Paleta de comandos `Ctrl+P` | P1 | 🟡 | Existe. **Não verificado nesta rodada** se a busca já é aproximada e se todos os comandos mostram o atalho — reconferir antes de fechar o MVP |
| RF4.8 | Busca por conteúdo `Ctrl+Shift+F` | P1 | ✅ | `PainelBusca.tsx` sobre `busca/minisearchIndex.ts`. Suporte a acento confirmado (`busca/normalizacao.ts`, função `dobrar`: NFD + remove diacríticos + minúsculas). Entrada visível via RF4.12. Detalhamento em `docs/13-busca.md` |
| RF4.9 | Painel de backlinks com trecho | P1 | ✅ | `PainelBacklinks.tsx:16` |
| RF4.10 | Recolher sidebar `Ctrl+\` | P1 | ⬜ | Continua sem existir. **A observação antiga está desatualizada**: `Ctrl+\` (`Mod-\`) hoje tem dono — é o atalho de mostrar/esconder o painel de tarefas (`catalogoAtalhos.ts`, id `painel-tarefas`, `App.tsx`), não um "destinatário que nunca existiu" |
| RF4.11 | Painel de sumário | P2 | ⬜ | Dado existe, componente não |
| RF4.12 | Campo "Buscar" visível na sidebar | P1 | ✅ | `CampoBuscaSidebar.tsx`, dentro de `ConteudoSidebar.tsx`, abre a busca unificada de RF4.6/RF4.8 |

## Módulo 5 — Canvas

A interface nativa do Excalidraw está ligada (ADR-20), então boa parte destes requisitos é
atendida por ele. Onde está escrito "nativo", foi confirmado que o app não desliga o recurso.

| ID | Requisito | P | Status | Situação |
|---|---|---|---|---|
| RF5.1 | Canvas infinito, fundo pontilhado, zoom/pan | P0 | ✅ | Fundo pontilhado é código próprio, acompanha zoom e pan |
| RF5.2 | Ferramentas de desenho | P0 | ✅ | Nativo |
| RF5.3 | Atalhos de tecla única | P1 | ✅ | Nativo — confirmado que o app não intercepta tecla sem Ctrl |
| RF5.4 | Painel de propriedades completo | P0 | ✅ | Nativo — camadas, alinhar, agrupar, espelhar, travar, todos conferidos |
| RF5.5 | ~~Paletas restritas~~ | — | ⛔ | Removido (ADR-20): seletor nativo não é customizável |
| RF5.6 | Texto dentro de forma | P0 | ✅ | Nativo; o app preserva na gravação |
| RF5.7 | Conectores que acompanham a forma | P0 | ✅ | Nativo |
| RF5.8 | Rótulo na seta | P1 | ✅ | Nativo |
| RF5.9 | ~~Post-it~~ | — | ⛔ | Removido (ADR-20): sem slot para ferramenta nova + decisão do usuário |
| RF5.10 | Colar e arrastar imagem para o canvas | P0 | ✅ | `canvas/adotarImagens.ts`: roda no `onChange` do Excalidraw, então cobre colar, arrastar-e-soltar e a ferramenta de imagem da toolbar igualmente — todas gravam em anexos |
| RF5.11 | `[[Nota]]` em texto vira link e backlink | P0 | 🟡 | **Backlink funciona.** O texto **não fica clicável** sem preencher o campo de link à mão |
| RF5.12 | `Ctrl+K` anexa link a qualquer elemento | P1 | ✅ | Nativo + painel próprio com autocomplete de nota |
| RF5.13 | Selecionar, mover, girar, agrupar, travar | P0 | ✅ | Nativo + clique dentro de forma vazia (código próprio) |
| RF5.14 | Desfazer/refazer no canvas | P0 | ✅ | Nativo, preservado pelo tratamento de atalhos |
| RF5.15 | Autosave com o contrato das notas | P0 | ✅ | Mesmo debounce e escrita atômica |
| RF5.16 | Exportar PNG e SVG | P1 | ⬜ | **Ativamente desligado** e sem substituto próprio |
| RF5.17 | Copiar/colar entre desenhos | P1 | ✅ | Nativo — confirmado que o app não bloqueia |
| RF5.18 | Encaixe na grade de 20px | P2 | 🟡 | Existe nativo, mas ligar desenha a grade do Excalidraw **por cima** do fundo pontilhado |
| RF5.19 | Biblioteca de elementos | P2 | 🟡 | Acessível, mas **o app não grava** o que for salvo nela |
| RF5.20 | Embutir nota dentro do desenho | P2 | ⬜ | Só o caminho inverso existe |
| RF5.21 | Bloquear atalhos destrutivos | P0 | ✅ | `atalhosCanvas.ts:22` |

## Módulo 6 — Integração nota ↔ desenho

| ID | Requisito | P | Status | Situação |
|---|---|---|---|---|
| RF6.1 | `![[Desenho.draw]]` renderiza como SVG | P0 | 🟡 | Renderiza e aceita largura. **Altura é ignorada**, e a forma com `.md` explícito não resolve pelo nome |
| RF6.2 | Clicar no embed abre o desenho | P0 | ✅ | Mouse e teclado |
| RF6.3 | Editar o desenho atualiza as notas abertas | P1 | ⬜ | Salvar o desenho não redesenha o embed na nota aberta |
| RF6.4 | Transcluir texto de um elemento | P2 | ⬜ | Não existe |
| RF6.5 | "Copiar link para este elemento" | P2 | ⬜ | Não existe |
| RF6.6 | Backlinks incluem desenhos | P0 | ✅ | Funciona porque os links ficam em texto plano no arquivo |
| RF6.7 | Renomear nota atualiza links nos desenhos | P0 | ✅ | Reescreve a cena com segurança, e tem teste |

## Módulo 7 — Lixeira

| ID | Requisito | P | Status | Situação |
|---|---|---|---|---|
| RF7.1 | Excluir move para `.trash/` com origem e data | P0 | ✅ | Fecha abas antes; resolve colisão de nome |
| RF7.2 | Painel de lixeira | P0 | ✅ | Lista o disco real; item sem registro vira "origem desconhecida" |
| RF7.3 | Restaurar, recriando pasta se sumiu | P0 | ✅ | Colisão vira "(restaurado)" |
| RF7.4 | Esvaziar com contagem exata | P0 | ✅ | Contagem vem da listagem real |
| RF7.5 | Desfazer pelo toast (8s) | P1 | ⬜ | O toast existe, mas sem botão de ação |
| RF7.6 | Escolher tipo de lixeira | P2 | ⬜ | Preferências só têm tema e largura |

## Módulo 8 — Aparência e preferências

| ID | Requisito | P | Status | Situação |
|---|---|---|---|---|
| RF8.1 | Tema claro/escuro/sistema | P0 | ✅ | Com teste automatizado |
| RF8.2 | Preferências do vault em `vault.json` | P1 | 🟡 | **`vault.json` agora existe** (`vault/configVault.ts`, `.excalisidian/vault.json`) — mas só modela `sortMode`/`customOrder` (RF4.2) até aqui; campos não modelados são preservados ao regravar. Pasta de anexos, local de novas notas e formato de link continuam fixos no código, não no arquivo |
| RF8.3 | Tela de atalhos de teclado | P2 | ✅ | `DialogoGlossario.tsx` (Configurações → Atalhos e símbolos), sobre `src/app/glossario/` (`catalogoAtalhos.ts`, `catalogoSimbolos.ts`), com filtro e abas de atalhos/símbolos. Testes de deriva (`catalogoAtalhos.test.ts`) conferem as teclas dos keymaps próprios do editor contra o catálogo — mas nem toda linha do catálogo é conferida assim: entradas com gesto textual em vez de tecla (ex. "abrir-link-nova-aba") são afirmação manual do comentário, não verificação automática, e pelo menos uma está errada (ver RF2.8) |
| RF8.4 | Toda ação de arrastar tem equivalente | P1 | 🟡 | Ver tabela abaixo — atualizada nesta revisão |
| RF8.5 | Nome do usuário: informado no onboarding, editável nas Configurações | P1 | ✅ | `TelaBoasVindas.tsx` sugere a partir do usuário do sistema (`app/sistemaOperacional.ts`), editável e pode ficar vazio; `DialogoPreferencias.tsx` permite trocar depois. Detalhamento em `docs/15-onboarding.md` |

### RF8.4 em detalhe

| Ação de arrastar | Equivalente? |
|---|---|
| Arquivo na árvore → outra pasta | ✅ menu "Mover para…" |
| Item na árvore → reordenar (modo customizado) | ⬜ nenhum — só arrastando |
| Aba → borda (cria divisão) | ✅ menu, atalho e paleta |
| Aba entre grupos existentes | ⬜ nenhum |
| Bloco no editor (alça ⠿, RF2.19) | ⬜ nenhum — recurso é novo desta revisão e já nasceu só por arraste |
| Divisória entre painéis | ⬜ nenhum |
| Coluna de tabela (redimensionar, RF2.16) | ⬜ nenhum |

---

## Requisitos não funcionais

Aqui o critério é outro: não é "existe a funcionalidade", é "existe mecanismo" e "existe
medição". **Nenhum destes tem verificação automatizada** — o projeto tem 152 testes, todos
unitários e puros, sem nenhum teste de interface, de desempenho ou de acessibilidade.

| ID | Requisito | Mecanismo | Medido | Observação |
|---|---|---|---|---|
| RNF1 | Vault de 5 000 notas em < 2s | ✅ | ⬜ | Cache de índice + varredura numa chamada só. **Meta nunca medida** — não há nenhum benchmark no projeto |
| RNF2 | Nota de 100 KB sem atraso | 🟡 | ⬜ | Herdado do CodeMirror. ⚠️ O embed de desenho varre o texto **inteiro** a cada tecla digitada — trabalho real por keystroke, não medido |
| RNF3 | 500 elementos a 60 fps | ✅ | ⬜ | Renderizador do Excalidraw. Nunca medido |
| RNF4 | Máx. 800 ms perdidos em fechamento abrupto | ✅ | 🟡 | Debounce + 4 gatilhos de flush + escrita atômica. Falta um gatilho da spec (foco da janela) e nenhum teste exercita o caminho |
| RNF5 | Funciona sem internet | ✅ | ⬜ | Varredura confirmou **zero referências remotas**; fontes empacotadas. ⚠️ Se a cópia dos assets falhar, o build passa mesmo assim e quebra em silêncio |
| RNF6 | UTF-8 sem BOM, `\n` | 🟡 | ⬜ | BOM tratado. **A parte do `\n` não tem mecanismo**: arquivo com CRLF é lido e regravado com CRLF |
| RNF7 | Abrir e fechar não gera diff no Git | ✅ | ⬜ | Não grava se o conteúdo é idêntico. Round-trip nunca testado ponta a ponta |
| RNF8 | Contraste AA nos dois temas | ✅ | ⬜ | Regra do `ocre` codificada nos tokens. Verificação é 100% visual |
| RNF9 | Foco visível | ✅ | ⬜ | Regra global de foco. Nenhum teste de interface |

---

## O que falta para o MVP fechar

Filtrando só P0 e P1 que estão pendentes ou parciais, em ordem de impacto:

**Resolvido desde a última revisão (03/09):** busca sem entrada visível (RF4.6/4.12), imagem
por caminho relativo no editor (RF2.2), arrastar imagem pro canvas sem gravar (RF5.10),
múltiplos vaults (RF1.3), tela de boas-vindas e nome do usuário (RF1.13/RF8.5), tela de atalhos
(RF8.3), ordenação da árvore (RF4.2). Removidos da lista abaixo.

**Lacunas que o usuário percebe direto**
1. **Embeds** (RF2.9) — desenho e imagem funcionam (imagem inclusive com redimensionar e
   arrastar pra juntar linhas); nota, seção e bloco ainda ficam como texto cru.
2. **Recolher a sidebar** com `Ctrl+\` (RF4.10) e **`F2` para renomear** (RF1.8) — atalhos
   prometidos que não existem. `Ctrl+\` já tem outro dono agora (painel de tarefas), então
   precisa de tecla nova, não só de implementação.
3. **Exportar desenho** (RF5.16) — desligado, sem substituto.
4. **`Ctrl+clique` não abre link em nova aba** (RF2.8) — e o glossário de atalhos (RF8.3)
   afirma que abre; ver "possíveis bugs no código" no relatório desta revisão.

**Conflitos de atalho a resolver** (RF2.4 e RF2.11)
`Ctrl+E` está em código inline, mas o requisito o reserva para modo de leitura (que nem existe
ainda); `` Ctrl+` ``, que deveria ser código inline, está livre. `Ctrl+K` **foi resolvido**
nesta revisão — já insere link.

**Inconsistências de estado**
5. Pastas abertas na árvore não sobrevivem ao fechar o app (RF4.1).
6. Preferências do vault em `vault.json` cobrem só ordenação da árvore (RF8.2) — pasta de
   anexos, local de novas notas e formato de link continuam fixos no código, não no arquivo.

**Riscos sem medição**
7. As três metas de desempenho (RNF1–3) nunca foram medidas. Não há benchmark no projeto.
8. Round-trip de arquivo (RNF7) — a garantia de não sujar o Git depende de uma única condição no código, sem teste que a proteja.
