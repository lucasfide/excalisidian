# 03 — Requisitos do MVP

Prioridade: **P0** = sem isso não existe produto · **P1** = MVP completo · **P2** = logo depois, já projetado mas não construído agora.

Persona única: **o autor** — uma pessoa usando o app sozinha no próprio computador.

---

## Módulo 1 — Vault e arquivos

| ID | Requisito | P |
|---|---|---|
| RF1.1 | Escolher uma pasta do computador como vault, por um diálogo nativo do sistema. | P0 |
| RF1.2 | Reabrir automaticamente o último vault usado ao iniciar o app. | P0 |
| RF1.3 | Trocar de vault sem reiniciar, listando os vaults recentes. | P1 |
| RF1.4 | Indexar o vault na abertura, mostrando progresso quando levar mais de 500 ms. | P0 |
| RF1.5 | Detectar mudanças feitas por outros programas na pasta e atualizar a árvore e o índice. | P0 |
| RF1.6 | Ignorar no índice e na árvore: qualquer pasta que comece com ponto (inclui `.trash/`, `.excalisidian/`, `.git/`), a pasta `node_modules/` e arquivos com extensão `.excalisidian-tmp`. | P0 |
| RF1.7 | Criar nota, criar desenho e criar pasta, tanto pelo botão do topo da sidebar quanto pelo menu de contexto de uma pasta. | P0 |
| RF1.8 | Renomear arquivo ou pasta com `F2` ou pelo menu de contexto, atualizando todos os links que apontavam para eles. | P0 |
| RF1.9 | Mover arquivo ou pasta arrastando na árvore, atualizando todos os links. | P1 |
| RF1.10 | Recusar nomes inválidos no Windows com mensagem que diz qual é o problema. | P0 |
| RF1.11 | Duplicar um arquivo (`Nota` vira `Nota 1`). | P2 |
| RF1.12 | Abrir a pasta do arquivo no Explorer pelo menu de contexto. | P1 |

## Módulo 2 — Editor de notas

| ID | Requisito | P |
|---|---|---|
| RF2.1 | Editar markdown com a sintaxe oculta fora da linha do cursor e visível na linha do cursor (live preview). | P0 |
| RF2.2 | Renderizar em live preview: headings, negrito, itálico, riscado, destaque, código inline, blocos de código com realce, listas, task lists, citações, linha horizontal, links, imagens, tabelas. | P0 |
| RF2.3 | Alternar para modo de código puro (toda a sintaxe visível) por comando. | P1 |
| RF2.4 | Alternar para modo de leitura (nada editável, nada de sintaxe) por `Ctrl+E`. | P1 |
| RF2.5 | Salvar automaticamente com debounce de 800 ms por documento, e imediatamente ao trocar de aba, ao perder o foco da janela e ao fechar o app. | P0 |
| RF2.6 | Salvar manualmente com `Ctrl+S`. | P0 |
| RF2.7 | Autocompletar wikilink ao digitar `[[`, buscando por nome de arquivo e por alias, com criação inline de nota inexistente. | P0 |
| RF2.8 | Navegar para a nota ao clicar num wikilink; `Ctrl+clique` abre em nova aba. | P0 |
| RF2.9 | Renderizar embeds `![[…]]` de nota, seção, bloco, imagem e desenho dentro do editor. | P1 |
| RF2.10 | Exibir frontmatter YAML como um bloco de propriedades recolhido, não como texto cru. | P1 |
| RF2.11 | Atalhos de formatação: `Ctrl+B`, `Ctrl+I`, `Ctrl+K` (link), ``Ctrl+` `` (código). `Ctrl+K` também é link no canvas (RF5.12) — contextos disjuntos, coincidência proposital com o Excalidraw. | P1 |
| RF2.12 | Colar imagem da área de transferência com `Ctrl+V`, gravando o arquivo na pasta de anexos e inserindo `![[…]]`. | P1 |
| RF2.13 | Colar uma URL com texto selecionado transforma a seleção em link markdown. | P2 |
| RF2.14 | Desfazer e refazer com histórico por documento, preservado enquanto a aba estiver aberta. | P0 |
| RF2.15 | Continuar lista automaticamente ao apertar Enter dentro de uma lista, e sair da lista com Enter em item vazio. | P1 |

## Módulo 3 — Abas e divisão de tela

| ID | Requisito | P |
|---|---|---|
| RF3.1 | Abrir arquivos em abas; `Ctrl+T` abre uma aba nova em branco. | P0 |
| RF3.2 | Fechar aba com `Ctrl+W`; reabrir a última fechada com `Ctrl+Shift+T`. | P0 |
| RF3.3 | Navegar entre abas com `Ctrl+Tab`, `Ctrl+Shift+Tab` e `Ctrl+1`…`Ctrl+9`. | P1 |
| RF3.4 | Dividir a tela em vertical e em horizontal, pelo menu de contexto da aba e por comando. | P0 |
| RF3.5 | Arrastar uma aba para a borda de um grupo para criar uma divisão nova, com destaque visual da zona de soltura. | P0 |
| RF3.6 | Arrastar uma aba entre grupos existentes. | P0 |
| RF3.7 | Redimensionar os painéis arrastando a divisória. | P0 |
| RF3.8 | Restaurar o layout de abas exatamente como estava ao reabrir o app. | P0 |
| RF3.9 | Marcar aba com edição não salva com um indicador visível. | P1 |
| RF3.10 | Fixar aba, impedindo que links abertos a partir dela substituam seu conteúdo. | P2 |

## Módulo 4 — Sidebar e navegação

| ID | Requisito | P |
|---|---|---|
| RF4.1 | Árvore de pastas e arquivos, com expandir e recolher, estado preservado entre sessões. | P0 |
| RF4.2 | Ordenar por nome, por data de modificação e por data de criação, crescente e decrescente. Exige `birthtimeMs` no retorno do `walk_vault` e no `FileMeta`. | P1 |
| RF4.3 | Revelar automaticamente o arquivo ativo na árvore (ligável e desligável). | P1 |
| RF4.4 | Menu de contexto na árvore: nova nota, novo desenho, nova pasta, renomear, mover para a lixeira, duplicar, revelar no Explorer, copiar caminho. | P0 |
| RF4.5 | Arrastar arquivo para dentro de uma pasta na árvore. | P1 |
| RF4.6 | Quick switcher com `Ctrl+O`: busca por nome e alias, `Enter` abre, `Ctrl+Enter` abre em nova aba, nome inexistente cria a nota. | P0 |
| RF4.7 | Paleta de comandos com `Ctrl+P`, busca aproximada, exibindo o atalho de cada comando. | P1 |
| RF4.8 | Busca por conteúdo com `Ctrl+Shift+F`, listando arquivo, número da linha e trecho com o termo destacado. | P1 |
| RF4.9 | Painel de backlinks do arquivo ativo, com o trecho de contexto de cada menção. | P1 |
| RF4.10 | Recolher a sidebar com `Ctrl+\`. | P1 |
| RF4.11 | Painel de sumário (headings do arquivo ativo) com navegação por clique. | P2 |

## Módulo 5 — Canvas

| ID | Requisito | P |
|---|---|---|
| RF5.1 | Canvas infinito com fundo pontilhado sempre visível (é o papel, não uma grade opcional), zoom e pan. | P0 |
| RF5.2 | Ferramentas: seleção, mão, retângulo, losango, elipse, seta, linha, desenho à mão livre, texto, imagem, post-it, borracha. | P0 |
| RF5.3 | Atalhos de ferramenta por tecla única: `V` seleção, `H` mão, `R` retângulo, `D` losango, `O` elipse, `A` seta, `L` linha, `P` mão livre, `T` texto, `S` post-it, `9` imagem, `E` borracha. Todos vêm do Excalidraw, menos `S` — a ferramenta post-it não existe lá. | P1 |
| RF5.4 | Painel de propriedades com cor de traço, cor de preenchimento, estilo de preenchimento, espessura, estilo de linha, imperfeição, cantos, opacidade, camadas e ações. | P0 |
| RF5.5 | Paletas restritas: 5 cores de traço e 5 opções de preenchimento (uma delas transparente), definidas no design system. | P0 |
| RF5.6 | Escrever texto dentro de uma forma com duplo clique; a forma cresce em altura para caber o texto. | P0 |
| RF5.7 | Conectores: setas que se prendem a formas e acompanham a forma quando ela é movida ou redimensionada. | P0 |
| RF5.8 | Rótulo em cima da seta (duplo clique na seta). | P1 |
| RF5.9 | Post-it: ferramenta que cria um quadrado com preenchimento sólido e texto já em edição, em uma das cores de post-it. | P0 |
| RF5.10 | Colar imagem com `Ctrl+V` e arrastar arquivo de imagem para o canvas; a imagem é gravada como arquivo na pasta de anexos e referenciada pelo desenho. | P0 |
| RF5.11 | Escrever `[[Nota]]` num elemento de texto cria um link clicável para a nota; o link conta como backlink da nota. | P0 |
| RF5.12 | Anexar um link a qualquer elemento (não só texto) com `Ctrl+K`, com indicador visual de que o elemento tem link. | P1 |
| RF5.13 | Selecionar, mover, redimensionar, girar, agrupar, alinhar, duplicar e travar elementos. | P0 |
| RF5.21 | Bloquear os atalhos destrutivos do Excalidraw embutido, em especial `Ctrl+Delete` (limpar a cena inteira), e deixar passar para o app os atalhos de aplicação (`Ctrl+S`, `Ctrl+O`, `Ctrl+P`, `Ctrl+T`, `Ctrl+W`). | P0 |
| RF5.14 | Desfazer e refazer no canvas enquanto a aba estiver visível. O histórico se perde quando a aba sai de vista e a instância é desmontada — comportamento conhecido e aceito. | P0 |
| RF5.15 | Salvar automaticamente com o mesmo contrato das notas (debounce, atômico). | P0 |
| RF5.16 | Exportar o desenho como PNG e como SVG, com opção de fundo transparente. | P1 |
| RF5.17 | Copiar e colar elementos entre desenhos diferentes. | P1 |
| RF5.18 | Encaixe na grade de 20px, ligável e desligável. Não altera o fundo pontilhado, que é fixo. | P2 |
| RF5.19 | Biblioteca de elementos reutilizáveis. | P2 |
| RF5.20 | Embutir uma nota inteira dentro do desenho como imagem renderizada. | P2 |

## Módulo 6 — Integração entre nota e desenho

| ID | Requisito | P |
|---|---|---|
| RF6.1 | `![[Desenho.draw]]` numa nota renderiza o desenho como SVG, com largura e altura opcionais. A forma com `.md` explícito também resolve. | P0 |
| RF6.2 | Clicar no desenho embutido abre o desenho na aba. | P0 |
| RF6.3 | Editar o desenho atualiza a renderização em todas as notas abertas que o embutem. | P1 |
| RF6.4 | `[[Desenho.draw#^idDoElemento]]` numa nota transclui o texto daquele elemento. | P2 |
| RF6.5 | Comando "Copiar link para este elemento" no menu de contexto de um elemento do canvas. | P2 |
| RF6.6 | Backlinks de uma nota incluem os desenhos que a referenciam, exibindo o nome do desenho. | P0 |
| RF6.7 | Renomear uma nota atualiza os links escritos dentro dos desenhos. | P0 |

## Módulo 7 — Lixeira

| ID | Requisito | P |
|---|---|---|
| RF7.1 | Excluir arquivo ou pasta move para `.trash/` do vault, registrando o caminho original e a data. | P0 |
| RF7.2 | Painel de lixeira listando os itens com nome, caminho original e data de exclusão. | P0 |
| RF7.3 | Restaurar um item para o caminho original, recriando a pasta se ela não existir mais. | P0 |
| RF7.4 | Esvaziar a lixeira, com confirmação que informa a quantidade exata de arquivos. | P0 |
| RF7.5 | Desfazer a exclusão pelo toast, por até 8 segundos. | P1 |
| RF7.6 | Escolher nas preferências entre lixeira do vault, lixeira do sistema e exclusão permanente. | P2 |

## Módulo 8 — Aparência e preferências

| ID | Requisito | P |
|---|---|---|
| RF8.1 | Tema claro (Papel) e escuro (Tinta), com opção de seguir o sistema. `prefsStore.tema` guarda `claro`, `escuro` ou `sistema`; no modo `sistema` o app escuta `prefers-color-scheme` e aplica ou remove a classe `.dark` na tag `<html>`. | P0 |
| RF8.2 | Preferências do vault (pasta de anexos, local de novas notas, formato de link, lixeira), gravadas em `.excalisidian/vault.json`. Tema e vaults recentes são da máquina e ficam em `settings.json`. | P1 |
| RF8.3 | Tela de atalhos de teclado, listando todos os comandos. | P2 |
| RF8.4 | Toda ação de arrastar tem equivalente por teclado ou por menu. | P1 |

---

## Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF1 | Abrir um vault de 5 000 notas em menos de 2 segundos, com o índice em cache válido. |
| RNF2 | Digitar numa nota de 100 KB sem atraso perceptível de renderização. |
| RNF3 | Um desenho de 500 elementos faz pan e zoom a 60 fps. |
| RNF4 | Nenhuma perda de conteúdo em caso de fechamento abrupto: no máximo 800 ms de digitação. |
| RNF5 | Funciona sem qualquer acesso à internet, incluindo fontes do canvas. |
| RNF6 | Arquivos gravados em UTF-8 sem BOM, com `\n`, e legíveis em qualquer editor. |
| RNF7 | Abrir e fechar um arquivo sem editar não produz diff no Git. |
| RNF8 | Contraste AA (4,5:1) em todo texto, nos dois temas. `ocre` nunca é cor de texto sobre fundo claro — para texto usa-se `ocre-tinta`. |
| RNF9 | Foco visível em todo elemento interativo. |
