# 10 — Tarefas

Este documento é normativo e autocontido. É a fonte da verdade sobre o painel de tarefas:
modelo de dados, formato no disco, cálculo das seções, interface, textos e as decisões por
trás de tudo isso. Os outros documentos só apontam para cá.

Escrito em 10/09/2026, depois de um brainstorming com o usuário. Entra como as outras coisas
que nasceram fora do roadmap original por pedido direto (ver doc 08).

---

## 1. O que é

Um checklist leve de tarefas, numa barra lateral **vertical e estreita** à direita do app
(~320px). As tarefas são uma lista única, empilhada verticalmente e dividida em seis seções
por prazo — não um kanban de colunas lado a lado (a orientação vertical é justamente pra
ocupar o mínimo de largura). O usuário não cria nem renomeia seções, e nunca escolhe uma data
num calendário: só arrasta a tarefa entre as seções, e a seção decide a data.

É um terceiro tipo de coisa no produto, ao lado de nota e desenho, mas **não é um arquivo do
vault**: todas as tarefas vivem num único `.excalisidian/tarefas.json`.

### O que NÃO tem (v1)

Escrito aqui para não virar discussão depois:

- Sem recorrência, subtarefas, prioridade, etiquetas, lembrete ou notificação.
- Sem vínculo entre tarefa e nota (a tarefa não aponta para um arquivo; o título é texto puro).
- Sem data ou calendário explícito — a única forma de definir prazo é a seção.
- Sem desfazer global de mover/reordenar. O único desfazer é o do apagar comentário (toast).
- Sem histórico de conclusão além do carimbo `concluidaEm` da tarefa.

---

## 2. Modelo de dados

### 2.1 Arquivo

`.excalisidian/tarefas.json`, na pasta de config versionável do vault (doc 02 §1), ao lado do
`vault.json`. Vai para o Git junto com as notas.

```json
{
  "versao": 1,
  "tarefas": [
    {
      "id": "t-1a2b3c4d",
      "titulo": "Comprar cabo HDMI",
      "vencimento": "2026-09-12",
      "ordem": 30,
      "concluida": false,
      "concluidaEm": null,
      "criadaEm": "2026-09-10T12:15:00Z",
      "comentarios": [
        {
          "id": "c-9f8e7d6c",
          "texto": "ver [[Setup da mesa]]",
          "criadoEm": "2026-09-10T12:20:00Z",
          "editadoEm": null
        }
      ]
    }
  ]
}
```

| Campo | Tipo | Regra |
|---|---|---|
| `versao` | número | `1` nesta versão do formato. |
| `tarefas` | array | Ordem no array é irrelevante para a exibição (a ordem visível sai de `ordem` / `concluidaEm`); serializar mantém a ordem de `id` estável (§2.3). |
| `id` | string | `t-` + 8 hex de `crypto.randomUUID()`. Imutável. |
| `titulo` | string | Texto puro. Sem markdown, sem wikilink clicável (diferente dos comentários). Nunca vazio no disco — ver §5.1. |
| `vencimento` | string | Data local `YYYY-MM-DD`, **sem hora e sem fuso**. Único eixo temporal da tarefa. O usuário nunca digita isto; sai da seção (§3.3). |
| `ordem` | número | Só serve para ordenar tarefas dentro de uma mesma seção calculada. Não precisa ser inteiro, contíguo, nem começar em zero. Ao soltar/mover, o store reatribui `10, 20, 30…` a todas as tarefas da seção afetada, na nova ordem (§8.2) — mantém os valores limpos sem acoplar o formato à lógica de data. `parseTarefas`/`serializarTarefas` só leem e escrevem o número como está. |
| `concluida` | booleano | — |
| `concluidaEm` | string \| null | ISO 8601 (`new Date().toISOString()`, UTC — `2026-09-10T17:03:11Z`), gravado no instante do check. `null` sempre que `concluida` é `false`. |
| `criadaEm` | string | ISO 8601 (`new Date().toISOString()`, UTC), no instante da criação. |
| `comentarios` | array | Ordem do array = ordem de exibição (mais antigo primeiro). |
| `comentarios[].id` | string | `c-` + 8 hex. Imutável. |
| `comentarios[].texto` | string | Texto com `[[wikilink]]` reconhecido e clicável na UI (§5.5). Guardado cru, sem escape. |
| `comentarios[].criadoEm` | string | ISO 8601 (`new Date().toISOString()`, UTC). |
| `comentarios[].editadoEm` | string \| null | ISO 8601 (`new Date().toISOString()`, UTC) da última edição; `null` até a primeira. |

### 2.2 Escrita e leitura

- **Toda gravação passa por `escritaAtomica.ts` / `VaultAdapter`** (regra do CLAUDE.md). Nunca
  `writeTextFile` direto.
- Salvamento com **debounce de 800 ms** após a última mutação, mais flush imediato ao fechar o
  app — o mesmo contrato de autosave das notas e dos desenhos.
- Se o conteúdo serializado for idêntico ao que está no disco, **não grava** (RNF7: abrir e
  fechar não gera diff).
- Carga: uma vez, ao abrir o vault. **Não há recarga ao vivo** de edição externa do
  `tarefas.json` — o watcher do projeto já ignora qualquer caminho que comece com `.` (ver
  `src-tauri/src/watcher.rs`), então o mesmo vale aqui e para o `vault.json`. Editar o JSON à
  mão com o app aberto só tem efeito na próxima abertura do vault.
- Arquivo **ausente**: trata como `{ "versao": 1, "tarefas": [] }`. Não cria o arquivo até a
  primeira tarefa existir.
- Arquivo **corrompido** (JSON inválido, `versao` desconhecida, schema fora do esperado): trata
  como lista vazia, **não** sobrescreve o arquivo até o usuário criar uma tarefa (para não
  destruir um arquivo que ele talvez consiga recuperar à mão), e mostra o toast de erro
  (§6.4). Nunca trava o app.

### 2.3 Formato estável

`src/tarefas/formatoTarefas.ts` expõe `parseTarefas(texto): DadosTarefas` e
`serializarTarefas(dados): string`. O serialize:

- Chaves de cada objeto em ordem fixa (a ordem da tabela §2.1), não alfabética — legibilidade.
- `tarefas` ordenado por `id` no arquivo (estável entre gravações mesmo quando a ordem visível
  muda).
- `comentarios` na ordem de criação.
- Indentação de 2 espaços, `\n` no fim.
- Round-trip idempotente: `serializarTarefas(parseTarefas(x))` reproduz `x` byte a byte quando
  `x` já foi gerado por este serialize.

---

## 3. Cálculo das seções

`src/tarefas/agrupamento.ts` — função pura `agruparTarefas(tarefas, hoje): Grupos`, testável
em `environment: "node"` (sem DOM). `hoje` é uma data local (`YYYY-MM-DD`).

### 3.1 Semana

A semana vai de **domingo a sábado**.

- `sabadoDestaSemana` = o primeiro sábado com data ≥ `hoje` (se `hoje` já é sábado, é o próprio
  `hoje`).
- `sabadoProximaSemana` = `sabadoDestaSemana + 7 dias`.

### 3.2 Seção de uma tarefa

Avalia na ordem; a primeira condição verdadeira define a seção:

| # | Condição | Seção |
|---|---|---|
| 1 | `concluida === true` | **Concluídas** |
| 2 | `vencimento < hoje` | **Atrasado** |
| 3 | `vencimento === hoje` | **Hoje** |
| 4 | `vencimento === hoje + 1 dia` | **Amanhã** |
| 5 | `vencimento <= sabadoDestaSemana` | **Essa semana** |
| 6 | qualquer outro caso | **Próxima semana** |

Notas:

- Uma tarefa concluída **nunca** aparece em Atrasado, mesmo que `vencimento` já tenha passado.
- Não existe seção além de Próxima semana. Como a UI só grava `vencimento` até
  `sabadoProximaSemana` (§3.3), a linha 6 na prática significa "entre depois de amanhã e o
  sábado da semana que vem". Um `vencimento` além disso (JSON editado à mão) continua caindo em
  Próxima semana — a última seção visível absorve o excedente.
- **Consequência desejada:** uma tarefa deixada em "Essa semana" tem `vencimento` no sábado
  desta semana. Ao virar a semana sem ter sido concluída, `vencimento < hoje` e ela aparece em
  **Atrasado**, sozinha. O mesmo vale para "Próxima semana".
- **Caso de borda aceito:** criar uma tarefa em "Essa semana" numa sexta ou num sábado grava
  `vencimento = sabadoDestaSemana`, que é hoje ou amanhã — a tarefa aparece em Hoje ou Amanhã,
  não em Essa semana. É comportamento assumido, não se trata como erro.

### 3.3 Data que cada seção grava

Ao criar uma tarefa numa seção, soltá-la nela, ou escolher a seção no button-group do modal:

| Seção alvo | O que grava |
|---|---|
| Hoje | `vencimento = hoje` |
| Amanhã | `vencimento = hoje + 1 dia` |
| Essa semana | `vencimento = sabadoDestaSemana` |
| Próxima semana | `vencimento = sabadoProximaSemana` |
| Concluídas | não altera `vencimento`; `concluida = true`, `concluidaEm = agora` |
| Atrasado | — não é alvo de soltura nem do button-group (§5.2, §5.5) |

### 3.4 Ordenação dentro da seção

- **Concluídas**: por `concluidaEm` **decrescente** (conclusão mais recente no topo), empate
  por `id`. Sem reordenação manual.
- **Todas as outras**, Atrasado incluído: por `ordem` **crescente**, empate por `id`.

### 3.5 Visibilidade das seções

| Seção | Quando aparece | Botão "Nova tarefa" |
|---|---|---|
| Atrasado | só quando tem ≥ 1 tarefa | não |
| Hoje | sempre | sim |
| Amanhã | sempre | sim |
| Essa semana | sempre | sim |
| Próxima semana | sempre | sim |
| Concluídas | sempre, **colapsada por padrão** | não |

O estado colapsado/expandido de Concluídas é efêmero: volta a colapsado a cada abertura do
app. Não é persistido.

### 3.6 "Hoje" que muda com o app aberto

`hoje` vem do hook `useHojeLocal()`, que devolve a data local e a revalida:

- no `visibilitychange` e no foco da janela (reaproveitando a lógica de
  `useRessincronizarAoVoltar`);
- num timer agendado para o próximo instante de meia-noite local.

Quando `hoje` muda, a lista se reagrupa sozinha — uma tarefa de "Hoje" não concluída passa
para "Atrasado" na virada do dia sem o usuário reabrir o app.

### 3.7 Cabeçalhos das seções de semana

- Essa semana: `Essa semana · 6–12 de setembro`
- Próxima semana: `Próxima semana · 13–19 de setembro`

Formato do intervalo: `D–D de <mês>` quando início e fim caem no mesmo mês; `D de <mês> – D de
<mês>` quando cruzam o mês. Sem ano. Mês por extenso, minúsculo.

---

## 4. Painel

### 4.1 Posição e estado

- Um `<aside>` à direita do `<main>` no `App.tsx`, espelhando a sidebar esquerda. Fundo
  `superficie`, hairline `regua` na borda esquerda, sem sombra.
- Largura padrão **320px**, ajustável entre **280 e 480px** por uma divisória de 1px com área
  de arraste de 8px (mesmo padrão da divisória de split, doc 06).
- **Alternável.** Começa aberto. Fecha e reabre por:
  - atalho `Ctrl+\` (`Cmd+\` no macOS). O handler casa a tecla física (`e.code === "Backslash"`),
    não `e.key` — com layout comum a barra invertida vira `"\\"` sem Shift e `"|"` com. Nada
    mais no app liga essa combinação;
  - um botão fixo no canto superior direito da janela (`App.tsx`, sobreposto ao `<main>`, some
    quando o painel já está aberto). Ocupa o lugar do dropdown nativo "abas escondidas" do
    dockview ("⌄ N", fim da faixa de abas de cada grupo) — desligado de propósito
    (`disableTabsOverflowList` em `Workspace.tsx`): o usuário achava que indicava quantas notas
    estavam abertas, não indicava isso, e não usava.
- `painelAberto` (booleano) e `larguraPainel` (número) são preferência **de app**, gravadas no
  `settings.json` como o tema — não por vault.
- Ícone do painel: `list-checks` (lucide).

### 4.2 Estrutura

```
┌─ Tarefas ───────────────────  [×] ─┐
│                                    │
│  Atrasado                          │   ← só se tiver tarefa
│  ☐ Ligar para a contadora          │
│                                    │
│  Hoje                              │
│  ☐ Revisar PR #214                 │
│  ☐ ─────────────────────           │   ← alça no hover
│  + Nova tarefa                     │
│                                    │
│  Amanhã                            │
│  + Nova tarefa                     │
│                                    │
│  Essa semana · 6–12 de setembro    │
│  ☐ Fechar o orçamento              │
│  + Nova tarefa                     │
│                                    │
│  Próxima semana · 13–19 de set.    │
│  + Nova tarefa                     │
│                                    │
│  ▸ Concluídas                      │   ← colapsada
└────────────────────────────────────┘
```

- Ordem fixa: Atrasado → Hoje → Amanhã → Essa semana → Próxima semana → Concluídas.
- Cabeçalho de seção: nome em `meta`/`tinta-suave`, o intervalo quando for semana, e um
  contador discreto do total da seção. Hairline abaixo.
- Corpo rolável; o cabeçalho do painel (`Tarefas` + fechar) fica fixo no topo.

### 4.3 Linha de tarefa

- Checkbox (componente base `Checkbox`) à esquerda + título.
- Alça `grip-vertical` aparece no hover da linha, à esquerda do checkbox — mesmo
  comportamento visual da `AlcaBloco` do editor.
- Clique na linha, fora do checkbox e da alça, abre o modal de detalhe (§5.5).
- Título que não cabe: trunca com reticências. O texto inteiro está no modal.
- Tarefa concluída (na seção Concluídas): título com `line-through` e `tinta-suave`.

### 4.4 Estados vazios

- Nenhuma tarefa em lugar nenhum: um `EstadoVazio` dentro do painel — título "Nenhuma tarefa",
  apoio curto, e o botão primário "Nova tarefa" (cria em Hoje).
- Seção visível sem tarefa (ex.: Amanhã vazia): só o cabeçalho e o botão "Nova tarefa". Não usa
  `EstadoVazio` por seção — seria barulho.

---

## 5. Interações

### 5.1 Nova tarefa

- Clique em "Nova tarefa" numa seção → aparece um campo de texto inline no fim da lista dessa
  seção, já focado. Ainda não existe tarefa nenhuma — é só o input.
- **Enter com texto**: cria a tarefa (`vencimento` = data da seção §3.3, `ordem` = maior
  `ordem` da seção + 10, `criadaEm` = agora, `comentarios` vazio) e **deixa um novo campo
  vazio focado logo abaixo** — a cadeia continua.
- **Enter com o campo vazio**: encerra a cadeia e remove o campo. Nada é criado.
- **Esc**: cancela e remove o campo. Nada é criado.
- **Blur com texto**: cria a tarefa e **encerra** a cadeia (não abre outro campo).
- **Blur com o campo vazio**: remove o campo.
- Não existe estado intermediário de "tarefa sem título no disco": a tarefa só nasce quando há
  texto. Isto cobre "se o usuário não escrever nenhum título, ela é apagada automaticamente".
- Se a data da seção fizer a tarefa cair em outra seção (§3.2, caso de borda da sexta/sábado),
  a tarefa aparece na seção calculada, mas a cadeia de "Nova tarefa" continua ancorada na
  seção cujo botão foi clicado.

### 5.2 Reordenar e mover — arrastar

Arrasto **por eventos de ponteiro na mão** (pointerdown / pointermove / pointerup), **nunca**
HTML5 drag-and-drop — o projeto já apanhou disso duas vezes (doc 09 ADR-18; dockview precisou
de `dndStrategy="pointer"`; `ArvoreArquivos` e `moverBloco` arrastam assim). Reaproveitar o
padrão de `moverBloco.ts`.

- Durante o arrasto, uma linha-alvo de 1px em `musgo` marca onde a tarefa vai cair (igual
  `cm-linha-soltura` do editor).
- Soltar **na mesma seção**, em outra posição: só recalcula `ordem` (§2.1).
- Soltar **em outra seção**: recalcula `vencimento` (§3.3) e `ordem` (posição onde soltou).
- **Atrasado**:
  - reordenar dentro dela: permitido (muda `ordem`);
  - arrastar uma tarefa dela para outra seção: permitido (a tarefa recebe a data da seção
    destino e deixa de estar atrasada);
  - soltar uma tarefa de fora **dentro** dela: **não permitido** — sem linha-alvo, sem realce
    ao passar por cima.
- **Concluídas**: não aceita soltura (a ordem é sempre por `concluidaEm`). Arrastar uma tarefa
  concluída para outra seção equivale a reabri-la — ver §5.4.
- **Sem equivalente de teclado para o reordenar puro.** É uma exceção consciente ao piso de
  qualidade do doc 06 ("toda ação de arraste tem equivalente por teclado ou menu"),
  autorizada pelo usuário no brainstorming. A ação semântica de mover entre seções **tem**
  caminho por teclado: o button-group de status no modal (§5.5).

### 5.3 Checkbox

- **Marcar** (em qualquer seção): `concluida = true`, `concluidaEm = agora`. A tarefa sai da
  seção atual e entra no topo de Concluídas.
- **Desmarcar** (só acontece na seção Concluídas): `concluida = false`, `concluidaEm = null`,
  `vencimento = hoje`. A tarefa vai para **Hoje**.

### 5.4 Tirar da seção Concluídas

Três formas. Todas limpam `concluida`/`concluidaEm`:

1. Desmarcar o checkbox de conclusão (§5.3) → `vencimento = hoje` → seção Hoje.
2. No modal, escolher outra seção no button-group de status → a seção escolhida define a data
   (§3.3), não necessariamente Hoje.
3. Arrastar a tarefa de Concluídas para outra seção (§5.2) → a seção onde soltou define a data.

### 5.5 Modal de detalhe

- Abre deslizando da direita, **cobrindo só a largura do painel de tarefas** — o editor/canvas
  atrás continua visível. Fundo `superficie`, `raio-ficha`, sombra `sobreposicao`.
- Fecha por Esc, clique fora (na lista atrás ou no editor), ou o botão de fechar do modal.
- Conteúdo, de cima para baixo:

  1. **Título** — campo editável que parece texto corrido até receber foco. Salva no blur e no
     Enter. Não pode ficar vazio: blur vazio restaura o título anterior.

  2. **Status** — `GrupoBotoes` (componente existente) com cinco opções: `Hoje`, `Amanhã`,
     `Essa semana`, `Próxima semana`, `Concluídas`. O botão aceso reflete a seção calculada
     atual da tarefa. Clicar num botão aplica a mesma lógica de mover (§3.3). **Atrasado não é
     um botão** — não se "coloca" uma tarefa em atrasado. Quando a tarefa está atrasada, nenhum
     dos quatro primeiros fica aceso e um rótulo discreto `Atrasado` aparece ao lado do grupo.

  3. **Comentários** — lista do mais antigo ao mais novo. Cada item mostra a data/hora
     (`criadoEm`, e `Editado` quando `editadoEm` não é nulo) e o texto com `[[wikilink]]`
     renderizado e clicável, reaproveitando o `LinkInterno` / resolvedor de link do projeto.
     Ações por comentário: **editar** inline (salva no blur/Enter, grava `editadoEm`),
     **apagar** (remove na hora e mostra o toast "Comentário apagado" com "Desfazer"). No fim,
     um campo "Novo comentário": Enter cria (grava `criadoEm`), Shift+Enter quebra linha.

- Se a tarefa muda de seção por ação do próprio modal, o modal continua aberto mostrando o novo
  estado. Se a tarefa é concluída pelo checkbox da linha enquanto o modal dela está aberto, o
  modal continua e o button-group passa a mostrar `Concluídas` aceso.

---

## 6. Textos da interface

Português do Brasil, sentence case, sem emoji (doc 06 §Voz da interface).

### 6.1 Rótulos

| Onde | Texto |
|---|---|
| Título do painel | Tarefas |
| Botão de alternar o painel (tooltip) | Tarefas |
| Seções | Atrasado · Hoje · Amanhã · Essa semana · Próxima semana · Concluídas |
| Botão de adicionar | Nova tarefa |
| Placeholder do campo de nova tarefa | Escreva o título e tecle Enter |
| Placeholder do campo de comentário | Escrever um comentário |
| Marca de comentário editado | Editado |
| Rótulo do modal quando atrasada | Atrasado |

### 6.2 Estado vazio

- Título: `Nenhuma tarefa`
- Apoio: `Crie a primeira e ela aparece agrupada por prazo.`
- Botão: `Nova tarefa`

### 6.3 Ícones

Estende a tabela do doc 06 §Ícones (lucide, traço 1.5):

| Uso | Ícone |
|---|---|
| painel de tarefas (botão de alternar) | `list-checks` |
| nova tarefa | `plus` |
| alça de arraste da tarefa | `grip-vertical` (igual à alça de bloco) |
| fechar o modal | `x` |
| apagar comentário | `trash-2` |

### 6.4 Erros e avisos (toasts)

| Situação | Texto |
|---|---|
| Comentário apagado | `Comentário apagado` + ação `Desfazer` |
| `tarefas.json` ilegível na abertura | `Não foi possível ler as tarefas. O arquivo pode estar corrompido; ele não será sobrescrito até você criar uma tarefa nova.` |
| Falha ao gravar `tarefas.json` | `Não foi possível salvar as tarefas. Verifique a permissão da pasta do vault.` |

---

## 7. Requisitos funcionais

| RF | Descrição | Prioridade |
|---|---|---|
| RF10.1 | Abrir e fechar o painel de tarefas por `Ctrl+\` e por um botão na sidebar; estado e largura persistem entre sessões. | P0 |
| RF10.2 | Exibir as tarefas em seis seções calculadas a partir de `vencimento` vs. hoje, na ordem fixa da §4.2. | P0 |
| RF10.3 | Criar tarefas em cadeia pelo botão "Nova tarefa" de cada seção (exceto Atrasado e Concluídas); campo vazio nunca vira tarefa. | P0 |
| RF10.4 | Reordenar tarefas dentro de uma seção arrastando. | P0 |
| RF10.5 | Mover uma tarefa entre seções arrastando, aplicando a data da seção destino. Atrasado não aceita tarefa de fora. | P0 |
| RF10.6 | Concluir/reabrir uma tarefa pelo checkbox da linha; concluir manda para Concluídas, reabrir manda para Hoje. | P0 |
| RF10.7 | Abrir um modal de detalhe ao clicar numa tarefa, com título editável, status em button-group e comentários. | P0 |
| RF10.8 | Adicionar, editar e apagar comentários de uma tarefa; `[[wikilink]]` no comentário é clicável. | P1 |
| RF10.9 | Manter Concluídas colapsada por padrão e ordenada por conclusão mais recente. | P1 |
| RF10.10 | Reagrupar as seções sozinho na virada do dia com o app aberto. | P1 |
| RF10.11 | Persistir tudo em `.excalisidian/tarefas.json` por escrita atômica, com debounce e flush no fechamento; abrir sem editar não gera diff. | P0 |
| RF10.12 | Tolerar `tarefas.json` ausente ou corrompido sem travar o app e sem destruir o arquivo. | P0 |

---

## 8. Arquitetura

Segue a estrutura do doc 05.

### 8.1 Arquivos novos

| Arquivo | Responsabilidade |
|---|---|
| `src/tarefas/formatoTarefas.ts` | `parseTarefas` / `serializarTarefas`, JSON estável, round-trip idempotente. Puro. |
| `src/tarefas/agrupamento.ts` | `agruparTarefas(tarefas, hoje)`, `secaoDe(tarefa, hoje)`, `dataDaSecao(secao, hoje)`, `intervaloDaSemana(...)`. Puro, testável em node. |
| `src/tarefas/tipos.ts` | `Tarefa`, `Comentario`, `Secao`, `DadosTarefas`. |
| `src/estado/tarefasStore.ts` | Store zustand: estado + ações + persistência com debounce. |
| `src/app/useHojeLocal.ts` | Hook: data local com revalidação em foco/visibilidade e timer de meia-noite. |
| `src/ui/excalisidian/PainelTarefas.tsx` | O `<aside>`: cabeçalho, lista de seções, divisória de largura. |
| `src/ui/excalisidian/SecaoTarefas.tsx` | Cabeçalho da seção, linhas, botão "Nova tarefa", alvo de soltura. |
| `src/ui/excalisidian/LinhaTarefa.tsx` | Checkbox + título + alça; origem do arrasto; abre o modal. |
| `src/ui/excalisidian/NovaTarefaInline.tsx` | Campo de criação em cadeia. |
| `src/ui/excalisidian/ModalTarefa.tsx` | Modal lateral: título, button-group de status, comentários. |
| `src/ui/excalisidian/ComentariosTarefa.tsx` | Lista, criação, edição inline, apagar com desfazer. |

### 8.2 `tarefasStore.ts`

Estado: `tarefas: Tarefa[]`, `carregado: boolean`, `painelAberto: boolean`,
`larguraPainel: number`, `concluidasExpandidas: boolean` (efêmero), `tarefaAberta: string | null`,
mais o estado transitório de arrasto.

Ações (todas as que mudam `tarefas` agendam `persistir()` — debounce 800 ms, `escritaAtomica`):
`carregar()`, `criar(secao, titulo, hoje)`, `editarTitulo(id, titulo)`,
`moverTarefa(id, secaoAlvo, indiceAlvo, hoje)` (reordenar dentro da seção e mover entre
seções colapsaram nesta única ação — o índice-alvo cobre os dois casos),
`alternarConcluida(id, hoje)`, `adicionarComentario(id, texto)`,
`editarComentario(id, comentarioId, texto)`, `removerComentario(id, comentarioId)` +
`restaurarComentario(...)` para o desfazer, `abrirModal(id)`, `fecharModal()`,
`alternarPainel()`, `definirLargura(n)`, `alternarConcluidas()`.

`painelAberto` e `larguraPainel` também vão para o `settings.json` (via o mesmo `plugin-store`
que o `prefsStore` usa).

### 8.3 Montagem

`PainelTarefas` entra no `App.tsx` como um `<aside>` à direita do `<main>`, dentro do
`LimiteDeErro` que já envolve o shell. O `ModalTarefa` é renderizado por dentro do
`PainelTarefas` (não no `RaizDialogos`), porque ele cobre só a largura do painel.

`tarefasStore.carregar()` é chamado quando o vault abre, junto com o resto da inicialização do
`vaultStore`.

---

## 9. Testes mínimos

Na linha do doc 05 §10 — poucos, mas estes:

1. `serializarTarefas(parseTarefas(x)) === x` para um arquivo com tarefa concluída, tarefa com
   comentário, e comentário editado.
2. Serializar duas vezes a mesma estrutura dá bytes idênticos.
3. `secaoDe` com `hoje` fixo cobrindo cada uma das seis seções, incluindo: concluída com
   `vencimento` no passado fica em Concluídas (não em Atrasado); `vencimento` além da próxima
   semana cai em Próxima semana.
4. Virada de semana: uma tarefa com `vencimento = sábado` está em "Essa semana" no sábado e em
   "Atrasado" no domingo seguinte.
5. `dataDaSecao` devolve hoje / hoje+1 / sábado desta semana / sábado da próxima para as quatro
   seções com data.
6. Cadeia de criação: criar com título vazio não produz tarefa; criar com título produz uma
   tarefa e `ordem` maior que a última da seção.
7. `intervaloDaSemana` formata `6–12 de setembro` (mesmo mês) e `28 de setembro – 4 de outubro`
   (cruza mês).

---

## 10. Decisões

### 10.1 Data única por tarefa, seções calculadas

As seções não são rótulos que a tarefa carrega — são o resultado de comparar `vencimento` com
hoje. É o que faz "Atrasado só aparece quando há tarefa atrasada" ser verdade sem nenhuma regra
extra, e o que faz a lista se reorganizar sozinha na virada do dia. O custo é que "Essa
semana" e "Próxima semana" precisam de um dia concreto para gravar: escolhido o **último dia da
janela** (sábado), para a tarefa decair de forma gradual (Essa semana → Amanhã → Hoje →
Atrasado) em vez de saltar de "Próxima semana" direto para "Hoje" no primeiro dia da semana.

### 10.2 JSON no vault, não markdown

Comentários com carimbo, ordenação manual, data de vencimento e carimbo de conclusão são
metadados estruturados demais para uma linha de checklist. Um `- [ ]` com metadados inline
(estilo Obsidian Tasks) viraria mais uma peça de parse/serialize frágil, como o
`formatoDesenho.ts`. O `tarefas.json` fica na pasta de config **versionável** (`.excalisidian/`),
então ainda vai para o Git junto com o conteúdo — só não é uma nota legível. Decisão tomada com
o usuário.

### 10.3 Sem calendário, sem data explícita

A única interface de prazo é a seção. Não há date picker em lugar nenhum. Menos superfície,
menos decisão para o usuário, e o modelo de "arrastar entre seções" fica sendo a história
inteira.

### 10.4 Barra lateral direita própria, não uma aba do dockview

O painel é utilitário e persistente; não deveria competir por espaço com as abas de nota e
desenho nem entrar na serialização de layout por vault. Vira uma região da casca, alternável,
espelhando a sidebar esquerda.

### 10.5 Sem teclado para o reordenar puro

O usuário pediu que reordenar fosse só por arrasto e dispensou o atalho de teclado. É uma
exceção explícita ao piso de qualidade do doc 06. A ação semântica que importa — mover entre
seções — continua tendo caminho por teclado, pelo button-group de status do modal.

### 10.6 Não é um kanban

O doc 01 diz que o produto não tem kanban, e continua sem ter. Kanban é um quadro de colunas
**horizontais** lado a lado; este painel é uma lista **vertical** numa faixa de ~320px, feita
pra ocupar o mínimo de largura ao lado do editor. As seis seções são fixas e definidas pelo
produto — o usuário não cria coluna, não renomeia, não tem vários quadros. Arrastar cartão
entre seções existe, mas a forma e a intenção são de uma lista de afazeres compacta, não de um
board. A linha do doc 01 foi ajustada só para citar o painel como feature nova.
