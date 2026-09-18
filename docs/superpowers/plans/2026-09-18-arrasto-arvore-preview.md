# Pré-visualização do arrasto na árvore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Arrastar na árvore de arquivos mostra onde o item vai cair antes de soltar (indicador de soltura), pra arquivos, pastas e separadores; o separador passa a usar a cor da borda da sidebar e ocupa menos altura.

**Architecture:** A decisão "onde isto cai" sai do componente e vira uma função pura testada (`alvoSoltura.ts`), consultada a cada `pointermove`. `ArvoreArquivos.tsx` troca os dois gestos de arrasto (item e separador, hoje duplicados e com semânticas que já divergiram duas vezes) por um gesto único que usa essa função, desenha o indicador e rola a árvore sozinho perto das bordas.

**Tech Stack:** React + TypeScript, `@tanstack/react-virtual`, Pointer Events, Vitest, Tailwind com tokens de `src/estilos/globals.css`.

**Spec:** `docs/superpowers/specs/2026-09-18-ordenacao-arvore-design.md` (feature de ordenação) + `docs/06-design-system.md` (normativo pra valores visuais).

## Global Constraints

- Português do Brasil em nomes, comentários e textos; sentence case; sem emoji.
- Nenhum valor visual fora dos tokens. Cores: `regua`, `regua-forte`, `cristal`, `superficie`, `tinta`, `tinta-media`, `tinta-suave`, `lavagem`. Sombra do elemento arrastado: `shadow-ficha` (doc 06 §1 e tabela de Movimento). Espaçamentos só da escala 4/8/12/16/24/32 px.
- Indicador de soltura: **2px em `cristal`**, horizontal, entre linhas — o mesmo do mover bloco e da tabela (doc 06, "Imagem na nota" e "Tabela no editor").
- Arrasto continua por Pointer Events, nunca `draggable`/HTML5 DnD (quebra no WebView2 do Tauri — ver cabeçalho de `ArvoreArquivos.tsx`).
- **Pasta nunca muda de diretório no disco** (fora do escopo, ver cabeçalho de `src/vault/mover.ts`). Pasta arrastada só reordena entre irmãs, e só em modo customizado.
- Separador só existe no nível raiz (`customOrder[""]`).
- Esc e `pointercancel` cancelam o gesto sem gravar nada; a captura de ponteiro é liberada em toda saída.
- Com `prefers-reduced-motion: reduce`, nada de `transform`/`animation` (doc 06, Movimento).
- Componentes `.tsx` não têm teste automatizado neste código-base; lógica pura tem (vitest).
- Commits: `git add` só dos arquivos da tarefa. **Nunca** incluir `README.md` nem `.github/workflows/release.yml` (alterações do usuário em andamento, fora deste trabalho).

## Comportamento (a especificação de interação)

Coordenada `y` = posição dentro do conteúdo rolável (já soma o `scrollTop`). Cada linha visível tem `inicio` e `altura`. "Nível" de uma linha = pasta que a contém (`""` pra raiz; separador é sempre nível `""`). A ordem de um nível = as linhas daquele nível na ordem em que aparecem (nomes-base dos nós e ids `sep-`).

**Arrastando um arquivo ou pasta (`item`, com `pasta` = pasta que o contém):**

| Linha sob o cursor | Modo | Resultado |
|---|---|---|
| a própria linha do item, ou qualquer descendente dele | qualquer | nenhum alvo |
| irmã (mesmo nível) que é **pasta**, e o item é **arquivo** | custom | 25% de cima: reordenar antes dela · 50% do meio: mover pra dentro dela · 25% de baixo: reordenar depois dela |
| irmã (mesmo nível) em qualquer outro caso | custom | metade de cima: antes dela · metade de baixo: depois dela |
| separador (só se o item está na raiz) | custom | metade de cima: antes dele · metade de baixo: depois dele |
| pasta que não é a pasta do item, item é arquivo | qualquer | mover pra dentro dela |
| qualquer outra | — | nenhum alvo |
| abaixo da última linha, dentro da faixa "raiz do vault" | qualquer | item é arquivo fora da raiz: mover pra raiz · item na raiz, modo custom: reordenar no fim da raiz · senão nenhum alvo |
| abaixo da última linha, fora da faixa | custom, item na raiz | reordenar no fim da raiz |

"Depois de X" = antes da próxima entrada do mesmo nível que vem depois do bloco de X (o bloco de uma pasta aberta inclui todos os descendentes visíveis); se não houver próxima, "no fim do nível".

**Arrastando um separador:** só nível raiz. A linha sob o cursor pertence ao bloco de uma entrada da raiz (a própria linha da entrada mais os descendentes visíveis dela). Metade de cima do bloco: antes dessa entrada · metade de baixo: depois dela. Abaixo da última linha: no fim.

**Sem efeito = sem indicador:** se a posição calculada é a mesma em que o item já está (antes de si mesmo, ou antes da entrada que já vem logo depois dele), não há alvo.

**Feedback visual durante o arrasto:**
- Reordenar: linha de 2px `cristal`, horizontal, na fronteira entre as linhas, começando no recuo do nível (`8 + nivel * 16` px, o mesmo `paddingLeft` de `ItemArvore`) e indo até 8px da borda direita.
- Mover pra dentro de pasta: destaque que já existe em `ItemArvore` (`alvoDeArrasto`: `cristal` a 12% + hairline `cristal`); na faixa "raiz do vault", o fundo `cristal` a 12% que já existe.
- Linha de origem (o item ou separador sendo arrastado) fica a 40% de opacidade enquanto o gesto está engajado.
- Etiqueta que segue o cursor: ícone do tipo (`IconeArquivo`, 16px) + nome; pra separador, ícone `Rows3` + "Separador". Fundo `superficie`, hairline `regua`, `rounded-controle`, `shadow-ficha`, texto 12px `tinta`. Já vai por portal pro `document.body` (manter).
- Cursor `grabbing` no documento inteiro enquanto o gesto está engajado.
- Rolagem automática: com o ponteiro a menos de 24px da borda de cima ou de baixo da área rolável, a árvore rola até 8px por quadro (proporcional à proximidade), e o alvo é recalculado a cada quadro com a última posição do ponteiro.

**Separador (visual):** linha de 1px em `regua` (a mesma cor de `border-r border-regua` da sidebar em `App.tsx`), com 8px de recuo de cada lado. A linha ocupa uma faixa de 16px de altura (8px de respiro acima e abaixo), no lugar dos 26px de uma linha de arquivo. No hover a linha fica `regua-forte` e o cursor vira `grab` — `regua` sozinha não pode ser a única pista de que algo é arrastável (doc 06, acessibilidade). `role="separator"`.

## Fora do escopo

- Abrir pasta fechada ao pairar sobre ela durante o arrasto.
- Arrastar pelo teclado (o equivalente por menu já existe: "Mover para…").
- Arrastar entre janelas.

---

### Task 1: `alvoSoltura.ts` — decisão pura de onde o arrasto cai

**Files:**
- Create: `src/ui/excalisidian/alvoSoltura.ts`
- Test: `src/ui/excalisidian/alvoSoltura.test.ts`

**Interfaces — Produces (exatamente estes nomes e tipos):**

```ts
export interface LinhaGeometria {
  /** "no" = arquivo ou pasta; "separador" = linha divisória da raiz. */
  tipo: "no" | "separador";
  /** Nó: nome-base (ex. "Nota.md"). Separador: o id `sep-xxxxxx`. É a entrada que vai pro customOrder. */
  chave: string;
  /** Nó: caminho relativo (ex. "Projetos/Nota.md"). Separador: o próprio id. */
  path: string;
  /** Pasta que contém a linha: pastaDe(path) pra nó, "" pra separador. */
  pasta: string;
  ehPasta: boolean;
  /** Profundidade (0 = raiz). Separador é 0. */
  nivel: number;
  inicio: number;
  altura: number;
}

export type ItemArrastado =
  | { tipo: "no"; chave: string; path: string; pasta: string; ehPasta: boolean }
  | { tipo: "separador"; chave: string };

export type AlvoSoltura =
  | {
      tipo: "reordenar";
      /** Nível que muda de ordem ("" = raiz). */
      pasta: string;
      /** Entrada antes da qual o item entra; null = fim do nível. */
      antesDe: string | null;
      /** Onde desenhar o indicador (coordenada de conteúdo, a fronteira entre linhas). */
      y: number;
      /** Recuo do indicador. */
      nivel: number;
    }
  | { tipo: "mover"; pasta: string }
  | null;

export interface ContextoSoltura {
  linhas: LinhaGeometria[];
  /** y do ponteiro no conteúdo (já com scrollTop). */
  y: number;
  item: ItemArrastado;
  modo: "custom" | "alphabetical";
  /** Soma das alturas das linhas (fim da árvore). */
  alturaArvore: number;
  /** Altura da faixa "raiz do vault", desenhada logo abaixo da árvore só durante arrasto de arquivo. */
  alturaFaixaRaiz: number;
}

export function calcularAlvo(ctx: ContextoSoltura): AlvoSoltura;

/** Ordem nova de um nível: tira `arrastado` de `base` e reinsere antes de `antesDe` (null = no
 * fim). Devolve null se `antesDe` não está em `base` ou se a ordem não muda. Não muta `base`. */
export function calcularNovaOrdem(base: string[], arrastado: string, antesDe: string | null): string[] | null;
```

Regras: a tabela da seção "Comportamento" acima, **inteira**, incluindo "sem efeito = sem indicador". Recuo (`nivel`) do alvo de reordenar = nível das linhas daquele nível (0 pra raiz, profundidade da pasta + 1 pra dentro de uma pasta). `y` do indicador: "antes de X" = `X.inicio`; "depois de X" = fim do bloco de X (fim da última linha descendente visível de X, ou da própria X); "no fim da raiz" = `alturaArvore`.

- [ ] **Step 1:** escreva `alvoSoltura.test.ts` com casos que cubram cada linha da tabela, nos dois modos, mais: pasta arrastada nunca recebe `tipo: "mover"` (inclusive sobre outra pasta não-irmã e sobre a faixa raiz); soltar sobre descendente da própria pasta arrastada → null; "depois de" uma pasta aberta cai depois de todos os descendentes dela; no-op antes de si mesmo / depois do vizinho de cima → null; separador sobre uma linha filha de uma pasta aberta da raiz usa o bloco da pasta; `calcularNovaOrdem` (início, meio, fim, antesDe inexistente → null, sem mudança → null, não muta a entrada). Monte as linhas de teste com um helper que calcula `inicio` acumulando alturas (26 pra nó, 16 pra separador).
- [ ] **Step 2:** `npx vitest run src/ui/excalisidian/alvoSoltura.test.ts` — deve falhar (módulo não existe).
- [ ] **Step 3:** implemente `alvoSoltura.ts`. Puro: nada de React, DOM ou store. Pode importar `pastaDe` de `../../vault/caminhos` se precisar.
- [ ] **Step 4:** rode o teste focado até passar; depois `npx vitest run` inteiro e `npx tsc --noEmit`.
- [ ] **Step 5:** commit de só esses dois arquivos: `feat: decisão pura do alvo de soltura do arrasto na árvore`.

---

### Task 2: Visual do separador

**Files:** Modify: `src/ui/excalisidian/ArvoreArquivos.tsx`

- [ ] **Step 1:** crie a constante `ALTURA_SEPARADOR = 16` ao lado de `ALTURA_LINHA = 26`.
- [ ] **Step 2:** no `useVirtualizer`, troque `estimateSize: () => ALTURA_LINHA` por uma função por índice (`linhas[i]?.kind === "separador" ? ALTURA_SEPARADOR : ALTURA_LINHA`) e adicione `getItemKey: (i) => { const l = linhas[i]; return l ? (l.kind === "separador" ? l.id : l.no.path) : i; }`. Sem o `getItemKey`, o virtualizador guarda altura por índice e, quando um separador muda de posição, a altura errada fica grudada no índice antigo.
- [ ] **Step 3:** no JSX do separador: container `px-2` (era `px-3`), `role="separator"`, classe `group cursor-grab`; a linha interna `h-px w-full bg-regua transition-colors duration-[140ms] ease-caderno group-hover:bg-regua-forte` (era `bg-regua-forte` fixo).
- [ ] **Step 4:** `npx tsc --noEmit` e `npx vitest run`.
- [ ] **Step 5:** commit só de `ArvoreArquivos.tsx`: `fix: separador da árvore com a cor da borda da sidebar e mais baixo`.

---

### Task 3: Gesto único de arrasto com pré-visualização

**Files:**
- Modify: `src/ui/excalisidian/ArvoreArquivos.tsx`
- Modify: `src/ui/excalisidian/ItemArvore.tsx`

**Interfaces — Consumes:** `calcularAlvo`, `calcularNovaOrdem`, `LinhaGeometria`, `ItemArrastado`, `AlvoSoltura` de `./alvoSoltura` (Task 1). `ALTURA_SEPARADOR`, `getItemKey` (Task 2).

- [ ] **Step 1 — ItemArvore:** nova prop opcional `arrastado?: boolean`; quando true, `opacity-40` na linha.
- [ ] **Step 2 — geometria:** um `useMemo`/função que monta `LinhaGeometria[]` a partir de `linhas` + `virt.getMeasurements()` (`start`/`size` de **todas** as linhas, não só as visíveis). `chave` = `nomeBase` do nó ou id do separador; `pasta` = `pastaDe(path)`; `nivel` = `linha.nivel` (separador 0).
- [ ] **Step 3 — um só gesto:** substitua `iniciarArrasto` e `iniciarArrastoSeparador` por um `iniciarArrasto(e, item: ItemArrastado, elemento)` que:
  - recusa botão ≠ 0; recusa pasta fora do modo custom (clique continua abrindo/fechando a pasta pelo `onClick` de `ItemArvore`);
  - `setPointerCapture`; engaja depois de 4px; a cada `pointermove` guarda o último `clientY`/`clientX`, calcula `y` de conteúdo, chama `calcularAlvo` e atualiza o estado de render (posição da etiqueta, alvo, chave arrastada);
  - no `pointerup`: se engajado e não cancelado — `reordenar`: base = `entradasRaiz` quando `pasta === ""`, senão `ordemBaseDoNivel(customOrder[pasta], encontrarNoLocal(raizOrdenada, pasta))`; `calcularNovaOrdem(base, item.chave, alvo.antesDe)`; se não for null, `onReordenarNivel(pasta, novaOrdem)`. `mover`: só se `item.tipo === "no" && !item.ehPasta` (segunda trava, de propósito) → `onMoverArquivo(item.path, alvo.pasta)`;
  - Esc e `pointercancel` marcam cancelado e passam pelo mesmo teardown; o teardown remove **todos** os listeners, libera a captura em try/catch, para a rolagem automática, limpa o estado e o cursor do documento. Um único teardown, chamado de toda saída.
- [ ] **Step 4 — rolagem automática:** `requestAnimationFrame` enquanto o ponteiro estiver na zona de 24px de cima/baixo do `scrollRef`; velocidade até 8px/quadro proporcional à proximidade; recalcula o alvo a cada quadro com o último ponteiro; para ao sair da zona e no teardown.
- [ ] **Step 5 — render:**
  - indicador: `div` absoluto dentro do container de altura total, `pointer-events-none`, `h-0.5 bg-cristal`, `top: alvo.y - 1`, `left: 8 + alvo.nivel * 16`, `right: 8`, só quando `alvo?.tipo === "reordenar"`;
  - `alvoDeArrasto` do `ItemArvore` = `alvo?.tipo === "mover" && alvo.pasta === no.path`; faixa "raiz do vault" destacada quando `alvo?.tipo === "mover" && alvo.pasta === ""`; a faixa só aparece em arrasto de arquivo (não pasta, não separador) — como hoje;
  - linha de origem com `arrastado` (nó) / `opacity-40` (separador);
  - etiqueta conforme a seção "Comportamento", trocando `shadow-[var(--shadow-sobreposicao)]` por `shadow-ficha` e `border-regua-forte` por `border-regua`;
  - `document.body.style.cursor = "grabbing"` ao engajar, restaurado no teardown.
- [ ] **Step 6:** apague o que ficou sem uso (`acharAlvo`, `acharIndiceLinha`, `reordenarAposArrasto`, `AlvoArrasto`, `EstadoArrasto` antigos, se não servirem mais). `ordemBaseDoNivel` e `achatar` continuam.
- [ ] **Step 7:** `npx tsc --noEmit`, `npx vitest run`. Releia o diff inteiro traçando: arquivo pra dentro de pasta nos dois modos; arquivo reordenado antes/depois de irmão; arquivo solto em pasta irmã (zona do meio) em custom; pasta reordenada entre irmãs; pasta sobre pasta não-irmã (nada); separador pra cima, pra baixo, pro fim; Esc; pointercancel; clique sem arrastar (abre arquivo / alterna pasta).
- [ ] **Step 8:** commit só de `ArvoreArquivos.tsx` e `ItemArvore.tsx`: `feat: arrasto na árvore mostra onde o item vai cair`.
