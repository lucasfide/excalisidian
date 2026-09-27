# 06 — Design system

Este arquivo é normativo. Nenhum valor visual pode ser inventado durante a implementação.

É o mesmo sistema do Taskly — direção "caderno editorial" — estendido com o que o Taskly não tinha: canvas, ferramentas de desenho e abas.

---

## Direção: caderno editorial

O Excalisidian não se parece com um app de notas de SaaS. Ele se parece com um **caderno de trabalho**: papel manilha, tinta, réguas finas, anotações de margem em máquina de escrever, fichas de arquivo.

Três consequências que valem para toda tela:

1. **A estrutura é feita de réguas, não de sombras.** Hairlines de 1px separam conteúdo. Sombra existe em exatamente dois casos: elemento sendo arrastado e superfície flutuante (modal, popover, autocomplete, toolbar do canvas). Nenhuma superfície ancorada — sidebar, painel, aba, barra de status — tem sombra.
2. **Raio de canto é quase zero.** 3px em fichas e painéis, 2px em controles. Papel cortado, não bolha.
3. **Metadado é datilografado.** Toda informação de sistema — caminho, contagem, data, coordenada, nome de ferramenta — é IBM Plex Mono em caixa alta com tracking aberto. Conteúdo do usuário é serifa ou sans.

**O que esta direção não é:** não usar terracota, argila ou laranja-queimado como cor de destaque; não usar Playfair Display nem Inter; não usar gradiente em nenhum lugar; não usar cartão com sombra difusa e canto de 12px.

---

## Paleta

Tema claro — **Papel**:

| Token | Hex | Uso |
|---|---|---|
| `papel` | `#EFEAE1` | fundo da janela, fundo do canvas |
| `superficie` | `#FBF9F5` | painéis, campos, sobreposições, aba ativa |
| `lavagem` | `#E5DFD4` | hover de linha, faixa de aba, fundo de código |
| `regua` | `#DCD5C8` | hairlines estruturais e decorativas, divisórias, pontos da grade |
| `regua-forte` | `#8C8578` | borda de controle interativo: campo, botão secundário, checkbox |
| `tinta` | `#1C1917` | texto principal, traço padrão do desenho |
| `tinta-media` | `#4A443C` | texto secundário, ícones |
| `tinta-suave` | `#655E54` | metadado, placeholder, sintaxe markdown visível |
| `cristal` | `#74419D` | marca, ação primária, seleção, foco, link resolvido |
| `ocre` | `#A87A1C` | atenção, edição não salva, destaque de busca |
| `ocre-tinta` | `#7A5610` | texto sobre fundo claro na cor ocre |
| `bordo` | `#7A2E22` | erro, ação destrutiva, link não resolvido |

Tema escuro — **Cristal**:

| Token | Hex |
|---|---|
| `papel` | `#0D0C10` |
| `superficie` | `#161519` |
| `lavagem` | `#201E24` |
| `regua` | `#2F2D34` |
| `regua-forte` | `#686473` |
| `tinta` | `#EAEAEC` |
| `tinta-media` | `#B6B4BB` |
| `tinta-suave` | `#928F99` |
| `cristal` | `#AA85CB` |
| `ocre` | `#D3A845` |
| `ocre-tinta` | `#D3A845` |
| `bordo` | `#C97B69` |

O tema escuro não é inversão automática: o papel escurece para um quase-preto violeta, nunca para cinza neutro nem preto puro, e as cores clareiam para manter contraste.

Todas as superfícies do tema escuro ficam na matiz 258°, com saturação muito baixa — entre 7% e 14% nas superfícies, 5% nas tintas. O violeta só aparece de verdade no acento (`cristal`), nos links e no foco. **Não suba essa saturação sem olhar o app inteiro aberto:** os valores desceram duas vezes (15/09/2026) porque, numa tela cheia, mesmo pouca saturação integra numa área grande e o app inteiro lê como "roxo" — a primeira tentativa tinha superfícies em 21–22% e foi reprovada em tela. Token isolado sempre parece neutro demais; o julgamento é a tela. `papel` fica em L 5,5%, a luminosidade medida no fundo da própria logo: escuro o bastante para o roxo ler como preto. A escada de luminosidade é a mesma do tema Tinta, quente, que veio antes (14/09/2026): mesma ordem, mesmas distâncias entre degraus — é ela que segura a hierarquia e o contraste. O que mudou foi a temperatura, de marrom-tinta (40°) para violeta (258°), quando a identidade passou a ser a espada de cristal. `ocre` e `bordo` seguem os mesmos do tema anterior de propósito: erro tem que parecer erro, e sobre o chão novo eles dão 8,8:1 e 6,1:1, então não precisaram de recalibragem.

---

## Tipografia

| Papel | Fonte | Pesos | Onde |
|---|---|---|---|
| Display | **Fraunces** (variável, `SOFT 20`, `WONK 0`) | 400–600 | logotipo, título de nota no editor, headings do markdown |
| Interface | **Instrument Sans** | 400, 500, 600 | corpo do texto, rótulos, botões, campos, árvore de arquivos |
| Metadado | **IBM Plex Mono** | 400, 500 | caminhos, contagens, nome de ferramenta, atalhos, blocos de código |

Escala:

| Token | Tamanho / linha | Fonte e peso | Detalhe |
|---|---|---|---|
| `display-1` | 44 / 1.05 | Fraunces 600 | tracking −0.02em |
| `display-2` | 32 / 1.10 | Fraunces 600 | tracking −0.015em |
| `titulo-1` | 24 / 1.20 | Fraunces 500 | |
| `titulo-2` | 19 / 1.30 | Fraunces 500 | |
| `titulo-3` | 16 / 1.40 | Fraunces 500 | |
| `corpo` | 15 / 1.55 | Instrument Sans 400 | |
| `corpo-forte` | 15 / 1.45 | Instrument Sans 500 | |
| `pequeno` | 13 / 1.45 | Instrument Sans 400 | |
| `meta` | 11 / 1.0 | IBM Plex Mono 500 | caixa alta, tracking 0.09em |
| `meta-mini` | 9 / 1.0 | IBM Plex Mono 500 | caixa alta, tracking 0.06em — só para a tecla de atalho no botão de ferramenta |
| `campo-grande` | 17 / 1.4 | Instrument Sans 400 | só no campo da busca e da paleta de comandos |

Só `corpo` e `pequeno` existem como token de verdade (`--text-corpo`/`--text-pequeno` em `@theme`, classes `text-corpo`/`text-pequeno`). Os demais degraus (`display-1`, `display-2`, `titulo-1/2/3`, `meta-mini`, `campo-grande`) não têm token — cada uso reproduz o par tamanho/altura-de-linha desta tabela com valor arbitrário do Tailwind (`text-[24px] leading-[1.2]` etc., ex. `AmostraSimbolo.tsx`, `Campo.tsx`). `meta` tem a `@utility meta` própria em `globals.css`. Isto é o estado real do código, não uma licença para inventar outro número: qualquer novo uso desses degraus repete exatamente o par desta tabela.

### Tipografia dentro do editor

O texto da nota é o conteúdo do produto e merece regra própria:

| Elemento markdown | Estilo |
|---|---|
| `# H1` | `titulo-1`, margem superior 32px |
| `## H2` | `titulo-2`, margem superior 24px |
| `### H3` | `titulo-3`, margem superior 20px |
| corpo | `corpo`, dentro da coluna de 720px definida em Layout |
| código inline | IBM Plex Mono 13px, fundo `lavagem`, padding 2px 4px, raio 2px |
| bloco de código | IBM Plex Mono 13px, fundo `lavagem`, hairline `regua`, raio 3px |
| citação | borda esquerda 2px `regua`, texto `tinta-media`, itálico não |
| sintaxe markdown visível | `tinta-suave` — o `**` aparece em cinza, o texto continua preto |
| link resolvido | `cristal`, sem sublinhado, sublinhado no hover |
| link não resolvido | `bordo`, sublinhado tracejado 1px |
| destaque `==` | fundo `ocre` a 22%, sem borda |
| task list marcada | traço de 1px em `tinta-suave` sobre o texto |

**Fontes carregadas localmente**, empacotadas com o app. Nada de CDN — o app tem que funcionar offline (RNF5).

---

## Espaçamento, raio e sombra

Base 4px. Escala: 4, 8, 12, 16, 24, 32, 48, 64.

| Token | Valor |
|---|---|
| `raio-ficha` | 3px |
| `raio-controle` | 2px |
| `raio-pilula` | 999px |
| `sombra-ficha` | `0 8px 20px -8px rgb(28 25 23 / 0.25)` |
| `sombra-sobreposicao` | `0 24px 60px -20px rgb(28 25 23 / 0.35)` |

No tema escuro as duas são redefinidas com preto puro e mais opacidade (`rgb(0 0 0 / 0.55)` e `rgb(0 0 0 / 0.70)`): uma sombra de `#1C1917` a 25% sobre um fundo `#0D0C10` é invisível. Além dela, toda superfície flutuante no escuro leva uma hairline `regua` — a sombra sozinha não separa o suficiente.

Nenhuma outra sombra no projeto.

**Scrollbar.** Fina (10px), sem seta, trilho transparente, polegar em `regua` (`regua-forte` no hover), cantos em `raio-pilula` — declarada uma vez em `globals.css` (Firefox via `scrollbar-width`/`scrollbar-color`, Chromium/WebView2 via `::-webkit-scrollbar*`) e válida em todo o app, sem CSS por componente.

---

## Tokens em código

`src/estilos/globals.css`:

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

/* Fontes empacotadas com o app. Nada de CDN — RNF5. */
@font-face { font-family: "Fraunces"; src: url("/fontes/Fraunces.woff2") format("woff2-variations");
             font-weight: 400 700; font-display: block; }
@font-face { font-family: "Instrument Sans"; src: url("/fontes/InstrumentSans.woff2") format("woff2-variations");
             font-weight: 400 600; font-display: block; }
@font-face { font-family: "IBM Plex Mono"; src: url("/fontes/IBMPlexMono-Regular.woff2") format("woff2");
             font-weight: 400; font-display: block; }
@font-face { font-family: "IBM Plex Mono"; src: url("/fontes/IBMPlexMono-Medium.woff2") format("woff2");
             font-weight: 500; font-display: block; }

:root {
  --fonte-display: "Fraunces", Georgia, serif;
  --fonte-sans:    "Instrument Sans", system-ui, sans-serif;
  --fonte-mono:    "IBM Plex Mono", ui-monospace, monospace;
}

@theme {
  --color-papel:       #EFEAE1;
  --color-superficie:  #FBF9F5;
  --color-lavagem:     #E5DFD4;
  --color-regua:       #DCD5C8;
  --color-regua-forte: #8C8578;
  --color-tinta:       #1C1917;
  --color-tinta-media: #4A443C;
  --color-tinta-suave: #655E54;
  --color-cristal:     #74419D;
  --color-ocre:        #A87A1C;
  --color-ocre-tinta:  #7A5610;
  --color-bordo:       #7A2E22;

  --radius-ficha:    3px;
  --radius-controle: 2px;
  --radius-pilula:   999px;

  --shadow-ficha:        0 8px 20px -8px rgb(28 25 23 / 0.25);
  --shadow-sobreposicao: 0 24px 60px -20px rgb(28 25 23 / 0.35);

  --font-display: var(--fonte-display);
  --font-sans:    var(--fonte-sans);
  --font-mono:    var(--fonte-mono);

  /* Únicos dois degraus da escala tipográfica com token de verdade — ver nota abaixo da
     tabela de escala. */
  --text-corpo:            15px;
  --text-corpo--line-height:   1.55;
  --text-pequeno:          13px;
  --text-pequeno--line-height: 1.45;

  --ease-caderno: cubic-bezier(0.2, 0.7, 0.3, 1);
}

.dark {
  --color-papel:       #0D0C10;
  --color-superficie:  #161519;
  --color-lavagem:     #201E24;
  --color-regua:       #2F2D34;
  --color-regua-forte: #686473;
  --color-tinta:       #EAEAEC;
  --color-tinta-media: #B6B4BB;
  --color-tinta-suave: #928F99;
  --color-cristal:     #AA85CB;
  --color-ocre:        #D3A845;
  --color-ocre-tinta:  #D3A845;
  --color-bordo:       #C97B69;

  --shadow-ficha:        0 8px 20px -6px rgb(0 0 0 / 0.55);
  --shadow-sobreposicao: 0 24px 60px -16px rgb(0 0 0 / 0.70);
}

@layer base {
  body {
    background-color: var(--color-papel);
    color: var(--color-tinta);
    font-family: var(--font-sans);
    font-size: 15px;
    line-height: 1.55;
    overflow: hidden;
  }
  :focus-visible {
    outline: 2px solid var(--color-cristal);
    outline-offset: 2px;
  }
}

@utility meta {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
```

**Tokens de canvas: removidos** (doc 09, ADR-20). Esta seção descrevia três rampas próprias
para o desenho — `traco-*`, `fundo-*` e `postit-*`, 13 tokens × 2 temas, em `@theme static`
para poderem ser lidos por `getComputedStyle`. Nenhum deles existe mais em `globals.css`.

Foram aposentados junto com a toolbar própria: a UI nativa do Excalidraw voltou a ser usada, e
o seletor de cor dela não é customizável pela API pública (as paletas são hardcoded nas actions
do pacote, as constantes não são exportadas). Manter uma paleta própria só produzia cena mista
— parte dos elementos acompanhando o tema, parte não. **Hoje o usuário escolhe cor de desenho
entre as opções nativas do Excalidraw**; os doze tokens acima definem o resto da interface, não
o canvas.

O que sobrou do canvas no design system é um único token: `regua`, para os pontos da grade do
fundo pontilhado — esse sim ainda lido por `getComputedStyle` em `canvas/paletaCanvas.ts`, que
é onde qualquer hex do desenho tem que nascer. Nunca valores literais repetidos no TypeScript.

Regra de contraste que fecha o RNF8: **`ocre` nunca é cor de texto sobre fundo claro** — para texto use `ocre-tinta` (`#7A5610`, contraste 5,5:1 sobre `papel`). No tema escuro `ocre` e `ocre-tinta` são o mesmo valor de propósito, porque lá `#D3A845` já passa AA. `ocre` continua sendo usado como preenchimento, faixa e destaque.

Ao instalar shadcn/ui, sobrescreva o tema gerado por estes tokens. Nenhum componente deve manter `bg-background`, `text-foreground`, `border-input` ou qualquer classe de cor padrão do Tailwind.

---

## Elemento de assinatura

**Removido.** A versão original desta seção especificava uma coluna de margem de 76px à
esquerda do texto do editor, com hairline vertical contínua e marcadores `H1`/`H2`/`H3`,
`^id` e `EMB`. Foi implementada, mas na prática o gutter do CodeMirror estica pela altura
inteira do painel independente do tamanho do texto — numa nota curta isso produz uma faixa
vazia grande com só um marcador solto no topo. Testada em tela, a avaliação do Lucas foi
direta ("achei uma merda"); decisão de produto: tirar por completo, não simplificar.
`src/editor/extensoes/marginalia.ts`/`.css` foram apagados. O editor de nota volta a ser só o
texto, centralizado na coluna de 720px (seção Layout, abaixo).

**Na sidebar.** Cada nível recua 16px e o nível ativo ganha uma hairline vertical em `cristal` de 2px na altura do item — a régua de margem em miniatura. Cada nível de ancestral aberto também ganha uma linha guia de 1px em `regua` (pedido do usuário, 02/09/2026 — sem ela, ficava difícil ver que arquivo pertence a qual pasta numa árvore funda). Sem canto/corner: linha reta o comprimento inteiro do nível, sem distinguir o último filho — o mesmo gesto simples de um snippet CSS do Obsidian, não a precisão de um IDE.

**Nas abas.** A aba é uma ficha de arquivo: altura 34px, fundo `lavagem` quando inativa e `superficie` quando ativa, hairline `regua` separando cada uma, sem raio no topo. A aba ativa não tem borda inferior — ela se funde com o conteúdo. Nada de sombra. O botão de fechar (`X`) não reserva espaço: fica sobreposto ao fim do nome, invisível em repouso, e aparece no hover ou no foco por teclado (140ms, `ease-caderno`); enquanto ele está visível, o fim do nome esmaece por trás dele com o mesmo fade de máscara do Seletor de vault (24px, alfa só).

**Seletor de vault.** Substitui o Logotipo no cabeçalho da sidebar (decisão de múltiplos
vaults, `docs/12-multiplos-vaults.md` §4.1). `SeletorVault` ocupa o espaço flexível à esquerda
do cabeçalho (`min-w-0 flex-1`); o botão mostra o nome do vault (`nomeDoVault(raiz)`) em uma
linha, `overflow-hidden whitespace-nowrap`, **sem `text-ellipsis`**: quando o texto transborda
(medido por `scrollWidth > clientWidth`, via `ResizeObserver`), o final some num fade —
`mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent)`. A máscara usa só
alfa, então não introduz cor nova. Os 24px saem da escala base de "Espaçamento, raio e sombra"
(escolha do usuário em 16/09/2026, entre 16, 24 e 32). Nome curto: sem
máscara. `title` do botão é o caminho absoluto completo do vault. Tipografia, hover e foco: os
mesmos de item de sidebar (esta seção). O logotipo em imagem (`lettering-excalisidian.png`)
sai do cabeçalho e fica sem uso nesta tela.

O botão de colapsar (`panel-left-close`) deixa de trocar de lugar com o logotipo no hover —
comportamento antigo, hoje incompatível com o Seletor de vault ocupando aquele espaço — e fica
**sempre visível** no fim do grupo de ícones do cabeçalho. Motivo: o mesmo já registrado acima
para o painel flutuante da sidebar colapsada — "o alvo trocar de lugar sob o cursor" entre a
intenção de clicar e o clique. A prop `comMouse` de `ConteudoSidebar` deixa de ser usada para
esse propósito.

**Menu do seletor** (ancorado sob o botão, `Menu`/`ItemMenu` de `src/ui/Menu.tsx`): lista de
recentes (nome por linha, `title` = caminho — o vault desta janela leva ícone `check` e não é
clicável; hover num item que não é o atual mostra `BotaoIcone` `x`, "Remover da lista");
separador; "Criar vault…" (`folder-plus`); "Abrir pasta como vault…" (`folder-open`). Textos
completos em `docs/04-regras-de-negocio.md` §13.

---

## Imagem na nota

Imagens embutidas (`![[imagem]]`) usam o mesmo respiro e recorte das imagens markdown do editor
(`.cm-atomic-image`). Na mesma linha, ficam lado a lado numa fileira com vão de 8px que quebra
quando não cabe (`embedImagem.css`).

- **Alça de tamanho:** canto inferior direito, 12px, duas réguas de 2px em `cristal` formando o
  canto, a 4px das bordas; aparece no hover (140ms, `ease-caderno`). Cursor `nwse-resize`.
- **Arrastando:** a imagem ganha `sombra-ficha`. Indicador de soltura de 2px em `cristal` —
  vertical ao lado da imagem alvo, horizontal entre linhas —, o mesmo do mover bloco.
- **Largura mínima** ao redimensionar: 64px.

## Tabela no editor

Controles de tabela no live preview — contrato completo, inclusive o modelo de dados e os
contratos de código, em `docs/14-tabelas.md`.

**Barra de formatação flutuante.** Aparece grudada acima do texto selecionado. Sem seleção, só
aparece se a linha do cursor estiver **vazia** (pedido do usuário, 16/09/2026) — numa linha com
texto, sem seleção, ela não aparece. Some quando o foco sai do editor, na vista somente
leitura, e quando o foco está dentro de uma célula de tabela — célula é outro campo editável, a
barra apontaria para o lugar errado. Ganha um grupo novo no fim, "Tabela", com um botão
"Tabela" (ícone `table`) que insere a tabela padrão.

**Discrição da flutuante em repouso** (pedido do usuário, 16/09/2026): sem o mouse em cima (da
barra ou do botão de acoplar, juntos — um só estado, via `group`/`group-hover`), a ficha fica
sem fundo, sem borda e sem sombra, e os ícones ficam a 40% de opacidade; no hover, ganha a ficha
inteira de volta (fundo `superficie`, borda `regua`, `sombra-sobreposicao`) e os ícones voltam a
100%. Transição de 140ms (`ease-caderno`) nas duas trocas. **Não é um `opacity` no wrapper
inteiro:** a primeira versão fazia isso e deixava o fundo sólido da ficha translúcido por cima
do texto selecionado, sujando a leitura em vez de deixá-la limpa (achado do usuário no mesmo
dia) — por isso o fundo desliga e liga por cor, e só o ícone usa opacidade. Não desabilita o
clique. Não vale para a acoplada, que fica sempre visível de propósito.

**Barra de formatação acoplada** (pedido do usuário, 16/09/2026). Ao lado direito da barra
flutuante, **fora dela**, numa `Superficie` flutuante própria de um botão só, fica "Acoplar
embaixo" (ícone `panel-bottom`), separada da barra por 8px. Fora porque é uma ação sobre a
barra, não sobre o texto. Acoplada, a barra deixa de flutuar e vira uma faixa ancorada no pé do
painel da nota, centralizada: fundo `superficie`, hairline `regua` em cima, **sem sombra**
(superfície ancorada), mesmos botões e grupos, e no fim, depois de uma hairline vertical,
"Desacoplar" (ícone `panel-bottom-close`). Fica visível enquanto a nota está aberta, com ou
sem foco; some na vista somente leitura. A escolha é preferência da máquina (`settings.json`)
e vale para todas as notas e janelas.

**Faixas "+".** Ao passar o mouse sobre uma tabela, duas faixas de 16px de espessura (escala de
"Espaçamento, raio e sombra") aparecem: à direita da última coluna, na altura da tabela
("Adicionar coluna"), e abaixo da última linha, na largura da tabela ("Adicionar linha"). Fundo
transparente, `lavagem` no hover da faixa, ícone `plus` de 16px em `tinta-suave`. Não aparecem
na vista somente leitura.

**Alças.** `grip-vertical` (16px, `tinta-suave`) aparece à esquerda de uma linha ao passar o
mouse sobre ela; `grip-horizontal` (mesma medida) aparece acima de uma coluna. Mesmo gesto
visual da alça de bloco ⠿ (`AlcaBloco`, `moverBloco`). Clicar na alça abre o menu da linha ou
da coluna, ancorado nela. Arrastar reordena: um indicador de 2px em `cristal` marca a posição
de destino (mesmo indicador do mover bloco), e a linha ou coluna arrastada ganha
`sombra-ficha`. Soltar move; `Esc` cancela. A linha de cabeçalho não tem alça de linha.

**Menu.** Mesmo componente visual de `Menu`/`ItemMenu` (`src/ui/Menu.tsx`) usado em qualquer
outro menu do app, com ícones — não o menu em DOM puro e visual próprio que existia antes
(`.cm-atomic-table-menu`, removido, com sombra e raio fora dos tokens). Aberto por clique
direito numa célula ou por clique numa alça.

Como em toda superfície do app, mover linha ou coluna pela alça tem equivalente no menu (mover
para cima/baixo/esquerda/direita) — ver "Piso de qualidade", "Toda ação de arraste tem
equivalente".

**Largura das colunas.** Arrastar a linha vertical entre duas colunas redimensiona proporcional: a coluna da esquerda ganha ou perde largura, a da direita perde ou ganha (soma zero). Zona de pega de 8px centrada na borda (escala 4/8), cursor `col-resize`. No hover e durante o arrasto: linha de 2px em `cristal` sobre a borda — mesma linguagem do indicador de soltura (§3 "Tabelas"). Clique duplo na linha volta à largura automática. Mover coluna leva a largura junto; inserir coluna dá à nova a largura média e renormaliza. Vista somente leitura mostra as larguras, sem alça.

---

## Canvas

### Fundo pontilhado

O fundo do canvas é `papel` com uma grade de **pontos de 1px em `regua`, espaçados 20px**, com opacidade 60%. É a folha pontilhada de caderno de bullet journal.

No tema escuro: pontos em `regua` (`#2F2D34`) sobre `papel` (`#0D0C10`), opacidade 80%.

Implementação: `background-image` com `radial-gradient` de um ponto, `background-size: 20px 20px`, aplicado no elemento abaixo do canvas do Excalidraw — o `viewBackgroundColor` da cena fica **transparente** para o fundo aparecer. A grade acompanha zoom e pan.

### Toolbar, painel de propriedades e paletas do desenho

**Removido** (doc 09, ADR-20). Esta seção descrevia uma
toolbar e um painel de propriedades próprios, com paletas de traço/preenchimento/post-it
restritas aos tokens do design system, substituindo por inteiro a UI nativa do Excalidraw
(escondida por CSS). Foi revertido: a UI nativa está ligada. Ela ganhou um reskin cosmético
pros tokens do app (cor, fonte, raio — ver "Reskin da UI nativa" abaixo), mas nenhuma
superfície é mais **construída** pelo app; a estrutura, o layout e os controles são os do
Excalidraw.

Motivo: o painel próprio cobria menos do que o nativo (sem ordem de camadas, espelhar, cantos,
pontas de seta, copiar estilo, duplicar, agrupar), e o alinhar/distribuir reimplementado tinha
um bug real — só movia elementos com id em `selectedElementIds`, e texto vinculado a uma forma
não está nesse conjunto, então alinhar um retângulo com texto deixava o texto pra trás. O
Excalidraw nativo trata isso certo. O seletor de cor nativo, além disso, nunca foi
customizável pela API pública — as paletas são hardcoded nas próprias actions do pacote e as
constantes não são exportadas — então restringir a paleta exigia mantê-la só do lado do app,
gerando cena mista quando o usuário usava o seletor nativo por baixo.

O que isso muda, em termos concretos: **o usuário escolhe cor entre as opções nativas do
Excalidraw**, não os tokens `cristal`/`ocre`/`bordo` etc. — essas cores continuam definindo o
resto da interface, só não mais o canvas. Espessura, estilo de linha, imperfeição, cantos,
fonte e opacidade também passam a ter as opções nativas (mais amplas que as que o app
restringia antes). Não existe mais ferramenta de post-it — decisão do usuário; post-its já
desenhados continuam renderizando (são retângulo + texto vinculado, formato nativo).

O que continua igual, por baixo da UI nativa: o fundo pontilhado (abaixo), e um painel próprio
pequeno só para o link com autocomplete de nota (ver `LinkDoElemento` no inventário de
componentes) — o único ponto em que o Excalidraw nativo não tem equivalente público.

### Reskin da UI nativa

A toolbar, o painel de propriedades, os menus e os diálogos do Excalidraw são reskinados por
CSS custom properties (`src/canvas/excalidraw-excalisidian.css`) — o mecanismo que o próprio
pacote expõe pro host, mesma família de `--color-selection` (acima). Só cor, fonte e raio;
nenhum layout, ordem ou controle é alterado, e **a paleta que o usuário aplica nos elementos
continua nativa** (não é reskinada — decisão explícita).

| O que | Vira |
|---|---|
| Fundo de painel/toolbar/popup/diálogo/sidebar | `superficie` |
| Hairline de painel/diálogo/sidebar | `regua` |
| Sombra de painel/toolbar/diálogo/sidebar | `sombra-sobreposicao` |
| Raio grande / pequeno | `raio-ficha` / `raio-controle` |
| Fonte de interface | `fonte-sans` |
| Texto e ícone | `tinta` / `tinta-media` |
| Ferramenta/opção ativa (fundo / ícone) | `cristal` / `superficie` |
| Hover de botão | `lavagem` |
| Borda de campo de texto | `regua-forte` |
| Foco / link | `cristal` |
| Fundo do backdrop de diálogo | `color-mix(in srgb, tinta 28%, transparent)` — mesma receita de `Dialog.tsx` |

Fora de escopo, deliberadamente: `RadioGroup`/`Switch`/avatar (componentes de colaboração ou de
telas que este app não expõe hoje, dado o `UIOptions` restrito) e a fonte do tooltip nativo
(`Tooltip.scss` redeclara a própria — `--ui-font` não alcança).

---

## Movimento

| Situação | Duração | Curva |
|---|---|---|
| Hover, cor, borda | 140ms | `--ease-caderno` |
| Abertura de painel lateral | 220ms | `--ease-caderno`, `translateX(16px) → 0` com opacidade |
| Sobreposição (modal, palette) | 160ms | opacidade + `scale(0.98) → 1` |
| Traço de task list concluída | 180ms | `scaleX(0) → 1`, origem à esquerda |
| Aba arrastada | imediato | `scale(1.02) rotate(-0.7deg)` + `sombra-ficha` |
| Aba solta | 180ms | volta a `scale(1) rotate(0)` |
| Zona de soltura do split | 120ms | fundo `cristal` a 12% + hairline `cristal` |

A rotação no arraste é a única liberdade lúdica do sistema. Não adicione outras. Nada anima dentro do canvas de desenho — lá o movimento é do usuário.

Com `prefers-reduced-motion: reduce`, remova todo `transform` e `animation`; mantenha apenas transições de cor e opacidade.

---

## Inventário de componentes

Todos precisam de estados: repouso, hover, foco visível, ativo, desabilitado, carregando, erro.

**Base (`ui/`)** — shadcn re-estilizado: Button, Input, Label, Select, Checkbox, Dialog, Popover, Command, DropdownMenu, ContextMenu, Tooltip, Toast (sonner), Skeleton, Separator, Badge, ScrollArea, Tabs.

`Dialog` aceita `cru`: a `Superficie` fica sem o padding padrão e sem `h2`/descrição/rodapé de
ações — só `children` — para um diálogo que desenha o próprio layout de ponta a ponta (ex.:
`DialogoPreferencias`, com navegação e cabeçalho próprios). O foco inicial procura primeiro um
elemento com `data-foco-inicial` dentro da caixa, e só cai no primeiro focável genérico se não
achar — necessário porque o efeito de foco do `Dialog` roda depois dos efeitos dos filhos, então
um filho não consegue focar a si mesmo a tempo (na Configurações é o campo de busca, não uma
aba). `Dialog` também respeita `data-esc-limpa`: seu handler de Esc (captura na window) checa se
`e.target` é um `HTMLInputElement` com esse atributo e valor não vazio — se for, não fecha nem
chama `preventDefault`, deixa o próprio campo tratar o Esc (limpar o texto, no caso da busca das
Configurações). `Campo` aceita `rotuloOculto`: o `<label>` continua no DOM (acessibilidade) mas
vira `sr-only` — para um layout cujo título ao lado já deixa o rótulo óbvio visualmente, sem
repeti-lo (ex.: "Seu nome" nas Configurações). `Campo` também aceita `prefixo`, simétrico a
`sufixo`: conteúdo decorativo fixo no início do campo, por dentro da borda (`pointer-events-none
absolute inset-y-0 left-2`), com o input ganhando `pl-7` — usado pelo ícone de busca das
Configurações.

`GrupoBotoes` tem duas variantes (prop `variante`): `solto` (padrão, intocado — botões com borda
própria, usado no painel de propriedades do canvas) e `segmentado` — um único controle com
trilho (`rounded-controle border border-regua-forte p-1`), segmentos de 26px de altura interna
(36px com padding e borda, a mesma altura de `Botao` e `Campo`), ativo em `cristal`/`superficie`,
inativo em `tinta-media` com hover `lavagem` — usado nas Configurações (tema, largura da nota,
idioma).

Botões:

| Variante | Aparência |
|---|---|
| primário | fundo `cristal`, texto `superficie`, `raio-controle` |
| secundário | fundo transparente, borda 1px `regua-forte`, texto `tinta` |
| fantasma | sem borda, hover com fundo `lavagem` |
| destrutivo | texto e borda `bordo`, fundo transparente; preenche em `bordo` no hover |

Altura padrão 36px, compacto 30px, ícone 32×32.

**Produto (`ui/excalisidian/`)**

| Componente | Responsabilidade |
|---|---|
| `Logotipo` | lettering em imagem, altura parametrizável (prop `altura`, padrão 16px — o do cabeçalho histórico; 32px na `TelaBoasVindas`); sem uso no cabeçalho da sidebar desde o Seletor de vault — ver "Elemento de assinatura" |
| `TelaBoasVindas` | tela sem vault (primeiro uso, retorno e erro) — lettering, nome do usuário (só no primeiro uso sem nome informado) e criação do primeiro vault com sugestão pronta; ver "Tela de boas-vindas", abaixo |
| `SeletorVault` | botão do cabeçalho da sidebar com o nome do vault e fade de transbordo; menu de recentes, criar e abrir vault (`docs/12-multiplos-vaults.md` §4) |
| `DialogoCriarVault` | diálogo de criar vault (nome + local), `Dialog` padrão (título + conteúdo + rodapé de ações, sem `cru`) (`docs/12-multiplos-vaults.md` §4.3) |
| `ArvoreArquivos` | árvore virtualizada, expandir/recolher, arrastar, menu de contexto; durante o arrasto o documento inteiro força `cursor: grabbing` (classe `.arrastando-arvore`, `globals.css`) — inclusive sobre elementos com cursor próprio, como o separador de redimensionar e o texto do editor — para o cursor não trocar de cara ao passar por cima deles |
| `ItemArvore` | linha de arquivo ou pasta, com ícone por tipo e régua de nível ativo |
| `BarraAbas` | fichas de aba, arrastar, zonas de soltura, indicador de não salvo |
| `PainelSplit` | wrapper do dockview com as divisórias em hairline |
| `EditorNota` | CodeMirror com live preview |
| `AlcaBloco` | alça ⠿ que aparece ao passar o mouse sobre um bloco, arrasta pra mover |
| `BarraFlutuanteFormatacao` | barra que aparece grudada acima do texto selecionado (só com seleção), ou acoplada embaixo da nota; some ao perder o foco do editor, na vista somente leitura e dentro de célula de tabela (negrito, itálico, riscado, código, título 1/2/3, citação, lista, lista numerada, checkbox, link, tabela) |
| `menuTabela` | extensão que abre o menu de tabela (`Menu`/`ItemMenu` do app) por clique direito numa célula ou clique numa alça de linha/coluna, com inserir, mover, alinhar e excluir (ver "Tabela no editor") |
| `caminhoDaNota` | widget de bloco do CodeMirror, acima do título: as pastas da nota separadas por " / ", em `meta`/`tinta-suave` — mesmo estilo da barra de status (`extensoes/caminhoDaNota.ts`); nota na raiz do vault não mostra a linha |
| `EmbedDesenho` | bloco que renderiza o SVG do desenho dentro da nota |
| `EmbedNota` | bloco que renderiza a transclusão de nota ou seção |
| `LinkInterno` | span de link resolvido / não resolvido, com preview no `Ctrl+hover` |
| `AutocompleteLink` | popover de sugestão ao digitar `[[` |
| `EditorDesenho` | Excalidraw embutido com UI nativa (toolbar, painel de propriedades, menu) e fundo pontilhado do app |
| `LinkDoElemento` | painel próprio pequeno (canto superior direito, via `renderTopRightUI`) com o campo de link e autocomplete de nota — a única UI de canvas que não é nativa |
| `PainelBacklinks` | lista de notas que apontam para a atual, com trecho — só aparece havendo backlink, sem estado vazio |
| `PainelBusca` | busca unificada por título e por conteúdo (doc 13): um campo, seções "Títulos" e "No conteúdo", trechos com destaque. Absorveu o `QuickSwitcher`, que foi apagado — a busca por nome/alias virou a seção "Títulos" desta mesma sobreposição |
| `CampoBuscaSidebar` | linha "Buscar" abaixo do cabeçalho da sidebar, com o atalho à direita; visualmente um campo, mas é um botão que abre `PainelBusca` (doc 13 §2.4) |
| `PaletaComandos` | sobreposição de comandos com atalho em `meta` |
| `PainelLixeira` | diálogo modal (`Dialog` padrão, não `cru` — não uma seção fixa da sidebar — o diagrama de Layout abaixo é aspiracional nesse ponto) com a lista de itens excluídos, restaurar por item e esvaziar |
| `EstadoVazio` | bloco com hairline superior e inferior, título, apoio e ação |
| `TelaInicio` | aba fixa de início, nesta ordem: saudação por horário (`display-1`, com o nome do usuário quando informado — `nomeUsuario` `null` ou `""` mostra só a saudação, sem nome), o convite de `EstadoVazio` para criar nota/desenho/pasta, atalhos para as pastas de primeiro nível, e — ao clicar num atalho — os arquivos/subpastas dela, navegável (mini-explorador) |
| `AsciiPeaks` | camada de fundo bem suave (15% de opacidade) por cima da vinheta do papel de parede, na Home e na aba em branco — relevo gerado por ruído, renderizado como caracteres ASCII (técnica de "ASCII art shader", código autoral em WebGL2 — não um efeito comprado, ver doc 09 ADR-28), na cor `cristal`; o mesmo brilho que já clareia os picos altos do relevo também reage à proximidade do cursor, deixando um rastro que se dispersa aos poucos; para de animar com `prefers-reduced-motion` e enquanto a tela não está visível; preferência `asciiPeaksHabilitado` (padrão ligado) — botão "Desabilitar shaders"/"Habilitar shaders" no rodapé da Home, separado do grupo de papel de parede por um bullet |
| `DialogoPreferencias` | configurações do app — ícone de engrenagem no rodapé da sidebar, ou `Ctrl+,`; `Dialog` `cru`, duas colunas (padrão Obsidian/Linear): navegação à esquerda com um campo de busca (`Campo` `rotuloOculto`, `prefixo` com ícone `search` 14px, foco inicial do diálogo) logo abaixo do título e acima das 5 abas — Geral, Aparência, Conta, Sincronização, Agente de IA — ícone lucide 16px + rótulo no estilo de `ItemArvore` (fundo `lavagem` e régua `cristal` de 2px na aba ativa), hairline `regua` separando da coluna de conteúdo; conteúdo à direita com o nome da aba no topo, `BotaoIcone` `x` para fechar no canto, e o corpo em linhas de configuração (`LinhaConfig`: título + descrição à esquerda, controle à direita (opcional — a linha "Licenças e créditos" não tem controle, só texto), régua `regua` entre linhas, nunca sombra, cada uma com um id estável) — Geral tem "Seu nome" (`Campo` `rotuloOculto`), idioma, "Atalhos e símbolos" (botão "Abrir glossário", que abre `DialogoGlossario` por cima), Atualizações e "Licenças e créditos" (ADR-42, texto legal do MIT/OFL, sem controle); Aparência tem tema e largura da nota, ambos em `GrupoBotoes` `segmentado`; Conta reaproveita a seção de conta (formulário deslogado, `LinhaConfig` "Conectado como" logado); Sincronização reaproveita `SecaoSincronizacao` (doc 17 §7-8) inteira, como uma entrada só na busca; Agente de IA tem uma `LinhaConfig` por ação (ligar/desligar, reconfigurar, testar conexão, abrir pasta, limpar memória) — o provedor "IA do Excalisidian" (ADR-35) aparece ali como mais um item de `provedorDe`, sem tratamento especial. Aba inicial: `secaoInicial === "conta"` abre direto na aba Conta (assistente do agente) e `secaoInicial === "sincronizacao"` abre direto na aba Sincronização (ícone de estado no rodapé da sidebar); sem isso, reabre a última aba usada nesta sessão do app (não persistida), e a primeira vez de todas cai em Geral (`ui/excalisidian/abasPreferencias.ts`). Digitar no campo de busca filtra as linhas de toda a navegação por título + descrição + termos extras (catálogo, invisíveis): nenhuma aba fica destacada, o cabeçalho do conteúdo vira "Resultados" (`role="region"`, não `tabpanel`) e o corpo mostra só as linhas casadas, agrupadas pelo nome da aba (`meta text-tinta-suave`, `mt-6` entre grupos); Conta e Sincronização casam cada uma como seção inteira, e sem agente configurado "Configurar agente" é a entrada única da aba Agente de IA; nada casando mostra "Nada encontrado para «consulta»." Esc no campo com texto limpa a busca em vez de fechar o diálogo (`data-esc-limpa`); escolher uma aba (clique ou seta) sai do modo de busca |
| `DialogoGlossario` | atalhos de teclado e símbolos de formatação (RF8.3): dois catálogos de dados puros com testes de deriva, filtro sem acento/caixa, interface com duas abas, abre por cima de `DialogoPreferencias` (pilha de diálogos) |
| `TeclasAtalho` | desenha cada tecla de uma combinação (ou gesto) num `<kbd>` — `meta`, hairline `regua`, `rounded-controle`, fundo `superficie`, texto `tinta-media` —, com rótulos por plataforma (Mod → Ctrl/⌘, Alt → ⌥, setas → ↑/↓/←/→); combinações alternativas separadas por "ou" em `text-pequeno` `tinta-suave` |
| `AmostraSimbolo` | coluna "Fica assim" do glossário: desenha a sintaxe markdown com os estilos que o editor aplica (negrito, código, citação etc.); amostra `comportamento` não desenha nada (só texto) |
| `ConfirmacaoDestrutiva` | diálogo com a contagem real do que será perdido |
| `FaixaConflito` | faixa no topo do editor com as duas ações |
| `BalaoAgente` | balão flutuante do agente de IA, canto inferior direito (doc 11 §6.1) — só existe com o agente habilitado |
| `PainelAgente` | cartão flutuante do agente: convite, sugestões, conversa, medidor de uso (doc 11 §6.2) |
| `IconeSincronizacao` | ícone de estado da sincronização no rodapé da sidebar (doc 17 §8) — ver "Ícone de sincronização no rodapé da sidebar", abaixo |
| `DialogoAgente` | assistente de configuração do agente em etapas — provedor, chave, modelo da leitura inicial, modelo do acompanhamento, revisão (doc 11 §6.3); a seção "Agente de IA" das Configurações o abre |

**Estado vazio** nunca é só texto centralizado: é um bloco com hairline superior e inferior, título em `titulo-2`, uma linha de apoio em `pequeno` e um botão primário.

---

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ [logo]                                            ─  □  ×    │  barra de título 38px
├───────────────┬──────────────────────────────────────────────┤
│               │ ┌ aba ─┬ aba ─┬ aba ─┐                       │
│  sidebar      │ ├──────┴──────┴───────────────────────────┐  │
│  264px        │ │                                         │  │
│  buscar       │ │   editor  |  canvas                     │  │
│  árvore       │ │           |                             │  │
│  backlinks    │ │                                         │  │
│  lixeira      │ └─────────────────────────────────────────┘  │
│               │                                              │
├───────────────┴──────────────────────────────────────────────┤
│ CAMINHO/DO/ARQUIVO.MD          1 240 PALAVRAS      SALVO      │  barra de status 24px
└──────────────────────────────────────────────────────────────┘
```

- Sidebar fixa de 264px, fundo `superficie`, redimensionável entre 200 e 400px, recolhível com `Ctrl+\` (`Ctrl+B` é negrito no editor).
- Logo abaixo do cabeçalho da sidebar, separada por hairline `regua`: a linha `CampoBuscaSidebar` ("Buscar" + atalho "CTRL O"), que abre a busca unificada (`PainelBusca`, doc 13).
- Sidebar colapsada em 48px: a faixa de ícones fica no lugar, imóvel, e o hover abre ao lado dela um painel flutuante com a árvore e os backlinks — 216px, somando os mesmos 264px da sidebar expandida. Abre 200ms depois que o mouse entra, fecha 150ms depois que sai, leva `sombra-sobreposicao`, não tem backdrop, e fecha ao abrir um arquivo ou ao expandir. Animação: "Abertura de painel lateral". Na faixa de ícones, logo depois de "Expandir sidebar", um `BotaoIcone` `search` ("Buscar") abre a mesma busca.
- Esse painel não repete o cabeçalho nem o rodapé da sidebar. O motivo é o erro de clique: a faixa já tem os mesmos ícones na vertical, e trazê-los de novo na horizontal fazia o alvo trocar de lugar sob o cursor entre a intenção de clicar e o clique.
- Hairline `regua` separando sidebar, conteúdo e barra de status. Sem sombra entre eles.
- Barra de status de 24px, fundo `superficie`, tudo em `meta`, `tinta-suave`: caminho à esquerda, contagem de palavras e estado de salvamento à direita.
- Coluna de texto da nota: centralizada no painel, padding lateral de 32px, largura conforme a preferência do usuário (tela de Configurações) — `pequena` 728px, `média` 936px (padrão), `full` sem teto de largura (só a margem de 32px de cada lado).
- Divisória de split: 1px de `regua`, área de arraste de 8px, cursor de redimensionar, `cristal` durante o arraste.
- Largura mínima de janela: 900×600. Abaixo disso a sidebar recolhe sozinha.

### Tela de boas-vindas

Especificada no doc 15 (§1.1); os valores visuais normativos moram aqui. Substitui a tela
`sem-vault` (primeiro uso, retorno e erro de abertura) — nunca há vault aberto e nenhum outro
elemento de layout (sidebar, abas, barra de status) atrás dela.

Ordem dos blocos, de cima para baixo:

1. **Lettering** (`Logotipo`, prop `altura={32}` — decisão do usuário, 16/09/2026; o cabeçalho
   histórico da sidebar usa 16px, ver "Elemento de assinatura").
2. **Título** em `display-2`, só no primeiro uso ("Vamos começar"; no retorno é "Nenhum vault
   aberto", e no erro "Não foi possível abrir o vault"); logo abaixo, o subtítulo em `corpo`
   (no primeiro uso) ou a mensagem de erro em `tom="erro"` (no erro) — nunca os dois juntos.
3. **Campo de nome**, só no primeiro uso sem nome informado: rótulo "Como podemos te chamar?",
   `Input`, e uma linha de ajuda em `pequeno`/`tinta-suave`.
4. **Seção do vault**, título em `titulo-3` ("Seu primeiro vault" no primeiro uso, "Criar
   vault" no retorno); no primeiro uso, um parágrafo de explicação em `corpo` antes dos
   campos; campos "Nome" e "Local" (`Input` + botão "Escolher…"); abaixo deles, o caminho
   final resolvido (`local` + separador + `nome`) em `meta`, atualizado a cada tecla.
5. **Botão primário** "Criar e começar", largura cheia da seção do vault.
6. **Alternativa** "Já tenho uma pasta com notas" com o botão "Abrir pasta" — fantasma/link,
   abaixo do botão primário.
7. **Recentes**, só havendo algum: título "Recentes" em `meta` e a lista, mesmo componente de
   item de recente do `SeletorVault`.

**Largura da tela:** `max-w-md` — a mesma que a tela `sem-vault` antiga já usava. Registrado
aqui, não um valor novo.

### Balão e painel do agente de IA

Especificado no doc 11 (§6); os valores visuais normativos moram aqui. Só existem quando o
agente está habilitado — o produto sem agente não tem nenhum destes elementos.

- **Balão**: canto inferior direito, `position: fixed`, 16px das bordas, redondo de 40px
  (`raio-pilula`), fundo `superficie`, hairline `regua`, `sombra-ficha`, ícone `bot` 18px.
  O Toaster (sonner) sobe para não ficar atrás dele.
- **Estados do balão**: ocioso `tinta-suave`; observando `tinta-media`; pensando com anel
  `ocre` em pulso de 1,6s; convite/sugestões com badge `cristal`; pausado a 50% de opacidade;
  erro `bordo`.
- **Painel**: cartão flutuante ancorado acima do balão, 360px de largura, máx. 60vh com
  scroll, fundo `superficie`, `raio-ficha`, `sombra-sobreposicao`, hairline `regua` no
  escuro (regra geral de superfície flutuante). Fora do dockview.
- **Realce de termo de busca** (PainelBusca e trechos do agente): fundo
  `color-mix(in srgb, var(--color-ocre) 30%, transparent)`, texto `tinta` — o mesmo realce
  do search do editor (`tokens-excalisidian.css`).

### Ícone de sincronização no rodapé da sidebar

Doc 17 §8: sem banner, sem aviso recorrente (ADR-31) — só um ícone discreto no rodapé da
sidebar, ao lado do ícone de Configurações (engrenagem), e só quando o vault atual está
sincronizado. Mesmo componente e mesma medida do ícone de Configurações: `BotaoIcone` do
rodapé, `tamanho={32}` (alvo 32×32, ícone 18px, doc 06 "Inventário de componentes" e "Ícones").
`title` do botão com o texto do `StatusSync` (catálogo, doc 04); clique abre as Configurações
na seção Sincronização.

Cor por estado — só tokens que já existem em `globals.css`, nenhum novo:

| `StatusSync` | Cor | Por quê |
|---|---|---|
| `sincronizado` | `tinta-media` | repouso — a mesma cor do ícone de Configurações ao lado; nada chama atenção porque não há nada para o usuário fazer |
| `sincronizando` | `tinta-media` | mesmo repouso; a tabela "Movimento" não define um spinner genérico fora do agente de IA, então esta task não inventa um — o ícone muda de forma (ver doc 04/catálogo), não de cor |
| `sem-conexao` | `ocre` | é o token de "atenção" (doc 06, Paleta) — tenta de novo sozinho, não é erro que trava |
| `pausado` | `tinta-media` a 50% de opacidade | mesmo padrão já usado no balão do agente pausado (acima, "Balão e painel do agente de IA") |
| `{ erro: "sessao" \| "plano" \| "espaco" }` (doc 17 §8: erros que pedem ação) | `bordo` | é o token de "erro" (doc 06, Paleta) |

Ícones (`lucide-react`, mesmo traço 1.5 da tabela "Ícones", abaixo): `cloud-check` (sincronizado),
`refresh-cw` (sincronizando), `cloud-off` (sem conexão), `pause` (pausado), `alert-triangle`
(erro que pede ação — o mesmo ícone já usado para "aviso").

---

## Ícones

`lucide-react`, traço 1.5, 16px em linha de árvore e menu, 18px em botão de toolbar.

| Uso | Ícone |
|---|---|
| nota | `file-text` |
| desenho | `pen-line` |
| pasta fechada / aberta | `folder` / `folder-open` |
| imagem | `image` |
| nova nota | `file-plus` |
| novo desenho | `square-pen` |
| nova pasta | `folder-plus` |
| mover para... | `move` |
| início | `home` |
| busca | `search` |
| backlinks | `corner-down-left` |
| lixeira | `trash-2` |
| restaurar (item da lixeira) | `rotate-ccw` |
| dividir vertical / horizontal | `columns-2` / `rows-2` |
| ordenar | `arrow-up-narrow-wide` |
| preferências | `settings` |
| Configurações: aba Geral / Aparência / Conta / Sincronização / Agente de IA | `sliders-horizontal` / `palette` / `user-round` / `refresh-cw` / `bot` |
| fechar (Configurações, canto superior direito) | `x` |
| colapsar sidebar / expandir sidebar | `panel-left-close` / `panel-left` |
| aviso | `alert-triangle` |
| negrito / itálico / riscado / código | `bold` / `italic` / `strikethrough` / `code` |
| título 1 / 2 / 3 | `heading-1` / `heading-2` / `heading-3` |
| citação / lista / lista numerada / checkbox / link | `quote` / `list` / `list-ordered` / `square-check` / `link` |
| mover bloco (alça) | `grip-vertical` |
| tabela (paleta, barra de formatação) | `table` |
| acoplar barra de formatação embaixo | `panel-bottom` |
| desacoplar barra de formatação | `panel-bottom-close` |
| dica de Enter no fim de um campo ("Seu nome" nas Configurações) — 12px, `tinta-suave`, seguido de "Enter" em `meta` | `corner-down-left` |
| busca das Configurações (`prefixo` do `Campo`) — 14px, `tinta-suave` | `search` |
| adicionar linha / coluna (faixa "+" da tabela) | `plus` |
| alça de linha / coluna (tabela) | `grip-vertical` / `grip-horizontal` |
| inserir linha acima / abaixo | `between-horizontal-start` / `between-horizontal-end` |
| inserir coluna à esquerda / direita | `between-vertical-start` / `between-vertical-end` |
| mover linha para cima / baixo | `arrow-up` / `arrow-down` |
| mover coluna para a esquerda / direita | `arrow-left` / `arrow-right` |
| alinhar coluna à esquerda / centro / direita | `align-left` / `align-center` / `align-right` |
| largura automática (menu da tabela) | `move-horizontal` |
| excluir linha / coluna / tabela | `trash-2` |
| agente de IA (balão) | `bot` — demais ícones do agente no doc 11 §8 |
| vault atual no menu do seletor | `check` |
| remover da lista de recentes | `x` |
| criar vault | `folder-plus` |
| abrir pasta como vault | `folder-open` |
| sincronização — sincronizado | `cloud-check` |
| sincronização — sincronizando | `refresh-cw` |
| sincronização — sem conexão | `cloud-off` |
| sincronização — pausada | `pause` |
| sincronização — erro que pede ação | `alert-triangle` |

Ícones de ferramenta do canvas (seleção, formas, texto, alinhar/distribuir etc.) não aparecem
aqui — vêm da UI nativa do Excalidraw, fora do controle do app (doc 09, ADR-20).

---

## Voz da interface

Português do Brasil, sentence case, verbo ativo, segunda pessoa implícita. O rótulo do botão e a confirmação usam a mesma palavra: "Criar nota" produz "Nota criada".

Erro diz o que aconteceu e o que fazer, sem pedir desculpa e sem culpar o usuário. Estado vazio é convite, não constatação. A tabela completa de textos está no documento 04, seção 10.

Sem emoji em nenhuma superfície de produção.

---

## Piso de qualidade

- Contraste mínimo AA (4,5:1) para todo texto nos dois temas.
- Contraste mínimo 3:1 para a borda de controle interativo, garantido por `regua-forte`. A `regua` comum fica em 1,2:1 sobre `papel` — ela é separador decorativo de propósito, nunca a única pista de que algo é clicável.
- Foco visível em todo elemento interativo, com a régua de foco em `cristal`.
- Toda ação de arraste tem equivalente por teclado ou menu (mover arquivo, mover aba, criar split).
- Nenhuma informação transmitida só por cor: link não resolvido tem sublinhado tracejado além da cor; aba não salva tem o ponto além da cor.
- O canvas funciona sem rede: fontes empacotadas, `window.EXCALIDRAW_ASSET_PATH` apontando para os assets locais.
