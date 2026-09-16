# 13 — Busca unificada

Plano de implementação da busca por título e por conteúdo numa janela só. Este documento é o
contrato entre as tarefas B1–B5 — nomes de função, textos e comportamento saem daqui.

## 0. Ponto de partida (16/09/2026)

Já existe, mas escondido:

- `QuickSwitcher` (`Ctrl+O`): busca por nome/alias via `buscarSugestoesLink`.
- `PainelBusca` (`Ctrl+Shift+F`): busca por conteúdo sobre MiniSearch
  (`src/busca/minisearchIndex.ts`), com trechos e destaque.

Problemas encontrados:

1. **Nenhuma entrada visível.** Só atalho ou paleta de comandos.
2. **Acento.** "reuniao" não acha "reunião" — MiniSearch sem `processTerm`.
3. **Palavra incompleta.** "proj" não acha "projeto" — sem `prefix`.
4. **Termos em OU.** "reunião time" devolve nota com só uma das palavras (padrão do MiniSearch).
5. **Resultado de conteúdo abre a nota no topo**, não no trecho — embora o editor já tenha
   `revealText` / `initialRevealText` (`AtomicCodeMirrorEditor.tsx`).
6. **Duas janelas para uma pergunta só** ("onde está aquela nota?").
7. RF4.6 incompleto: sem `Ctrl+Enter` e sem criar nota inexistente.
8. `REQUISITOS-STATUS.md` diz que RF4.8 não existe — está desatualizado.

Decisões do usuário (16/09/2026):

- **Uma busca unificada.** Um campo, seções "Títulos" e "No conteúdo".
- **Entrada visível: campo "Buscar" na sidebar**, logo abaixo do cabeçalho, com o atalho à direita.
- **Abrir resultado de conteúdo rola até o trecho e destaca** (fade), sem painel de busca do
  editor e sem mover o cursor.

## 1. Experiência

### 1.1 Abrir

- Clique no campo "Buscar" da sidebar, `Ctrl+O`, `Ctrl+Shift+F` ou "Buscar" na paleta
  de comandos. Todos abrem a mesma sobreposição. A mesma tecla com a busca aberta fecha.
- Sidebar recolhida: ícone `search` na faixa de ícones, logo abaixo de "Expandir sidebar".
- Reabrir na mesma sessão traz a última consulta, **toda selecionada** (digitar substitui).

### 1.2 Campo vazio

Seção **"Modificados recentemente"**: 8 notas e desenhos do vault, por `mtimeMs`
decrescente. Anexos ficam de fora.

### 1.3 Digitando

Ordem da lista, que é navegável como uma lista só (↑/↓ atravessa seções):

1. **Títulos** — instantâneo, sem debounce. Até 6. Casa título (H1), nome do arquivo e
   aliases, sem acento e sem caixa. Ranking: igual > começa com > contém palavra que começa
   com > contém > caminho contém. Mostra ícone do tipo, nome e a pasta (em `meta`).
2. **No conteúdo** — debounce de 200 ms. Até 20 arquivos, 3 trechos cada (doc 04 §8). Só
   arquivos com pelo menos um trecho no corpo; arquivo que só casa pelo título não repete
   aqui. Cabeçalho de arquivo (ícone, título, "desenho" quando for, caminho) não é
   selecionável; os trechos são. Enquanto busca: "Buscando no conteúdo…" no lugar dos
   resultados desta seção, sem apagar os títulos.
3. **"Criar nota «consulta»"** — sempre por último, quando a consulta não é vazia e nenhum
   título casa exatamente. Cria na raiz do vault (mesma regra dos botões da sidebar) e abre.

Sem nenhum resultado e sem item de criar: "Nada encontrado para «xyz»." (texto já existente).
Vault reindexando: linha "Reindexando o vault…" acima dos resultados (já existe).

Sintaxe continua a do doc 04 §8: termos em E, `"frase exata"`, `-termo` exclui.

### 1.4 Teclado

| Tecla | Ação |
|---|---|
| ↑ / ↓ | move a seleção pela lista inteira |
| Enter | abre (aba existente é ativada; aba em branco ativa é substituída — comportamento atual) |
| Ctrl+Enter | abre ao lado (divide à direita) |
| Esc | fecha e devolve o foco a quem tinha |

Rodapé da sobreposição, em `meta`: "↵ abrir · Ctrl ↵ abrir ao lado · Esc fechar".

### 1.5 Abrir um resultado

- **Título / recente:** abre o arquivo.
- **Trecho de nota:** abre e revela a linha do trecho (`revealText` com a linha completa),
  com o fade de destaque do editor. Se a nota já estava aberta, ativa a aba e revela.
- **Trecho de desenho:** só abre o desenho (canvas não tem linha).

## 2. Contratos

### 2.1 Motor (B1)

`src/busca/normalizacao.ts` (novo, com teste):

```ts
/** Minúsculas + sem diacríticos. Preserva o comprimento em UTF-16 para texto NFC. */
export function dobrar(texto: string): string;
```

`src/busca/minisearchIndex.ts`:

- `processTerm` = `dobrar` no índice e na consulta. `VERSAO_INDICE` sobe para 2 (força
  reconstrução do índice persistido).
- `searchOptions`: `prefix: true`; `fuzzy`: `0.2` só para termo com 5+ caracteres.
- `buscarConteudo(consulta, lerTexto, opcoes?: { combinar?: "AND" | "OR" })`. **Padrão
  continua `"OR"`** porque `src/agente/recuperacao.ts` usa essa função com texto livre; a UI
  passa `"AND"`. Conferir o agente e não mudar o comportamento dele.
- `parsearConsulta`, filtro de frase/exclusão, `montarTrechos` e `partesComDestaque`
  comparam com `dobrar` dos dois lados. O destaque marca o trecho **original** (com acento),
  usando que `dobrar` preserva índices. Com `prefix`, destacar a palavra que começa com o termo.
- `TrechoBusca` ganha `linhaCompleta: string` (a linha inteira, sem recorte nem "…").

`src/busca/buscaTitulos.ts` (novo, com teste, puro — índice por parâmetro opcional como
`buscarSugestoesLink`):

```ts
export interface ResultadoTitulo { path: string; titulo: string; kind: "note" | "drawing"; pasta: string }
export function buscarTitulos(consulta: string, limite?: number, indice?: Map<string, FileMeta>): ResultadoTitulo[]; // padrão 6
export function modificadosRecentemente(limite?: number, indice?: Map<string, FileMeta>): ResultadoTitulo[];       // padrão 8
export function temTituloExato(consulta: string, indice?: Map<string, FileMeta>): boolean;
```

`buscarSugestoesLink` (autocomplete de link) não muda.

### 2.2 Navegação (B2)

`src/estado/workspaceStore.ts`:

```ts
abrirDocumento(path: string, opcoes?: { revelar?: string; aoLado?: boolean }): void;
```

- `aoLado`: abre num grupo novo à direita do painel ativo (mesma direção de
  `dividirAtivo("right")`). Se o arquivo já tem aba, ativa ela em vez de duplicar.
- `revelar`: registra em `src/estado/revelacaoStore.ts` (novo) um pedido
  `{ path, texto, seq }`. `seq` incrementa para o mesmo texto poder ser revelado duas vezes.
- `EditorNota.tsx` consome o pedido do próprio `caminho`: se já montado, chama
  `handleRef.current.revealText(texto)`; se está montando, espera o editor ficar pronto (ou
  usa `initialRevealText`). Consome o pedido para não revelar de novo ao remontar.
  Vista somente leitura (split da mesma nota) também revela.
- Todos os chamadores atuais de `abrirDocumento(path)` continuam funcionando sem mudança.

### 2.3 Sobreposição (B3)

- `PainelBusca.tsx` é reescrito como a busca unificada da seção 1. `QuickSwitcher.tsx` é
  apagado. `SobreposicaoBusca.tsx` continua existindo para a `PaletaComandos`.
- `sobreposicaoStore`: `TipoSobreposicao = "comandos" | "busca"`; guarda
  `ultimaConsulta: string` (memória de sessão, sem persistir).
- `Workspace.tsx`: `Ctrl+O` e `Ctrl+Shift+F` → `abrir("busca")`. Conferir
  `canvas/atalhosCanvas.ts` e doc 04 §6.1: as duas teclas precisam passar do canvas para o app.
- `PaletaComandos`: o comando vira "Buscar", atalho "CTRL O".
- Criar nota: usar a função de `vault/criar.ts` / `app/comandos/criacao.ts` que cria com
  nome (se não houver uma que aceite nome, criar a mais fina possível lá, sem duplicar lógica
  de `caminhoLivre`).
- Visual: mesmo chrome da sobreposição atual (backdrop, `surgir` 160 ms, `max-w-xl`),
  `campo-grande` no campo, cabeçalhos de seção em `meta text-tinta-suave`, realce `ocre` a 30%
  que já existe. Nada fora do doc 06.

### 2.4 Entrada na sidebar (B4)

- `src/ui/excalisidian/CampoBuscaSidebar.tsx` (novo): linha logo abaixo do cabeçalho em
  `ConteudoSidebar`, separada por hairline `regua`. Visual de campo (não é um input de
  verdade — é um `button` que chama `useSobreposicaoStore.getState().abrir("busca")`):
  ícone `search` 16px, "Buscar" em `text-tinta-suave`, "CTRL O" em `meta` à direita.
  Hover/foco/raio: os de `Campo` e item de sidebar do doc 06.
- `App.tsx`, faixa recolhida: `BotaoIcone` `Search`, título "Buscar", logo depois de
  "Expandir sidebar".

## 3. Textos (B5 grava no doc 04)

| Situação | Texto |
|---|---|
| Campo na sidebar | "Buscar" + atalho "CTRL O" |
| Botão na faixa recolhida | "Buscar" |
| Rótulo acessível da sobreposição | "Buscar" |
| Placeholder | "Buscar por título ou conteúdo…" |
| Seção | "Títulos" / "No conteúdo" / "Modificados recentemente" |
| Carregando conteúdo | "Buscando no conteúdo…" |
| Criar | "Criar nota «{consulta}»" |
| Sem resultado | "Nada encontrado para «{consulta}»." (existente) |
| Reindexando | "Reindexando o vault…" (existente) |
| Rodapé | "↵ abrir · Ctrl ↵ abrir ao lado · Esc fechar" |
| Paleta de comandos | "Buscar" |

## 4. Tarefas

| Tarefa | Arquivos (exclusivos) | Depende de |
|---|---|---|
| B1 Motor | `src/busca/normalizacao.ts` (+test), `src/busca/minisearchIndex.ts` (+test), `src/busca/buscaTitulos.ts` (+test) | — |
| B2 Navegação | `src/estado/workspaceStore.ts` (+test), `src/estado/revelacaoStore.ts` (+test), `src/editor/EditorNota.tsx` | — |
| B4 Sidebar | `src/ui/excalisidian/CampoBuscaSidebar.tsx`, `ConteudoSidebar.tsx`, `App.tsx` (só a faixa recolhida) | — |
| B5 Docs | `docs/03`, `docs/04`, `docs/06`, `docs/09`, `docs/REQUISITOS-STATUS.md` | — |
| B3 Sobreposição | `PainelBusca.tsx`, `QuickSwitcher.tsx` (apagar), `RaizSobreposicoes.tsx`, `sobreposicaoStore.ts`, `Workspace.tsx` (atalhos), `PaletaComandos.tsx`, `canvas/atalhosCanvas.ts` (se preciso), `vault/criar.ts` / `app/comandos/criacao.ts` (se preciso) | B1, B2 |

Ondas: B1 + B2 + B4 + B5 em paralelo; depois B3; depois integração (`npx tsc --noEmit`,
`npm test`) e teste manual.

## 5. Teste manual

1. Campo "Buscar" visível na sidebar; clicar abre. Sidebar recolhida: ícone abre.
2. Campo vazio mostra 8 modificados recentemente.
3. "reuniao" acha "Reunião semanal" em Títulos e trechos com "reunião" destacado no acento certo.
4. "proj" acha "Projeto"; "reunião time" só traz notas com as duas palavras.
5. Enter num trecho: nota abre rolada até a linha, com o fade. Nota já aberta: ativa e revela.
6. Ctrl+Enter abre à direita. Trecho de desenho só abre o desenho.
7. Consulta sem título exato: "Criar nota «x»" cria na raiz e abre.
8. Ctrl+O e Ctrl+Shift+F com o canvas focado abrem a busca; a mesma tecla fecha.
9. Fechar e reabrir: última consulta selecionada.
10. Painel do agente continua achando notas relacionadas (recuperação usa `"OR"`).
