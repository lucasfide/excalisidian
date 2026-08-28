# 07 — Prompt para o Claude Design

Cole o bloco abaixo inteiro no Claude Design. Ele é autossuficiente: repete os tokens do design system para não depender de anexo.

Se quiser gerar em duas rodadas (recomendado, para não diluir a atenção), use a **Rodada 1** primeiro e depois a **Rodada 2**.

---

## Rodada 1 — telas principais

````
Crie um design canvas com 4 artboards de um aplicativo desktop para Windows chamado Excalisidian. É um app de notas em Markdown com canvas de desenho integrado — pense em Obsidian e Excalidraw no mesmo programa. Público: uma pessoa só, uso pessoal, offline.

Artboards em 1440 x 900 cada, lado a lado.

## DIREÇÃO VISUAL — obrigatória, não invente valores

A direção é "caderno editorial": papel manilha, tinta, réguas finas, anotação de margem em máquina de escrever, ficha de arquivo. NÃO é um app SaaS de produtividade.

Três regras que valem para tudo:
1. Estrutura é feita de réguas (hairlines de 1px), não de sombras. Sombra existe em exatamente dois casos: elemento arrastado e superfície flutuante (modal, popover, autocomplete, toolbar do canvas). Nenhuma superfície ancorada — sidebar, painel, aba, barra de status — tem sombra.
2. Raio de canto quase zero: 3px em painéis e fichas, 2px em controles. Papel cortado, não bolha.
3. Metadado é datilografado: caminho, contagem, atalho, nome de ferramenta em IBM Plex Mono 11px caixa alta com letter-spacing 0.09em.

Proibido: gradiente, sombra difusa, canto de 12px, roxo, azul de SaaS, glassmorphism, emoji, ilustração colorida.

## PALETA — use exatamente estes hex

papel #EFEAE1 (fundo da janela e do canvas)
superficie #FBF9F5 (painéis, campos, sobreposições, aba ativa)
lavagem #E5DFD4 (hover, faixa de aba inativa, fundo de código)
regua #DCD5C8 (hairlines, divisórias e os pontos da grade)
regua-forte #8C8578 (borda de campo e de botão secundário)
tinta #1C1917 (texto principal)
tinta-media #4A443C (texto secundário, ícones)
tinta-suave #655E54 (metadado, placeholder, sintaxe markdown)
musgo #3E5C46 (marca, ação primária, seleção, foco, link resolvido)
ocre #A87A1C (atenção, não salvo, destaque de busca — nunca como cor de texto)
ocre-tinta #7A5610 (texto na cor ocre sobre fundo claro)
bordo #7A2E22 (erro, destrutivo, link não resolvido)

## TIPOGRAFIA

Fraunces (serifa variável) para display e headings do markdown.
Instrument Sans para interface e corpo de texto.
IBM Plex Mono para metadado e código.

Escala: display-1 44/1.05 Fraunces 600 · display-2 32/1.10 Fraunces 600 · titulo-1 24/1.20 Fraunces 500 · titulo-2 19/1.30 Fraunces 500 · titulo-3 16/1.40 Fraunces 500 · campo-grande 17/1.4 Instrument Sans 400 · corpo 15/1.55 Instrument Sans 400 · corpo-forte 15/1.45 Instrument Sans 500 · pequeno 13/1.45 Instrument Sans 400 · meta 11/1.0 IBM Plex Mono 500 caixa alta tracking 0.09em · meta-mini 9/1.0 IBM Plex Mono 500 caixa alta.

## ESTRUTURA COMUM A TODAS AS TELAS

- Barra de título de 38px no topo: logotipo "Excalisidian" em Fraunces 600, 16px à esquerda com uma régua de 2px em musgo embaixo, ocupando 40% da largura da palavra; controles de janela minimizar/maximizar/fechar à direita, em traço fino.
- Sidebar de 264px à esquerda, fundo superficie, separada por hairline regua.
- Barra de status de 24px embaixo, fundo superficie, hairline regua em cima: à esquerda o caminho do arquivo em meta ("PROJETOS/ARQUITETURA.MD"), à direita "1 240 PALAVRAS" e "SALVO" em meta tinta-suave.
- Área central: barra de abas de 34px e o conteúdo.
- Abas são fichas de arquivo: altura 34px, sem raio no topo, hairline regua entre elas; aba inativa com fundo lavagem, aba ativa com fundo superficie e SEM borda inferior (funde com o conteúdo). Nome da aba em pequeno (13px, Instrument Sans 400), ícone de 14px à esquerda, x de fechar à direita só no hover. Aba com edição não salva mostra um ponto de 6px em ocre no lugar do x.

## SIDEBAR (igual nas 4 telas)

De cima para baixo:
- Linha de ações com 4 botões-ícone de 28px em tinta-media: nova nota (file-plus), novo desenho (square-pen), nova pasta (folder-plus), ordenar (arrow-up-narrow-wide). Hairline regua embaixo.
- Árvore de arquivos. Cada nível recua 16px. Pastas com chevron e ícone folder/folder-open, arquivos com file-text (nota) ou pen-line (desenho). Item ativo tem fundo lavagem e uma régua vertical de 2px em musgo colada na borda esquerda do item. Hover: fundo lavagem.
  Conteúdo: pasta "Projetos" aberta com "Excalisidian.md", "Arquitetura.draw.md" (ativo), "Backend.md"; pasta "Diário" fechada; pasta "Referências" fechada; arquivo solto "Inbox.md"; pasta "anexos" fechada.
- Na base da sidebar, colado embaixo, uma barra com 4 ícones de 16px em tinta-suave: search, corner-down-left (backlinks), trash-2 (lixeira), settings. Hairline regua em cima.

## ARTBOARD 1 — "Editor de nota"

Uma aba só, aberta em "Excalisidian.md".

A área de texto tem largura máxima de 720px centralizada no painel. Dentro dela, a MARGINÁLIA: uma coluna de 76px à esquerda, separada do texto por uma hairline VERTICAL CONTÍNUA em regua que atravessa o documento inteiro de cima a baixo. Dentro da margem, alinhados ao topo do bloco correspondente, marcadores em meta tinta-suave: "H1" ao lado do título, "H2" ao lado dos subtítulos, "EMB" ao lado do desenho embutido, "^DEC-3" ao lado de um parágrafo com id de bloco.

O texto mostra LIVE PREVIEW: markdown renderizado, com a sintaxe visível só na linha onde está o cursor. Mostre isso explicitamente — uma linha com o cursor exibindo "**decisão**" com os asteriscos em tinta-suave e a palavra em negrito preto, e as outras linhas sem asterisco nenhum.

Conteúdo da nota:
- Título H1 em Fraunces "Por que o canvas é markdown"
- Um parágrafo de corpo com dois links internos em musgo sem sublinhado: [[Projetos/Arquitetura]] e [[Backend]], e um link não resolvido em bordo com sublinhado tracejado: [[Sincronização]]
- H2 "Consequências"
- Uma lista de 3 itens com bullets
- Um bloco de desenho embutido: um retângulo de 640x300 com hairline regua, raio 3px, fundo papel com grade de pontos, contendo um diagrama simples desenhado à mão (3 caixas ligadas por setas) em tinta e musgo. Acima do bloco, à esquerda, em meta tinta-suave: "ARQUITETURA.EXCALIDRAW.MD"
- Um parágrafo com um trecho em ==destaque== com fundo ocre a 22%
- Um bloco de código em IBM Plex Mono 13px, fundo lavagem, hairline regua, raio 3px
- A linha com o cursor piscando (barra de 2px em tinta) mostrando a sintaxe

## ARTBOARD 2 — "Canvas de desenho"

Uma aba só, aberta em "Arquitetura.draw.md".

O canvas ocupa todo o painel. Fundo papel com GRADE DE PONTOS: pontos de 1px em regua espaçados 20px, opacidade 60%.

Toolbar flutuante NO TOPO, CENTRALIZADA, a 16px do topo do painel: fundo superficie, hairline regua, raio 3px, sombra de sobreposição (a toolbar flutua, e superfície flutuante é um dos dois casos em que sombra é permitida), padding 4px. 12 botões de 32px com ícones de 18px em tinta-media, separados em 3 grupos por hairlines verticais: (seleção mouse-pointer-2, mão hand) | (retângulo square, losango diamond, elipse circle, seta move-right, linha minus, mão livre pencil) | (texto type, post-it sticky-note, imagem image, borracha eraser). A ferramenta ativa é "seta": fundo musgo, ícone superficie. Cada botão tem a tecla de atalho em meta-mini (IBM Plex Mono 500, 9px, caixa alta) em tinta-suave no canto inferior direito (V H R D O A L P T S 9 E).

Painel de propriedades À ESQUERDA, ancorado, largura 216px, fundo superficie, hairline regua à direita, começando abaixo da barra de abas. Seções separadas por hairline, cada uma com rótulo em meta tinta-suave:
- TRAÇO: 5 quadrados de 24px, raio 2px — #1C1917, #3E5C46, #A87A1C, #7A2E22, #655E54. O primeiro selecionado, com uma régua de 2px em musgo embaixo dele.
- PREENCHIMENTO: 5 quadrados — transparente (xadrez sutil), #E5DFD4, #CFDBD1, #EDDCB4, #E7CEC8
- ESPESSURA: 3 botões com linhas de 1, 2 e 4px
- ESTILO: 3 botões, linha contínua, tracejada, pontilhada
- IMPERFEIÇÃO: 2 botões, reta e à mão
- CANTOS: 2 botões, vivo e arredondado
- OPACIDADE: um slider fino, trilho regua, alça quadrada de 12px em musgo
- CAMADAS: 4 botões-ícone
- AÇÕES: duplicar, agrupar, travar, excluir (excluir em bordo)

No canvas, um diagrama de arquitetura desenhado com a estética à mão livre do Excalidraw:
- 3 retângulos de canto arredondado com texto dentro, traço tinta, preenchimento transparente: "Editor", "Índice", "Vault"
- 1 elipse com traço musgo: "Watcher"
- setas conectando as formas, com pontas de flecha, uma delas com o rótulo "escreve" em cima
- 2 post-its: um em #EDDCB4 escrito "decidir: comprimir JSON?" e um em #CFDBD1 escrito "testar 500 elementos"
- um elemento de texto que é um link: "[[Projetos/Backend]]" em musgo, com um pequeno ícone de link antes
- uma imagem colada (um retângulo com um placeholder de imagem) com alça de seleção
- um dos retângulos está SELECIONADO: contorno de 1px em musgo com 8 alças quadradas de 8px em musgo

## ARTBOARD 3 — "Tela dividida: nota e desenho"

O painel central dividido ao meio na VERTICAL por uma divisória de 1px em regua.

Painel esquerdo: duas abas ("Excalisidian.md" ativa, "Backend.md" com ponto ocre de não salvo), com o editor de nota. Como cada metade do split tem cerca de 590px, a marginália aparece COLAPSADA: coluna de 24px, sem os rótulos de heading, mostrando só os marcadores de bloco ("^DEC-3"), com a hairline vertical contínua preservada. Este é o estado colapsado real do produto — desenhe assim de propósito.
Painel direito: uma aba ("Arquitetura.draw.md") com o canvas pontilhado, o mesmo diagrama do artboard 2 mas menor, e a toolbar flutuante no topo desse painel — em versão compacta, sem os rótulos de atalho.

Mostre uma aba SENDO ARRASTADA: uma ficha de aba flutuando entre os dois painéis, com rotação de -0.7 graus, escala levemente maior e sombra; e na borda inferior do painel direito uma ZONA DE SOLTURA destacada: retângulo com fundo musgo a 12% e hairline musgo de 1px, ocupando a metade inferior do painel.

## ARTBOARD 4 — "Quick switcher aberto"

O mesmo layout do artboard 1 ao fundo, escurecido por um véu de tinta a 30%.

Por cima, centralizado no terço superior, o quick switcher: 620px de largura, fundo superficie, hairline regua, raio 3px, sombra de sobreposição.
- Campo de busca no topo: altura 52px, sem borda própria, hairline regua embaixo, ícone search de 18px em tinta-suave à esquerda, texto digitado "arqui" em campo-grande (17px, Instrument Sans 400).
- Lista de 4 resultados, cada um com 44px de altura: ícone de tipo à esquerda, nome do arquivo em corpo-forte com o trecho "arqui" destacado em fundo ocre a 22%, e o caminho da pasta à direita em meta tinta-suave. O primeiro resultado está selecionado: fundo lavagem e régua de 2px em musgo na borda esquerda.
  Resultados: "Arquitetura.draw.md" (PROJETOS), "Arquitetura de dados.md" (REFERÊNCIAS), "Notas de arquitetura.md" (DIÁRIO), "Arquivo morto.md" (raiz).
- Última linha da lista, separada por hairline: "Criar «arqui»" com ícone file-plus, em tinta-media.
- Rodapé de 32px com hairline em cima, em meta tinta-suave: "↑↓ NAVEGAR   ⏎ ABRIR   CTRL+⏎ NOVA ABA   ESC FECHAR"

Gere os 4 artboards com fidelidade alta, respeitando os hex exatos, as hairlines de 1px e a ausência total de sombra fora dos dois casos permitidos.
````

---

## Rodada 2 — telas de apoio

````
Adicione 4 artboards ao canvas, mesma direção visual, mesma paleta e mesma tipografia das telas anteriores (caderno editorial: papel #EFEAE1, superficie #FBF9F5, lavagem #E5DFD4, regua #DCD5C8, regua-forte #8C8578, tinta #1C1917, tinta-media #4A443C, tinta-suave #655E54, musgo #3E5C46, ocre #A87A1C, ocre-tinta #7A5610, bordo #7A2E22; Fraunces / Instrument Sans / IBM Plex Mono; hairlines de 1px, raio 3px, sem gradiente, sem sombra difusa). 1440x900 cada.

## ARTBOARD 5 — "Busca e backlinks"

Layout de 3 colunas: sidebar 264px, editor no centro, painel direito de 320px (o painel de backlinks aberto como coluna própria, além de existir dentro da sidebar).

A sidebar está mostrando o PAINEL DE BUSCA no lugar da árvore: campo de busca no topo com o termo "canvas", e abaixo os resultados agrupados por arquivo — nome do arquivo em corpo-forte, contagem de ocorrências em meta à direita, e até 3 trechos por arquivo em pequeno tinta-media com o termo destacado em fundo ocre a 22%. Hairline regua entre grupos. 4 arquivos, um deles um desenho (ícone pen-line) com o rótulo "DESENHO" em meta.

Centro: o editor de nota, versão simples.

Painel direito, fundo superficie, hairline regua à esquerda: título "Backlinks" em titulo-2, contagem "4 NOTAS" em meta embaixo. Lista de 4 itens, cada um com o nome da nota de origem em corpo-forte e o trecho onde o link aparece em pequeno tinta-media, com o wikilink em musgo. Um dos itens é um desenho e mostra "ARQUITETURA.EXCALIDRAW.MD" com ícone pen-line.

## ARTBOARD 6 — "Lixeira"

Sidebar mostrando o painel de lixeira selecionado (o ícone trash-2 da barra inferior está ativo, com fundo lavagem).

O painel central inteiro é a lixeira, com largura máxima de 720px centralizada:
- Cabeçalho: "Lixeira" em display-2 Fraunces, e abaixo "12 ARQUIVOS · 4,2 MB" em meta tinta-suave. À direita do cabeçalho, um botão destrutivo "Esvaziar lixeira" (texto e borda bordo, fundo transparente).
- Hairline regua.
- Lista de itens, cada linha com 56px: ícone de tipo, nome do arquivo em corpo-forte, caminho original embaixo em meta tinta-suave ("PROJETOS/ANTIGOS"), data de exclusão à direita em meta ("28 AGO 23:14"), e um botão fantasma "Restaurar" que aparece no hover. Hairline entre linhas, sem zebra.
- 6 itens visíveis, um deles uma pasta (ícone folder) com "14 ARQUIVOS" no lugar do caminho.
- Uma das linhas está em hover: fundo lavagem, com o botão "Restaurar" visível.

## ARTBOARD 7 — "Diálogo de confirmação destrutiva"

Fundo: a tela da lixeira, escurecida por véu de tinta a 30%.

No centro, o diálogo: 480px de largura, fundo superficie, hairline regua, raio 3px, sombra de sobreposição, padding 24px.
- Título em titulo-2: "Esvaziar a lixeira?"
- Corpo em corpo tinta-media: "12 arquivos serão excluídos permanentemente, incluindo a pasta «Antigos» com 14 arquivos dentro. Isso não pode ser desfeito."
- Uma lista compacta em meta tinta-suave dos 3 primeiros nomes e "+ 9 OUTROS"
- Rodapé com dois botões alinhados à direita: "Cancelar" (secundário) e "Excluir 12 arquivos" (destrutivo em repouso: fundo transparente, borda e texto em bordo — o preenchimento sólido só acontece no hover)

## ARTBOARD 8 — "Estados: vault vazio, conflito e erro"

Divida o artboard em 3 faixas horizontais de 300px, separadas por hairline regua, cada uma com um rótulo em meta tinta-suave no canto superior esquerdo.

Faixa 1 — "VAULT VAZIO": o app com a sidebar vazia (só a linha de ações) e no centro um estado vazio: um bloco de 520px com hairline em cima e embaixo, título em titulo-2 "Este vault está em branco.", linha de apoio em pequeno tinta-media "Crie a primeira nota ou o primeiro desenho.", e dois botões: "Nova nota" (primário, fundo musgo) e "Novo desenho" (secundário).

Faixa 2 — "CONFLITO COM O DISCO": o editor de nota com uma faixa no topo, largura total do painel, altura 44px, fundo ocre a 12%, hairline ocre em cima e embaixo: ícone alert-triangle de 16px em ocre, texto "Este arquivo mudou fora do Excalisidian." em corpo, e à direita dois botões compactos: "Recarregar do disco" (secundário) e "Manter minha versão" (fantasma).

Faixa 3 — "ERRO AO SALVAR": o editor com uma faixa igual mas em bordo a 12% com hairline bordo: "Não foi possível salvar «Arquitetura». O arquivo pode estar aberto em outro programa." e um botão "Tentar de novo". A aba correspondente mostra o ponto de não salvo em bordo em vez de ocre.
````

---

## Depois de gerar

O que olhar antes de aceitar:

1. **A hairline vertical da marginália atravessa o documento inteiro?** Se ela virou uma linha por parágrafo, o elemento de assinatura se perdeu.
2. **A aba ativa tem borda inferior?** Não pode ter. Ela funde com o conteúdo.
3. **Tem sombra em algum lugar que não seja elemento arrastado, modal, popover ou a toolbar flutuante do canvas?** Se tiver, peça para remover.
4. **A grade do canvas é de pontos, não de linhas?**
5. **Os hex são os do sistema?** Se apareceu qualquer azul, roxo ou cinza neutro, está errado.
6. **O metadado está em mono, caixa alta, com tracking?**


---

## Rodada 3 — tema escuro

Duas telas. O tema escuro tem paleta própria (não é inversão do claro) e quatro cores de post-it que só existem nele. Sem esta rodada, ninguém terá visto essas telas antes de codar, e RF8.1 é P0.

````
Adicione 2 artboards de 1440x900 ao canvas, com a MESMA estrutura das telas anteriores, agora no TEMA ESCURO do Excalisidian.

## PALETA ESCURA — use exatamente estes hex

papel #16140F (fundo da janela e do canvas)
superficie #1F1C16 (painéis, campos, sobreposições, aba ativa)
lavagem #272319 (hover, faixa de aba inativa, fundo de código)
regua #34302A (hairlines, divisórias, pontos da grade)
regua-forte #6E675C (borda de campo e de botão secundário)
tinta #EFEAE0 (texto principal)
tinta-media #BDB6A9 (texto secundário, ícones)
tinta-suave #9A9384 (metadado, placeholder, sintaxe markdown)
musgo #86A98B (marca, ação primária, seleção, foco, link resolvido)
ocre #D3A845 (atenção, não salvo, destaque de busca)
bordo #C97B69 (erro, destrutivo, link não resolvido)

O papel escuro é um marrom-tinta, NUNCA cinza neutro nem preto puro. Mesma tipografia, mesmas hairlines de 1px, mesmo raio de 3px, sem gradiente.

Sombra no escuro é preta e mais opaca (0 24px 60px -16px rgba(0,0,0,0.70)), e toda superfície flutuante leva TAMBÉM uma hairline regua — sombra sozinha não separa nesse fundo.

## ARTBOARD 9 — "Editor de nota, tema escuro"

Igual ao artboard 1 — barra de título, sidebar de 264px com a árvore, barra de status, marginália de 76px com a hairline vertical contínua, live preview com a sintaxe visível só na linha do cursor, desenho embutido, bloco de código, trecho em destaque — agora na paleta escura. O bloco do desenho embutido tem fundo papel escuro com os pontos da grade em regua.

## ARTBOARD 10 — "Canvas, tema escuro"

Igual ao artboard 2 — toolbar flutuante no topo centralizada com as 12 ferramentas em 3 grupos, painel de propriedades de 216px à esquerda, diagrama de arquitetura com formas, setas ligadas e texto dentro das formas, um elemento selecionado com alças em musgo — agora na paleta escura, com estas trocas:

- fundo do canvas: papel #16140F com pontos de 1px em regua #34302A espaçados 20px, opacidade 80%
- TRAÇO, os 5 quadrados: #EFEAE0, #86A98B, #D3A845, #C97B69, #9A9384
- PREENCHIMENTO, os 5: transparente, #272319, #2C3A2F, #3D3323, #3A2823
- os 2 post-its no canvas: um em #4A3E28 e outro em #2F4034, ambos com o texto em #EFEAE0
- o elemento de texto que é link ([[Projetos/Backend]]) em musgo #86A98B
````
