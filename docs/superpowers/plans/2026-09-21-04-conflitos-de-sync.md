# Conflitos de sincronização — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** quando a mesma nota ou o mesmo desenho for editado em dois computadores, mostrar
as duas versões lado a lado e deixar o usuário escolher — sem que nada seja apagado antes
da escolha.

**Architecture:** todo o raciocínio vive em módulos puros: a comparação linha a linha, o
nome da cópia de conflito e a tradução de uma decisão em operações de arquivo. Um store
guarda a fila de conflitos e aplica as operações pelo `VaultAdapter`. Os componentes só
desenham. Nada aqui fala com servidor: um conflito é "duas versões do mesmo caminho", e de
onde a segunda veio é problema de quem sincroniza.

**Tech Stack:** TypeScript, zustand, `@excalidraw/excalidraw` 0.18.1, vitest.

**Spec:** `docs/superpowers/plans/2026-09-21-servicos-online-indice.md` (etapa 07 do
relatório "Excalisidian Premium"), `docs/02-modelo-de-dados.md` §11.

## Global Constraints

- Português do Brasil em nomes de arquivo, componentes, variáveis e comentários.
- Interface em sentence case, sem emoji. Texto novo entra no catálogo do plano 01.
- Nenhum valor de cor, fonte, espaçamento, raio ou sombra fora dos tokens de
  `src/estilos/globals.css`. Nenhuma classe de cor padrão do Tailwind.
- **Toda gravação em disco passa por `escritaAtomica.ts`.** Nunca `writeTextFile`.
- **Toda leitura e escrita do vault passa por `VaultAdapter`.**
- Caminhos com `/` e `.normalize("NFC")`. Reutilizar `src/vault/caminhos.ts` —
  `dividirExtensao` já trata `.draw.md` como uma extensão só.
- Desenhos são `.draw.md`. `.excalidraw` não existe no produto.
- `@excalidraw/excalidraw` pinado em `0.18.1`.
- Testes só de módulos puros — não existe jsdom nem `.test.tsx`.
- **Nada é apagado sem uma volta atrás** (`doc 01`, princípio 1). Nenhuma tarefa aqui
  remove conteúdo antes de o usuário decidir.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/sync/tipos.ts` | `VersaoEmConflito`, `Conflito`, `Resolucao`, `OperacaoArquivo`. Folha de dependências. |
| `src/sync/diffLinhas.ts` | Comparação linha a linha. Puro, sem dependência. |
| `src/sync/nomeDeConflito.ts` | O nome da cópia de conflito, preservando `.draw.md`. Puro. |
| `src/sync/resolucao.ts` | Decisão do usuário → lista de operações de arquivo. Puro. |
| `src/estado/conflitosStore.ts` | A fila de conflitos e a aplicação das operações pelo `VaultAdapter`. |
| `src/ui/excalisidian/FaixaConflitos.tsx` | O aviso e a lista. |
| `src/ui/excalisidian/ComparadorNotas.tsx` | Duas colunas de texto com as diferenças marcadas. |
| `src/ui/excalisidian/ComparadorDesenhos.tsx` | Duas telas do Excalidraw, só leitura. |

A separação entre `resolucao.ts` (decide o que fazer) e `conflitosStore.ts` (faz) é o que
permite testar cada caminho de decisão sem tocar em disco.

---

### Task 1: Tipos e o nome da cópia de conflito

**Files:**
- Create: `src/sync/tipos.ts`
- Create: `src/sync/nomeDeConflito.ts`
- Test: `src/sync/nomeDeConflito.test.ts`

**Interfaces:**
- Consumes: `dividirExtensao`, `nomeDe`, `pastaDe` de `../vault/caminhos`.
- Produces:
  ```ts
  type OrigemVersao = "local" | "remoto";
  interface VersaoEmConflito { origem: OrigemVersao; conteudo: string; mtimeMs: number; dispositivo: string }
  interface Conflito { caminho: string; tipo: "nota" | "desenho"; local: VersaoEmConflito; remoto: VersaoEmConflito }
  type Resolucao = { acao: "ficarCom"; origem: OrigemVersao } | { acao: "manterAmbas" };
  type OperacaoArquivo = { tipo: "escrever"; caminho: string; conteudo: string };
  function nomeDaCopiaDeConflito(caminho: string, dispositivo: string, quando: Date): string;
  ```

O nome segue o que o relatório fechou: `reunião (conflito de 21-09-2026, Desktop).md`.
Duas armadilhas que os testes cobram:

- **`.draw.md` é uma extensão só.** `mapa.draw.md` não pode virar `mapa.draw (conflito…).md`.
- **Data com hífen, nunca barra ou dois-pontos.** `src/vault/caminhos.ts` proíbe
  `< > : " / \ | ? *` em nome de arquivo — uma data com barra geraria nome inválido no
  Windows.

- [ ] **Step 1: Write the failing test**

```ts
// src/sync/nomeDeConflito.test.ts
import { describe, it, expect } from "vitest";

import { nomeDaCopiaDeConflito } from "./nomeDeConflito";

const quando = new Date(2026, 8, 21); // 21/09/2026 — mês é zero-based

describe("nomeDaCopiaDeConflito", () => {
  it("põe o carimbo antes da extensão", () => {
    expect(nomeDaCopiaDeConflito("Diário/reunião.md", "Desktop", quando)).toBe(
      "Diário/reunião (conflito de 21-09-2026, Desktop).md",
    );
  });

  it("trata .draw.md como uma extensão só", () => {
    expect(nomeDaCopiaDeConflito("Projetos/mapa.draw.md", "Notebook", quando)).toBe(
      "Projetos/mapa (conflito de 21-09-2026, Notebook).draw.md",
    );
  });

  it("funciona na raiz do vault", () => {
    expect(nomeDaCopiaDeConflito("nota.md", "Desktop", quando)).toBe(
      "nota (conflito de 21-09-2026, Desktop).md",
    );
  });

  it("a data usa hífen, porque barra e dois-pontos são proibidos em nome de arquivo", () => {
    const nome = nomeDaCopiaDeConflito("nota.md", "Desktop", quando);
    expect(nome).not.toMatch(/[/\\:]/);
  });

  it("dia e mês vêm com dois dígitos", () => {
    expect(nomeDaCopiaDeConflito("nota.md", "PC", new Date(2026, 0, 5))).toBe(
      "nota (conflito de 05-01-2026, PC).md",
    );
  });

  it("caractere proibido no nome do dispositivo é trocado por hífen", () => {
    expect(nomeDaCopiaDeConflito("nota.md", 'PC da Ana: "casa"', quando)).toBe(
      "nota (conflito de 21-09-2026, PC da Ana- -casa-).md",
    );
  });

  it("arquivo sem extensão recebe o carimbo no fim", () => {
    expect(nomeDaCopiaDeConflito("LEIAME", "Desktop", quando)).toBe(
      "LEIAME (conflito de 21-09-2026, Desktop)",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/sync/nomeDeConflito.test.ts`
Expected: FAIL — "Failed to resolve import ./nomeDeConflito".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/sync/tipos.ts
// Tipos de conflito. Sem import: folha de dependências.
//
// Um conflito é "duas versões do mesmo caminho". De onde a segunda veio — outro
// computador, outro processo — não importa aqui.

export type OrigemVersao = "local" | "remoto";

export interface VersaoEmConflito {
  origem: OrigemVersao;
  conteudo: string;
  mtimeMs: number;
  /** Nome do computador que gravou. Entra no nome da cópia de conflito. */
  dispositivo: string;
}

export interface Conflito {
  /** Caminho relativo à raiz do vault, com "/", normalizado NFC. */
  caminho: string;
  tipo: "nota" | "desenho";
  local: VersaoEmConflito;
  remoto: VersaoEmConflito;
}

export type Resolucao =
  | { acao: "ficarCom"; origem: OrigemVersao }
  | { acao: "manterAmbas" };

export type OperacaoArquivo = { tipo: "escrever"; caminho: string; conteudo: string };
```

```ts
// src/sync/nomeDeConflito.ts
// O nome da cópia de conflito: "reunião (conflito de 21-09-2026, Desktop).md".
//
// Duas armadilhas: `.draw.md` é UMA extensão (doc 02 §3.0, e `dividirExtensao` já sabe
// disso), e a data não pode usar barra nem dois-pontos — `caminhos.ts` proíbe
// < > : " / \ | ? * em nome de arquivo, e o Windows recusaria.

import { dividirExtensao, nomeDe, pastaDe } from "../vault/caminhos";

const PROIBIDOS = /[<>:"/\\|?*]/g;

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

function carimbo(quando: Date): string {
  return `${doisDigitos(quando.getDate())}-${doisDigitos(quando.getMonth() + 1)}-${quando.getFullYear()}`;
}

export function nomeDaCopiaDeConflito(
  caminho: string,
  dispositivo: string,
  quando: Date,
): string {
  const pasta = pastaDe(caminho);
  const { base, ext } = dividirExtensao(nomeDe(caminho));
  const dispositivoLimpo = dispositivo.replace(PROIBIDOS, "-");
  const nome = `${base} (conflito de ${carimbo(quando)}, ${dispositivoLimpo})${ext}`;
  return pasta ? `${pasta}/${nome}` : nome;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/sync/nomeDeConflito.test.ts`
Expected: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/sync/tipos.ts src/sync/nomeDeConflito.ts src/sync/nomeDeConflito.test.ts
git commit -m "feat(sync): tipos de conflito e nome da copia de conflito"
```

---

### Task 2: Comparação linha a linha

**Files:**
- Create: `src/sync/diffLinhas.ts`
- Test: `src/sync/diffLinhas.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  type TipoTrecho = "igual" | "adicionado" | "removido";
  interface Trecho { tipo: TipoTrecho; linhas: string[] }
  function diffLinhas(antes: string, depois: string): Trecho[];
  function temDiferenca(trechos: Trecho[]): boolean;
  ```

Subsequência comum mais longa, clássica, sobre linhas. Sem biblioteca: o projeto não tem
uma e a implementação cabe em quarenta linhas testadas. `"removido"` é o que só existe em
`antes`; `"adicionado"` é o que só existe em `depois`.

Trechos consecutivos do mesmo tipo são agrupados — é o que permite a interface pintar um
bloco só em vez de vinte linhas soltas.

- [ ] **Step 1: Write the failing test**

```ts
// src/sync/diffLinhas.test.ts
import { describe, it, expect } from "vitest";

import { diffLinhas, temDiferenca } from "./diffLinhas";

describe("diffLinhas", () => {
  it("textos iguais dão um trecho só", () => {
    expect(diffLinhas("a\nb", "a\nb")).toEqual([{ tipo: "igual", linhas: ["a", "b"] }]);
  });

  it("linha acrescentada no fim", () => {
    expect(diffLinhas("a", "a\nb")).toEqual([
      { tipo: "igual", linhas: ["a"] },
      { tipo: "adicionado", linhas: ["b"] },
    ]);
  });

  it("linha removida do fim", () => {
    expect(diffLinhas("a\nb", "a")).toEqual([
      { tipo: "igual", linhas: ["a"] },
      { tipo: "removido", linhas: ["b"] },
    ]);
  });

  it("linha trocada vira removido seguido de adicionado", () => {
    expect(diffLinhas("a\nx\nc", "a\ny\nc")).toEqual([
      { tipo: "igual", linhas: ["a"] },
      { tipo: "removido", linhas: ["x"] },
      { tipo: "adicionado", linhas: ["y"] },
      { tipo: "igual", linhas: ["c"] },
    ]);
  });

  it("linhas seguidas do mesmo tipo ficam num trecho só", () => {
    expect(diffLinhas("a", "a\nb\nc")).toEqual([
      { tipo: "igual", linhas: ["a"] },
      { tipo: "adicionado", linhas: ["b", "c"] },
    ]);
  });

  it("texto vazio de um lado dá tudo adicionado", () => {
    expect(diffLinhas("", "a\nb")).toEqual([{ tipo: "adicionado", linhas: ["a", "b"] }]);
  });

  it("os dois vazios não dão trecho nenhum", () => {
    expect(diffLinhas("", "")).toEqual([]);
  });

  it("CRLF e LF comparam igual — arquivo do Windows contra arquivo do Mac", () => {
    expect(temDiferenca(diffLinhas("a\r\nb", "a\nb"))).toBe(false);
  });

  it("trecho igual no meio é preservado, não reescrito", () => {
    const trechos = diffLinhas("x\nmeio\ny", "z\nmeio\nw");
    expect(trechos.some((t) => t.tipo === "igual" && t.linhas.includes("meio"))).toBe(true);
  });
});

describe("temDiferenca", () => {
  it("é falso quando tudo é igual", () => {
    expect(temDiferenca(diffLinhas("a\nb", "a\nb"))).toBe(false);
  });

  it("é verdadeiro com qualquer trecho diferente", () => {
    expect(temDiferenca(diffLinhas("a", "b"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/sync/diffLinhas.test.ts`
Expected: FAIL — "Failed to resolve import ./diffLinhas".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/sync/diffLinhas.ts
// Comparação linha a linha por subsequência comum mais longa. Sem biblioteca: cabe aqui,
// é testado, e uma dependência a mais num app local-first custa mais do que vale.
//
// "removido" = só existe no texto da esquerda. "adicionado" = só no da direita.
// CRLF é normalizado antes de comparar: o mesmo arquivo vindo de um Windows e de um Mac
// não é um conflito de conteúdo.

export type TipoTrecho = "igual" | "adicionado" | "removido";

export interface Trecho {
  tipo: TipoTrecho;
  linhas: string[];
}

function emLinhas(texto: string): string[] {
  if (texto === "") return [];
  return texto.replace(/\r\n/g, "\n").split("\n");
}

export function diffLinhas(antes: string, depois: string): Trecho[] {
  const a = emLinhas(antes);
  const b = emLinhas(depois);

  // tabela[i][j] = tamanho da maior subsequência comum de a[i..] e b[j..]
  const tabela: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      tabela[i][j] =
        a[i] === b[j] ? tabela[i + 1][j + 1] + 1 : Math.max(tabela[i + 1][j], tabela[i][j + 1]);
    }
  }

  const trechos: Trecho[] = [];
  const empurrar = (tipo: TipoTrecho, linha: string) => {
    const ultimo = trechos[trechos.length - 1];
    if (ultimo && ultimo.tipo === tipo) ultimo.linhas.push(linha);
    else trechos.push({ tipo, linhas: [linha] });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      empurrar("igual", a[i]);
      i++;
      j++;
    } else if (tabela[i + 1][j] >= tabela[i][j + 1]) {
      empurrar("removido", a[i]);
      i++;
    } else {
      empurrar("adicionado", b[j]);
      j++;
    }
  }
  while (i < a.length) empurrar("removido", a[i++]);
  while (j < b.length) empurrar("adicionado", b[j++]);

  return trechos;
}

export function temDiferenca(trechos: Trecho[]): boolean {
  return trechos.some((t) => t.tipo !== "igual");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/sync/diffLinhas.test.ts`
Expected: PASS, 11 testes.

- [ ] **Step 5: Commit**

```bash
git add src/sync/diffLinhas.ts src/sync/diffLinhas.test.ts
git commit -m "feat(sync): comparacao linha a linha por subsequencia comum"
```

---

### Task 3: Da decisão às operações de arquivo

**Files:**
- Create: `src/sync/resolucao.ts`
- Test: `src/sync/resolucao.test.ts`

**Interfaces:**
- Consumes: `Conflito`, `Resolucao`, `OperacaoArquivo` de `./tipos`;
  `nomeDaCopiaDeConflito` de `./nomeDeConflito`.
- Produces: `operacoesPara(conflito: Conflito, resolucao: Resolucao, quando: Date): OperacaoArquivo[]`.

Traduzir decisão em operações é o coração do plano, e é onde um erro apaga trabalho de
alguém. Por isso é uma função pura, separada de quem escreve em disco, com um teste por
caminho.

Regras:
- **"ficar com a local"** não escreve nada no caminho original — o disco local já tem esse
  conteúdo. Escrever de novo só geraria um evento de watcher e um novo ciclo de sync.
- **"ficar com a remota"** escreve a remota no caminho original.
- **"manter as duas"** deixa a local onde está e grava a remota numa cópia de conflito,
  carimbada com o dispositivo de **onde a versão remota veio**.

- [ ] **Step 1: Write the failing test**

```ts
// src/sync/resolucao.test.ts
import { describe, it, expect } from "vitest";

import { operacoesPara } from "./resolucao";
import type { Conflito } from "./tipos";

const quando = new Date(2026, 8, 21);

const conflito = (caminho = "Diário/reunião.md"): Conflito => ({
  caminho,
  tipo: caminho.endsWith(".draw.md") ? "desenho" : "nota",
  local: { origem: "local", conteudo: "versão daqui", mtimeMs: 2, dispositivo: "Desktop" },
  remoto: { origem: "remoto", conteudo: "versão de lá", mtimeMs: 1, dispositivo: "Notebook" },
});

describe("operacoesPara", () => {
  it("ficar com a local não escreve nada, porque o disco já tem isso", () => {
    expect(operacoesPara(conflito(), { acao: "ficarCom", origem: "local" }, quando)).toEqual([]);
  });

  it("ficar com a remota sobrescreve o caminho original", () => {
    expect(operacoesPara(conflito(), { acao: "ficarCom", origem: "remoto" }, quando)).toEqual([
      { tipo: "escrever", caminho: "Diário/reunião.md", conteudo: "versão de lá" },
    ]);
  });

  it("manter as duas grava a remota numa cópia e não toca no original", () => {
    expect(operacoesPara(conflito(), { acao: "manterAmbas" }, quando)).toEqual([
      {
        tipo: "escrever",
        caminho: "Diário/reunião (conflito de 21-09-2026, Notebook).md",
        conteudo: "versão de lá",
      },
    ]);
  });

  it("a cópia é carimbada com o dispositivo de onde a versão remota veio", () => {
    const c = conflito();
    c.remoto.dispositivo = "Tablet da Ana";
    const [op] = operacoesPara(c, { acao: "manterAmbas" }, quando);
    expect(op.caminho).toContain("Tablet da Ana");
    expect(op.caminho).not.toContain("Desktop");
  });

  it("manter as duas preserva .draw.md na cópia", () => {
    const [op] = operacoesPara(conflito("mapa.draw.md"), { acao: "manterAmbas" }, quando);
    expect(op.caminho).toBe("mapa (conflito de 21-09-2026, Notebook).draw.md");
  });

  it("nenhuma resolução remove arquivo — só existe operação de escrita", () => {
    const todas = [
      ...operacoesPara(conflito(), { acao: "ficarCom", origem: "local" }, quando),
      ...operacoesPara(conflito(), { acao: "ficarCom", origem: "remoto" }, quando),
      ...operacoesPara(conflito(), { acao: "manterAmbas" }, quando),
    ];
    expect(todas.every((op) => op.tipo === "escrever")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/sync/resolucao.test.ts`
Expected: FAIL — "Failed to resolve import ./resolucao".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/sync/resolucao.ts
// Decisão do usuário → operações de arquivo. Pura de propósito: é aqui que um erro apagaria
// trabalho de alguém, e função pura tem teste por caminho.
//
// Só existe operação de ESCRITA. Nenhuma resolução remove arquivo — o princípio 1 do doc 01
// diz que nada some sem volta atrás, e "ficar com esta" não é motivo para destruir a outra
// quando o usuário pode ter se enganado.

import { nomeDaCopiaDeConflito } from "./nomeDeConflito";
import type { Conflito, OperacaoArquivo, Resolucao } from "./tipos";

export function operacoesPara(
  conflito: Conflito,
  resolucao: Resolucao,
  quando: Date,
): OperacaoArquivo[] {
  if (resolucao.acao === "ficarCom") {
    // A versão local JÁ é o que está no disco. Reescrever geraria evento de watcher e um
    // novo ciclo de sincronização à toa.
    if (resolucao.origem === "local") return [];
    return [
      { tipo: "escrever", caminho: conflito.caminho, conteudo: conflito.remoto.conteudo },
    ];
  }

  // manterAmbas: a local fica onde está; a remota vira cópia carimbada com o dispositivo
  // DE ONDE ELA VEIO — é essa a informação útil para quem vai abrir as duas depois.
  return [
    {
      tipo: "escrever",
      caminho: nomeDaCopiaDeConflito(conflito.caminho, conflito.remoto.dispositivo, quando),
      conteudo: conflito.remoto.conteudo,
    },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/sync/resolucao.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 5: Commit**

```bash
git add src/sync/resolucao.ts src/sync/resolucao.test.ts
git commit -m "feat(sync): traducao de resolucao de conflito em operacoes de arquivo"
```

---

### Task 4: O `conflitosStore`

**Files:**
- Create: `src/estado/conflitosStore.ts`
- Test: `src/estado/conflitosStore.test.ts`

**Interfaces:**
- Consumes: `Conflito`, `Resolucao` de `../sync/tipos`; `operacoesPara` de
  `../sync/resolucao`; `VaultAdapter` de `../vault/VaultAdapter`.
- Produces: `useConflitosStore` com
  `{ conflitos: Conflito[]; registrar(c: Conflito): void; limpar(): void;
  resolver(caminho: string, r: Resolucao, adaptador: VaultAdapter, quando?: Date): Promise<void>;
  conflitoDe(caminho: string): Conflito | undefined }`.

Regras que os testes cobram:
- **Registrar o mesmo caminho duas vezes substitui**, não duplica. Um caminho tem no máximo
  um conflito aberto.
- **O conflito só sai da fila depois de a escrita terminar.** Se `escreverTexto` falhar, o
  conflito continua lá — perder o aviso por causa de um disco cheio deixaria o usuário sem
  saber que existiu um conflito.

`escreverTexto` do `VaultAdapter` já faz a escrita atômica (tmp + rename) — é por isso que
o store escreve por ele e nunca chama `writeTextFile`.

- [ ] **Step 1: Write the failing test**

```ts
// src/estado/conflitosStore.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

import { useConflitosStore } from "./conflitosStore";
import type { Conflito } from "../sync/tipos";
import type { VaultAdapter } from "../vault/VaultAdapter";

const quando = new Date(2026, 8, 21);

const conflito = (caminho = "nota.md"): Conflito => ({
  caminho,
  tipo: "nota",
  local: { origem: "local", conteudo: "daqui", mtimeMs: 2, dispositivo: "Desktop" },
  remoto: { origem: "remoto", conteudo: "de lá", mtimeMs: 1, dispositivo: "Notebook" },
});

function adaptadorFalso(escreverTexto = vi.fn(async () => {})) {
  return { escreverTexto } as unknown as VaultAdapter & { escreverTexto: typeof escreverTexto };
}

describe("conflitosStore", () => {
  beforeEach(() => useConflitosStore.setState({ conflitos: [] }));

  it("começa vazio", () => {
    expect(useConflitosStore.getState().conflitos).toEqual([]);
  });

  it("registrar acrescenta e conflitoDe encontra", () => {
    useConflitosStore.getState().registrar(conflito());
    expect(useConflitosStore.getState().conflitoDe("nota.md")?.caminho).toBe("nota.md");
  });

  it("registrar o mesmo caminho substitui em vez de duplicar", () => {
    useConflitosStore.getState().registrar(conflito());
    const novo = conflito();
    novo.remoto.conteudo = "de lá, mais novo";
    useConflitosStore.getState().registrar(novo);
    expect(useConflitosStore.getState().conflitos).toHaveLength(1);
    expect(useConflitosStore.getState().conflitoDe("nota.md")?.remoto.conteudo).toBe(
      "de lá, mais novo",
    );
  });

  it("resolver com a local não escreve nada e tira da fila", async () => {
    const adaptador = adaptadorFalso();
    useConflitosStore.getState().registrar(conflito());

    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "ficarCom", origem: "local" }, adaptador, quando);

    expect(adaptador.escreverTexto).not.toHaveBeenCalled();
    expect(useConflitosStore.getState().conflitos).toEqual([]);
  });

  it("resolver com a remota escreve pelo adaptador, nunca direto no disco", async () => {
    const adaptador = adaptadorFalso();
    useConflitosStore.getState().registrar(conflito());

    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "ficarCom", origem: "remoto" }, adaptador, quando);

    expect(adaptador.escreverTexto).toHaveBeenCalledWith("nota.md", "de lá");
    expect(useConflitosStore.getState().conflitos).toEqual([]);
  });

  it("manter as duas grava a cópia carimbada", async () => {
    const adaptador = adaptadorFalso();
    useConflitosStore.getState().registrar(conflito());

    await useConflitosStore
      .getState()
      .resolver("nota.md", { acao: "manterAmbas" }, adaptador, quando);

    expect(adaptador.escreverTexto).toHaveBeenCalledWith(
      "nota (conflito de 21-09-2026, Notebook).md",
      "de lá",
    );
  });

  it("escrita que falha mantém o conflito na fila", async () => {
    const adaptador = adaptadorFalso(
      vi.fn(async () => {
        throw new Error("disco cheio");
      }),
    );
    useConflitosStore.getState().registrar(conflito());

    await expect(
      useConflitosStore
        .getState()
        .resolver("nota.md", { acao: "ficarCom", origem: "remoto" }, adaptador, quando),
    ).rejects.toThrow("disco cheio");

    expect(useConflitosStore.getState().conflitos).toHaveLength(1);
  });

  it("resolver caminho que não está em conflito não faz nada", async () => {
    const adaptador = adaptadorFalso();
    await useConflitosStore
      .getState()
      .resolver("outra.md", { acao: "manterAmbas" }, adaptador, quando);
    expect(adaptador.escreverTexto).not.toHaveBeenCalled();
  });

  it("limpar esvazia a fila — usado ao trocar de vault", () => {
    useConflitosStore.getState().registrar(conflito("a.md"));
    useConflitosStore.getState().registrar(conflito("b.md"));
    useConflitosStore.getState().limpar();
    expect(useConflitosStore.getState().conflitos).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/estado/conflitosStore.test.ts`
Expected: FAIL — "Failed to resolve import ./conflitosStore".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/estado/conflitosStore.ts
// A fila de conflitos abertos e a aplicação da decisão do usuário.
//
// A escrita sai pelo VaultAdapter, que já faz tmp + rename (doc 02 §10) — este store nunca
// chama writeTextFile. E o conflito só sai da fila DEPOIS de a escrita terminar: sumir com
// o aviso por causa de um disco cheio deixaria o usuário sem saber que houve conflito.

import { create } from "zustand";

import { operacoesPara } from "../sync/resolucao";
import type { Conflito, Resolucao } from "../sync/tipos";
import type { VaultAdapter } from "../vault/VaultAdapter";

interface ConflitosState {
  conflitos: Conflito[];
  conflitoDe(caminho: string): Conflito | undefined;
  registrar(conflito: Conflito): void;
  limpar(): void;
  resolver(
    caminho: string,
    resolucao: Resolucao,
    adaptador: VaultAdapter,
    quando?: Date,
  ): Promise<void>;
}

export const useConflitosStore = create<ConflitosState>((set, get) => ({
  conflitos: [],

  conflitoDe(caminho) {
    return get().conflitos.find((c) => c.caminho === caminho);
  },

  registrar(conflito) {
    set((estado) => ({
      // Um caminho tem no máximo um conflito aberto: o novo substitui o velho.
      conflitos: [...estado.conflitos.filter((c) => c.caminho !== conflito.caminho), conflito],
    }));
  },

  limpar() {
    set({ conflitos: [] });
  },

  async resolver(caminho, resolucao, adaptador, quando = new Date()) {
    const conflito = get().conflitoDe(caminho);
    if (!conflito) return;

    for (const op of operacoesPara(conflito, resolucao, quando)) {
      await adaptador.escreverTexto(op.caminho, op.conteudo);
    }

    set((estado) => ({ conflitos: estado.conflitos.filter((c) => c.caminho !== caminho) }));
  },
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/estado/conflitosStore.test.ts`
Expected: PASS, 9 testes.

- [ ] **Step 5: Commit**

```bash
git add src/estado/conflitosStore.ts src/estado/conflitosStore.test.ts
git commit -m "feat(sync): store da fila de conflitos com escrita pelo VaultAdapter"
```

---

### Task 5: A faixa de aviso e o comparador de notas

**Files:**
- Create: `src/ui/excalisidian/FaixaConflitos.tsx`
- Create: `src/ui/excalisidian/ComparadorNotas.tsx`
- Modify: `src/i18n/catalogo.ts`

**Interfaces:**
- Consumes: `useConflitosStore`, `diffLinhas`, `temDiferenca`, `useTexto`.
- Produces: nada consumido por outra tarefa.

Sem teste automatizado — interface. A comparação e a resolução já estão cobertas.

- [ ] **Step 1: Acrescentar os textos ao catálogo**

Em `PT_BR`:

```ts
  "conflito.faixa.um": "Uma nota foi editada em dois lugares.",
  "conflito.faixa.varias": "{contagem} notas foram editadas em dois lugares.",
  "conflito.faixa.resolver": "Resolver",
  "conflito.titulo": "Duas versões de {nome}",
  "conflito.explicacao":
    "Esta nota foi editada em dois computadores. Nada foi apagado — escolha o que manter.",
  "conflito.estaMaquina": "Nesta máquina",
  "conflito.outraMaquina": "Em {dispositivo}",
  "conflito.editadoEm": "Editado em {data}",
  "conflito.ficarComEsta": "Ficar com esta",
  "conflito.manterAmbas": "Manter as duas",
  "conflito.manterAmbasExplicacao":
    "A outra versão é salva ao lado, com o nome marcado como conflito.",
  "conflito.semDiferenca": "As duas versões têm o mesmo conteúdo.",
```

Em `EN`:

```ts
  "conflito.faixa.um": "A note was edited in two places.",
  "conflito.faixa.varias": "{contagem} notes were edited in two places.",
  "conflito.faixa.resolver": "Resolve",
  "conflito.titulo": "Two versions of {nome}",
  "conflito.explicacao":
    "This note was edited on two computers. Nothing was deleted — choose what to keep.",
  "conflito.estaMaquina": "On this computer",
  "conflito.outraMaquina": "On {dispositivo}",
  "conflito.editadoEm": "Edited on {data}",
  "conflito.ficarComEsta": "Keep this one",
  "conflito.manterAmbas": "Keep both",
  "conflito.manterAmbasExplicacao":
    "The other version is saved alongside, with the name marked as a conflict.",
  "conflito.semDiferenca": "Both versions have the same content.",
```

- [ ] **Step 2: A faixa**

`FaixaConflitos.tsx` lê `useConflitosStore((s) => s.conflitos)` e **não renderiza nada**
quando a lista está vazia — é a regra de não incomodar. Com conflito, mostra o texto
(singular ou plural conforme a contagem) e um botão "Resolver" que abre o comparador do
primeiro da fila.

Cor da faixa: `--color-ocre` (aviso, não erro — nada foi perdido). Raio: `--radius-ficha`.
Nenhum hex literal, nenhuma classe de cor do Tailwind.

- [ ] **Step 3: O comparador de notas**

`ComparadorNotas.tsx` recebe um `Conflito` e mostra duas colunas:

- Cabeçalho de cada coluna: `t("conflito.estaMaquina")` e
  `t("conflito.outraMaquina", { dispositivo })`, mais
  `t("conflito.editadoEm", { data })` a partir de `mtimeMs`.
- Corpo: os trechos de `diffLinhas(local.conteudo, remoto.conteudo)`. Trecho `"removido"`
  aparece só na coluna da esquerda, `"adicionado"` só na direita, `"igual"` nas duas.
  Marcação por fundo: `--color-lavagem` para igual, `--color-bordo` para removido,
  `--color-cristal` para adicionado — sempre em fundo, nunca em cor de texto, senão perde
  contraste no tema escuro.
- Rodapé: um "Ficar com esta" por coluna e um "Manter as duas" no meio, com
  `t("conflito.manterAmbasExplicacao")` embaixo.
- Quando `temDiferenca(...)` for `false`, mostrar `t("conflito.semDiferenca")` no lugar das
  colunas e deixar só "Ficar com esta" na coluna local.

Em telas estreitas, as duas colunas empilham. O texto usa `--fonte-mono`, porque é
markdown e alinhamento de linha importa.

- [ ] **Step 4: Verificar no app**

Conferir se já existe um `npm run tauri dev` na porta 1420. Como ainda não há sync, testar
registrando um conflito à mão no console do dev:

```js
// no console do WebView
useConflitosStore.getState().registrar({
  caminho: "Teste.md",
  tipo: "nota",
  local: { origem: "local", conteudo: "linha um\nlinha dois", mtimeMs: Date.now(), dispositivo: "Desktop" },
  remoto: { origem: "remoto", conteudo: "linha um\nlinha DOIS", mtimeMs: Date.now(), dispositivo: "Notebook" },
});
```

A faixa tem que aparecer, o comparador tem que marcar só a segunda linha, e "Manter as
duas" tem que criar `Teste (conflito de …, Notebook).md` no vault.

- [ ] **Step 5: Commit**

```bash
git add src/ui/excalisidian/FaixaConflitos.tsx src/ui/excalisidian/ComparadorNotas.tsx src/i18n/catalogo.ts
git commit -m "feat(sync): faixa de conflitos e comparador de notas lado a lado"
```

---

### Task 6: O comparador de desenhos

**Files:**
- Create: `src/ui/excalisidian/ComparadorDesenhos.tsx`
- Modify: `src/i18n/catalogo.ts`

**Interfaces:**
- Consumes: o leitor de cena `.draw.md` que `src/canvas/` já usa; `useConflitosStore`,
  `useTexto`.
- Produces: nada consumido por outra tarefa.

Esta é a pendência que o estudo de viabilidade deixou explícita: **desenho não dá para
comparar como texto**. Duas versões de um `.draw.md` precisam aparecer como duas telas.

- [ ] **Step 1: Acrescentar os textos ao catálogo**

Em `PT_BR`:

```ts
  "conflito.desenho.titulo": "Duas versões de {nome}",
  "conflito.desenho.explicacao":
    "Este desenho foi editado em dois computadores. Compare as duas telas e escolha.",
  "conflito.desenho.sugestao": "Manter as duas costuma ser a escolha segura num desenho.",
  "conflito.desenho.naoAbriu": "Não foi possível desenhar esta versão. Ela continua salva.",
```

Em `EN`:

```ts
  "conflito.desenho.titulo": "Two versions of {nome}",
  "conflito.desenho.explicacao":
    "This drawing was edited on two computers. Compare both canvases and choose.",
  "conflito.desenho.sugestao": "Keeping both is usually the safe choice for a drawing.",
  "conflito.desenho.naoAbriu": "Could not render this version. It is still saved.",
```

- [ ] **Step 2: Implementar**

Duas instâncias do Excalidraw lado a lado, **em modo somente leitura** (`viewModeEnabled`),
cada uma carregando a cena de uma versão, com o mesmo enquadramento nas duas (usar
`scrollToContent` em cada uma depois de montar, para as duas mostrarem o conteúdo inteiro).

Reaproveitar o leitor de cena que `src/canvas/` já usa para abrir um `.draw.md` — não
escrever um analisador novo. As cores saem de `canvas/paletaCanvas.ts`, nunca hex literal.

Se uma das cenas não abrir (JSON corrompido pela sincronização), mostrar
`t("conflito.desenho.naoAbriu")` naquela coluna e **manter o botão "Manter as duas"
disponível** — o arquivo continua no disco e o usuário pode querer preservá-lo para
recuperar depois.

Os mesmos três botões da Task 5, com `t("conflito.desenho.sugestao")` em destaque discreto
perto de "Manter as duas".

Em tela estreita, as duas telas empilham; cada uma com `aspect-ratio` e `max-width: 100%`.

- [ ] **Step 3: Verificar no app**

Registrar um conflito de `.draw.md` à mão, do mesmo jeito da Task 5, usando o conteúdo de
dois desenhos de verdade do vault. Conferir que as duas telas desenham, que não dá para
editar nenhuma das duas, e que "Manter as duas" gera
`mapa (conflito de …, Notebook).draw.md` — com o `.draw.md` inteiro preservado.

- [ ] **Step 4: Commit**

```bash
git add src/ui/excalisidian/ComparadorDesenhos.tsx src/i18n/catalogo.ts
git commit -m "feat(sync): comparador visual de duas versoes de um desenho"
```

---

### Task 7: Testes mínimos da fatia

**Files:**
- Nenhum arquivo novo.

- [ ] **Step 1: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS, incluindo os 48 testes novos dos planos 01 a 04.

- [ ] **Step 2: Rodar os testes mínimos da seção 10 do doc 05**

Seguir a lista de `docs/05-arquitetura-e-stack.md` §10 — é a regra do `CLAUDE.md` para
fechar uma fatia do roadmap.

- [ ] **Step 3: Conferir a compilação**

Run: `npm run build`
Expected: `tsc` sem erro. É aqui que aparece qualquer `switch` sobre `ProvedorId` ou
`ErroAgente` que ficou sem o caso novo.

---

## Fora deste plano

- **O sync em si**: observar o vault, cifrar, subir, baixar, versionar, detectar que houve
  conflito. Este plano cobre o que acontece **depois** de o conflito ser detectado.
- A criptografia e a derivação de chave a partir do código de recuperação.
- Histórico de versões no servidor.
- Merge automático — decisão fechada no estudo de viabilidade: não existe, por princípio.
