# Paletas atuais — Excalisidian

O que existe **no código hoje** (15/09/2026), depois da troca para a identidade da espada de cristal.

Fonte da verdade: `src/estilos/globals.css`. O `docs/06-design-system.md` é o documento normativo e está em dia com isto.

---

## 1. Paleta de interface — a única paleta viva

Doze tokens, dois temas. Tema claro chamado **Papel**, tema escuro chamado **Cristal**.

Definidos em `globals.css`: o tema claro no bloco `@theme`, o escuro no bloco `.dark`, trocado pela classe `dark` no `<html>`.

| Token | Papel (claro) | Cristal (escuro) | Uso |
|---|---|---|---|
| `papel` | `#EFEAE1` | `#0D0C10` | fundo da janela, fundo do canvas |
| `superficie` | `#FBF9F5` | `#161519` | painéis, campos, sobreposições, aba ativa |
| `lavagem` | `#E5DFD4` | `#201E24` | hover de linha, faixa de aba, fundo de código |
| `regua` | `#DCD5C8` | `#2F2D34` | hairlines, divisórias, pontos da grade do canvas |
| `regua-forte` | `#8C8578` | `#686473` | borda de controle: campo, botão secundário, checkbox |
| `tinta` | `#1C1917` | `#EAEAEC` | texto principal, traço padrão do desenho |
| `tinta-media` | `#4A443C` | `#B6B4BB` | texto secundário, ícones |
| `tinta-suave` | `#655E54` | `#928F99` | metadado, placeholder, sintaxe markdown visível |
| `cristal` | `#74419D` | `#AA85CB` | marca, ação primária, seleção, foco, link resolvido |
| `ocre` | `#A87A1C` | `#D3A845` | atenção, edição não salva, destaque de busca |
| `ocre-tinta` | `#7A5610` | `#D3A845` | texto na cor ocre sobre fundo claro |
| `bordo` | `#7A2E22` | `#C97B69` | erro, ação destrutiva, link não resolvido |

De onde saíram os valores novos: `cristal` claro é o violeta do lettering da logo, `cristal` escuro é a lâmina — as duas amostras medidas no arquivo, não escolhidas no olho. O chão escuro fica em L 5,5%, a luminosidade do fundo da própria logo.

Observações de construção que valem para qualquer paleta futura:

- **O tema escuro não é inversão automática.** O papel escurece para um quase-preto violeta (`#0D0C10`), nunca para cinza neutro nem preto puro, e as cores clareiam para manter contraste.
- **A escada de luminosidade do escuro é herdada do tema Tinta**, quente, que veio antes (até 14/09/2026): mesma ordem, mesmas distâncias. Só a temperatura mudou, de 40° para 258°. É a escada que segura a hierarquia — mexer nela é mais arriscado do que mexer na matiz.
- **Saturação muito baixa nas superfícies: 7% a 14%, e 5% nas tintas.** O violeta só carrega de verdade no acento. Foram duas descidas até chegar aqui, as duas reprovadas em tela cheia antes: a primeira pintava violeta a L 9–12% (o chão desceu para L 5,5%), a segunda ainda tinha superfícies a 21–22% de saturação (caíram pela metade). A lição é que numa área grande a saturação integra — um token isolado parece neutro enquanto a tela inteira parece roxa. Julgue no app aberto, nunca no swatch.
- **`ocre` e `ocre-tinta` são o mesmo valor no escuro**, de propósito: lá o `#D3A845` já passa AA sozinho.
- **`ocre` e `bordo` não mudaram na troca de identidade.** Erro tem que parecer erro: sobre o chão novo eles dão 8,8:1 e 6,1:1, então não precisaram de recalibragem.

---

## 2. Cor que não é token

Valores de cor que existem no app mas não são tokens próprios — derivam dos de cima por opacidade ou `color-mix`. Uma paleta nova herda todos automaticamente, mas convém conferir cada um.

| Onde | Receita | Arquivo |
|---|---|---|
| Sombra de ficha (claro) | `0 8px 20px -8px rgb(28 25 23 / 0.25)` | `globals.css:56` |
| Sombra de sobreposição (claro) | `0 24px 60px -20px rgb(28 25 23 / 0.35)` | `globals.css:57` |
| Sombra de ficha (escuro) | `0 8px 20px -6px rgb(0 0 0 / 0.55)` | `globals.css:90` |
| Sombra de sobreposição (escuro) | `0 24px 60px -16px rgb(0 0 0 / 0.70)` | `globals.css:91` |
| Régua de foco | `2px solid` `cristal`, offset 2px | `globals.css:104` |
| Scrollbar (trilho / polegar / hover) | transparente / `regua` / `regua-forte` | `globals.css:110–129` |
| Pulso do balão do agente | `color-mix(in srgb, ocre 55%, transparent)` | `globals.css:175` |
| Realce de termo de busca | `color-mix(in srgb, ocre 30%, transparent)` | doc 06, "Balão e painel do agente" |
| Backdrop de diálogo | `color-mix(in srgb, tinta 28%, transparent)` | `Dialog.tsx` |
| Grade pontilhada do canvas | `regua` a 60% (claro) / 80% (escuro), pontos 1px a cada 20px | doc 06, "Fundo pontilhado" |

No tema escuro as sombras usam preto puro e mais opacidade porque uma sombra de `#1C1917` sobre `#0D0C10` é invisível. Além dela, toda superfície flutuante no escuro leva uma hairline `regua` — a sombra sozinha não separa.

---

## 3. Quem consome os tokens

Uma paleta nova precisa atravessar estes quatro pontos. Nenhum deles tem cor própria: todos leem os doze tokens.

| Arquivo | O que faz | Tokens mais usados |
|---|---|---|
| `src/editor/atomico/tokens-excalisidian.css` | ponte para o editor vendorizado (`--atomic-editor-*`) | `cristal` (9×), `bordo` (5×), `tinta`, `regua` |
| `src/canvas/excalidraw-excalisidian.css` | reskin da UI nativa do Excalidraw | `cristal` (10×), `superficie` (5×), `regua` (5×) |
| `src/layout/dockview-excalisidian.css` | abas e divisórias do dockview | `regua` (7×), `cristal` (7×), `lavagem` (6×) |
| `src/canvas/paletaCanvas.ts` | lê token via `getComputedStyle` para passar hex ao Excalidraw | só `regua` (grade) |

---

## 4. Regras que qualquer paleta nova precisa respeitar

1. **Contraste (RNF8).** `ocre` nunca é cor de texto sobre fundo claro — para texto, `ocre-tinta` (`#7A5610`, 5,5:1 sobre `papel`). Toda cor de texto precisa do par equivalente.
2. **Nenhum hex literal no TypeScript.** Cor que precisa virar hex (Excalidraw) sai de `getComputedStyle` em `paletaCanvas.ts`.
3. **Nenhuma classe de cor padrão do Tailwind** (`bg-background`, `text-foreground`, `border-input`).
4. **Token lido por `getComputedStyle` vai em `@theme static`**, não `@theme`. O Tailwind v4 só emite no `:root` as variáveis de `@theme` que alguma classe usa — sem `static`, o token volta string vazia. Já foi bug real em produção.
5. **Nada de gradiente**, por direção do design system ("caderno editorial").

---

## 5. O que o canvas NÃO tem mais

Existiu uma **paleta de canvas** com três rampas — `traco-*`, `fundo-*` e `postit-*`, 13 tokens × 2 temas. Ela não existe mais: foi aposentada pelo ADR-20, junto com a toolbar própria, porque o seletor de cor nativo do Excalidraw não é customizável pela API pública (as paletas são hardcoded nas actions do pacote) e manter uma paleta própria só produzia cena mista.

**Hoje o usuário escolhe cor de desenho entre as opções nativas do Excalidraw**; os doze tokens definem o resto da interface, não o canvas. O único token que o canvas ainda consome é `regua`, para os pontos da grade.

Consequência para qualquer paleta futura: **não desenhe rampas de traço/preenchimento/post-it** — não há mais nada que as consuma. O bloco de CSS que documentava essas rampas foi removido do doc 06 em 15/09/2026; até então ele estava lá como se fosse código vivo.
