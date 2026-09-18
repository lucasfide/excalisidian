# Ordenação da árvore de arquivos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um botão-dropdown ao lado da busca na sidebar deixa o usuário escolher entre 4 modos de ordenação da árvore de arquivos: Customizada (drag-and-drop entre irmãos + separadores na raiz), Alfabética (comportamento atual), e Data — mais recente/mais antiga (lista achatada de notas e desenhos).

**Architecture:** Lógica pura em dois módulos novos (`vault/ordenacao.ts` para calcular a ordem, `vault/customOrder.ts` para manter o mapa de ordem customizada consistente com criar/mover/renomear/excluir), persistida em `.excalisidian/vault.json` via `vault/configVault.ts` (primeira leitura/escrita desse arquivo no código — segue o padrão adapter-based já usado por `vault/lixeira.ts`). `vaultStore` carrega o estado ao abrir o vault e expõe ações; a UI ganha um botão novo (`BotaoOrdenacao`), ajustes em `ArvoreArquivos` (separadores, só modo customizado) e um componente novo (`ListaPorData`) que substitui a árvore nos dois modos de data.

**Tech Stack:** React + TypeScript, Zustand (`vaultStore`), Vitest, `@tauri-apps/plugin-fs` via `VaultAdapter`, `@tanstack/react-virtual`, lucide-react, Tailwind com tokens do design system (`src/ui/*`).

**Spec:** `docs/superpowers/specs/2026-09-18-ordenacao-arvore-design.md`

## Global Constraints

- Português do Brasil em nomes de arquivo, variável, comentário e texto de interface (sentence case, sem emoji).
- Nenhuma cor/espaçamento/raio fora dos tokens (`src/ui/*`, `globals.css`) — nenhum hex literal, nenhuma classe Tailwind de cor padrão (`bg-background` etc.).
- Toda gravação em disco passa por `escritaAtomica.ts` (indiretamente, via `VaultAdapter.escreverTexto`) — nunca `writeTextFile` direto.
- Toda leitura/escrita de arquivo do vault passa por `VaultAdapter`.
- Caminhos internos sempre com `/`, normalizados (`vault/caminhos.ts`).
- Separador só existe no nível raiz do `customOrder` (chave `""`) — nunca dentro de subpasta.
- Item criado em modo customizado entra no **topo** do array daquele nível.
- `sortMode` ausente no `vault.json` = `"alphabetical"` (sem migração). Campos desconhecidos do JSON são preservados ao regravar.
- `ArvoreArquivos.tsx` já usa arrasto por Pointer Events (não HTML5 DnD nativo — quebra no WebView2 do Tauri). Separadores reusam o mesmo mecanismo, não implementam um segundo.
- Testes de lógica pura (`vault/*.ts`) seguem o padrão dos testes existentes (`mover.test.ts`, `criar.test.ts`, `lixeira.test.ts`): `vi.mock("../estado/vaultStore", …)` com um adapter fake em memória. Componentes `.tsx` não têm teste automatizado neste código-base — verificação é `tsc --noEmit` + rodar o app.

---

### Task 1: `vault/ordenacao.ts` — modos e ordenação pura

**Files:**
- Create: `src/vault/ordenacao.ts`
- Test: `src/vault/ordenacao.test.ts`

**Interfaces:**
- Consumes: `NoArvore`, `TipoNo` de `./arvore` (já existe); `FileMeta` de `../indice/parser` (já existe, tem `mtimeMs`).
- Produces:
  - `type ModoOrdenacao = "custom" | "alphabetical" | "dateDesc" | "dateAsc"`
  - `const ORDEM_MODOS: ModoOrdenacao[]` (ordem fixa pro dropdown: `["custom", "alphabetical", "dateDesc", "dateAsc"]`)
  - `const ROTULO_MODO: Record<ModoOrdenacao, string>`
  - `function ordenarArvore(raiz: NoArvore, modo: "custom" | "alphabetical", customOrder: Record<string, string[]>): NoArvore`
  - `interface ItemData { no: NoArvore; pastaExibicao: string; mtimeMs: number }`
  - `function listaPorData(raiz: NoArvore, modo: "dateDesc" | "dateAsc", metaPorPath: Map<string, { mtimeMs: number }>): ItemData[]`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/vault/ordenacao.test.ts
import { describe, it, expect } from "vitest";

import { montarArvore } from "./arvore";
import type { EntradaArquivo } from "./VaultAdapter";
import {
  ORDEM_MODOS,
  ROTULO_MODO,
  ordenarArvore,
  listaPorData,
} from "./ordenacao";

function ent(path: string, isDir = false): EntradaArquivo {
  return { path, isDir, size: 0, mtimeMs: 0, birthtimeMs: 0 };
}

describe("ORDEM_MODOS / ROTULO_MODO", () => {
  it("tem os 4 modos na ordem do dropdown, cada um com rótulo", () => {
    expect(ORDEM_MODOS).toEqual(["custom", "alphabetical", "dateDesc", "dateAsc"]);
    for (const modo of ORDEM_MODOS) expect(ROTULO_MODO[modo]).toBeTruthy();
  });
});

describe("ordenarArvore — alphabetical", () => {
  it("é a mesma ordem que montarArvore já produz (pastas primeiro, alfabético)", () => {
    const raiz = montarArvore([
      ent("Zebra.md"),
      ent("Projetos", true),
      ent("Ana.md"),
    ]);
    const ordenada = ordenarArvore(raiz, "alphabetical", {});
    expect(ordenada.filhos.map((n) => n.nome)).toEqual(["Projetos", "Ana.md", "Zebra.md"]);
  });
});

describe("ordenarArvore — custom", () => {
  it("segue a ordem do customOrder quando todos os itens estão listados", () => {
    const raiz = montarArvore([ent("A.md"), ent("B.md"), ent("C.md")]);
    const ordenada = ordenarArvore(raiz, "custom", { "": ["C.md", "A.md", "B.md"] });
    expect(ordenada.filhos.map((n) => n.nome)).toEqual(["C.md", "A.md", "B.md"]);
  });

  it("ignora separadores (sep-xxxxxx) — eles não são NoArvore", () => {
    const raiz = montarArvore([ent("A.md"), ent("B.md")]);
    const ordenada = ordenarArvore(raiz, "custom", { "": ["B.md", "sep-a1b2c3", "A.md"] });
    expect(ordenada.filhos.map((n) => n.nome)).toEqual(["B.md", "A.md"]);
  });

  it("item ausente do customOrder entra no fim, em ordem alfabética", () => {
    const raiz = montarArvore([ent("A.md"), ent("B.md"), ent("Novo.md")]);
    const ordenada = ordenarArvore(raiz, "custom", { "": ["B.md", "A.md"] });
    expect(ordenada.filhos.map((n) => n.nome)).toEqual(["B.md", "A.md", "Novo.md"]);
  });

  it("customOrder vazio equivale a alfabética", () => {
    const raiz = montarArvore([ent("Zebra.md"), ent("Ana.md")]);
    const ordenada = ordenarArvore(raiz, "custom", {});
    expect(ordenada.filhos.map((n) => n.nome)).toEqual(["Ana.md", "Zebra.md"]);
  });

  it("ordena cada nível recursivamente, com a ordem daquela pasta", () => {
    const raiz = montarArvore([
      ent("Projetos", true),
      ent("Projetos/Z.md"),
      ent("Projetos/A.md"),
    ]);
    const ordenada = ordenarArvore(raiz, "custom", {
      Projetos: ["Z.md", "A.md"],
    });
    const projetos = ordenada.filhos.find((n) => n.nome === "Projetos")!;
    expect(projetos.filhos.map((n) => n.nome)).toEqual(["Z.md", "A.md"]);
  });
});

describe("listaPorData", () => {
  it("achata só notas e desenhos, ignora pastas e a pasta anexos, ordena por mtimeMs", () => {
    const raiz = montarArvore([
      ent("Projetos", true),
      ent("Projetos/Velha.md"),
      ent("Nova.draw.md"),
      ent("anexos", true),
      ent("anexos/foto.png"),
    ]);
    const meta = new Map([
      ["Projetos/Velha.md", { mtimeMs: 100 }],
      ["Nova.draw.md", { mtimeMs: 200 }],
    ]);
    const desc = listaPorData(raiz, "dateDesc", meta);
    expect(desc.map((i) => i.no.path)).toEqual(["Nova.draw.md", "Projetos/Velha.md"]);
    expect(desc[0].pastaExibicao).toBe("");
    expect(desc[1].pastaExibicao).toBe("Projetos");

    const asc = listaPorData(raiz, "dateAsc", meta);
    expect(asc.map((i) => i.no.path)).toEqual(["Projetos/Velha.md", "Nova.draw.md"]);
  });

  it("arquivo sem entrada no metaPorPath conta como mtimeMs 0", () => {
    const raiz = montarArvore([ent("SemMeta.md")]);
    const desc = listaPorData(raiz, "dateDesc", new Map());
    expect(desc.map((i) => i.no.path)).toEqual(["SemMeta.md"]);
    expect(desc[0].mtimeMs).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/vault/ordenacao.test.ts`
Expected: FAIL — `Cannot find module './ordenacao'` (o arquivo ainda não existe).

- [ ] **Step 3: Implement `src/vault/ordenacao.ts`**

```typescript
// Modos de ordenação da sidebar e a lógica pura pra aplicá-los (doc: ordenacao-arvore
// design). Customizada e alfabética reordenam a árvore existente (arvore.ts, normativo,
// fica intocado); data ignora hierarquia e devolve uma lista achatada.

import type { NoArvore } from "./arvore";

export type ModoOrdenacao = "custom" | "alphabetical" | "dateDesc" | "dateAsc";

/** Ordem fixa em que os modos aparecem no dropdown do botão de ordenar. */
export const ORDEM_MODOS: ModoOrdenacao[] = ["custom", "alphabetical", "dateDesc", "dateAsc"];

export const ROTULO_MODO: Record<ModoOrdenacao, string> = {
  custom: "Customizada",
  alphabetical: "Alfabética",
  dateDesc: "Data (mais recente)",
  dateAsc: "Data (mais antiga)",
};

/** `sep-xxxxxx`: entrada sintética de separador dentro de customOrder[""] — nunca corresponde
 * a um NoArvore de verdade. */
function ehSeparador(entrada: string): boolean {
  return entrada.startsWith("sep-");
}

function compararAlfabetico(a: NoArvore, b: NoArvore): number {
  const pastaA = a.tipo === "folder" ? 0 : 1;
  const pastaB = b.tipo === "folder" ? 0 : 1;
  if (pastaA !== pastaB) return pastaA - pastaB;
  return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
}

function ordenarNivel(
  filhos: NoArvore[],
  ordem: string[] | undefined,
): NoArvore[] {
  if (!ordem || ordem.length === 0) {
    return [...filhos].sort(compararAlfabetico);
  }
  const nomes = ordem.filter((e) => !ehSeparador(e));
  const posicao = new Map(nomes.map((nome, i) => [nome, i]));
  const conhecidos = filhos.filter((n) => posicao.has(n.nome));
  const desconhecidos = filhos
    .filter((n) => !posicao.has(n.nome))
    .sort(compararAlfabetico);
  conhecidos.sort((a, b) => posicao.get(a.nome)! - posicao.get(b.nome)!);
  return [...conhecidos, ...desconhecidos];
}

/** Reordena `filhos` em cada nível da árvore, recursivamente. Não muda a raiz (path "") em
 * si, só a ordem de `raiz.filhos` e de cada pasta dentro dela. */
export function ordenarArvore(
  raiz: NoArvore,
  modo: "custom" | "alphabetical",
  customOrder: Record<string, string[]>,
): NoArvore {
  function visitar(no: NoArvore): NoArvore {
    const ordem = modo === "custom" ? customOrder[no.path] : undefined;
    const filhosOrdenados = ordenarNivel(no.filhos, ordem);
    return { ...no, filhos: filhosOrdenados.map(visitar) };
  }
  return visitar(raiz);
}

export interface ItemData {
  no: NoArvore;
  /** Caminho da pasta que contém o arquivo, "" para a raiz do vault. */
  pastaExibicao: string;
  mtimeMs: number;
}

function pastaDoPath(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** Achata a árvore em notas e desenhos (ignora pastas e a pasta "anexos", mesmo filtro que
 * a árvore normal já aplica), ordenados por mtimeMs. */
export function listaPorData(
  raiz: NoArvore,
  modo: "dateDesc" | "dateAsc",
  metaPorPath: Map<string, { mtimeMs: number }>,
): ItemData[] {
  const itens: ItemData[] = [];
  function visitar(no: NoArvore) {
    for (const filho of no.filhos) {
      if (filho.path === "anexos") continue;
      if (filho.tipo === "folder") {
        visitar(filho);
        continue;
      }
      if (filho.tipo !== "note" && filho.tipo !== "drawing") continue;
      itens.push({
        no: filho,
        pastaExibicao: pastaDoPath(filho.path),
        mtimeMs: metaPorPath.get(filho.path)?.mtimeMs ?? 0,
      });
    }
  }
  visitar(raiz);
  itens.sort((a, b) => (modo === "dateDesc" ? b.mtimeMs - a.mtimeMs : a.mtimeMs - b.mtimeMs));
  return itens;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/vault/ordenacao.test.ts`
Expected: PASS (todos os testes acima).

- [ ] **Step 5: Commit**

```bash
git add src/vault/ordenacao.ts src/vault/ordenacao.test.ts
git commit -m "feat: adiciona lógica pura de ordenação da árvore (ordenacao.ts)"
```

---

### Task 2: `vault/customOrder.ts` — manter o mapa de ordem customizada consistente

**Files:**
- Create: `src/vault/customOrder.ts`
- Test: `src/vault/customOrder.test.ts`

**Interfaces:**
- Consumes: nada de outro módulo desta feature (puro, só `Record<string, string[]>`).
- Produces (todas puras, devolvem um `Record<string, string[]>` **novo**, nunca mutam o argumento):
  - `function gerarIdSeparador(): string` — `"sep-" + 6 chars alfanuméricos minúsculos`.
  - `function inserirNoTopo(customOrder: Record<string, string[]>, pasta: string, nomeBase: string): Record<string, string[]>`
  - `function removerItem(customOrder: Record<string, string[]>, pasta: string, nomeBase: string): Record<string, string[]>`
  - `function renomearItem(customOrder: Record<string, string[]>, pasta: string, nomeAntigo: string, nomeNovo: string): Record<string, string[]>`
  - `function moverItem(customOrder: Record<string, string[]>, pastaOrigem: string, pastaDestino: string, nomeBase: string): Record<string, string[]>` — remove de `pastaOrigem`, insere no topo de `pastaDestino`.
  - `function adicionarSeparador(customOrder: Record<string, string[]>): { customOrder: Record<string, string[]>; id: string }` — só mexe na chave `""`, acrescenta no fim.
  - `function removerSeparador(customOrder: Record<string, string[]>, id: string): Record<string, string[]>`
  - `function reordenarNivel(customOrder: Record<string, string[]>, pasta: string, novaOrdem: string[]): Record<string, string[]>` — substitui `customOrder[pasta]` inteiro (usado pelo resultado do drag-and-drop, que já manda a lista final).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/vault/customOrder.test.ts
import { describe, it, expect } from "vitest";

import {
  gerarIdSeparador,
  inserirNoTopo,
  removerItem,
  renomearItem,
  moverItem,
  adicionarSeparador,
  removerSeparador,
  reordenarNivel,
} from "./customOrder";

describe("gerarIdSeparador", () => {
  it("gera sep- seguido de 6 caracteres alfanuméricos minúsculos, sempre diferente", () => {
    const a = gerarIdSeparador();
    const b = gerarIdSeparador();
    expect(a).toMatch(/^sep-[a-z0-9]{6}$/);
    expect(a).not.toBe(b);
  });
});

describe("inserirNoTopo", () => {
  it("adiciona no início do array daquela pasta", () => {
    const r = inserirNoTopo({ "": ["A.md"] }, "", "B.md");
    expect(r[""]).toEqual(["B.md", "A.md"]);
  });

  it("cria o array se a pasta ainda não tinha entrada", () => {
    const r = inserirNoTopo({}, "Projetos", "Nota.md");
    expect(r).toEqual({ Projetos: ["Nota.md"] });
  });

  it("não muta o customOrder original", () => {
    const original = { "": ["A.md"] };
    inserirNoTopo(original, "", "B.md");
    expect(original[""]).toEqual(["A.md"]);
  });
});

describe("removerItem", () => {
  it("remove só a entrada pedida, mantendo o resto", () => {
    const r = removerItem({ "": ["A.md", "B.md", "C.md"] }, "", "B.md");
    expect(r[""]).toEqual(["A.md", "C.md"]);
  });

  it("pasta sem entrada não quebra", () => {
    expect(removerItem({}, "Projetos", "X.md")).toEqual({});
  });
});

describe("renomearItem", () => {
  it("troca o nome na mesma posição", () => {
    const r = renomearItem({ "": ["A.md", "B.md"] }, "", "A.md", "Z.md");
    expect(r[""]).toEqual(["Z.md", "B.md"]);
  });

  it("item que não estava na lista: nada a fazer, devolve igual", () => {
    const r = renomearItem({ "": ["A.md"] }, "", "Ausente.md", "Z.md");
    expect(r[""]).toEqual(["A.md"]);
  });
});

describe("moverItem", () => {
  it("remove da pasta de origem e insere no topo da pasta de destino", () => {
    const r = moverItem(
      { "": ["Nota.md"], Projetos: ["Existente.md"] },
      "",
      "Projetos",
      "Nota.md",
    );
    expect(r[""]).toEqual([]);
    expect(r.Projetos).toEqual(["Nota.md", "Existente.md"]);
  });
});

describe("adicionarSeparador / removerSeparador", () => {
  it("adiciona no fim da raiz e devolve o id gerado", () => {
    const { customOrder, id } = adicionarSeparador({ "": ["A.md"] });
    expect(customOrder[""]).toEqual(["A.md", id]);
    expect(id).toMatch(/^sep-[a-z0-9]{6}$/);
  });

  it("cria a chave raiz se ainda não existia", () => {
    const { customOrder, id } = adicionarSeparador({});
    expect(customOrder[""]).toEqual([id]);
  });

  it("removerSeparador tira só aquele id", () => {
    const r = removerSeparador({ "": ["A.md", "sep-abc123", "B.md"] }, "sep-abc123");
    expect(r[""]).toEqual(["A.md", "B.md"]);
  });
});

describe("reordenarNivel", () => {
  it("substitui o array daquele nível pela nova ordem", () => {
    const r = reordenarNivel({ "": ["A.md", "B.md"] }, "", ["B.md", "A.md"]);
    expect(r[""]).toEqual(["B.md", "A.md"]);
  });

  it("não mexe em outros níveis", () => {
    const r = reordenarNivel({ "": ["A.md"], Projetos: ["X.md"] }, "", ["A.md"]);
    expect(r.Projetos).toEqual(["X.md"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/vault/customOrder.test.ts`
Expected: FAIL — `Cannot find module './customOrder'`.

- [ ] **Step 3: Implement `src/vault/customOrder.ts`**

```typescript
// Mantém o mapa `customOrder` (pasta -> ordem dos filhos, doc: ordenacao-arvore design)
// consistente com criar/mover/renomear/excluir. Puro: nenhuma função aqui toca disco nem
// conhece o vaultStore — quem chama (vaultStore) decide quando persistir o resultado.

function copiar(customOrder: Record<string, string[]>): Record<string, string[]> {
  const novo: Record<string, string[]> = {};
  for (const [pasta, lista] of Object.entries(customOrder)) novo[pasta] = [...lista];
  return novo;
}

/** 6 caracteres alfanuméricos minúsculos, mesmo formato dos block ids gerados (doc 02 §5). */
export function gerarIdSeparador(): string {
  const alfabeto = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  }
  return `sep-${id}`;
}

export function inserirNoTopo(
  customOrder: Record<string, string[]>,
  pasta: string,
  nomeBase: string,
): Record<string, string[]> {
  const novo = copiar(customOrder);
  novo[pasta] = [nomeBase, ...(novo[pasta] ?? [])];
  return novo;
}

export function removerItem(
  customOrder: Record<string, string[]>,
  pasta: string,
  nomeBase: string,
): Record<string, string[]> {
  const novo = copiar(customOrder);
  if (novo[pasta]) novo[pasta] = novo[pasta].filter((n) => n !== nomeBase);
  return novo;
}

export function renomearItem(
  customOrder: Record<string, string[]>,
  pasta: string,
  nomeAntigo: string,
  nomeNovo: string,
): Record<string, string[]> {
  const novo = copiar(customOrder);
  const lista = novo[pasta];
  if (!lista) return novo;
  const i = lista.indexOf(nomeAntigo);
  if (i !== -1) lista[i] = nomeNovo;
  return novo;
}

export function moverItem(
  customOrder: Record<string, string[]>,
  pastaOrigem: string,
  pastaDestino: string,
  nomeBase: string,
): Record<string, string[]> {
  const semOrigem = removerItem(customOrder, pastaOrigem, nomeBase);
  return inserirNoTopo(semOrigem, pastaDestino, nomeBase);
}

export function adicionarSeparador(
  customOrder: Record<string, string[]>,
): { customOrder: Record<string, string[]>; id: string } {
  const id = gerarIdSeparador();
  const novo = copiar(customOrder);
  novo[""] = [...(novo[""] ?? []), id];
  return { customOrder: novo, id };
}

export function removerSeparador(
  customOrder: Record<string, string[]>,
  id: string,
): Record<string, string[]> {
  const novo = copiar(customOrder);
  if (novo[""]) novo[""] = novo[""].filter((e) => e !== id);
  return novo;
}

export function reordenarNivel(
  customOrder: Record<string, string[]>,
  pasta: string,
  novaOrdem: string[],
): Record<string, string[]> {
  const novo = copiar(customOrder);
  novo[pasta] = [...novaOrdem];
  return novo;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/vault/customOrder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vault/customOrder.ts src/vault/customOrder.test.ts
git commit -m "feat: adiciona manutenção pura do mapa de ordem customizada (customOrder.ts)"
```

---

### Task 3: `vault/configVault.ts` — ler/gravar `.excalisidian/vault.json`

**Files:**
- Create: `src/vault/configVault.ts`
- Test: `src/vault/configVault.test.ts`

**Interfaces:**
- Consumes: `useVaultStore` (`adapter.lerTexto`/`escreverTexto`/`criarPasta`, mesmo padrão de `vault/lixeira.ts`); `PASTA_CONFIG_VAULT` de `../app/constantes` (já existe, vale `.excalisidian`); `ModoOrdenacao` de `./ordenacao`.
- Produces:
  - `interface ConfigVault { version: number; sortMode?: ModoOrdenacao; customOrder?: Record<string, string[]>; [chave: string]: unknown }`
  - `async function lerConfigVault(): Promise<ConfigVault>`
  - `async function gravarConfigVault(patch: Partial<ConfigVault>): Promise<void>` — lê o que existe no disco, aplica o patch por cima (preserva campos desconhecidos) e regrava.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/vault/configVault.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { disco, vaultState } = vi.hoisted(() => {
  const disco = new Map<string, string>();
  const vaultState = {
    adapter: {
      async lerTexto(p: string) {
        if (!disco.has(p)) throw new Error("ENOENT");
        return disco.get(p)!;
      },
      async escreverTexto(p: string, c: string) {
        disco.set(p, c);
      },
      async criarPasta() {},
    },
  };
  return { disco, vaultState };
});

vi.mock("../estado/vaultStore", () => ({
  useVaultStore: { getState: () => vaultState },
}));

import { lerConfigVault, gravarConfigVault } from "./configVault";

beforeEach(() => {
  disco.clear();
});

describe("lerConfigVault", () => {
  it("arquivo inexistente: devolve default { version: 1 } sem gravar nada", async () => {
    const config = await lerConfigVault();
    expect(config).toEqual({ version: 1 });
    expect(disco.has(".excalisidian/vault.json")).toBe(false);
  });

  it("lê o que está gravado", async () => {
    disco.set(
      ".excalisidian/vault.json",
      JSON.stringify({ version: 1, sortMode: "alphabetical" }),
    );
    expect(await lerConfigVault()).toEqual({ version: 1, sortMode: "alphabetical" });
  });

  it("versão ausente no JSON vira 1", async () => {
    disco.set(".excalisidian/vault.json", JSON.stringify({ sortMode: "custom" }));
    const config = await lerConfigVault();
    expect(config.version).toBe(1);
    expect(config.sortMode).toBe("custom");
  });

  it("JSON inválido não derruba a leitura: volta pro default", async () => {
    disco.set(".excalisidian/vault.json", "{ isso não é json");
    expect(await lerConfigVault()).toEqual({ version: 1 });
  });
});

describe("gravarConfigVault", () => {
  it("grava campos novos preservando os que já existiam e não foram tocados", async () => {
    disco.set(
      ".excalisidian/vault.json",
      JSON.stringify({ version: 1, attachmentMode: "fixed" }),
    );
    await gravarConfigVault({ sortMode: "custom" });
    const gravado = JSON.parse(disco.get(".excalisidian/vault.json")!);
    expect(gravado).toEqual({ version: 1, attachmentMode: "fixed", sortMode: "custom" });
  });

  it("primeira gravação, sem arquivo prévio: cria com version 1 + o patch", async () => {
    await gravarConfigVault({ customOrder: { "": ["A.md"] } });
    const gravado = JSON.parse(disco.get(".excalisidian/vault.json")!);
    expect(gravado).toEqual({ version: 1, customOrder: { "": ["A.md"] } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/vault/configVault.test.ts`
Expected: FAIL — `Cannot find module './configVault'`.

- [ ] **Step 3: Implement `src/vault/configVault.ts`**

```typescript
// Leitura/escrita de `.excalisidian/vault.json` (doc 02 §1). Primeiro uso desse arquivo no
// código — hoje os campos que o doc 02 descreve (attachmentMode etc.) ainda são hardcoded em
// outros módulos. Este arquivo só modela o que a ordenação da árvore precisa; qualquer outro
// campo do JSON passa por aqui sem ser interpretado (`[chave: string]: unknown`) e é
// preservado ao regravar — nunca sobrescreve o que não entende (doc 02 §12).
//
// Mesmo padrão de vault/lixeira.ts: função de domínio que fala com o adapter via
// useVaultStore, sem depender de um parâmetro de raiz — `VaultAdapter.escreverTexto` já é
// gravação atômica (tmp + rename), não precisa reimplementar isso aqui.

import { useVaultStore } from "../estado/vaultStore";
import { PASTA_CONFIG_VAULT } from "../app/constantes";
import type { ModoOrdenacao } from "./ordenacao";

const CAMINHO_CONFIG = `${PASTA_CONFIG_VAULT}/vault.json`;

export interface ConfigVault {
  version: number;
  sortMode?: ModoOrdenacao;
  customOrder?: Record<string, string[]>;
  [chave: string]: unknown;
}

const DEFAULT_CONFIG: ConfigVault = { version: 1 };

export async function lerConfigVault(): Promise<ConfigVault> {
  const adapter = useVaultStore.getState().adapter;
  if (!adapter) return { ...DEFAULT_CONFIG };
  let bruto: string;
  try {
    bruto = await adapter.lerTexto(CAMINHO_CONFIG);
  } catch {
    return { ...DEFAULT_CONFIG }; // arquivo ainda não existe
  }
  try {
    const dado = JSON.parse(bruto) as Partial<ConfigVault>;
    return { ...DEFAULT_CONFIG, ...dado, version: dado.version ?? 1 };
  } catch {
    return { ...DEFAULT_CONFIG }; // JSON corrompido por fora — não derruba o app
  }
}

/** Read-modify-write: lê o que está no disco, aplica `patch` por cima e regrava. Campos que
 * `patch` não menciona (incluindo os que este módulo nem modela) ficam intactos. */
export async function gravarConfigVault(patch: Partial<ConfigVault>): Promise<void> {
  const adapter = useVaultStore.getState().adapter;
  if (!adapter) return;
  const atual = await lerConfigVault();
  const novo: ConfigVault = { ...atual, ...patch };
  await adapter.criarPasta(PASTA_CONFIG_VAULT);
  await adapter.escreverTexto(CAMINHO_CONFIG, JSON.stringify(novo, null, 2));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/vault/configVault.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vault/configVault.ts src/vault/configVault.test.ts
git commit -m "feat: adiciona leitura/escrita de .excalisidian/vault.json (configVault.ts)"
```

---

### Task 4: `vaultStore` — estado e ações de ordenação

**Files:**
- Modify: `src/estado/vaultStore.ts`

**Interfaces:**
- Consumes: `ModoOrdenacao`, `ROTULO_MODO` de `../vault/ordenacao`; `lerConfigVault`/`gravarConfigVault` de `../vault/configVault`; `inserirNoTopo`/`removerItem`/`renomearItem`/`moverItem`/`adicionarSeparador`/`removerSeparador`/`reordenarNivel` de `../vault/customOrder`.
- Produces (novos campos/ações em `VaultState`, consumidos pela UI no Task 6-8 e pelo domínio no Task 5):
  - `modoOrdenacao: ModoOrdenacao`
  - `customOrder: Record<string, string[]>`
  - `definirModoOrdenacao(modo: ModoOrdenacao): Promise<void>`
  - `reordenarNivelCustom(pasta: string, novaOrdem: string[]): Promise<void>`
  - `adicionarSeparadorCustom(): Promise<void>`
  - `removerSeparadorCustom(id: string): Promise<void>`
  - `registrarItemCriado(pasta: string, nomeBase: string): Promise<void>` — no-op se `modoOrdenacao !== "custom"`.
  - `registrarItemMovido(pastaOrigem: string, pastaDestino: string, nomeBase: string): Promise<void>` — idem.
  - `registrarItemRenomeado(pasta: string, nomeAntigo: string, nomeNovo: string): Promise<void>` — idem.
  - `registrarItemRemovido(pasta: string, nomeBase: string): Promise<void>` — idem.

Este é um arquivo sem teste dedicado no código-base atual (`vaultStore.ts` não tem
`vaultStore.test.ts` — a cobertura vem dos testes de domínio que mockam o store, feitos no
Task 5). Verificação aqui é `tsc --noEmit` mais teste manual (Task 8 cobre a verificação
manual completa do fluxo).

- [ ] **Step 1: Adicionar os campos e ações ao `VaultState`**

Em `src/estado/vaultStore.ts`, adicione os imports no topo do arquivo (depois dos imports existentes):

```typescript
import {
  ROTULO_MODO as _ROTULO_MODO, // reexportado só pra não duplicar a fonte única do rótulo
  type ModoOrdenacao,
} from "../vault/ordenacao";
import { lerConfigVault, gravarConfigVault } from "../vault/configVault";
import {
  inserirNoTopo,
  removerItem,
  renomearItem,
  moverItem,
  adicionarSeparador,
  removerSeparador,
  reordenarNivel,
} from "../vault/customOrder";
```

Na interface `VaultState`, logo depois de `pastasAbertas: Set<string>;`:

```typescript
  modoOrdenacao: ModoOrdenacao;
  customOrder: Record<string, string[]>;
```

E, no fim da interface (depois de `garantirAncestraisAbertos`):

```typescript
  definirModoOrdenacao(modo: ModoOrdenacao): Promise<void>;
  reordenarNivelCustom(pasta: string, novaOrdem: string[]): Promise<void>;
  adicionarSeparadorCustom(): Promise<void>;
  removerSeparadorCustom(id: string): Promise<void>;
  registrarItemCriado(pasta: string, nomeBase: string): Promise<void>;
  registrarItemMovido(pastaOrigem: string, pastaDestino: string, nomeBase: string): Promise<void>;
  registrarItemRenomeado(pasta: string, nomeAntigo: string, nomeNovo: string): Promise<void>;
  registrarItemRemovido(pasta: string, nomeBase: string): Promise<void>;
```

- [ ] **Step 2: Inicializar o estado e carregar do disco em `definirAdapter`**

No corpo de `create<VaultState>((set, get) => ({ ... }))`, logo depois de `pastasAbertas: new Set(),`:

```typescript
  modoOrdenacao: "alphabetical",
  customOrder: {},
```

Dentro de `async definirAdapter(adapter) { ... }`, depois do `set({ adapter, raiz: ... })` existente e antes de `await inicializarBusca(...)`, adicione a leitura da config:

```typescript
    const config = await lerConfigVault();
    set({
      modoOrdenacao: config.sortMode ?? "alphabetical",
      customOrder: config.customOrder ?? {},
    });
```

- [ ] **Step 3: Implementar as ações, no fim do objeto (depois de `garantirAncestraisAbertos`)**

```typescript
  async definirModoOrdenacao(modo) {
    set({ modoOrdenacao: modo });
    await gravarConfigVault({ sortMode: modo });
  },

  async reordenarNivelCustom(pasta, novaOrdem) {
    const novo = reordenarNivel(get().customOrder, pasta, novaOrdem);
    set({ customOrder: novo });
    await gravarConfigVault({ customOrder: novo });
  },

  async adicionarSeparadorCustom() {
    const { customOrder } = adicionarSeparador(get().customOrder);
    set({ customOrder });
    await gravarConfigVault({ customOrder });
  },

  async removerSeparadorCustom(id) {
    const novo = removerSeparador(get().customOrder, id);
    set({ customOrder: novo });
    await gravarConfigVault({ customOrder: novo });
  },

  async registrarItemCriado(pasta, nomeBase) {
    if (get().modoOrdenacao !== "custom") return;
    const novo = inserirNoTopo(get().customOrder, pasta, nomeBase);
    set({ customOrder: novo });
    await gravarConfigVault({ customOrder: novo });
  },

  async registrarItemMovido(pastaOrigem, pastaDestino, nomeBase) {
    if (get().modoOrdenacao !== "custom") return;
    const novo = moverItem(get().customOrder, pastaOrigem, pastaDestino, nomeBase);
    set({ customOrder: novo });
    await gravarConfigVault({ customOrder: novo });
  },

  async registrarItemRenomeado(pasta, nomeAntigo, nomeNovo) {
    if (get().modoOrdenacao !== "custom") return;
    const novo = renomearItem(get().customOrder, pasta, nomeAntigo, nomeNovo);
    set({ customOrder: novo });
    await gravarConfigVault({ customOrder: novo });
  },

  async registrarItemRemovido(pasta, nomeBase) {
    if (get().modoOrdenacao !== "custom") return;
    const novo = removerItem(get().customOrder, pasta, nomeBase);
    set({ customOrder: novo });
    await gravarConfigVault({ customOrder: novo });
  },
```

Remova o import `_ROTULO_MODO` se o TypeScript acusar "declared but never used" — ele foi só
pra documentar a fonte do rótulo; a UI (Task 6) importa `ROTULO_MODO` direto de
`vault/ordenacao`, não precisa passar pelo store.

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a `vaultStore.ts`.

- [ ] **Step 5: Rodar a suíte inteira pra checar que nada quebrou**

Run: `npx vitest run`
Expected: PASS (os testes existentes não mexem em `modoOrdenacao`/`customOrder`, então continuam passando com os defaults).

- [ ] **Step 6: Commit**

```bash
git add src/estado/vaultStore.ts
git commit -m "feat: vaultStore carrega e persiste modo de ordenação e customOrder"
```

---

### Task 5: Integração com criar/mover-renomear/excluir

**Files:**
- Modify: `src/vault/criar.ts`
- Modify: `src/vault/renomear.ts`
- Modify: `src/vault/lixeira.ts`
- Test: `src/vault/criar.test.ts` (estender)
- Test: `src/vault/renomear.test.ts` (estender)
- Test: `src/vault/mover.test.ts` (estender)
- Test: `src/vault/lixeira.test.ts` (estender)

**Interfaces:**
- Consumes: `registrarItemCriado`/`registrarItemMovido`/`registrarItemRenomeado`/`registrarItemRemovido` do `vaultStore` (Task 4); `pastaDe`/`nomeBase` de `./caminhos`.
- Produces: nenhuma interface nova — só efeito colateral (customOrder atualizado) quando `modoOrdenacao === "custom"`.

`aplicarMovimentacao` (em `renomear.ts`) é o ponto único usado tanto por `renomearArquivo`
(mesma pasta, nome novo) quanto por `moverArquivo` em `vault/mover.ts` (pasta nova, mesmo
nome) — então um único hook ali cobre os dois comandos.

- [ ] **Step 1: Write the failing tests (criar.test.ts)**

Adicione ao fim de `src/vault/criar.test.ts` (depois do `describe("duplicarArquivo", ...)`
existente). Primeiro ajuste o mock do topo do arquivo pra incluir as novas ações do
`vaultState` (troque o objeto `vaultState` existente por este, mantendo tudo que já tinha):

```typescript
const vaultState = {
  adapter,
  recarregarArvore: vi.fn(async () => {}),
  reindexarArquivo: vi.fn(async () => {}),
  modoOrdenacao: "alphabetical" as "alphabetical" | "custom",
  registrarItemCriado: vi.fn(async () => {}),
};
```

E, no `beforeEach`, depois de `arquivos.clear();`, reseta o modo e as chamadas:

```typescript
  vaultState.modoOrdenacao = "alphabetical";
  vaultState.registrarItemCriado.mockClear();
```

Novo bloco de teste, no fim do arquivo:

```typescript
describe("criarNota/criarPasta — registram no customOrder quando o modo é custom", () => {
  it("modo alphabetical: não chama registrarItemCriado", async () => {
    const { criarNota } = await import("./criar");
    await criarNota("Nota", "");
    expect(vaultState.registrarItemCriado).not.toHaveBeenCalled();
  });

  it("modo custom: registra a pasta e o nome-base do arquivo criado", async () => {
    vaultState.modoOrdenacao = "custom";
    const { criarNota } = await import("./criar");
    const r = await criarNota("Nota", "Projetos");
    expect(r.ok).toBe(true);
    expect(vaultState.registrarItemCriado).toHaveBeenCalledWith("Projetos", "Nota.md");
  });

  it("modo custom: pasta nova também é registrada, na raiz", async () => {
    vaultState.modoOrdenacao = "custom";
    const { criarPasta } = await import("./criar");
    const r = await criarPasta("Nova Pasta", "");
    expect(r.ok).toBe(true);
    expect(vaultState.registrarItemCriado).toHaveBeenCalledWith("", "Nova Pasta");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/vault/criar.test.ts`
Expected: FAIL — `registrarItemCriado` nunca é chamado (a implementação ainda não existe).

- [ ] **Step 3: Implement — `src/vault/criar.ts`**

Em `criarArquivo`, depois de `await vault.reindexarArquivo(caminho);` e antes do `return`:

```typescript
  await vault.registrarItemCriado(dir, caminho.slice(caminho.lastIndexOf("/") + 1));
```

Em `criarPasta`, depois de `await vault.recarregarArvore();` e antes do `return`:

```typescript
  await vault.registrarItemCriado(dir, nome);
```

(`duplicarArquivo` não precisa do hook: o teste do design cobre só criação via os 3 comandos
de criação da toolbar — duplicar já reaproveita `criarArquivo`... na verdade duplicar tem
sua própria função, mas gera o mesmo efeito esperado de "entrar no topo"; deixe fora do
escopo desta task por YAGNI, o design não pediu isso explicitamente e pode ser adicionado
depois sem quebrar nada.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/vault/criar.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests (mover.test.ts e renomear.test.ts)**

Em `src/vault/mover.test.ts`, no objeto `vaultState` do `vi.hoisted`, adicione:

```typescript
    modoOrdenacao: "alphabetical" as "alphabetical" | "custom",
    registrarItemMovido: async () => {},
    registrarItemRenomeado: async () => {},
```

E, no `beforeEach`, `vaultState.modoOrdenacao = "alphabetical";`.

Novo teste no fim de `src/vault/mover.test.ts`:

```typescript
it("modo custom: registra a movimentação no customOrder", async () => {
  const chamadas: [string, string, string][] = [];
  vaultState.modoOrdenacao = "custom";
  vaultState.registrarItemMovido = async (origem, destino, nome) => {
    chamadas.push([origem, destino, nome]);
  };
  disco.set("Nota.md", "# Nota\n");
  await moverArquivo("Nota.md", "Projetos");
  expect(chamadas).toEqual([["", "Projetos", "Nota.md"]]);
});
```

Em `src/vault/renomear.test.ts` (leia o arquivo antes de editar — ele já existe e segue o
mesmo padrão de `vi.hoisted`/`vaultState`; adicione os mesmos dois campos
`modoOrdenacao`/`registrarItemRenomeado` ao `vaultState` de lá, resetando `modoOrdenacao` no
`beforeEach`), acrescente:

```typescript
it("modo custom, renomear na mesma pasta: registra a troca de nome", async () => {
  const chamadas: [string, string, string][] = [];
  vaultState.modoOrdenacao = "custom";
  vaultState.registrarItemRenomeado = async (pasta, antigo, novo) => {
    chamadas.push([pasta, antigo, novo]);
  };
  disco.set("Nota.md", "# Nota\n");
  await renomearArquivo("Nota.md", "Renomeada");
  expect(chamadas).toEqual([["", "Nota.md", "Renomeada.md"]]);
});
```

- [ ] **Step 6: Run to verify they fail**

Run: `npx vitest run src/vault/mover.test.ts src/vault/renomear.test.ts`
Expected: FAIL nos dois novos testes.

- [ ] **Step 7: Implement — `src/vault/renomear.ts`**

Em `aplicarMovimentacao`, depois do bloco que já grava as notas (`for (const g of gravacoes) { ... }`) e antes de `useWorkspaceStore.getState().renomearDocumento(pathAntigo, pathNovo);`, adicione:

```typescript
  const dirAntigo = pastaDe(pathAntigo);
  const dirNovo = pastaDe(pathNovo);
  const nomeAntigoBase = baseNome(pathAntigo);
  const nomeNovoBase = baseNome(pathNovo);
  if (dirAntigo !== dirNovo) {
    await vault.registrarItemMovido(dirAntigo, dirNovo, nomeNovoBase);
  } else if (nomeAntigoBase !== nomeNovoBase) {
    await vault.registrarItemRenomeado(dirAntigo, nomeAntigoBase, nomeNovoBase);
  }
```

`pastaDe` já está importado no topo do arquivo (de `./caminhos`); `baseNome` já existe como
função local no próprio `renomear.ts` — reuse, não duplique.

- [ ] **Step 8: Run to verify they pass**

Run: `npx vitest run src/vault/mover.test.ts src/vault/renomear.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing test (lixeira.test.ts)**

Leia `src/vault/lixeira.test.ts` (já existe, segue o mesmo padrão) antes de editar. Adicione
ao `vaultState` de lá `modoOrdenacao: "alphabetical" as "alphabetical" | "custom"` e
`registrarItemRemovido: async () => {}`, reset no `beforeEach`, e um teste:

```typescript
it("modo custom: excluir registra a remoção do customOrder", async () => {
  const chamadas: [string, string][] = [];
  vaultState.modoOrdenacao = "custom";
  vaultState.registrarItemRemovido = async (pasta, nome) => {
    chamadas.push([pasta, nome]);
  };
  disco.set("Nota.md", "# Nota\n");
  const r = await excluir("Nota.md");
  expect(r.ok).toBe(true);
  expect(chamadas).toEqual([["", "Nota.md"]]);
});
```

- [ ] **Step 10: Run to verify it fails**

Run: `npx vitest run src/vault/lixeira.test.ts`
Expected: FAIL no novo teste.

- [ ] **Step 11: Implement — `src/vault/lixeira.ts`**

Em `excluir`, depois de `await vault.adapter.mover(path, trashPath);` e antes de
`const itens = await lerIndice();`, adicione:

```typescript
  await vault.registrarItemRemovido(pastaDe(path), nome);
```

(`pastaDe` já está importado no topo de `lixeira.ts`; `nome` já é uma variável local do
próprio `excluir`.)

- [ ] **Step 12: Run to verify it passes**

Run: `npx vitest run src/vault/lixeira.test.ts`
Expected: PASS.

- [ ] **Step 13: Run the whole suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add src/vault/criar.ts src/vault/renomear.ts src/vault/lixeira.ts \
  src/vault/criar.test.ts src/vault/renomear.test.ts src/vault/mover.test.ts src/vault/lixeira.test.ts
git commit -m "feat: criar/mover/renomear/excluir mantêm o customOrder em modo customizado"
```

---

### Task 6: `BotaoOrdenacao.tsx` — botão-dropdown ao lado da busca

**Files:**
- Create: `src/ui/excalisidian/BotaoOrdenacao.tsx`
- Modify: `src/ui/excalisidian/ConteudoSidebar.tsx`

**Interfaces:**
- Consumes: `ORDEM_MODOS`, `ROTULO_MODO`, `ModoOrdenacao` de `../../vault/ordenacao`; `useVaultStore` (`modoOrdenacao`, `definirModoOrdenacao`); `Menu`, `ItemMenu`, `BotaoIcone` de `../index`; ícones `ArrowUpDown`, `Check` de `lucide-react`.
- Produces: `export default function BotaoOrdenacao(): JSX.Element` — sem props, lê e escreve
  direto no `vaultStore` (mesmo padrão que outros botões da sidebar, ex. `alternarSidebar`
  em `ConteudoSidebar.tsx`).

Sem teste automatizado (componente `.tsx`, ver convenção nas Global Constraints). Verificação
é `tsc --noEmit` + checagem visual no dev server, feita ao final do Task 8 quando o fluxo
inteiro estiver de pé (o botão sozinho, sem os outros componentes, não tem muito o que
verificar visualmente ainda além de abrir/fechar).

- [ ] **Step 1: Implement `src/ui/excalisidian/BotaoOrdenacao.tsx`**

```tsx
// Botão-dropdown de ordenação da árvore, ao lado do campo de busca (doc: ordenacao-arvore
// design, seção 4). Ícone fixo — o dropdown mostra o texto de cada modo, então não precisa
// de um ícone por modo pra comunicar o estado atual.

import { useState } from "react";
import { ArrowUpDown, Check } from "lucide-react";

import { BotaoIcone, Menu, ItemMenu, type PosicaoMenu } from "../index";
import { useVaultStore } from "../../estado/vaultStore";
import { ORDEM_MODOS, ROTULO_MODO, type ModoOrdenacao } from "../../vault/ordenacao";

export default function BotaoOrdenacao() {
  const modoOrdenacao = useVaultStore((s) => s.modoOrdenacao);
  const definirModoOrdenacao = useVaultStore((s) => s.definirModoOrdenacao);
  const [posicao, setPosicao] = useState<PosicaoMenu | null>(null);

  const selecionar = (modo: ModoOrdenacao) => {
    setPosicao(null);
    if (modo !== modoOrdenacao) void definirModoOrdenacao(modo);
  };

  return (
    <>
      <BotaoIcone
        Icone={ArrowUpDown}
        titulo={`Ordenar: ${ROTULO_MODO[modoOrdenacao]}`}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setPosicao({ x: rect.left, y: rect.bottom + 4 });
        }}
      />
      {posicao && (
        <Menu posicao={posicao} onFechar={() => setPosicao(null)}>
          {ORDEM_MODOS.map((modo) => (
            <ItemMenu
              key={modo}
              Icone={modo === modoOrdenacao ? Check : undefined}
              rotulo={ROTULO_MODO[modo]}
              onClick={() => selecionar(modo)}
            />
          ))}
        </Menu>
      )}
    </>
  );
}
```

- [ ] **Step 2: Wire into `ConteudoSidebar.tsx`**

Leia `src/ui/excalisidian/ConteudoSidebar.tsx` (já lido nesta sessão de design) e troque o
trecho:

```tsx
      {/* Entrada visível da busca unificada (doc 13 §1.1): abaixo do cabeçalho, antes da
          árvore de arquivos. */}
      <CampoBuscaSidebar />
```

por:

```tsx
      {/* Entrada visível da busca unificada (doc 13 §1.1) + botão de ordenar, na mesma
          linha, abaixo do cabeçalho e antes da árvore de arquivos. */}
      <div className="flex items-center gap-2 border-b border-regua px-3 py-2">
        <div className="flex-1">
          <CampoBuscaSidebar />
        </div>
        <BotaoOrdenacao />
      </div>
```

`CampoBuscaSidebar` já tem seu próprio `border-b border-regua px-3 py-2` (ver
`src/ui/excalisidian/CampoBuscaSidebar.tsx`) — isso duplicaria a hairline/padding dentro do
novo container. Remova o wrapper `<div className="border-b border-regua px-3 py-2">` de
dentro de `CampoBuscaSidebar.tsx`, deixando só o `<button>` (o container agora vive em
`ConteudoSidebar.tsx`):

```tsx
// src/ui/excalisidian/CampoBuscaSidebar.tsx — trecho a mudar
export default function CampoBuscaSidebar() {
  return (
    <button
      type="button"
      title="Buscar"
      aria-label="Buscar"
      onClick={() => useSobreposicaoStore.getState().abrir("busca")}
      className="flex h-9 w-full items-center gap-2 rounded-controle border border-regua-forte bg-superficie px-2 text-left transition-colors duration-[140ms] ease-caderno hover:bg-lavagem"
    >
      <Search size={16} strokeWidth={1.5} className="shrink-0 text-tinta-suave" aria-hidden />
      <span className="flex-1 text-corpo text-tinta-suave">Buscar</span>
      <span className="meta text-tinta-suave">CTRL O</span>
    </button>
  );
}
```

E ajuste o comentário no topo de `CampoBuscaSidebar.tsx` (que hoje descreve a hairline que
saiu de lá) pra refletir que o container mora em `ConteudoSidebar.tsx` agora.

Por fim, adicione o import em `ConteudoSidebar.tsx`:

```tsx
import BotaoOrdenacao from "./BotaoOrdenacao";
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/ui/excalisidian/BotaoOrdenacao.tsx src/ui/excalisidian/ConteudoSidebar.tsx \
  src/ui/excalisidian/CampoBuscaSidebar.tsx
git commit -m "feat: botão-dropdown de ordenação ao lado da busca na sidebar"
```

---

### Task 7: `ArvoreArquivos.tsx` — aplicar o modo, desenhar separadores, drag reordena irmãos

**Files:**
- Modify: `src/ui/excalisidian/ArvoreArquivos.tsx`
- Modify: `src/ui/excalisidian/ArvoreEBacklinks.tsx`

**Interfaces:**
- Consumes: `ordenarArvore` de `../../vault/ordenacao`; `modoOrdenacao`, `customOrder`, `reordenarNivelCustom`, `adicionarSeparadorCustom`, `removerSeparadorCustom` do `vaultStore`.
- Produces: `ArvoreArquivos` ganha duas props novas: `modo: "custom" | "alphabetical"` e
  `customOrder: Record<string, string[]>` — a árvore que ele recebe em `raiz` já vem
  **não-ordenada** por quem chama (a ordenação acontece dentro do componente, porque só ele
  sabe combinar com os separadores na hora de achatar em `LinhaVisivel[]`).

Sem teste automatizado (mesma convenção). Verificação: `tsc --noEmit` + checagem manual no
Task 8.

- [ ] **Step 1: Ordenar a árvore e tipar `LinhaVisivel` como união (separador vs. nó)**

Em `src/ui/excalisidian/ArvoreArquivos.tsx`, troque o import de `arvore` e adicione o de
`ordenacao`:

```typescript
import { nomeExibicao, type NoArvore } from "../../vault/arvore";
import { pastaDe } from "../../vault/caminhos";
import { ordenarArvore } from "../../vault/ordenacao";
```

Troque a interface `LinhaVisivel` e a função `achatar` por:

```typescript
type LinhaVisivel =
  | { kind: "no"; no: NoArvore; nivel: number; aberta: boolean }
  | { kind: "separador"; id: string };

function achatar(
  raiz: NoArvore,
  pastasAbertas: Set<string>,
  separadoresRaiz: string[],
): LinhaVisivel[] {
  const linhas: LinhaVisivel[] = [];
  const visitar = (nos: NoArvore[], nivel: number) => {
    for (const no of nos) {
      if (no.path === "anexos") continue;
      const aberta = pastasAbertas.has(no.path);
      linhas.push({ kind: "no", no, nivel, aberta });
      if (no.tipo === "folder" && aberta) visitar(no.filhos, nivel + 1);
    }
  };
  if (separadoresRaiz.length === 0) {
    visitar(raiz.filhos, 0);
    return linhas;
  }
  // Intercala os itens de nível 0 com os separadores, na posição relativa que
  // `customOrder[""]` registrou (a ordenação em si já foi feita por `ordenarArvore`, que
  // ignora separadores — aqui só reinserimos as posições).
  const idsRaiz = separadoresRaiz;
  let cursor = 0;
  const filhosRaiz = raiz.filhos;
  for (const entrada of idsRaiz) {
    if (entrada.startsWith("sep-")) {
      linhas.push({ kind: "separador", id: entrada });
    } else if (cursor < filhosRaiz.length) {
      const no = filhosRaiz[cursor++];
      const aberta = pastasAbertas.has(no.path);
      linhas.push({ kind: "no", no, nivel: 0, aberta });
      if (no.tipo === "folder" && aberta) visitar(no.filhos, 1);
    }
  }
  while (cursor < filhosRaiz.length) {
    const no = filhosRaiz[cursor++];
    const aberta = pastasAbertas.has(no.path);
    linhas.push({ kind: "no", no, nivel: 0, aberta });
    if (no.tipo === "folder" && aberta) visitar(no.filhos, 1);
  }
  return linhas;
}
```

- [ ] **Step 2: Atualizar `Props` e o `useMemo` de `linhas`**

Na interface `Props`, adicione:

```typescript
  modo: "custom" | "alphabetical";
  customOrder: Record<string, string[]>;
  onAdicionarSeparador(): void;
  onRemoverSeparador(id: string): void;
```

Na assinatura da função `ArvoreArquivos`, desestruture os 4 novos props. Troque:

```typescript
  const linhas = useMemo(
    () => achatar(raiz, pastasAbertas),
    [raiz, pastasAbertas],
  );
```

por:

```typescript
  const raizOrdenada = useMemo(
    () => ordenarArvore(raiz, modo, customOrder),
    [raiz, modo, customOrder],
  );
  const separadoresRaiz = modo === "custom" ? (customOrder[""] ?? []) : [];
  const linhas = useMemo(
    () => achatar(raizOrdenada, pastasAbertas, separadoresRaiz),
    [raizOrdenada, pastasAbertas, separadoresRaiz],
  );
```

- [ ] **Step 3: Atualizar tudo que lia `linhas[i].no` direto — agora precisa checar `kind`**

No `useEffect` de rolar até o caminho aberto:

```typescript
  useEffect(() => {
    if (!caminhoAberto) return;
    const indice = linhas.findIndex((l) => l.kind === "no" && l.no.path === caminhoAberto);
    if (indice !== -1) virt.scrollToIndex(indice, { align: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caminhoAberto, linhas]);
```

Em `acharAlvo`, a linha `const { no } = linhas[item.index];` vira:

```typescript
    const linha = linhas[item.index];
    if (linha.kind !== "no") return null;
    const { no } = linha;
```

No `virt.getVirtualItems().map((vi) => { ... })`, troque `const { no, nivel, aberta } = linhas[vi.index];` e o `return (<ItemArvore ... />)` por um branch pelo `kind`:

```tsx
        {virt.getVirtualItems().map((vi) => {
          const linha = linhas[vi.index];
          if (linha.kind === "separador") {
            return (
              <div
                key={linha.id}
                style={{ position: "absolute", top: vi.start, height: vi.size, width: "100%" }}
                className="flex items-center px-3"
                onPointerDown={(e) => iniciarArrastoSeparador(e, linha.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onRemoverSeparador(linha.id);
                }}
              >
                <div className="h-px w-full bg-regua-forte" />
              </div>
            );
          }
          const { no, nivel, aberta } = linha;
          const destacado = no.path === caminhoAberto;
          return (
            <ItemArvore
              key={no.path}
              no={no}
              nivel={nivel}
              aberta={aberta}
              destacado={destacado}
              alvoDeArrasto={arraste?.alvo === no.path}
              style={{ top: vi.start, height: vi.size }}
              onPointerDown={(e) => iniciarArrasto(e, no)}
              onClick={() => {
                if (no.tipo === "folder") {
                  onAlternarPasta(no.path);
                } else {
                  onAbrirArquivo(no.path);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, no });
              }}
            />
          );
        })}
```

- [ ] **Step 4: Drag de item reordena irmãos em modo `custom`**

O mecanismo de arrasto existente (`iniciarArrasto`) já resolve "mover pra outra pasta"
(`onMoverArquivo`) soltando sobre uma pasta. Reordenar entre irmãos é um caso novo: soltar
sobre **outro item do mesmo nível, no modo `custom`**, sem que o alvo seja uma pasta
diferente. Adicione, logo depois da função `acharAlvo` existente:

```typescript
  /** Em modo customizado, soltar um item sobre outro do MESMO nível reordena os dois — sem
   * mexer em qual pasta cada um está. Devolve o índice de linha (dentro de `linhas`) sob o
   * cursor, ou -1 se não houver nenhum. */
  const acharIndiceLinha = (clientY: number): number => {
    const rect = scrollRef.current?.getBoundingClientRect();
    if (!rect) return -1;
    const y = clientY - rect.top + (scrollRef.current?.scrollTop ?? 0);
    const item = virt.getVirtualItems().find((vi) => y >= vi.start && y < vi.start + vi.size);
    return item ? item.index : -1;
  };
```

E, dentro de `iniciarArrasto`, na função `aoSoltar`, depois do bloco existente
`if (info?.engajado && info.alvo !== null) { onMoverArquivo(info.path, info.alvo); }`,
adicione o caso de reordenar (usando o último `clientY` capturado — guarde-o em
`arrastoRef.current` a cada `pointermove`; adicione `ultimoY: number` ao tipo do ref e
atualize em `aoMover`):

No tipo de `arrastoRef.current`, adicione `ultimoY: number;`. Em `iniciarArrasto`, ao criar o
objeto, adicione `ultimoY: e.clientY,`. Em `aoMover`, logo após `info.alvo = alvo;`, adicione
`info.ultimoY = ev.clientY;`. Em `aoSoltar`, troque o bloco final por:

```typescript
      if (info?.engajado && modo === "custom" && info.alvo === null) {
        // Alvo null pode ser "sem pasta válida sob o cursor" OU "é a própria pasta de
        // origem" (acharAlvo já filtra isso) — nos dois casos, ainda vale checar se caiu
        // sobre um irmão pra reordenar.
        const indice = acharIndiceLinha(info.ultimoY);
        const linhaAlvo = indice !== -1 ? linhas[indice] : undefined;
        if (linhaAlvo?.kind === "no" && pastaDoNo(linhaAlvo.no) === info.origem) {
          void reordenarAposArrasto(info.origem, info.path, linhaAlvo.no.path);
        }
      } else if (info?.engajado && info.alvo !== null) {
        onMoverArquivo(info.path, info.alvo);
      }
```

Isso ficou apontando pra uma função `reordenarAposArrasto` que ainda não existe — implemente-a
logo acima de `iniciarArrasto`:

```typescript
  /** Calcula a nova ordem de uma pasta movendo `pathArrastado` pra logo antes de
   * `pathAlvo`, e persiste via `onReordenarNivel`. A ordem-base é `customOrder[pasta]` se
   * já existir; senão, a ordem alfabética atual daquele nível (mesma lista que
   * `ordenarArvore` já produziu em `raizOrdenada`), pra o primeiro arrasto naquele nível
   * não "perder" os itens que não tinham posição salva ainda. */
  const reordenarAposArrasto = async (
    pasta: string,
    pathArrastado: string,
    pathAlvo: string,
  ): Promise<void> => {
    const nivelNo = pasta === "" ? raizOrdenada : encontrarNoLocal(raizOrdenada, pasta);
    if (!nivelNo) return;
    const nomesAtuais = nivelNo.filhos.map((n) => n.nome);
    const nomeArrastado = pathArrastado.slice(pathArrastado.lastIndexOf("/") + 1);
    const nomeAlvo = pathAlvo.slice(pathAlvo.lastIndexOf("/") + 1);
    const semArrastado = nomesAtuais.filter((n) => n !== nomeArrastado);
    const indiceAlvo = semArrastado.indexOf(nomeAlvo);
    const novaOrdem = [
      ...semArrastado.slice(0, indiceAlvo),
      nomeArrastado,
      ...semArrastado.slice(indiceAlvo),
    ];
    await onReordenarNivel(pasta, novaOrdem);
  };
```

Adicione o import de `encontrarNo` (renomeado localmente pra não colidir, já que o arquivo
não o importava antes) e `onReordenarNivel` como prop nova:

```typescript
import { nomeExibicao, encontrarNo as encontrarNoLocal, type NoArvore } from "../../vault/arvore";
```

E na interface `Props`, junto dos outros props novos do Step 2:

```typescript
  onReordenarNivel(pasta: string, novaOrdem: string[]): Promise<void>;
```

- [ ] **Step 5: Separador — arrastar pra reordenar entre os itens de nível 0**

Reaproveita o mesmo `iniciarArrasto`, mas pra um separador (não tem `no` associado). Adicione,
perto de `iniciarArrasto`:

```typescript
  const iniciarArrastoSeparador = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const elemento = e.currentTarget as HTMLElement;
    elemento.setPointerCapture(e.pointerId);

    const aoMover = (ev: PointerEvent) => {
      // Feedback visual simples: nenhum ghost/tooltip pro separador (ele já é uma linha
      // fina, arrastar sem preview extra é suficiente) — só recalcula o índice ao soltar.
      ev.preventDefault();
    };
    const aoSoltar = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
      try {
        elemento.releasePointerCapture(e.pointerId);
      } catch {
        /* elemento já desmontado — esperado */
      }
      const indice = acharIndiceLinha(ev.clientY);
      if (indice === -1) return;
      const linhaAlvo = linhas[indice];
      const nomesENivel0 = raizOrdenada.filhos.map((n) => n.nome);
      const ordemAtual = customOrder[""] ?? nomesENivel0;
      const semSeparador = ordemAtual.filter((entrada) => entrada !== id);
      let posicaoNova = semSeparador.length;
      if (linhaAlvo?.kind === "no") {
        posicaoNova = semSeparador.indexOf(linhaAlvo.no.nome);
        if (posicaoNova === -1) posicaoNova = semSeparador.length;
      } else if (linhaAlvo?.kind === "separador") {
        posicaoNova = semSeparador.indexOf(linhaAlvo.id);
        if (posicaoNova === -1) posicaoNova = semSeparador.length;
      }
      const novaOrdem = [
        ...semSeparador.slice(0, posicaoNova),
        id,
        ...semSeparador.slice(posicaoNova),
      ];
      void onReordenarNivel("", novaOrdem);
    };
    window.addEventListener("pointermove", aoMover);
    window.addEventListener("pointerup", aoSoltar);
  };
```

- [ ] **Step 6: Menu de contexto — "Adicionar separador" (raiz) / "Remover separador"**

O `onContextMenu` do separador já chama `onRemoverSeparador(linha.id)` direto (Step 3, sem
submenu — remoção não precisa de confirmação, é reversível clicando em "Adicionar
separador" de novo). Falta o menu de contexto de **espaço vazio da árvore** (clique direito
fora de qualquer linha), que hoje não existe — adicione um `onContextMenu` na `div` raiz do
componente (`<div ref={scrollRef} ...>`), só ativo em modo `custom`:

```tsx
  <div
    ref={scrollRef}
    className="relative h-full overflow-auto"
    onContextMenu={(e) => {
      if (modo !== "custom") return;
      if (e.target !== e.currentTarget) return; // clique em cima de um item já tem seu próprio menu
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, no: null });
    }}
  >
```

Isso muda o tipo de `EstadoMenu` pra aceitar `no: NoArvore | null`. Troque:

```typescript
type EstadoMenu = (PosicaoMenu & { no: NoArvore }) | null;
```

por:

```typescript
type EstadoMenu = (PosicaoMenu & { no: NoArvore | null }) | null;
```

E, no JSX do menu (`{menu && (<Menu ...>`), envolva os itens que dependem de `menu.no` (todos
os atuais) num branch, adicionando o item de separador antes do fechamento:

```tsx
      {menu && (
        <Menu posicao={menu} onFechar={fecharMenu}>
          {menu.no && (
            <>
              <ItemMenu
                Icone={FilePlus}
                rotulo="Nova nota aqui"
                onClick={comMenuFechado(() => onCriarNota(pastaDoNo(menu.no!)))}
              />
              <ItemMenu
                Icone={SquarePen}
                rotulo="Novo desenho aqui"
                onClick={comMenuFechado(() => onCriarDesenho(pastaDoNo(menu.no!)))}
              />
              <ItemMenu
                Icone={FolderPlus}
                rotulo="Nova pasta aqui"
                onClick={comMenuFechado(() => onCriarPasta(pastaDoNo(menu.no!)))}
              />
              <SeparadorMenu />
              <ItemMenu
                Icone={Pencil}
                rotulo="Renomear"
                onClick={comMenuFechado(() => onRenomear(menu.no!.path))}
              />
              {menu.no.tipo !== "folder" && (
                <ItemMenu
                  Icone={Move}
                  rotulo="Mover para…"
                  onClick={comMenuFechado(() => onMoverPara(menu.no!.path))}
                />
              )}
              <SeparadorMenu />
              <ItemMenu
                Icone={Trash2}
                rotulo="Mover para a lixeira"
                destrutivo
                onClick={comMenuFechado(() => onExcluir(menu.no!.path, menu.no!.tipo))}
              />
            </>
          )}
          {!menu.no && modo === "custom" && (
            <ItemMenu
              Icone={Rows3}
              rotulo="Adicionar separador"
              onClick={comMenuFechado(onAdicionarSeparador)}
            />
          )}
        </Menu>
      )}
```

Adicione `Rows3` ao import de `lucide-react` no topo do arquivo.

- [ ] **Step 7: Passar os novos props em `ArvoreEBacklinks.tsx`**

Em `src/ui/excalisidian/ArvoreEBacklinks.tsx`, adicione ao topo:

```typescript
import { useVaultStore } from "../../estado/vaultStore";
```

(o arquivo já importa `useVaultStore`, então só some os seletores que faltam — veja o
arquivo real antes de editar, ele já tem `const arvore = useVaultStore((s) => s.arvore);`
etc., adicione ao lado:)

```typescript
  const modoOrdenacao = useVaultStore((s) => s.modoOrdenacao);
  const customOrder = useVaultStore((s) => s.customOrder);
  const reordenarNivelCustom = useVaultStore((s) => s.reordenarNivelCustom);
  const adicionarSeparadorCustom = useVaultStore((s) => s.adicionarSeparadorCustom);
  const removerSeparadorCustom = useVaultStore((s) => s.removerSeparadorCustom);
```

E, no JSX de `<ArvoreArquivos ...>`, adicione (este componente só é renderizado quando
`modoOrdenacao` é `"custom"` ou `"alphabetical"` — o Task 8 cuida de trocar por
`ListaPorData` nos outros dois modos, então aqui é seguro assumir só esses dois):

```tsx
            modo={modoOrdenacao === "custom" ? "custom" : "alphabetical"}
            customOrder={customOrder}
            onReordenarNivel={reordenarNivelCustom}
            onAdicionarSeparador={() => void adicionarSeparadorCustom()}
            onRemoverSeparador={(id) => void removerSeparadorCustom(id)}
```

- [ ] **Step 8: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros. Resolva qualquer um que aparecer antes de seguir — esta task mexeu em
bastante lógica interna de um arquivo que já era complexo (drag-and-drop com pointer events),
então preste atenção especial a tipos de `EstadoArrasto`/`arrastoRef` que precisam do campo
`ultimoY` novo.

- [ ] **Step 9: Commit**

```bash
git add src/ui/excalisidian/ArvoreArquivos.tsx src/ui/excalisidian/ArvoreEBacklinks.tsx
git commit -m "feat: árvore aplica o modo de ordenação, desenha e arrasta separadores"
```

---

### Task 8: `ListaPorData.tsx` — lista achatada por data + troca de componente + verificação manual

**Files:**
- Create: `src/ui/excalisidian/ListaPorData.tsx`
- Modify: `src/ui/excalisidian/ArvoreEBacklinks.tsx`

**Interfaces:**
- Consumes: `listaPorData` de `../../vault/ordenacao`; `useVaultStore` (`arvore`, `indice`,
  `modoOrdenacao`); `IconeArquivo`, `nomeExibicao` já existentes.
- Produces: `export default function ListaPorData(props: { onAbrirArquivo(path: string): void }): JSX.Element`.

- [ ] **Step 1: Implement `src/ui/excalisidian/ListaPorData.tsx`**

```tsx
// Lista achatada de notas e desenhos por data de modificação (doc: ordenacao-arvore design,
// seção 6). Sem hierarquia de pasta, sem drag, sem criação por menu de contexto — não faz
// sentido numa lista sem posição estrutural pra soltar ou criar dentro.

import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { IconeArquivo } from "../index";
import { nomeExibicao } from "../../vault/arvore";
import { listaPorData, type ModoOrdenacao } from "../../vault/ordenacao";
import { useVaultStore } from "../../estado/vaultStore";

const ALTURA_LINHA = 44;

const formatadorData = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

interface Props {
  modo: Extract<ModoOrdenacao, "dateDesc" | "dateAsc">;
  onAbrirArquivo(path: string): void;
}

export default function ListaPorData({ modo, onAbrirArquivo }: Props) {
  const arvore = useVaultStore((s) => s.arvore);
  const indice = useVaultStore((s) => s.indice);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const itens = useMemo(
    () => (arvore ? listaPorData(arvore, modo, indice) : []),
    [arvore, modo, indice],
  );

  const virt = useVirtualizer({
    count: itens.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ALTURA_LINHA,
    overscan: 12,
  });

  return (
    <div ref={scrollRef} className="relative h-full overflow-auto">
      <div style={{ height: virt.getTotalSize(), position: "relative", width: "100%" }}>
        {virt.getVirtualItems().map((vi) => {
          const item = itens[vi.index];
          return (
            <button
              key={item.no.path}
              onClick={() => onAbrirArquivo(item.no.path)}
              className="absolute left-0 flex w-full flex-col gap-0.5 px-3 py-1 text-left transition-colors duration-[140ms] ease-caderno hover:bg-lavagem"
              style={{ top: vi.start, height: vi.size }}
            >
              <span className="flex items-center justify-between meta text-tinta-suave">
                <span className="truncate">{item.pastaExibicao || "raiz do vault"}</span>
                <span className="shrink-0">{formatadorData.format(new Date(item.mtimeMs))}</span>
              </span>
              <span className="flex items-center gap-2 text-[13px] text-tinta-media">
                <IconeArquivo tipo={item.no.tipo} className="shrink-0" />
                <span className="truncate">{nomeExibicao(item.no)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Trocar entre `ArvoreArquivos` e `ListaPorData` em `ArvoreEBacklinks.tsx`**

No JSX de `ArvoreEBacklinks.tsx`, envolva a renderização condicional pelo `modoOrdenacao`:

```tsx
      <div className="min-h-0 flex-1">
        {arvore && modoOrdenacao !== "dateDesc" && modoOrdenacao !== "dateAsc" && (
          <ArvoreArquivos
            raiz={arvore}
            pastasAbertas={pastasAbertas}
            caminhoAberto={caminhoAtivo}
            onAlternarPasta={alternarPasta}
            onAbrirArquivo={(path) => {
              abrirDocumento(path);
              onArquivoAberto?.();
            }}
            onRenomear={(path) => void comandoRenomear(path)}
            onCriarNota={(dir) => void comandoNovaNota(dir)}
            onCriarDesenho={(dir) => void comandoNovoDesenho(dir)}
            onCriarPasta={(dir) => void comandoNovaPasta(dir)}
            onMoverArquivo={(path, dir) => void comandoMoverArquivo(path, dir)}
            onMoverPara={(path) => void comandoMoverPara(path)}
            onExcluir={(path, tipo) => void comandoExcluir(path, tipo)}
            modo={modoOrdenacao === "custom" ? "custom" : "alphabetical"}
            customOrder={customOrder}
            onReordenarNivel={reordenarNivelCustom}
            onAdicionarSeparador={() => void adicionarSeparadorCustom()}
            onRemoverSeparador={(id) => void removerSeparadorCustom(id)}
          />
        )}
        {arvore && (modoOrdenacao === "dateDesc" || modoOrdenacao === "dateAsc") && (
          <ListaPorData
            modo={modoOrdenacao}
            onAbrirArquivo={(path) => {
              abrirDocumento(path);
              onArquivoAberto?.();
            }}
          />
        )}
      </div>
```

Adicione o import: `import ListaPorData from "./ListaPorData";`.

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Verificação manual no app**

Confira antes se já existe um `npm run tauri dev` rodando nesta máquina (o HMR já entrega as
mudanças — não subir um segundo processo). Se não houver, rode `npm run tauri dev` e, com um
vault de teste aberto:

1. Clique no botão de ordenar ao lado da busca — o dropdown abre com os 4 modos, o atual
   marcado com `Check`.
2. Selecione "Alfabética" — confirma que a árvore continua exatamente como sempre foi.
3. Selecione "Customizada" — clique-direito num espaço vazio da árvore mostra "Adicionar
   separador"; adicione um, confirme que aparece uma linha fina na raiz; arraste-o pra outra
   posição; clique-direito nele remove.
4. Ainda em customizada, arraste um arquivo por cima de outro do mesmo nível (não uma pasta)
   e confirme que a posição muda e persiste ao reabrir o vault (feche e reabra a janela, ou
   troque de vault e volte).
5. Crie uma nota nova em modo customizado — confirme que ela aparece no topo da raiz (ou da
   pasta onde foi criada, se criada via clique-direito "Nova nota aqui").
6. Selecione "Data (mais recente)" — a árvore vira lista achatada, cada linha com pasta+data
   em cima e ícone+nome embaixo, mais recente primeiro; abra um arquivo clicando nele.
7. Selecione "Data (mais antiga)" — mesma lista, ordem invertida.
8. Feche e reabra o vault — confirme que o modo escolhido e a ordem customizada
   sobreviveram (persistidos em `.excalisidian/vault.json`, visível abrindo o arquivo num
   editor de texto fora do app).

Se algum passo falhar, volte à task correspondente (1-7) e corrija antes de prosseguir —
não é aceitável fechar esta task com o fluxo manual quebrado.

- [ ] **Step 6: Commit**

```bash
git add src/ui/excalisidian/ListaPorData.tsx src/ui/excalisidian/ArvoreEBacklinks.tsx
git commit -m "feat: lista achatada por data de modificação, com troca de componente pelo modo"
```
