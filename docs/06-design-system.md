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
| `musgo` | `#3E5C46` | marca, ação primária, seleção, foco, link resolvido |
| `ocre` | `#A87A1C` | atenção, edição não salva, destaque de busca |
| `ocre-tinta` | `#7A5610` | texto sobre fundo claro na cor ocre |
| `bordo` | `#7A2E22` | erro, ação destrutiva, link não resolvido |

Tema escuro — **Tinta**:

| Token | Hex |
|---|---|
| `papel` | `#16140F` |
| `superficie` | `#1F1C16` |
| `lavagem` | `#272319` |
| `regua` | `#34302A` |
| `regua-forte` | `#6E675C` |
| `tinta` | `#EFEAE0` |
| `tinta-media` | `#BDB6A9` |
| `tinta-suave` | `#9A9384` |
| `musgo` | `#86A98B` |
| `ocre` | `#D3A845` |
| `ocre-tinta` | `#D3A845` |
| `bordo` | `#C97B69` |

O tema escuro não é inversão automática: o papel escurece para um marrom-tinta, nunca para cinza neutro nem preto puro, e as cores clareiam para manter contraste.

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
| `campo-grande` | 17 / 1.4 | Instrument Sans 400 | só no campo do quick switcher e da paleta de comandos |

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
| link resolvido | `musgo`, sem sublinhado, sublinhado no hover |
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

No tema escuro as duas são redefinidas com preto puro e mais opacidade (`rgb(0 0 0 / 0.55)` e `rgb(0 0 0 / 0.70)`): uma sombra de `#1C1917` a 25% sobre um fundo `#16140F` é invisível. Além dela, toda superfície flutuante no escuro leva uma hairline `regua` — a sombra sozinha não separa o suficiente.

Nenhuma outra sombra no projeto.

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
  --color-musgo:       #3E5C46;
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

  --ease-caderno: cubic-bezier(0.2, 0.7, 0.3, 1);
}

.dark {
  --color-papel:       #16140F;
  --color-superficie:  #1F1C16;
  --color-lavagem:     #272319;
  --color-regua:       #34302A;
  --color-regua-forte: #6E675C;
  --color-tinta:       #EFEAE0;
  --color-tinta-media: #BDB6A9;
  --color-tinta-suave: #9A9384;
  --color-musgo:       #86A98B;
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
    outline: 2px solid var(--color-musgo);
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

Os tokens do canvas ficam no mesmo arquivo, para que nenhum hex do desenho viva solto no código.
São lidos via `getComputedStyle` (por `canvas/paletaCanvas.ts`), não por classe utilitária —
por isso vão em **`@theme static`**, não em `@theme`: o Tailwind v4 só emite no `:root` as
variáveis de `@theme` que alguma classe realmente usa, e nenhuma usa estas. Sem `static`, no
tema claro (onde o bloco vive dentro de `@theme`) os tokens voltam como string vazia do
`getComputedStyle` — foi um bug real, silencioso, corrigido depois de shipado (post-it
invisível, seletor de cor em branco, só no tema claro).

```css
@theme static {
  --color-traco-tinta:  #1C1917;  --color-traco-musgo:  #3E5C46;
  --color-traco-ocre:   #A87A1C;  --color-traco-bordo:  #7A2E22;
  --color-traco-suave:  #655E54;

  --color-fundo-neutro: #E5DFD4;  --color-fundo-musgo:  #CFDBD1;
  --color-fundo-ocre:   #EDDCB4;  --color-fundo-bordo:  #E7CEC8;

  --color-postit-ocre:   #EDDCB4; --color-postit-musgo:  #CFDBD1;
  --color-postit-bordo:  #E7CEC8; --color-postit-neutro: #E5DFD4;
}

.dark {
  --color-traco-tinta:  #EFEAE0;  --color-traco-musgo:  #86A98B;
  --color-traco-ocre:   #D3A845;  --color-traco-bordo:  #C97B69;
  --color-traco-suave:  #9A9384;

  --color-fundo-neutro: #272319;  --color-fundo-musgo:  #2C3A2F;
  --color-fundo-ocre:   #3D3323;  --color-fundo-bordo:  #3A2823;

  --color-postit-ocre:   #4A3E28; --color-postit-musgo:  #2F4034;
  --color-postit-bordo:  #4A2F28; --color-postit-neutro: #312C22;
}
```

O Excalidraw recebe hex, não variáveis CSS. Um módulo `canvas/paletaCanvas.ts` lê esses tokens com `getComputedStyle` no tema ativo e monta a paleta que vai para a cena — nunca com valores literais repetidos no TypeScript.

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

**Na sidebar.** A árvore não usa recuo com linhas pontilhadas. Cada nível recua 16px e o nível ativo ganha uma hairline vertical em `musgo` de 2px na altura do item — a régua de margem em miniatura.

**Nas abas.** A aba é uma ficha de arquivo: altura 34px, fundo `lavagem` quando inativa e `superficie` quando ativa, hairline `regua` separando cada uma, sem raio no topo. A aba ativa não tem borda inferior — ela se funde com o conteúdo. Nada de sombra.

**Logotipo.** "Excalisidian" em Fraunces 600 a 16px, e abaixo dele uma régua de 2px em `musgo` com 40% da largura da palavra, alinhada à esquerda. Nada mais.

---

## Canvas

### Fundo pontilhado

O fundo do canvas é `papel` com uma grade de **pontos de 1px em `regua`, espaçados 20px**, com opacidade 60%. É a folha pontilhada de caderno de bullet journal.

No tema escuro: pontos em `regua` (`#34302A`) sobre `papel` (`#16140F`), opacidade 80%.

Implementação: `background-image` com `radial-gradient` de um ponto, `background-size: 20px 20px`, aplicado no elemento abaixo do canvas do Excalidraw — o `viewBackgroundColor` da cena fica **transparente** para o fundo aparecer. A grade acompanha zoom e pan.

### Toolbar, painel de propriedades e paletas do desenho

**Removido** (doc 09, ADR-20). Esta seção descrevia uma
toolbar e um painel de propriedades próprios, com paletas de traço/preenchimento/post-it
restritas aos tokens do design system, substituindo por inteiro a UI nativa do Excalidraw
(escondida por CSS). Foi revertido: a UI nativa está ligada, e nenhuma dessas superfícies é mais
estilizada pelo app.

Motivo: o painel próprio cobria menos do que o nativo (sem ordem de camadas, espelhar, cantos,
pontas de seta, copiar estilo, duplicar, agrupar), e o alinhar/distribuir reimplementado tinha
um bug real — só movia elementos com id em `selectedElementIds`, e texto vinculado a uma forma
não está nesse conjunto, então alinhar um retângulo com texto deixava o texto pra trás. O
Excalidraw nativo trata isso certo. O seletor de cor nativo, além disso, nunca foi
customizável pela API pública — as paletas são hardcoded nas próprias actions do pacote e as
constantes não são exportadas — então restringir a paleta exigia mantê-la só do lado do app,
gerando cena mista quando o usuário usava o seletor nativo por baixo.

O que isso muda, em termos concretos: **o usuário escolhe cor entre as opções nativas do
Excalidraw**, não os tokens `musgo`/`ocre`/`bordo` etc. — essas cores continuam definindo o
resto da interface, só não mais o canvas. Espessura, estilo de linha, imperfeição, cantos,
fonte e opacidade também passam a ter as opções nativas (mais amplas que as que o app
restringia antes). Não existe mais ferramenta de post-it — decisão do usuário; post-its já
desenhados continuam renderizando (são retângulo + texto vinculado, formato nativo).

O que continua igual, por baixo da UI nativa: o fundo pontilhado (abaixo), e um painel próprio
pequeno só para o link com autocomplete de nota (ver `LinkDoElemento` no inventário de
componentes) — o único ponto em que o Excalidraw nativo não tem equivalente público.

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
| Zona de soltura do split | 120ms | fundo `musgo` a 12% + hairline `musgo` |

A rotação no arraste é a única liberdade lúdica do sistema. Não adicione outras. Nada anima dentro do canvas de desenho — lá o movimento é do usuário.

Com `prefers-reduced-motion: reduce`, remova todo `transform` e `animation`; mantenha apenas transições de cor e opacidade.

---

## Inventário de componentes

Todos precisam de estados: repouso, hover, foco visível, ativo, desabilitado, carregando, erro.

**Base (`ui/`)** — shadcn re-estilizado: Button, Input, Label, Select, Checkbox, Dialog, Popover, Command, DropdownMenu, ContextMenu, Tooltip, Toast (sonner), Skeleton, Separator, Badge, ScrollArea, Tabs.

Botões:

| Variante | Aparência |
|---|---|
| primário | fundo `musgo`, texto `superficie`, `raio-controle` |
| secundário | fundo transparente, borda 1px `regua-forte`, texto `tinta` |
| fantasma | sem borda, hover com fundo `lavagem` |
| destrutivo | texto e borda `bordo`, fundo transparente; preenche em `bordo` no hover |

Altura padrão 36px, compacto 30px, ícone 32×32.

**Produto (`ui/excalisidian/`)**

| Componente | Responsabilidade |
|---|---|
| `Logotipo` | marca com a régua |
| `ArvoreArquivos` | árvore virtualizada, expandir/recolher, arrastar, menu de contexto |
| `ItemArvore` | linha de arquivo ou pasta, com ícone por tipo e régua de nível ativo |
| `BarraAbas` | fichas de aba, arrastar, zonas de soltura, indicador de não salvo |
| `PainelSplit` | wrapper do dockview com as divisórias em hairline |
| `EditorNota` | CodeMirror com live preview |
| `AlcaBloco` | alça ⠿ que aparece ao passar o mouse sobre um bloco, arrasta pra mover |
| `BarraFlutuanteFormatacao` | barra que aparece grudada acima do texto selecionado (negrito, itálico, riscado, código, título 1/2/3, citação, lista, lista numerada, checkbox, link) |
| `MargemNota` | coluna de 76px com metadados do bloco |
| `EmbedDesenho` | bloco que renderiza o SVG do desenho dentro da nota |
| `EmbedNota` | bloco que renderiza a transclusão de nota ou seção |
| `LinkInterno` | span de link resolvido / não resolvido, com preview no `Ctrl+hover` |
| `AutocompleteLink` | popover de sugestão ao digitar `[[` |
| `EditorDesenho` | Excalidraw embutido com UI nativa (toolbar, painel de propriedades, menu) e fundo pontilhado do app |
| `LinkDoElemento` | painel próprio pequeno (canto superior direito, via `renderTopRightUI`) com o campo de link e autocomplete de nota — a única UI de canvas que não é nativa |
| `PainelBacklinks` | lista de notas que apontam para a atual, com trecho |
| `PainelBusca` | campo, resultados agrupados por arquivo, trecho com destaque |
| `QuickSwitcher` | sobreposição de busca por nome |
| `PaletaComandos` | sobreposição de comandos com atalho em `meta` |
| `PainelLixeira` | lista de itens excluídos com restaurar e esvaziar |
| `EstadoVazio` | bloco com hairline superior e inferior, título, apoio e ação |
| `TelaInicio` | aba fixa de início, nesta ordem: saudação por horário (`display-1`), o convite de `EstadoVazio` para criar nota/desenho/pasta, atalhos para as pastas de primeiro nível, e — ao clicar num atalho — os arquivos/subpastas dela, navegável (mini-explorador) |
| `DialogoPreferencias` | configurações do app (tema, largura da nota) — ícone de engrenagem no rodapé da sidebar, ou `Ctrl+,` |
| `ConfirmacaoDestrutiva` | diálogo com a contagem real do que será perdido |
| `FaixaConflito` | faixa no topo do editor com as duas ações |

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
│               │ │   editor  |  canvas                     │  │
│  árvore       │ │           |                             │  │
│  busca        │ │                                         │  │
│  backlinks    │ └─────────────────────────────────────────┘  │
│  lixeira      │                                              │
├───────────────┴──────────────────────────────────────────────┤
│ CAMINHO/DO/ARQUIVO.MD          1 240 PALAVRAS      SALVO      │  barra de status 24px
└──────────────────────────────────────────────────────────────┘
```

- Sidebar fixa de 264px, fundo `superficie`, redimensionável entre 200 e 400px, recolhível com `Ctrl+\` (`Ctrl+B` é negrito no editor).
- Hairline `regua` separando sidebar, conteúdo e barra de status. Sem sombra entre eles.
- Barra de status de 24px, fundo `superficie`, tudo em `meta`, `tinta-suave`: caminho à esquerda, contagem de palavras e estado de salvamento à direita.
- Coluna de texto da nota: centralizada no painel, padding lateral de 32px, largura conforme a preferência do usuário (tela de Configurações) — `pequena` 728px, `média` 936px (padrão), `full` sem teto de largura (só a margem de 32px de cada lado).
- Divisória de split: 1px de `regua`, área de arraste de 8px, cursor de redimensionar, `musgo` durante o arraste.
- Largura mínima de janela: 900×600. Abaixo disso a sidebar recolhe sozinha.

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
| dividir vertical / horizontal | `columns-2` / `rows-2` |
| ordenar | `arrow-up-narrow-wide` |
| preferências | `settings` |
| aviso | `alert-triangle` |
| negrito / itálico / riscado / código | `bold` / `italic` / `strikethrough` / `code` |
| título 1 / 2 / 3 | `heading-1` / `heading-2` / `heading-3` |
| citação / lista / lista numerada / checkbox / link | `quote` / `list` / `list-ordered` / `square-check` / `link` |
| mover bloco (alça) | `grip-vertical` |

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
- Foco visível em todo elemento interativo, com a régua de foco em `musgo`.
- Toda ação de arraste tem equivalente por teclado ou menu (mover arquivo, mover aba, criar split).
- Nenhuma informação transmitida só por cor: link não resolvido tem sublinhado tracejado além da cor; aba não salva tem o ponto além da cor.
- O canvas funciona sem rede: fontes empacotadas, `window.EXCALIDRAW_ASSET_PATH` apontando para os assets locais.
