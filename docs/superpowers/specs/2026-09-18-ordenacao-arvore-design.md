# Ordenação da árvore de arquivos — design

Data: 2026-09-18

## Objetivo

Dar ao usuário controle sobre a ordem dos itens na sidebar, com 4 modos, selecionados por
um botão-dropdown ao lado do campo de busca:

1. **Customizada** — o usuário arrasta arquivos/pastas pra reordenar dentro do mesmo nível, e
   pode inserir separadores (linha divisória) só no nível raiz.
2. **Alfabética** — a ordem atual (pastas primeiro, `localeCompare` pt-BR), sem mudança de
   comportamento.
3. **Data (mais recente primeiro)** — lista achatada de notas e desenhos por `mtimeMs` desc.
4. **Data (mais antiga primeiro)** — mesma lista, `mtimeMs` asc.

## Decisões (respondidas pelo usuário em 2026-09-18)

| Assunto | Decisão |
|---|---|
| Persistência da ordem customizada | Dentro do vault, em `.excalisidian/vault.json` (versionável) |
| Seletor de modo | Botão de ícone abre um dropdown (`Menu`/`ItemMenu` existentes) com os 4 modos; item atual marcado; clique seleciona direto |
| Estrutura por modo | Customizada e Alfabética continuam árvore (pastas expansíveis); Data vira lista achatada |
| Escopo do reordenar customizado | Só entre irmãos da mesma pasta; mover entre pastas continua sendo o arrasto que já existe |
| Separadores | Só no nível raiz (não dentro de subpastas); podem existir vários |
| Posição de item novo (modo customizado) | Sempre no topo do nível onde foi criado |
| Escopo da lista por data | Só notas e desenhos — mesmo filtro visual que a árvore já aplica (`anexos` fica fora) |
| Ícone do botão de ordenar | Fixo (`ArrowUpDown`), não muda por modo — o dropdown mostra o texto de cada opção |

## Não-objetivos (YAGNI)

- Separador dentro de subpastas.
- Ordenação customizada por data (arrastar dentro do modo Data) — Data é sempre automático.
- Drag-and-drop na lista por Data (ela não tem hierarquia pra soltar dentro).
- Migração de uma ordem customizada pré-existente de outro app (Obsidian etc.).
- Sincronizar `sortMode`/`customOrder` por aba/janela — é uma preferência do vault inteiro.
- Implementar os demais campos de `.excalisidian/vault.json` do doc 02 (`attachmentMode` etc.)
  além do necessário pra não perder dado ao regravar o arquivo.

## Modelo de dados

### `.excalisidian/vault.json` (novo campo lido/gravado nesta fatia)

```json
{
  "version": 1,
  "sortMode": "custom",
  "customOrder": {
    "": ["Projetos", "sep-a1b2c3", "Diário.md"],
    "Projetos": ["Excalisidian.md", "Arquitetura.draw.md"]
  }
}
```

- `sortMode`: `"custom" | "alphabetical" | "dateDesc" | "dateAsc"`. Ausente = `"alphabetical"`
  (comportamento atual, sem migração).
- `customOrder`: mapa `caminho da pasta → array de nomes-base dos filhos diretos`, chave `""`
  para a raiz. Só a chave `""` pode conter entradas de separador (`sep-<id>`, id de 6
  caracteres alfanuméricos minúsculos, mesmo gerador usado pelos block ids do doc 02 §5).
- Campos desconhecidos no JSON (de versões futuras) são preservados ao regravar — o
  `configVault.ts` faz *read-modify-write* do objeto inteiro, nunca grava só os campos que
  conhece.
- Versão ausente é tratada como 1 (doc 02 §12). Versão maior que a suportada: abre em modo
  leitura, os controles de ordenação ficam desabilitados com tooltip explicando.

### Módulo novo: `src/vault/configVault.ts`

Primeira leitura/escrita de `vault.json` no código — não existe hoje (campos do doc 02 como
`attachmentMode` são hardcoded). Responsabilidades mínimas pra esta fatia:

```ts
interface ConfigVault {
  version: number;
  sortMode?: ModoOrdenacao;
  customOrder?: Record<string, string[]>;
  [chave: string]: unknown; // preserva campos que este módulo ainda não modela
}

async function lerConfigVault(raizVault: string): Promise<ConfigVault>;
async function gravarConfigVault(raizVault: string, config: ConfigVault): Promise<void>;
```

- `lerConfigVault`: se o arquivo não existe, devolve `{ version: 1 }` (sem gravar nada — só
  grava quando o usuário efetivamente muda algo, pra não criar `.excalisidian/vault.json` só
  por abrir o app).
- `gravarConfigVault`: usa `escritaAtomica.ts`, igual a qualquer outra gravação no vault.
- Erros de parse (JSON inválido escrito por fora) não travam o app: loga e trata como
  `{ version: 1 }`, mesma filosofia de tolerância a erro externo do resto do produto.

### Módulo novo: `src/vault/ordenacao.ts`

Funções puras, sem estado, sem I/O:

```ts
type ModoOrdenacao = "custom" | "alphabetical" | "dateDesc" | "dateAsc";

const ROTULO_MODO: Record<ModoOrdenacao, string>; // "Customizada", "Alfabética", ...

/** Reordena `filhos` de cada nível da árvore. Para "alphabetical", igual ao comportamento
 * atual de `arvore.ts`. Para "custom", aplica `customOrder[no.path]`: itens presentes no
 * array mantêm essa posição relativa; itens no disco ausentes do array são anexados no fim,
 * em ordem alfabética. */
function ordenarArvore(
  raiz: NoArvore,
  modo: "custom" | "alphabetical",
  customOrder: Record<string, string[]>,
): NoArvore;

interface ItemData {
  no: NoArvore;
  pastaExibicao: string; // dirname legível, "" para raiz
  mtimeMs: number;
}

/** Achata notas e desenhos (ignora pastas e a pasta "anexos"), ordenado por mtimeMs. */
function listaPorData(
  raiz: NoArvore,
  modo: "dateDesc" | "dateAsc",
  metaPorPath: Map<string, { mtimeMs: number }>,
): ItemData[];
```

`mtimeMs` vem do metadata cache que já existe (`FileMeta.mtimeMs`, doc 02 §6) — nenhuma leitura
de disco nova.

### Separadores na árvore (só modo `custom`, só raiz)

Não é um `NoArvore` — `arvore.ts` (normativo, doc 02) fica intocado. É puramente um dado de UI:
o array `customOrder[""]` pode conter strings `sep-xxxxxx` intercaladas com nomes de arquivo.
`ArvoreArquivos.tsx` já achata a árvore visível em `LinhaVisivel[]`; esse tipo vira uma união:

```ts
type LinhaVisivel =
  | { kind: "no"; no: NoArvore; nivel: number; aberta: boolean }
  | { kind: "separador"; id: string };
```

Só é populado quando `modo === "custom"`. Arrastar um separador ou um item por cima dele
funciona com o mesmo mecanismo de ponteiro (`onPointerDown`/`pointermove`/`pointerup`) já usado
pro drag de arquivo — não é uma segunda implementação de drag.

## Componentes de UI

### Botão de ordenar (`BotaoOrdenacao.tsx`, novo)

Ao lado de `CampoBuscaSidebar` na mesma linha (`ConteudoSidebar.tsx` muda o container dessa
linha pra `flex` com o campo em `flex-1` e o botão fixo). `BotaoIcone` com `ArrowUpDown`,
`title="Ordenar"`. Clique abre `Menu` (mesmo componente flutuante do menu de contexto) ancorado
no botão, com 4 `ItemMenu`, rótulo de `ROTULO_MODO`, e um ícone `Check` no item que é o modo
atual. Clicar num item chama `usePrefsStore`/`useVaultStore` (ver seção Estado) pra trocar de
modo e fecha o menu.

### `ArvoreArquivos.tsx` (existente, ajustado)

Recebe `modo` e `customOrder` como props (ou lê da store — ver Estado). Quando `modo === "custom"`,
usa a árvore já reordenada por `ordenarArvore` e insere as linhas de separador no nível raiz.
Separador ganha um item de menu de contexto próprio: "Remover separador". O menu de contexto da
raiz (clique com botão direito num espaço vazio da árvore, ou no próprio separador) ganha
"Adicionar separador" — só aparece quando `modo === "custom"`.

### `ListaPorData.tsx` (novo)

Substitui `ArvoreArquivos` em `ArvoreEBacklinks.tsx` quando `modo` é `dateDesc`/`dateAsc`.
Virtualizado do mesmo jeito (reaproveita `@tanstack/react-virtual`, mesma dependência já em
uso). Cada linha, duas sub-linhas:

```
<pasta ou "raiz do vault">                    <data dd/mm/aaaa>
<ícone do tipo> <nome de exibição>
```

Mesmo `IconeArquivo`, mesmo `nomeExibicao`, mesmo `onClick` (abre o arquivo) que `ItemArvore`
já usa. Sem drag, sem clique direito de criação — não faz sentido numa lista sem hierarquia.
Data formatada com `Intl.DateTimeFormat("pt-BR")`, mesmo padrão que o resto da UI em português.

## Estado (`estado/vaultStore.ts`)

- Novo estado: `modoOrdenacao: ModoOrdenacao`, `customOrder: Record<string, string[]>`, ambos
  carregados de `lerConfigVault` ao abrir o vault (igual a `arvore`/`indice` hoje).
- Nova ação `definirModoOrdenacao(modo)`: atualiza o estado e grava via `gravarConfigVault`
  (debounced não é necessário — é um clique de menu, não uma sequência de eventos).
- Nova ação `reordenarCustom(pastaPath, novaOrdem)`: chamada pelo drag-and-drop dentro da árvore
  e pela criação/exclusão/renomeação de arquivo (essas últimas via os comandos existentes em
  `app/comandos/*`, que passam a também atualizar `customOrder` quando o modo é `custom` — se
  não for, não fazem nada extra).
- Nova ação `adicionarSeparador()` / `removerSeparador(id)`: só mexem em `customOrder[""]`.

## Integração com comandos existentes

`app/comandos/criacao.ts`, `mover.ts`, `renomear.ts`, `exclusao.ts` ganham uma chamada extra
(condicional a `modoOrdenacao === "custom"`) pra manter `customOrder` consistente:

- criar nota/desenho/pasta: insere o nome-base no topo do array daquela pasta.
- mover: remove do array da pasta de origem, insere no topo do array da pasta de destino.
- renomear: troca o nome-base na mesma posição do array.
- excluir: remove do array.

Essas mudanças passam pelo mesmo `gravarConfigVault`, não por um caminho de gravação paralelo.

## Testes mínimos

- `ordenacao.test.ts`: ciclo determinístico dos 4 modos (via `ROTULO_MODO`/ordem fixa),
  `ordenarArvore` com `customOrder` completo, parcial (fallback alfabético pro que falta) e
  vazio (equivale a alfabética), `listaPorData` asc/desc excluindo pastas e `anexos`.
- `configVault.test.ts`: ler arquivo inexistente devolve default sem gravar nada, gravar
  preserva campos desconhecidos, JSON inválido não derruba a leitura, versão ausente vira 1.
- Teste de integração leve em `criacao.test.ts`/`mover.test.ts`/etc.: no modo `custom`, a ação
  também atualiza `customOrder` como descrito acima.

Segue o piso de testes da seção 10 do doc 05 — sem depender de rodar o app de verdade pra
validar lógica pura.
