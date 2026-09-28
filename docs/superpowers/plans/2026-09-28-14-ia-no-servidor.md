# IA do Excalisidian no servidor — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o servidor passa a atender o provedor "IA do Excalisidian" que o app já tem:
repassa os pedidos ao fornecedor com a chave guardada só na VPS, conta créditos pelo custo
real e expõe o saldo que o medidor do app espera.

**Architecture:** três módulos novos no servidor, planos (arquivos na raiz de
`servidor/src/`, como os existentes): `creditosIa.ts` (preços, período, saldo e débito no
SQLite), `fornecedorIa.ts` (a chamada HTTP ao fornecedor e a leitura do `usage`) e
`rotasIa.ts` (as duas rotas, registradas no mesmo plugin `/v1`). O app ganha o código de erro
`creditos`, um buscador de saldo e o medidor ligado ao saldo real. Implantação na VPS pelo
orquestrador, com autorização do dono do produto.

**Tech Stack:** Node 22, Fastify 5, better-sqlite3 12, vitest (servidor); TypeScript,
`@tauri-apps/plugin-http`, zustand, vitest (app).

**Spec:** `docs/18-servidor.md` §5 (normativo — rotas, ordem das verificações, créditos,
chave, privacidade), `docs/11-agente-ia.md` §3.2 e §7, `docs/09-decisoes-e-incertezas.md`
ADR-43 e Parte 2 (fatos do fornecedor verificados em 28/09/2026).

## Global Constraints

- Português do Brasil em nomes de arquivo, funções, variáveis e comentários.
- Commit sempre por caminho explícito (`git add <arquivos>`), nunca `git add -A` nem `git add .`.
  Conferir `git status` antes: a árvore pode ter trabalho do dono do produto.
- Servidor: `cd servidor && npm test` e `cd servidor && npx tsc --noEmit` passam ao fim de cada
  tarefa que toca o servidor. Hoje: 77 testes.
- App: `npm test` na raiz passa ao fim de cada tarefa que toca o app. Hoje: 1448 testes. Sem
  jsdom: só módulos puros têm teste.
- Nenhuma dependência nova (o servidor usa o `fetch` do próprio Node 22).
- A chave do fornecedor nunca aparece em log, em resposta HTTP, em mensagem de erro, no
  repositório ou no app. O nome do modelo real e o nome do fornecedor nunca aparecem na
  resposta ao app nem na interface.
- O texto das mensagens nunca é guardado no banco nem escrito em log.
- Unidade de crédito: 1 crédito = US$ 0,001 = 1000 micro-dólares. Cotas: `padrao` 3000,
  `superior` 10000 créditos por mês.
- Período: mês civil no horário de Brasília (UTC−3 fixo). Renova à 00:00 do dia 1º (= 03:00 UTC).
- Preços (US$ por milhão de tokens; = micro-dólares por token): fora de pico — entrada com
  cache 0,003, sem cache 0,15, saída 0,60; pico — 0,006 / 0,30 / 1,20. Pico = segunda a sexta
  (dia da semana em UTC), 01:00–04:00 e 06:00–10:00 UTC.
- Texto de interface novo sai do catálogo (`src/i18n/catalogo/`), com português e inglês.

## Review Focus

1. Resposta do fornecedor sem `usage`, ou sem detalhe de cache → cobra pela estimativa
   conservadora (nunca de graça, nunca menos que o real). Teste na Task 2.
2. Virada de mês em Brasília: dia 31 às 22:00 de Brasília (01:00 UTC do dia 1º) ainda é o mês
   anterior. Teste na Task 1.
3. Fornecedor falha, demora mais de 90 s ou devolve resposta sem texto → 502 e **nenhum**
   débito. Teste na Task 4.
4. O log de uma chamada de IA não contém o texto da mensagem, o token nem a chave. Teste na
   Task 4.
5. Créditos exatamente no total → barrado com 429 `creditos`; um abaixo → passa. Teste na
   Task 4.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `servidor/src/config.ts` | Ganha `ia?: ConfigIa` lido de `EXCALISIDIAN_IA_*`. |
| `servidor/src/banco.ts` | Migração 6: coluna `contas.faixa_ia` e tabela `uso_ia`. |
| `servidor/src/creditosIa.ts` | Preços, horário de pico, custo em micro-dólares, período, saldo, débito. |
| `servidor/src/fornecedorIa.ts` | Modelos lógicos, teto de saída, chamada ao fornecedor, leitura do `usage`. |
| `servidor/src/rotasIa.ts` | `POST /chat/completions` e `GET /creditos`. |
| `servidor/src/limiteDeTentativas.ts` | Limite configurável pelo construtor (padrão continua 10). |
| `servidor/src/rotas.ts`, `servidor/src/app.ts` | Registram as rotas de IA e injetam `fetch` do fornecedor e relógio. |
| `servidor/src/admin.ts` | `premium`/`superior`/`gratis` com faixa, `contas` com faixa, `uso <email>`. |
| `servidor/implantacao/excalisidian-api.service` | `EnvironmentFile=-/etc/excalisidian/ia.env`. |
| `servidor/implantacao/excalisidian-configurar-ia` | Script que pede a chave sem mostrar, testa, grava e reinicia. |
| `servidor/implantacao/excalisidian-admin` | Comentário de uso atualizado. |
| `servidor/LEIAME.md` | Seção "IA do Excalisidian": instalar, configurar a chave, conferir. |
| `src/agente/tipos.ts`, `src/agente/cliente.ts` | Código de erro `creditos`. |
| `src/i18n/catalogo/agente.ts` | Texto `agente.erro.creditos` (pt-BR e en). |
| `src/servico/saldoCreditos.ts` | Busca `GET /creditos`; `null` em qualquer falha. |
| `src/estado/agenteStore.ts` | `saldoCreditos` e `atualizarSaldo()`. |
| `src/ui/excalisidian/PainelAgente.tsx` | Medidor lê o saldo do store; atualiza ao abrir e após cada resposta. |

---

### Task 1: Créditos — preços, período, saldo e débito

**Files:**
- Modify: `servidor/src/config.ts`
- Modify: `servidor/src/banco.ts` (acrescentar a migração 6 no FIM de `MIGRACOES`)
- Create: `servidor/src/creditosIa.ts`
- Test: `servidor/src/creditosIa.test.ts`

**Interfaces:**
- Consumes: `BancoSqlite` de `./banco`.
- Produces:
  - `config.ts`: `interface ConfigIa { chave: string; url: string; modelo: string }`;
    `Config.ia?: ConfigIa`.
  - `creditosIa.ts`: `type FaixaIa = "padrao" | "superior"`;
    `COTA_POR_FAIXA: Record<FaixaIa, number>`;
    `interface UsoFornecedor { entradaComCache: number; entradaSemCache: number; saida: number }`;
    `ehHorarioDePico(agoraMs: number): boolean`;
    `custoMicroUsd(uso: UsoFornecedor, agoraMs: number): number`;
    `periodoDe(agoraMs: number): string` (formato `"AAAA-MM"`);
    `renovaEmDe(agoraMs: number): number`;
    `creditosDeMicroUsd(micro: number): number`;
    `interface Saldo { usados: number; total: number; renovaEm: number }`;
    `saldoDaConta(banco: BancoSqlite, contaId: number, agoraMs: number): Saldo`;
    `debitar(banco: BancoSqlite, contaId: number, agoraMs: number, uso: UsoFornecedor): number`
    (devolve o custo do pedido em micro-dólares).

- [ ] **Step 1: Write the failing test**

```ts
// servidor/src/creditosIa.test.ts
// Créditos da IA (doc 18 §5.2): preço por faixa de horário, custo em micro-dólares inteiros,
// mês civil de Brasília, saldo e débito no SQLite.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { abrirBanco, type BancoSqlite } from "./banco";
import {
  COTA_POR_FAIXA,
  creditosDeMicroUsd,
  custoMicroUsd,
  debitar,
  ehHorarioDePico,
  periodoDe,
  renovaEmDe,
  saldoDaConta,
} from "./creditosIa";

// 28/09/2026 é segunda-feira.
const SEGUNDA_12H_UTC = Date.UTC(2026, 8, 28, 12, 0, 0);
const SEGUNDA_02H_UTC = Date.UTC(2026, 8, 28, 2, 0, 0);
const SEGUNDA_07H_UTC = Date.UTC(2026, 8, 28, 7, 30, 0);
const SEGUNDA_04H_UTC = Date.UTC(2026, 8, 28, 4, 0, 0);
const SABADO_02H_UTC = Date.UTC(2026, 8, 26, 2, 0, 0);

describe("ehHorarioDePico", () => {
  it("é pico de segunda a sexta entre 01h e 04h e entre 06h e 10h UTC", () => {
    expect(ehHorarioDePico(SEGUNDA_02H_UTC)).toBe(true);
    expect(ehHorarioDePico(SEGUNDA_07H_UTC)).toBe(true);
  });

  it("04:00 em ponto já é fora de pico, e meio-dia também", () => {
    expect(ehHorarioDePico(SEGUNDA_04H_UTC)).toBe(false);
    expect(ehHorarioDePico(SEGUNDA_12H_UTC)).toBe(false);
  });

  it("fim de semana nunca é pico", () => {
    expect(ehHorarioDePico(SABADO_02H_UTC)).toBe(false);
  });
});

describe("custoMicroUsd", () => {
  it("fora de pico: 1000 sem cache + 1000 com cache + 100 de saída", () => {
    // 1000*0,15 + 1000*0,003 + 100*0,60 = 150 + 3 + 60 = 213 micro-dólares
    expect(
      custoMicroUsd({ entradaSemCache: 1000, entradaComCache: 1000, saida: 100 }, SEGUNDA_12H_UTC),
    ).toBe(213);
  });

  it("no pico custa o dobro", () => {
    expect(
      custoMicroUsd({ entradaSemCache: 1000, entradaComCache: 1000, saida: 100 }, SEGUNDA_02H_UTC),
    ).toBe(426);
  });

  it("arredonda para cima, nunca para baixo", () => {
    // 1 token com cache fora de pico = 0,003 micro-dólar → 1
    expect(custoMicroUsd({ entradaSemCache: 0, entradaComCache: 1, saida: 0 }, SEGUNDA_12H_UTC)).toBe(1);
  });

  it("não sofre erro de ponto flutuante (1000 tokens sem cache = 150 exatos)", () => {
    expect(custoMicroUsd({ entradaSemCache: 1000, entradaComCache: 0, saida: 0 }, SEGUNDA_12H_UTC)).toBe(150);
  });

  it("uso zero custa zero", () => {
    expect(custoMicroUsd({ entradaSemCache: 0, entradaComCache: 0, saida: 0 }, SEGUNDA_12H_UTC)).toBe(0);
  });
});

describe("período (mês civil de Brasília)", () => {
  it("dia 1º às 01:00 UTC ainda é o mês anterior em Brasília (dia 31 às 22:00)", () => {
    expect(periodoDe(Date.UTC(2026, 9, 1, 1, 0, 0))).toBe("2026-09");
  });

  it("dia 1º às 03:00 UTC (meia-noite em Brasília) já é o mês novo", () => {
    expect(periodoDe(Date.UTC(2026, 9, 1, 3, 0, 0))).toBe("2026-10");
  });

  it("renovaEm é meia-noite de Brasília do dia 1º do mês seguinte", () => {
    expect(renovaEmDe(SEGUNDA_12H_UTC)).toBe(Date.UTC(2026, 9, 1, 3, 0, 0));
  });

  it("em dezembro renova em janeiro do ano seguinte", () => {
    expect(renovaEmDe(Date.UTC(2026, 11, 15, 12, 0, 0))).toBe(Date.UTC(2027, 0, 1, 3, 0, 0));
    expect(periodoDe(Date.UTC(2026, 11, 15, 12, 0, 0))).toBe("2026-12");
  });
});

describe("creditosDeMicroUsd", () => {
  it("1000 micro-dólares = 1 crédito; qualquer fração conta como crédito inteiro", () => {
    expect(creditosDeMicroUsd(0)).toBe(0);
    expect(creditosDeMicroUsd(1000)).toBe(1);
    expect(creditosDeMicroUsd(1001)).toBe(2);
  });
});

describe("saldo e débito no banco", () => {
  let pasta: string;
  let banco: BancoSqlite;
  let contaId: number;

  beforeEach(() => {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), "excalisidian-creditos-"));
    banco = abrirBanco(pasta);
    const r = banco
      .prepare(`insert into contas (email, sal, hash, plano, criada_em) values (?, x'00', x'00', 'premium', 0)`)
      .run("a@exemplo.com");
    contaId = Number(r.lastInsertRowid);
  });

  afterEach(() => {
    banco.close();
    fs.rmSync(pasta, { recursive: true, force: true });
  });

  it("conta nova nasce na faixa padrão, sem uso", () => {
    expect(saldoDaConta(banco, contaId, SEGUNDA_12H_UTC)).toEqual({
      usados: 0,
      total: COTA_POR_FAIXA.padrao,
      renovaEm: Date.UTC(2026, 9, 1, 3, 0, 0),
    });
  });

  it("faixa superior tem 10.000 créditos", () => {
    banco.prepare(`update contas set faixa_ia = 'superior' where id = ?`).run(contaId);
    expect(saldoDaConta(banco, contaId, SEGUNDA_12H_UTC).total).toBe(10_000);
  });

  it("debitar acumula custo, pedidos e tokens no mês", () => {
    debitar(banco, contaId, SEGUNDA_12H_UTC, { entradaSemCache: 10_000, entradaComCache: 0, saida: 0 }); // 1500 µ$
    debitar(banco, contaId, SEGUNDA_12H_UTC, { entradaSemCache: 0, entradaComCache: 0, saida: 1000 }); // 600 µ$
    const linha = banco
      .prepare(`select custo_micro_usd, pedidos, tokens_entrada, tokens_saida from uso_ia where conta_id = ?`)
      .get(contaId);
    expect(linha).toEqual({ custo_micro_usd: 2100, pedidos: 2, tokens_entrada: 10_000, tokens_saida: 1000 });
    expect(saldoDaConta(banco, contaId, SEGUNDA_12H_UTC).usados).toBe(3); // teto(2100/1000)
  });

  it("uso de um mês não conta no mês seguinte", () => {
    debitar(banco, contaId, SEGUNDA_12H_UTC, { entradaSemCache: 10_000, entradaComCache: 0, saida: 0 });
    expect(saldoDaConta(banco, contaId, Date.UTC(2026, 9, 5, 12, 0, 0)).usados).toBe(0);
  });

  it("debitar devolve o custo do pedido em micro-dólares", () => {
    expect(debitar(banco, contaId, SEGUNDA_12H_UTC, { entradaSemCache: 1000, entradaComCache: 0, saida: 0 })).toBe(150);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd servidor && npx vitest run src/creditosIa.test.ts`
Expected: FAIL — "Failed to resolve import ./creditosIa".

- [ ] **Step 3: Write minimal implementation**

Em `servidor/src/config.ts`, acrescentar `ConfigIa`, o campo opcional e a leitura do ambiente
(opcional para os testes existentes, que montam `{ porta, pastaDados }` à mão, continuarem
compilando):

```ts
export interface ConfigIa {
  /** Chave do fornecedor. Vazia = IA desligada (as rotas de IA respondem 503). Nunca logar. */
  chave: string;
  /** Base do fornecedor, sem barra no fim (a rota `/chat/completions` é acrescentada). */
  url: string;
  /** Modelo real do fornecedor para os dois modelos lógicos do app. */
  modelo: string;
}

export interface Config {
  porta: number;
  pastaDados: string;
  /** IA do Excalisidian (doc 18 §5.3). Ausente nos testes que não usam IA. */
  ia?: ConfigIa;
}
```

E, em `carregarConfig`, devolver também:

```ts
  const ia: ConfigIa = {
    chave: (env.EXCALISIDIAN_IA_CHAVE ?? "").trim(),
    url: (env.EXCALISIDIAN_IA_URL ?? "https://api.deepseek.com").replace(/\/+$/, ""),
    modelo: env.EXCALISIDIAN_IA_MODELO ?? "deepseek-flash",
  };
  return { porta, pastaDados, ia };
```

Em `servidor/src/banco.ts`, acrescentar no FIM de `MIGRACOES` (nunca alterar as anteriores):

```ts
  // Migração 6 (IA do Excalisidian, doc 18 §5.2): a faixa de IA da conta (`padrao` = 3.000
  // créditos/mês, `superior` = 10.000; as duas são "premium" para o resto do produto) e o uso
  // por conta e por mês civil de Brasília (`periodo` = "AAAA-MM"). Só números — nunca texto
  // de mensagem. `custo_micro_usd` é o custo real acumulado do fornecedor em micro-dólares
  // inteiros; os créditos saem dele (1 crédito = 1000 micro-dólares).
  (db) => {
    db.exec(`
      alter table contas add column faixa_ia text not null default 'padrao';
      create table uso_ia (
        conta_id integer not null references contas(id) on delete cascade,
        periodo text not null,
        custo_micro_usd integer not null default 0,
        pedidos integer not null default 0,
        tokens_entrada integer not null default 0,
        tokens_saida integer not null default 0,
        primary key (conta_id, periodo)
      );
    `);
  },
```

Criar `servidor/src/creditosIa.ts`:

```ts
// servidor/src/creditosIa.ts
// Créditos da IA do Excalisidian (doc 18 §5.2, ADR-43). 1 crédito = US$ 0,001 de custo real
// do fornecedor. Toda a conta é feita em inteiros: o preço em US$ por milhão de tokens é o
// mesmo número que micro-dólares por token; multiplicado por 1000 vira nano-dólares por
// token, inteiro para os seis preços — assim não há erro de ponto flutuante (1000 × 0,15 dá
// 150 exatos, não 150,00000000000003).

import type { BancoSqlite } from "./banco";

export type FaixaIa = "padrao" | "superior";

/** Créditos por mês de cada faixa. Mudar aqui é atualizar o servidor, não o app. */
export const COTA_POR_FAIXA: Record<FaixaIa, number> = { padrao: 3000, superior: 10_000 };

/** Preços do fornecedor verificados em 28/09/2026 (doc 09, Parte 2), em nano-dólares por
 * token (= US$ por milhão × 1000). */
const PRECOS_NANO_USD = {
  foraDePico: { entradaComCache: 3, entradaSemCache: 150, saida: 600 },
  pico: { entradaComCache: 6, entradaSemCache: 300, saida: 1200 },
} as const;

/** Brasília é UTC−3 fixo (sem horário de verão desde 2019). */
const DESLOCAMENTO_BRASILIA_MS = 3 * 60 * 60 * 1000;

export interface UsoFornecedor {
  entradaComCache: number;
  entradaSemCache: number;
  saida: number;
}

/** Pico do fornecedor: segunda a sexta, 01:00–04:00 e 06:00–10:00 UTC. Feriado chinês é
 * tratado como dia comum — cobra no máximo o preço de pico, nunca menos que o real. */
export function ehHorarioDePico(agoraMs: number): boolean {
  const d = new Date(agoraMs);
  const dia = d.getUTCDay(); // 0 = domingo, 6 = sábado
  if (dia === 0 || dia === 6) return false;
  const hora = d.getUTCHours();
  return (hora >= 1 && hora < 4) || (hora >= 6 && hora < 10);
}

/** Custo do pedido em micro-dólares, arredondado para cima. */
export function custoMicroUsd(uso: UsoFornecedor, agoraMs: number): number {
  const p = ehHorarioDePico(agoraMs) ? PRECOS_NANO_USD.pico : PRECOS_NANO_USD.foraDePico;
  const nano =
    uso.entradaComCache * p.entradaComCache +
    uso.entradaSemCache * p.entradaSemCache +
    uso.saida * p.saida;
  return Math.ceil(nano / 1000);
}

/** "AAAA-MM" do mês civil de Brasília que contém `agoraMs`. */
export function periodoDe(agoraMs: number): string {
  const d = new Date(agoraMs - DESLOCAMENTO_BRASILIA_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Instante (ms) da meia-noite de Brasília do dia 1º do mês seguinte. */
export function renovaEmDe(agoraMs: number): number {
  const d = new Date(agoraMs - DESLOCAMENTO_BRASILIA_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) + DESLOCAMENTO_BRASILIA_MS;
}

/** Créditos usados a partir do custo acumulado; fração de crédito conta como inteiro. */
export function creditosDeMicroUsd(micro: number): number {
  return Math.ceil(micro / 1000);
}

export interface Saldo {
  usados: number;
  total: number;
  /** Epoch em ms — mesmo formato de `SaldoCreditos` no app (src/servico/creditos.ts). */
  renovaEm: number;
}

export function saldoDaConta(banco: BancoSqlite, contaId: number, agoraMs: number): Saldo {
  const conta = banco.prepare(`select faixa_ia as faixa from contas where id = ?`).get(contaId) as
    | { faixa: string }
    | undefined;
  const faixa: FaixaIa = conta?.faixa === "superior" ? "superior" : "padrao";
  const uso = banco
    .prepare(`select custo_micro_usd as micro from uso_ia where conta_id = ? and periodo = ?`)
    .get(contaId, periodoDe(agoraMs)) as { micro: number } | undefined;
  return {
    usados: creditosDeMicroUsd(uso?.micro ?? 0),
    total: COTA_POR_FAIXA[faixa],
    renovaEm: renovaEmDe(agoraMs),
  };
}

/** Soma o pedido ao mês corrente da conta. Devolve o custo do pedido em micro-dólares. */
export function debitar(banco: BancoSqlite, contaId: number, agoraMs: number, uso: UsoFornecedor): number {
  const micro = custoMicroUsd(uso, agoraMs);
  banco
    .prepare(
      `insert into uso_ia (conta_id, periodo, custo_micro_usd, pedidos, tokens_entrada, tokens_saida)
       values (?, ?, ?, 1, ?, ?)
       on conflict(conta_id, periodo) do update set
         custo_micro_usd = custo_micro_usd + excluded.custo_micro_usd,
         pedidos = pedidos + 1,
         tokens_entrada = tokens_entrada + excluded.tokens_entrada,
         tokens_saida = tokens_saida + excluded.tokens_saida`,
    )
    .run(contaId, periodoDe(agoraMs), micro, uso.entradaComCache + uso.entradaSemCache, uso.saida);
  return micro;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd servidor && npx vitest run src/creditosIa.test.ts` → PASS.
Depois: `cd servidor && npm test && npx tsc --noEmit` → tudo passa (o teste de migrações
idempotentes em `banco.test.ts` precisa continuar verde).

- [ ] **Step 5: Commit**

```bash
git add servidor/src/config.ts servidor/src/banco.ts servidor/src/creditosIa.ts servidor/src/creditosIa.test.ts
git commit -m "feat(servidor): creditos da IA pelo custo real, por mes de Brasilia"
```

---

### Task 2: Chamada ao fornecedor

**Files:**
- Create: `servidor/src/fornecedorIa.ts`
- Test: `servidor/src/fornecedorIa.test.ts`

**Interfaces:**
- Consumes: `ConfigIa` de `./config`; `UsoFornecedor` de `./creditosIa`.
- Produces:
  - `MODELOS_LOGICOS: readonly ["leitura-rapida", "acompanhamento"]`;
    `type ModeloLogico`; `ehModeloLogico(m: string): m is ModeloLogico`;
  - `tetoDeSaida(pedido: number | undefined): number` (ausente → 2048; acima de 4096 → 4096);
  - `interface MensagemIa { role: "system" | "user" | "assistant"; content: string }`;
  - `interface RespostaFornecedor { texto: string; motivoFim: string; uso: UsoFornecedor; tokensEntrada: number; tokensSaida: number }`;
  - `class FalhaFornecedor extends Error`;
  - `chamarFornecedor(args: { ia: ConfigIa; fetchImpl: typeof fetch; mensagens: MensagemIa[]; maxTokens: number; tempoMaximoMs?: number }): Promise<RespostaFornecedor>`.

- [ ] **Step 1: Write the failing test**

```ts
// servidor/src/fornecedorIa.test.ts
// Chamada ao fornecedor (doc 18 §5.1, passo 9): corpo enviado, leitura do usage (inclusive
// sem detalhe de cache ou sem usage — cobrança conservadora) e falhas.

import { describe, expect, it, vi } from "vitest";

import type { ConfigIa } from "./config";
import { chamarFornecedor, ehModeloLogico, FalhaFornecedor, tetoDeSaida, type MensagemIa } from "./fornecedorIa";

const IA: ConfigIa = { chave: "sk-teste-secreta", url: "https://fornecedor.exemplo", modelo: "modelo-real" };
const MENSAGENS: MensagemIa[] = [
  { role: "system", content: "sistema" },
  { role: "user", content: "olá mundo" },
];

function fetchQueResponde(status: number, corpo: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(corpo), { status }));
}

function corpoOk(usage: unknown) {
  return { choices: [{ message: { role: "assistant", content: "oi" }, finish_reason: "stop" }], usage };
}

describe("modelos e teto de saída", () => {
  it("só os dois modelos lógicos são aceitos", () => {
    expect(ehModeloLogico("leitura-rapida")).toBe(true);
    expect(ehModeloLogico("acompanhamento")).toBe(true);
    expect(ehModeloLogico("modelo-real")).toBe(false);
  });

  it("teto: 2048 sem pedido, respeita pedido menor, limita em 4096", () => {
    expect(tetoDeSaida(undefined)).toBe(2048);
    expect(tetoDeSaida(500)).toBe(500);
    expect(tetoDeSaida(100_000)).toBe(4096);
  });
});

describe("chamarFornecedor — pedido", () => {
  it("POST {url}/chat/completions com Bearer, modelo real, raciocínio desligado e max_tokens", async () => {
    const f = fetchQueResponde(200, corpoOk({ prompt_tokens: 10, completion_tokens: 2 }));
    await chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 });

    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://fornecedor.exemplo/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-teste-secreta");
    const corpo = JSON.parse(init.body as string);
    expect(corpo).toEqual({
      model: "modelo-real",
      messages: MENSAGENS,
      max_tokens: 500,
      thinking: { type: "disabled" },
      stream: false,
    });
  });
});

describe("chamarFornecedor — leitura do usage", () => {
  it("detalhe de cache no topo de usage", async () => {
    const f = fetchQueResponde(200, corpoOk({ prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 60 }));
    const r = await chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 });
    expect(r.uso).toEqual({ entradaComCache: 60, entradaSemCache: 40, saida: 20 });
    expect(r).toMatchObject({ texto: "oi", motivoFim: "stop", tokensEntrada: 100, tokensSaida: 20 });
  });

  it("detalhe de cache dentro de prompt_tokens_details", async () => {
    const f = fetchQueResponde(
      200,
      corpoOk({ prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { prompt_cache_hit_tokens: 70 } }),
    );
    const r = await chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 });
    expect(r.uso).toEqual({ entradaComCache: 70, entradaSemCache: 30, saida: 20 });
  });

  it("cached_tokens (estilo OpenAI) também vale", async () => {
    const f = fetchQueResponde(
      200,
      corpoOk({ prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 50 } }),
    );
    const r = await chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 });
    expect(r.uso.entradaComCache).toBe(50);
  });

  it("sem detalhe de cache, toda a entrada conta como sem cache (cobra mais, nunca menos)", async () => {
    const f = fetchQueResponde(200, corpoOk({ prompt_tokens: 100, completion_tokens: 20 }));
    const r = await chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 });
    expect(r.uso).toEqual({ entradaComCache: 0, entradaSemCache: 100, saida: 20 });
  });

  it("sem usage, estima para cima: entrada = caracteres das mensagens, saída = teto pedido", async () => {
    const f = fetchQueResponde(200, corpoOk(undefined));
    const r = await chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 });
    const caracteres = "sistema".length + "olá mundo".length;
    expect(r.uso).toEqual({ entradaComCache: 0, entradaSemCache: caracteres, saida: 500 });
    expect(r.tokensEntrada).toBe(caracteres);
    expect(r.tokensSaida).toBe(500);
  });

  it("cache maior que a entrada é limitado à entrada", async () => {
    const f = fetchQueResponde(200, corpoOk({ prompt_tokens: 10, completion_tokens: 1, prompt_cache_hit_tokens: 99 }));
    const r = await chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 });
    expect(r.uso).toEqual({ entradaComCache: 10, entradaSemCache: 0, saida: 1 });
  });
});

describe("chamarFornecedor — falhas viram FalhaFornecedor, sem vazar a chave", () => {
  it("status não-2xx", async () => {
    const f = fetchQueResponde(401, { error: "chave sk-teste-secreta inválida" });
    const erro = await chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 }).catch((e) => e);
    expect(erro).toBeInstanceOf(FalhaFornecedor);
    expect(String(erro.message)).not.toContain("sk-teste-secreta");
  });

  it("resposta sem texto", async () => {
    const f = fetchQueResponde(200, { choices: [{ message: { content: "" } }], usage: { prompt_tokens: 1, completion_tokens: 0 } });
    await expect(
      chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 }),
    ).rejects.toBeInstanceOf(FalhaFornecedor);
  });

  it("erro de rede", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(
      chamarFornecedor({ ia: IA, fetchImpl: f as unknown as typeof fetch, mensagens: MENSAGENS, maxTokens: 500 }),
    ).rejects.toBeInstanceOf(FalhaFornecedor);
  });

  it("tempo esgotado", async () => {
    const f = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, rejeitar) => {
          init.signal?.addEventListener("abort", () => rejeitar(init.signal!.reason));
        }),
    );
    await expect(
      chamarFornecedor({
        ia: IA,
        fetchImpl: f as unknown as typeof fetch,
        mensagens: MENSAGENS,
        maxTokens: 500,
        tempoMaximoMs: 20,
      }),
    ).rejects.toBeInstanceOf(FalhaFornecedor);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd servidor && npx vitest run src/fornecedorIa.test.ts`
Expected: FAIL — "Failed to resolve import ./fornecedorIa".

- [ ] **Step 3: Write minimal implementation**

```ts
// servidor/src/fornecedorIa.ts
// A chamada ao fornecedor de IA (doc 18 §5.1, passo 9). O app pede um modelo LÓGICO
// (`leitura-rapida` ou `acompanhamento`); o modelo real sai daqui — hoje os dois apontam para
// `config.ia.modelo`. Raciocínio do fornecedor sempre desligado (vem ligado por padrão e gasta
// créditos à toa; também cortaria a resposta curta da leitura rápida — doc 09, Parte 2).
//
// Nunca repassa ao fornecedor nada além de `messages` normalizadas e do teto de saída, e nunca
// coloca a chave nem o corpo da resposta do fornecedor numa mensagem de erro (que poderia
// acabar num log).

import type { ConfigIa } from "./config";
import type { UsoFornecedor } from "./creditosIa";

export const MODELOS_LOGICOS = ["leitura-rapida", "acompanhamento"] as const;
export type ModeloLogico = (typeof MODELOS_LOGICOS)[number];

export function ehModeloLogico(m: string): m is ModeloLogico {
  return (MODELOS_LOGICOS as readonly string[]).includes(m);
}

const SAIDA_PADRAO = 2048;
const TETO_SAIDA = 4096;
const TEMPO_MAXIMO_MS = 90_000;

export function tetoDeSaida(pedido: number | undefined): number {
  if (pedido === undefined) return SAIDA_PADRAO;
  return Math.min(pedido, TETO_SAIDA);
}

export interface MensagemIa {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface RespostaFornecedor {
  texto: string;
  motivoFim: string;
  /** O que se cobra (doc 18 §5.2). */
  uso: UsoFornecedor;
  /** O que se devolve ao app em `usage`. */
  tokensEntrada: number;
  tokensSaida: number;
}

export class FalhaFornecedor extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "FalhaFornecedor";
  }
}

function inteiroNaoNegativo(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : undefined;
}

/** Lê o `usage` do fornecedor. Sem `usage`, estima PARA CIMA (1 token ≤ 1 caractere; saída =
 * teto pedido) — um pedido nunca sai de graça. Sem detalhe de cache, toda a entrada conta
 * como sem cache. O detalhe de cache é procurado nos lugares conhecidos (doc 09, Parte 3,
 * item 33 — ainda não se sabe qual a resposta real usa). */
function lerUso(
  usage: unknown,
  estimativa: { entrada: number; saida: number },
): Pick<RespostaFornecedor, "uso" | "tokensEntrada" | "tokensSaida"> {
  const u = (usage && typeof usage === "object" ? usage : {}) as Record<string, unknown>;
  const detalhes = (u.prompt_tokens_details && typeof u.prompt_tokens_details === "object"
    ? u.prompt_tokens_details
    : {}) as Record<string, unknown>;
  const entrada = inteiroNaoNegativo(u.prompt_tokens);
  const saida = inteiroNaoNegativo(u.completion_tokens);
  if (entrada === undefined || saida === undefined) {
    return {
      uso: { entradaComCache: 0, entradaSemCache: estimativa.entrada, saida: estimativa.saida },
      tokensEntrada: estimativa.entrada,
      tokensSaida: estimativa.saida,
    };
  }
  const comCache =
    inteiroNaoNegativo(u.prompt_cache_hit_tokens) ??
    inteiroNaoNegativo(detalhes.prompt_cache_hit_tokens) ??
    inteiroNaoNegativo(detalhes.cached_tokens) ??
    0;
  const comCacheLimitado = Math.min(comCache, entrada);
  return {
    uso: { entradaComCache: comCacheLimitado, entradaSemCache: entrada - comCacheLimitado, saida },
    tokensEntrada: entrada,
    tokensSaida: saida,
  };
}

export async function chamarFornecedor(args: {
  ia: ConfigIa;
  fetchImpl: typeof fetch;
  mensagens: MensagemIa[];
  maxTokens: number;
  tempoMaximoMs?: number;
}): Promise<RespostaFornecedor> {
  const corpo = {
    model: args.ia.modelo,
    messages: args.mensagens,
    max_tokens: args.maxTokens,
    thinking: { type: "disabled" },
    stream: false,
  };

  let json: unknown;
  try {
    const res = await args.fetchImpl(`${args.ia.url}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${args.ia.chave}` },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(args.tempoMaximoMs ?? TEMPO_MAXIMO_MS),
    });
    if (!res.ok) throw new FalhaFornecedor(`fornecedor respondeu ${res.status}`);
    json = await res.json();
  } catch (erro) {
    if (erro instanceof FalhaFornecedor) throw erro;
    throw new FalhaFornecedor("sem resposta do fornecedor (rede, tempo esgotado ou corpo inválido)");
  }

  const escolha = (json as { choices?: { message?: { content?: unknown }; finish_reason?: unknown }[] })
    ?.choices?.[0];
  const texto = escolha?.message?.content;
  if (typeof texto !== "string" || texto.length === 0) {
    throw new FalhaFornecedor("resposta do fornecedor sem texto");
  }
  const caracteres = args.mensagens.reduce((soma, m) => soma + m.content.length, 0);
  return {
    texto,
    motivoFim: typeof escolha?.finish_reason === "string" ? escolha.finish_reason : "stop",
    ...lerUso((json as { usage?: unknown }).usage, { entrada: caracteres, saida: args.maxTokens }),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd servidor && npx vitest run src/fornecedorIa.test.ts` → PASS.
Depois: `cd servidor && npm test && npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add servidor/src/fornecedorIa.ts servidor/src/fornecedorIa.test.ts
git commit -m "feat(servidor): chamada ao fornecedor de IA com leitura conservadora do uso"
```

---

### Task 3: App — erro `creditos`, busca do saldo e medidor ligado

**Files:**
- Modify: `src/agente/tipos.ts`
- Modify: `src/agente/cliente.ts` (`erroDeStatus`, `textoDoErro`)
- Modify: `src/agente/cliente.test.ts`
- Modify: `src/i18n/catalogo/agente.ts`
- Create: `src/servico/saldoCreditos.ts`
- Test: `src/servico/saldoCreditos.test.ts`
- Modify: `src/estado/agenteStore.ts`
- Modify: `src/ui/excalisidian/PainelAgente.tsx`

**Interfaces:**
- Consumes: `SaldoCreditos` de `src/servico/creditos.ts`; `tokenDaSessaoAtual` de
  `src/servico/sessao.ts`; `decidirModoServidor` de `src/servico/modoServidor.ts`;
  `BASE_URL_SERVICO` de `src/servico/base.ts`.
- Produces:
  - `ErroAgente` ganha `"creditos"`.
  - `buscarSaldoCreditos(token: string, baseUrl?: string, fetchImpl?: typeof fetch): Promise<SaldoCreditos | null>`
    — a Task 4 usa esta função no teste de contrato contra o servidor.
  - `useAgenteStore`: `saldoCreditos: SaldoCreditos | null`, `atualizarSaldo(): Promise<void>`.
  - Catálogo: `agente.erro.creditos`.

- [ ] **Step 1: Write the failing tests**

Criar `src/servico/saldoCreditos.test.ts`:

```ts
// Busca do saldo de créditos (doc 11 §3.2): qualquer falha vira null — o medidor fica oculto,
// nunca mostra número inventado.
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

import { buscarSaldoCreditos } from "./saldoCreditos";

function resposta(status: number, corpo: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(corpo), { status })) as unknown as typeof fetch;
}

describe("buscarSaldoCreditos", () => {
  it("GET {base}/creditos com Bearer e devolve o saldo", async () => {
    const f = resposta(200, { usados: 120, total: 3000, renovaEm: 1_790_000_000_000 });
    const saldo = await buscarSaldoCreditos("tok-1", "https://api.exemplo/v1", f);
    expect(saldo).toEqual({ usados: 120, total: 3000, renovaEm: 1_790_000_000_000 });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.exemplo/v1/creditos");
    expect(init.headers.Authorization).toBe("Bearer tok-1");
  });

  it("status diferente de 200 vira null", async () => {
    expect(await buscarSaldoCreditos("tok", "https://x/v1", resposta(401, {}))).toBeNull();
    expect(await buscarSaldoCreditos("tok", "https://x/v1", resposta(403, {}))).toBeNull();
    expect(await buscarSaldoCreditos("tok", "https://x/v1", resposta(500, {}))).toBeNull();
  });

  it("corpo fora do formato vira null", async () => {
    expect(await buscarSaldoCreditos("tok", "https://x/v1", resposta(200, { usados: "1", total: 3000, renovaEm: 1 }))).toBeNull();
    expect(await buscarSaldoCreditos("tok", "https://x/v1", resposta(200, { total: 3000, renovaEm: 1 }))).toBeNull();
    expect(await buscarSaldoCreditos("tok", "https://x/v1", resposta(200, null))).toBeNull();
  });

  it("erro de rede vira null", async () => {
    const f = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await buscarSaldoCreditos("tok", "https://x/v1", f)).toBeNull();
  });
});
```

Acrescentar em `src/agente/cliente.test.ts` (usa o `fetchMock`, `respostaHTTP`, `provedorDe`,
`MODELO_LEITURA`, `BASE_URL_SERVICO`, `definirTokenDaSessao` e `textoDoErro` que o arquivo já
importa):

```ts
describe("provedor próprio — créditos esgotados", () => {
  afterEach(() => definirTokenDaSessao(null));

  const pedidoProprio = () => ({
    provedor: provedorDe("excalisidian"),
    baseUrl: BASE_URL_SERVICO,
    modelo: MODELO_LEITURA,
    thinking: "padrao" as const,
    system: "sys",
    mensagens: [{ papel: "usuario" as const, texto: "oi" }],
  });

  it("429 com codigo creditos vira FalhaAgente('creditos') com mensagem própria", async () => {
    definirTokenDaSessao("tok");
    fetchMock.mockResolvedValue(respostaHTTP(429, { codigo: "creditos" }));
    const erro = await completar(pedidoProprio()).catch((e) => e);
    expect(erro).toMatchObject({ codigo: "creditos" });
    expect(textoDoErro(erro)).toBe("Seus créditos de IA deste mês acabaram.");
  });

  it("429 sem esse corpo continua sendo cota", async () => {
    definirTokenDaSessao("tok");
    fetchMock.mockResolvedValue(respostaHTTP(429, { codigo: "limite" }));
    await expect(completar(pedidoProprio())).rejects.toMatchObject({ codigo: "cota" });
  });

  it("provedor de chave própria nunca vira creditos, mesmo com o corpo", async () => {
    fetchMock.mockResolvedValue(respostaHTTP(429, { codigo: "creditos" }));
    await expect(
      completar({
        provedor: provedorDe("openai"),
        chave: "sk",
        baseUrl: "https://api.openai.com/v1",
        modelo: "gpt-5.4-mini",
        thinking: "padrao",
        system: "sys",
        mensagens: [{ papel: "usuario", texto: "oi" }],
      }),
    ).rejects.toMatchObject({ codigo: "cota" });
  });
});
```

(Se `afterEach` não estiver no import de `vitest` no topo do arquivo, acrescentar.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/servico/saldoCreditos.test.ts src/agente/cliente.test.ts`
Expected: FAIL — `./saldoCreditos` não existe; o 429 `creditos` ainda vira `cota`.

- [ ] **Step 3: Write the implementation**

`src/agente/tipos.ts` — acrescentar ao `ErroAgente`, logo depois de `"cota"`:

```ts
  | "creditos" // provedor próprio: créditos do mês esgotados (429 {"codigo":"creditos"})
```

`src/agente/cliente.ts` — em `erroDeStatus`, trocar a linha do 429 por:

```ts
  if (status === 429) {
    // Provedor próprio: créditos do mês esgotados têm mensagem própria (doc 11 §7). Qualquer
    // outro 429 (inclusive o limite por minuto do nosso servidor) é "cota" momentânea.
    const codigo = corpo && typeof corpo === "object" ? (corpo as { codigo?: unknown }).codigo : undefined;
    if (ctx.provedor.exigeConta && codigo === "creditos") return new FalhaAgente("creditos", detalhe);
    return new FalhaAgente("cota", detalhe);
  }
```

e em `textoDoErro`, depois do `case "cota":`:

```ts
    case "creditos":
      return traduzirAgora("agente.erro.creditos");
```

Procurar outros `switch` sobre `ErroAgente` (`grep -rn "\"cota\"" src --include=*.ts --include=*.tsx`)
e tratar `"creditos"` junto de `"cota"` onde o TypeScript acusar.

`src/i18n/catalogo/agente.ts` — no bloco pt-BR, depois de `"agente.erro.cota"`:

```ts
  "agente.erro.creditos": "Seus créditos de IA deste mês acabaram.",
```

e no bloco inglês, na posição equivalente:

```ts
  "agente.erro.creditos": "You are out of AI credits for this month.",
```

Criar `src/servico/saldoCreditos.ts`:

```ts
// src/servico/saldoCreditos.ts
// Busca o saldo de créditos da IA do Excalisidian (doc 18 §5.1, doc 11 §3.2). Qualquer falha
// — sem rede, 401, 403, corpo estranho — devolve null: o medidor fica oculto, porque mostrar
// zero ou um número velho seria mentir sobre dinheiro. O fetch entra por parâmetro para o
// teste (e o teste de contrato do servidor) injetar um dublê.

import { fetch as fetchTauri } from "@tauri-apps/plugin-http";

import { BASE_URL_SERVICO } from "./base";
import type { SaldoCreditos } from "./creditos";

const TIMEOUT_MS = 20_000;

function ehNumero(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export async function buscarSaldoCreditos(
  token: string,
  baseUrl: string = BASE_URL_SERVICO,
  fetchImpl: typeof fetch = fetchTauri as unknown as typeof fetch,
): Promise<SaldoCreditos | null> {
  try {
    // Mesmo cast de ServicoContaHttp: `connectTimeout` é do fetch do Tauri, ausente do
    // RequestInit do DOM; dublês de teste ignoram o campo.
    const res = await fetchImpl(`${baseUrl}/creditos`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      connectTimeout: TIMEOUT_MS,
    } as RequestInit);
    if (res.status !== 200) return null;
    const corpo = (await res.json()) as Record<string, unknown> | null;
    if (!corpo || !ehNumero(corpo.usados) || !ehNumero(corpo.total) || !ehNumero(corpo.renovaEm)) return null;
    return { usados: corpo.usados, total: corpo.total, renovaEm: corpo.renovaEm };
  } catch {
    return null;
  }
}
```

`src/estado/agenteStore.ts`:
- imports: `buscarSaldoCreditos` de `../servico/saldoCreditos`, `type SaldoCreditos` de
  `../servico/creditos`, `tokenDaSessaoAtual` de `../servico/sessao`, `decidirModoServidor`
  de `../servico/modoServidor` (conferir quais já estão importados).
- em `interface AgenteState`, depois de `usoSessao`:

```ts
  /** Saldo da IA do Excalisidian vindo do servidor; null = desconhecido, medidor oculto. */
  saldoCreditos: SaldoCreditos | null;
  /** Busca o saldo no servidor (só provedor próprio, com sessão, fora do modo local de DEV). */
  atualizarSaldo: () => Promise<void>;
```

- no estado inicial, junto de `usoSessao: usoVazio(),`: `saldoCreditos: null,`
- a ação, junto das demais:

```ts
    atualizarSaldo: async () => {
      const cfg = get().config;
      // Mesmo padrão de contaStore: `import.meta.env.DEV` literal para o ramo sumir do build de
      // produção. Com a conta de teste do DEV (servidor local), não há saldo real para buscar.
      const modoLocal =
        import.meta.env.DEV &&
        decidirModoServidor({ dev: import.meta.env.DEV, variavelServidor: import.meta.env.VITE_SERVIDOR }) ===
          "local";
      const token = tokenDaSessaoAtual();
      if (!cfg || !provedorDe(cfg.provedor).exigeConta || modoLocal || !token) {
        set({ saldoCreditos: null });
        return;
      }
      set({ saldoCreditos: await buscarSaldoCreditos(token) });
    },
```

`src/ui/excalisidian/PainelAgente.tsx`:
- trocar `const saldo: SaldoCreditos | null = null;` por
  `const saldo = useAgenteStore((s) => s.saldoCreditos);` e atualizar o comentário acima
  (o endpoint agora existe; o saldo vem do store e fica null quando a busca falha).
- logo depois, ANTES do `if (!habilitado || !aberto) return null;` (hooks não podem ficar
  depois de retorno antecipado):

```tsx
  // Atualiza o saldo ao abrir o painel e depois de cada resposta (o `uso` da sessão muda a cada
  // resposta bem-sucedida) ou erro (créditos esgotados mudam o medidor para "esgotado").
  useEffect(() => {
    if (aberto && usaCreditos) void useAgenteStore.getState().atualizarSaldo();
  }, [aberto, usaCreditos, uso, erroAtual]);
```

- remover o import de `SaldoCreditos` se ficar sem uso (o `tsc` acusa).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → tudo passa (inclusive `cobertura.test.ts` do catálogo).
Run: `npx tsc --noEmit` na raiz → sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/agente/tipos.ts src/agente/cliente.ts src/agente/cliente.test.ts src/i18n/catalogo/agente.ts src/servico/saldoCreditos.ts src/servico/saldoCreditos.test.ts src/estado/agenteStore.ts src/ui/excalisidian/PainelAgente.tsx
git commit -m "feat(agente): creditos esgotados com mensagem propria e medidor com saldo real"
```

(Acrescentar ao `git add` qualquer outro arquivo que o passo do `switch` tenha tocado.)

---

### Task 4: Rotas de IA no servidor

**Files:**
- Modify: `servidor/src/limiteDeTentativas.ts`
- Create: `servidor/src/rotasIa.ts`
- Modify: `servidor/src/rotas.ts`
- Modify: `servidor/src/app.ts`
- Test: `servidor/src/rotasIa.test.ts`

**Interfaces:**
- Consumes: Task 1 (`saldoDaConta`, `debitar`, `ConfigIa`), Task 2 (`chamarFornecedor`,
  `FalhaFornecedor`, `ehModeloLogico`, `tetoDeSaida`, `MensagemIa`), Task 3
  (`buscarSaldoCreditos` no teste de contrato), `exigirSessao`/`exigirPremium`/`criarSessao`
  de `./sessao`.
- Produces: `criarApp(config, opcoes?: { agora?: () => number; fetchFornecedor?: typeof fetch })`;
  `new LimiteDeTentativas(limite?: number)`;
  `registrarRotasIa(app, banco, opcoes: { ia?: ConfigIa; fetchFornecedor: typeof fetch; agora: () => number }): void`.

- [ ] **Step 1: Write the failing test**

```ts
// servidor/src/rotasIa.test.ts
// Rotas da IA (doc 18 §5.1): a ordem das verificações, o débito pelo uso real, nada cobrado
// em falha, formato da resposta que src/agente/cliente.ts lê, e o log sem texto.
//
// Contas e sessões são criadas direto no banco com `criarSessao` (relógio real): o `agora`
// injetado no app só controla preço e período, sem vencer a sessão.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

import { criarApp } from "./app";
import type { Config } from "./config";
import { criarSessao } from "./sessao";
import { fetchPorInject } from "./apoioTestes/fetchPorInject";
import { buscarSaldoCreditos } from "../../src/servico/saldoCreditos";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

const SEGUNDA_12H_UTC = Date.UTC(2026, 8, 28, 12, 0, 0); // fora de pico
const IA = { chave: "sk-secreta-do-fornecedor", url: "https://fornecedor.exemplo", modelo: "modelo-real" };

let pasta: string;
let app: FastifyInstance;
let fornecedor: ReturnType<typeof vi.fn>;

function respostaFornecedor(usage: unknown = { prompt_tokens: 1000, completion_tokens: 100 }) {
  return new Response(
    JSON.stringify({
      id: "x",
      model: "modelo-real",
      choices: [{ message: { role: "assistant", content: "resposta", reasoning_content: "pensei" }, finish_reason: "stop" }],
      usage,
    }),
    { status: 200 },
  );
}

function montar(config: Partial<Config> = {}) {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), "excalisidian-ia-"));
  fornecedor = vi.fn(async () => respostaFornecedor());
  app = criarApp(
    { porta: 0, pastaDados: pasta, ia: IA, ...config },
    { agora: () => SEGUNDA_12H_UTC, fetchFornecedor: fornecedor as unknown as typeof fetch },
  );
}

function criarConta(email: string, plano: "premium" | "gratis" = "premium"): { id: number; token: string } {
  const r = app.banco
    .prepare(`insert into contas (email, sal, hash, plano, criada_em) values (?, x'00', x'00', ?, 0)`)
    .run(email, plano);
  const id = Number(r.lastInsertRowid);
  return { id, token: criarSessao(app.banco, id).token };
}

function pedir(token: string | undefined, corpo: unknown) {
  return app.inject({
    method: "POST",
    url: "/v1/chat/completions",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    payload: JSON.stringify(corpo),
  });
}

const CORPO = { model: "leitura-rapida", messages: [{ role: "user", content: "texto secreto da nota" }] };

beforeEach(() => montar());

afterEach(async () => {
  await app.close();
  fs.rmSync(pasta, { recursive: true, force: true });
});

describe("POST /v1/chat/completions — ordem das verificações", () => {
  it("corpo acima de 256 KiB → 413", async () => {
    const { token } = criarConta("a@x.com");
    const grande = { model: "leitura-rapida", messages: [{ role: "user", content: "a".repeat(300 * 1024) }] };
    expect((await pedir(token, grande)).statusCode).toBe(413);
  });

  it("corpo inválido → 400; stream true → 400", async () => {
    const { token } = criarConta("a@x.com");
    expect((await pedir(token, { model: "leitura-rapida", messages: [] })).statusCode).toBe(400);
    expect((await pedir(token, { model: "leitura-rapida", messages: [{ role: "tool", content: "x" }] })).statusCode).toBe(400);
    expect((await pedir(token, { ...CORPO, stream: true })).statusCode).toBe(400);
  });

  it("sem sessão → 401; conta grátis → 403", async () => {
    expect((await pedir(undefined, CORPO)).statusCode).toBe(401);
    const { token } = criarConta("g@x.com", "gratis");
    expect((await pedir(token, CORPO)).statusCode).toBe(403);
  });

  it("modelo fora dos lógicos → 404, sem chamar o fornecedor", async () => {
    const { token } = criarConta("a@x.com");
    expect((await pedir(token, { ...CORPO, model: "modelo-real" })).statusCode).toBe(404);
    expect(fornecedor).not.toHaveBeenCalled();
  });

  it("mais de 30 pedidos por minuto na conta → 429 limite", async () => {
    const { token } = criarConta("a@x.com");
    for (let i = 0; i < 30; i++) expect((await pedir(token, CORPO)).statusCode).toBe(200);
    const r = await pedir(token, CORPO);
    expect(r.statusCode).toBe(429);
    expect(r.json()).toEqual({ codigo: "limite" });
  });

  it("créditos no total → 429 creditos; um abaixo → passa", async () => {
    const { id, token } = criarConta("a@x.com");
    // 2.999 créditos = 2.999.000 micro-dólares usados no mês.
    app.banco
      .prepare(`insert into uso_ia (conta_id, periodo, custo_micro_usd, pedidos, tokens_entrada, tokens_saida) values (?, '2026-09', 2999000, 1, 0, 0)`)
      .run(id);
    expect((await pedir(token, CORPO)).statusCode).toBe(200);
    app.banco.prepare(`update uso_ia set custo_micro_usd = 3000000 where conta_id = ?`).run(id);
    const r = await pedir(token, CORPO);
    expect(r.statusCode).toBe(429);
    expect(r.json()).toEqual({ codigo: "creditos" });
  });

  it("sem chave do fornecedor → 503", async () => {
    await app.close();
    fs.rmSync(pasta, { recursive: true, force: true });
    montar({ ia: { ...IA, chave: "" } });
    const { token } = criarConta("a@x.com");
    expect((await pedir(token, CORPO)).statusCode).toBe(503);
  });
});

describe("POST /v1/chat/completions — sucesso e falha do fornecedor", () => {
  it("200 no formato do dialeto OpenAI, com o modelo lógico e sem campos do fornecedor", async () => {
    const { token } = criarConta("a@x.com");
    const r = await pedir(token, CORPO);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      object: "chat.completion",
      model: "leitura-rapida",
      choices: [{ index: 0, message: { role: "assistant", content: "resposta" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 },
    });
    expect(r.body).not.toContain("modelo-real");
    expect(r.body).not.toContain("pensei");
  });

  it("repassa só role e content, com o teto de saída pedido", async () => {
    const { token } = criarConta("a@x.com");
    await pedir(token, { ...CORPO, max_completion_tokens: 500, temperature: 2, extra: "x" });
    const corpo = JSON.parse((fornecedor.mock.calls[0][1] as RequestInit).body as string);
    expect(corpo.messages).toEqual([{ role: "user", content: "texto secreto da nota" }]);
    expect(corpo.max_tokens).toBe(500);
    expect(corpo.temperature).toBeUndefined();
    expect(corpo.extra).toBeUndefined();
  });

  it("debita pelo uso real: 1000 entrada + 100 saída fora de pico = 210 µ$ = 1 crédito", async () => {
    const { id, token } = criarConta("a@x.com");
    await pedir(token, CORPO);
    const linha = app.banco.prepare(`select custo_micro_usd as micro, pedidos from uso_ia where conta_id = ?`).get(id);
    expect(linha).toEqual({ micro: 210, pedidos: 1 });
  });

  it("fornecedor falha → 502 e nada é cobrado", async () => {
    const { id, token } = criarConta("a@x.com");
    fornecedor.mockImplementationOnce(async () => new Response("{}", { status: 500 }));
    expect((await pedir(token, CORPO)).statusCode).toBe(502);
    fornecedor.mockImplementationOnce(async () => {
      throw new TypeError("fetch failed");
    });
    expect((await pedir(token, CORPO)).statusCode).toBe(502);
    expect(app.banco.prepare(`select count(*) as n from uso_ia where conta_id = ?`).get(id)).toEqual({ n: 0 });
  });

  it("o log da chamada não traz o texto, o token nem a chave", async () => {
    const { token } = criarConta("a@x.com");
    const espiao = vi.spyOn(console, "log").mockImplementation(() => {});
    await pedir(token, CORPO);
    const tudo = espiao.mock.calls.map((c) => String(c[0])).join("\n");
    espiao.mockRestore();
    expect(tudo).toContain("/v1/chat/completions");
    expect(tudo).not.toContain("texto secreto da nota");
    expect(tudo).not.toContain(token);
    expect(tudo).not.toContain("sk-secreta-do-fornecedor");
  });
});

describe("GET /v1/creditos", () => {
  it("401 sem sessão, 403 conta grátis", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/creditos" })).statusCode).toBe(401);
    const { token } = criarConta("g@x.com", "gratis");
    const r = await app.inject({ method: "GET", url: "/v1/creditos", headers: { authorization: `Bearer ${token}` } });
    expect(r.statusCode).toBe(403);
  });

  it("contrato com o app: buscarSaldoCreditos lê o saldo real depois de um pedido", async () => {
    const { token } = criarConta("a@x.com");
    await pedir(token, CORPO);
    const saldo = await buscarSaldoCreditos(token, "http://localhost/v1", fetchPorInject(app));
    expect(saldo).toEqual({ usados: 1, total: 3000, renovaEm: Date.UTC(2026, 9, 1, 3, 0, 0) });
  });

  it("faixa superior mostra total 10.000", async () => {
    const { id, token } = criarConta("s@x.com");
    app.banco.prepare(`update contas set faixa_ia = 'superior' where id = ?`).run(id);
    const saldo = await buscarSaldoCreditos(token, "http://localhost/v1", fetchPorInject(app));
    expect(saldo?.total).toBe(10_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd servidor && npx vitest run src/rotasIa.test.ts`
Expected: FAIL — `/v1/chat/completions` responde 404 (rota não existe) e `criarApp` não
aceita `fetchFornecedor`.

- [ ] **Step 3: Write the implementation**

`servidor/src/limiteDeTentativas.ts` — o limite passa a vir do construtor, padrão 10 (as rotas
de conta continuam iguais):

```ts
export class LimiteDeTentativas {
  private readonly tentativasPorChave = new Map<string, number[]>();
  private chamadasDesdeALimpeza = 0;

  /** `limite`: tentativas por minuto por chave. Padrão 10 (entrar/criar conta, doc 18 §3); a
   * IA usa 30 por conta (doc 18 §5.1). */
  constructor(private readonly limite: number = LIMITE) {}
```

e em `registrar`, trocar `return dentroDaJanela.length <= LIMITE;` por
`return dentroDaJanela.length <= this.limite;`.

Criar `servidor/src/rotasIa.ts`:

```ts
// servidor/src/rotasIa.ts
// As duas rotas da IA do Excalisidian (doc 18 §5.1), registradas dentro do plugin de
// rotas.ts (prefixo /v1). A ordem das verificações é a do doc: tamanho e formato do corpo
// (Fastify, antes do código da rota), sessão, plano, modelo, limite por minuto, créditos,
// chave do fornecedor, fornecedor. Só se debita depois de uma resposta boa do fornecedor.
//
// O texto das mensagens atravessa esta rota e vai ao fornecedor; nunca é guardado nem logado
// (o log de log.ts só vê método, rota, status e duração).

import type { FastifyInstance } from "fastify";

import type { BancoSqlite } from "./banco";
import type { ConfigIa } from "./config";
import { debitar, saldoDaConta } from "./creditosIa";
import { chamarFornecedor, ehModeloLogico, FalhaFornecedor, tetoDeSaida, type MensagemIa } from "./fornecedorIa";
import { LimiteDeTentativas } from "./limiteDeTentativas";
import { exigirPremium, exigirSessao } from "./sessao";

const LIMITE_CORPO_BYTES = 256 * 1024;
const PEDIDOS_POR_MINUTO = 30;

interface CorpoChat {
  model: string;
  messages: MensagemIa[];
  max_completion_tokens?: number;
  stream?: boolean;
}

// Sem `additionalProperties: false` no topo: campos extras do dialeto OpenAI são aceitos e
// simplesmente ignorados — nunca repassados ao fornecedor.
const SCHEMA_CHAT = {
  type: "object",
  required: ["model", "messages"],
  properties: {
    model: { type: "string", minLength: 1 },
    messages: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["role", "content"],
        properties: {
          role: { type: "string", enum: ["system", "user", "assistant"] },
          content: { type: "string" },
        },
      },
    },
    max_completion_tokens: { type: "integer", minimum: 1 },
    stream: { type: "boolean", const: false },
  },
} as const;

export function registrarRotasIa(
  app: FastifyInstance,
  banco: BancoSqlite,
  opcoes: { ia?: ConfigIa; fetchFornecedor: typeof fetch; agora: () => number },
): void {
  const limite = new LimiteDeTentativas(PEDIDOS_POR_MINUTO);

  app.post<{ Body: CorpoChat }>(
    "/chat/completions",
    {
      bodyLimit: LIMITE_CORPO_BYTES,
      schema: { body: SCHEMA_CHAT },
      preHandler: [exigirSessao, exigirPremium],
    },
    async (request, reply) => {
      const conta = request.conta!;
      const { model, messages, max_completion_tokens } = request.body;

      if (!ehModeloLogico(model)) return reply.code(404).send();
      if (!limite.registrar(`conta:${conta.id}`)) return reply.code(429).send({ codigo: "limite" });

      const saldo = saldoDaConta(banco, conta.id, opcoes.agora());
      if (saldo.usados >= saldo.total) return reply.code(429).send({ codigo: "creditos" });

      if (!opcoes.ia?.chave) return reply.code(503).send();

      let resposta;
      try {
        resposta = await chamarFornecedor({
          ia: opcoes.ia,
          fetchImpl: opcoes.fetchFornecedor,
          mensagens: messages.map((m) => ({ role: m.role, content: m.content })),
          maxTokens: tetoDeSaida(max_completion_tokens),
        });
      } catch (erro) {
        if (erro instanceof FalhaFornecedor) return reply.code(502).send();
        throw erro;
      }

      debitar(banco, conta.id, opcoes.agora(), resposta.uso);

      return reply.code(200).send({
        object: "chat.completion",
        model,
        choices: [
          { index: 0, message: { role: "assistant", content: resposta.texto }, finish_reason: resposta.motivoFim },
        ],
        usage: {
          prompt_tokens: resposta.tokensEntrada,
          completion_tokens: resposta.tokensSaida,
          total_tokens: resposta.tokensEntrada + resposta.tokensSaida,
        },
      });
    },
  );

  app.get("/creditos", { preHandler: [exigirSessao, exigirPremium] }, async (request) =>
    saldoDaConta(banco, request.conta!.id, opcoes.agora()),
  );
}
```

`servidor/src/rotas.ts`:
- import: `import { registrarRotasIa } from "./rotasIa";` e `import type { ConfigIa } from "./config";`
- assinatura de `rotasApi`:
  `opcoes: { pastaDados: string; agora?: () => number; ia?: ConfigIa; fetchFornecedor?: typeof fetch }`
- no fim de `rotasApi`, depois de `registrarRotasSync(app, banco, pastaDados);`:

```ts
  // --- IA do Excalisidian (doc 18 §5) ---------------------------------------------------------
  registrarRotasIa(app, banco, {
    ia: opcoes.ia,
    fetchFornecedor: opcoes.fetchFornecedor ?? fetch,
    agora,
  });
```

`servidor/src/app.ts`:
- assinatura: `export function criarApp(config: Config, opcoes?: { agora?: () => number; fetchFornecedor?: typeof fetch }): FastifyInstance`
- registro:
  `app.register(rotasApi, { prefix: "/v1", pastaDados: config.pastaDados, agora: opcoes?.agora, ia: config.ia, fetchFornecedor: opcoes?.fetchFornecedor });`

> Se o teste do 413 der 400 ou outro código: confira que o `bodyLimit` da rota vale para o
> parser próprio de `application/json` de `app.ts` (ele usa `parseAs: "string"`, e o Fastify
> aplica o `bodyLimit` da rota nesse caso). Não aumente o limite global do app.
>
> Se `buscarSaldoCreditos` não puder ser importado aqui (erro de resolução de
> `@tauri-apps/plugin-http` mesmo com o `vi.mock`), troque os dois testes de contrato por
> `app.inject` em `GET /v1/creditos` conferindo `r.json()` com os mesmos valores esperados, e
> registre isso no relatório.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd servidor && npx vitest run src/rotasIa.test.ts` → PASS.
Depois: `cd servidor && npm test && npx tsc --noEmit` → tudo passa (os testes de conta, com o
limite de 10, continuam verdes).

- [ ] **Step 5: Commit**

```bash
git add servidor/src/limiteDeTentativas.ts servidor/src/rotasIa.ts servidor/src/rotasIa.test.ts servidor/src/rotas.ts servidor/src/app.ts
git commit -m "feat(servidor): rotas da IA com creditos e saldo"
```

---

### Task 5: Administração, implantação e LEIAME

**Files:**
- Modify: `servidor/src/admin.ts`
- Modify: `servidor/src/admin.test.ts`
- Modify: `servidor/implantacao/excalisidian-api.service`
- Create: `servidor/implantacao/excalisidian-configurar-ia`
- Modify: `servidor/implantacao/excalisidian-admin` (só o comentário de uso)
- Modify: `servidor/LEIAME.md`

**Interfaces:**
- Consumes: `saldoDaConta`, `periodoDe`, `COTA_POR_FAIXA`, `type FaixaIa` de `./creditosIa`.
- Produces:
  - `definirPlano(banco, email, plano: "premium" | "gratis", faixa?: FaixaIa): LinhaConta`
    (premium sem faixa → `padrao`; gratis → `padrao`);
  - `LinhaContaComUso` ganha `faixa: string`;
  - `usoDaConta(banco, email, agoraMs): { periodo: string; usados: number; total: number; pedidos: number; tokensEntrada: number; tokensSaida: number; custoUsd: number }`;
  - `executarComando(banco, pastaDados, argumentos, agoraMs = Date.now())` com os comandos
    `superior <email>` e `uso <email>`.

- [ ] **Step 1: Write the failing tests**

Acrescentar em `servidor/src/admin.test.ts` (usando o banco temporário e a criação de conta que
o arquivo já usa — ler o topo do arquivo e seguir o mesmo padrão):

```ts
describe("faixa de IA e uso", () => {
  const AGORA = Date.UTC(2026, 8, 28, 12, 0, 0);

  it("premium põe a faixa padrão; superior põe premium com faixa superior; gratis volta à padrão", async () => {
    // (criar a conta "a@x.com" como os outros testes do arquivo fazem)
    await executarComando(banco, pasta, ["superior", "a@x.com"], AGORA);
    expect(banco.prepare(`select plano, faixa_ia as faixa from contas where email = 'a@x.com'`).get()).toEqual({
      plano: "premium",
      faixa: "superior",
    });
    await executarComando(banco, pasta, ["premium", "a@x.com"], AGORA);
    expect(banco.prepare(`select faixa_ia as faixa from contas where email = 'a@x.com'`).get()).toEqual({ faixa: "padrao" });
    await executarComando(banco, pasta, ["superior", "a@x.com"], AGORA);
    await executarComando(banco, pasta, ["gratis", "a@x.com"], AGORA);
    expect(banco.prepare(`select plano, faixa_ia as faixa from contas where email = 'a@x.com'`).get()).toEqual({
      plano: "gratis",
      faixa: "padrao",
    });
  });

  it("contas mostra a faixa", async () => {
    await executarComando(banco, pasta, ["superior", "a@x.com"], AGORA);
    expect(await executarComando(banco, pasta, ["contas"], AGORA)).toContain("a@x.com\tpremium\tsuperior\t");
  });

  it("uso mostra o mês atual: créditos, pedidos, tokens e custo em US$", async () => {
    const conta = banco.prepare(`select id from contas where email = 'a@x.com'`).get() as { id: number };
    banco
      .prepare(`insert into uso_ia (conta_id, periodo, custo_micro_usd, pedidos, tokens_entrada, tokens_saida) values (?, '2026-09', 1234567, 42, 900000, 80000)`)
      .run(conta.id);
    expect(usoDaConta(banco, "a@x.com", AGORA)).toEqual({
      periodo: "2026-09",
      usados: 1235,
      total: 3000,
      pedidos: 42,
      tokensEntrada: 900000,
      tokensSaida: 80000,
      custoUsd: 1.234567,
    });
    const texto = await executarComando(banco, pasta, ["uso", "a@x.com"], AGORA);
    expect(texto).toContain("2026-09");
    expect(texto).toContain("1235/3000");
    expect(texto).toContain("US$ 1.2346");
  });

  it("uso de conta sem nenhum pedido no mês mostra zeros, não erro", () => {
    expect(usoDaConta(banco, "a@x.com", AGORA)).toMatchObject({ usados: 0, pedidos: 0, custoUsd: 0 });
  });

  it("uso e superior com e-mail inexistente são erro", async () => {
    await expect(executarComando(banco, pasta, ["uso", "ninguem@x.com"], AGORA)).rejects.toThrow("e-mail nao encontrado");
    await expect(executarComando(banco, pasta, ["superior", "ninguem@x.com"], AGORA)).rejects.toThrow("e-mail nao encontrado");
  });
});
```

(Importar `usoDaConta` junto dos outros nomes de `./admin`. Se o arquivo usar outros nomes
para o banco e a pasta temporária, adaptar os nomes, não a lógica. Ajustar também, no mesmo
arquivo, qualquer teste existente de `contas` que compare a linha inteira — ela passa a ter a
coluna da faixa entre o plano e os bytes.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd servidor && npx vitest run src/admin.test.ts`
Expected: FAIL — comando `superior` desconhecido, `usoDaConta` não existe.

- [ ] **Step 3: Write the implementation**

Em `servidor/src/admin.ts`:
- import: `import { COTA_POR_FAIXA, periodoDe, saldoDaConta, type FaixaIa } from "./creditosIa";`
- `definirPlano` ganha a faixa:

```ts
/** `premium`/`superior`/`gratis <email>`: define o plano e a faixa de IA (doc 18 §4, §5.2).
 * `superior` é premium com faixa `superior` (10.000 créditos); premium e grátis ficam na
 * faixa `padrao`. E-mail inexistente é erro (não cria conta). */
export function definirPlano(
  banco: BancoSqlite,
  email: string,
  plano: "premium" | "gratis",
  faixa: FaixaIa = "padrao",
): LinhaConta {
  const conta = buscarContaPorEmail(banco, email);
  if (!conta) {
    throw new Error(`e-mail nao encontrado: ${normalizarEmail(email)}`);
  }
  banco.prepare(`update contas set plano = ?, faixa_ia = ? where id = ?`).run(plano, faixa, conta.id);
  return { ...conta, plano };
}
```

- `LinhaContaComUso` ganha `faixa: string`; `listarContas` seleciona
  `faixa_ia as faixa` e devolve `faixa: linha.faixa`; `formatarTabelaContas` imprime
  `` `${linha.email}\t${linha.plano}\t${linha.faixa}\t${linha.bytesUsados} bytes` `` (a
  interface `LinhaConta` interna do `select` também ganha `faixa?: string`).
- função nova:

```ts
export interface UsoDaConta {
  periodo: string;
  usados: number;
  total: number;
  pedidos: number;
  tokensEntrada: number;
  tokensSaida: number;
  custoUsd: number;
}

/** `uso <email>`: o mês corrente (Brasília) da conta — créditos, pedidos, tokens e o custo
 * real em US$ (para conferir a conta do ADR-43 com uso de verdade). Nunca texto. */
export function usoDaConta(banco: BancoSqlite, email: string, agoraMs: number): UsoDaConta {
  const conta = buscarContaPorEmail(banco, email);
  if (!conta) {
    throw new Error(`e-mail nao encontrado: ${normalizarEmail(email)}`);
  }
  const periodo = periodoDe(agoraMs);
  const linha = banco
    .prepare(
      `select custo_micro_usd as micro, pedidos, tokens_entrada as entrada, tokens_saida as saida
       from uso_ia where conta_id = ? and periodo = ?`,
    )
    .get(conta.id, periodo) as { micro: number; pedidos: number; entrada: number; saida: number } | undefined;
  const saldo = saldoDaConta(banco, conta.id, agoraMs);
  return {
    periodo,
    usados: saldo.usados,
    total: saldo.total,
    pedidos: linha?.pedidos ?? 0,
    tokensEntrada: linha?.entrada ?? 0,
    tokensSaida: linha?.saida ?? 0,
    custoUsd: (linha?.micro ?? 0) / 1_000_000,
  };
}

function formatarUso(email: string, u: UsoDaConta): string {
  return [
    `${normalizarEmail(email)} — ${u.periodo}`,
    `creditos\t${u.usados}/${u.total}`,
    `pedidos\t${u.pedidos}`,
    `tokens\tentrada ${u.tokensEntrada}, saida ${u.tokensSaida}`,
    `custo\tUS$ ${u.custoUsd.toFixed(4)}`,
  ].join("\n");
}
```

(`COTA_POR_FAIXA` só entra no import se for usado; senão, deixar fora — `noUnusedLocals`.)

- `executarComando(banco, pastaDados, argumentos, agoraMs: number = Date.now())`, com os
  casos novos:

```ts
    case "superior": {
      if (!primeiroArgumento) throw new Error("uso: excalisidian-admin superior <email>");
      const conta = definirPlano(banco, primeiroArgumento, "premium", "superior");
      return `${conta.email}: premium (superior, ${COTA_POR_FAIXA.superior} creditos/mes)`;
    }
    case "uso": {
      if (!primeiroArgumento) throw new Error("uso: excalisidian-admin uso <email>");
      return formatarUso(primeiroArgumento, usoDaConta(banco, primeiroArgumento, agoraMs));
    }
```

  o `case "premium"` passa a devolver
  `` `${conta.email}: premium (${COTA_POR_FAIXA.padrao} creditos/mes)` `` (ajustar o teste
  existente que confere essa saída, se houver), e a mensagem do `default` lista
  `<premium|superior|gratis|contas|uso|vaults|apagar-vault>`.
- Atualizar o comentário de topo do arquivo (sete comandos).

`servidor/implantacao/excalisidian-api.service` — na seção `[Service]`, depois das linhas
`Environment=`:

```ini
# Chave do fornecedor da IA (doc 18 §5.3): só neste arquivo, root:root 600, gravado por
# `sudo excalisidian-configurar-ia`. O hífen deixa o serviço subir mesmo sem o arquivo — aí
# só as rotas de IA respondem 503.
EnvironmentFile=-/etc/excalisidian/ia.env
```

e trocar a `Description` para `Excalisidian - servidor de conta, sincronizacao e IA`.

Criar `servidor/implantacao/excalisidian-configurar-ia` (com fim de linha LF — conferir que o
git não converte para CRLF; se o repositório não tiver `.gitattributes` cobrindo
`servidor/implantacao/*`, rodar `git add --chmod=+x` no commit e conferir com
`git ls-files --eol servidor/implantacao/excalisidian-configurar-ia` que está `i/lf`):

```bash
#!/usr/bin/env bash
# servidor/implantacao/excalisidian-configurar-ia
# Grava a chave do fornecedor da IA na VPS (doc 18 §5.3). Quem roda é o dono do produto, numa
# sessão SSH: a chave é pedida sem aparecer na tela, testada com uma chamada mínima ao
# fornecedor, gravada em /etc/excalisidian/ia.env (root, 600) e o serviço é reiniciado. A chave
# nunca vai para a linha de comando (o cabeçalho segue para o curl pela entrada padrão), para
# não aparecer na lista de processos.
#
# Uso: sudo excalisidian-configurar-ia
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
	echo "Rode com sudo: sudo excalisidian-configurar-ia" >&2
	exit 1
fi

URL="${EXCALISIDIAN_IA_URL:-https://api.deepseek.com}"
MODELO="${EXCALISIDIAN_IA_MODELO:-deepseek-flash}"

read -rsp "Cole a chave da IA e aperte Enter (nada aparece na tela): " CHAVE
echo
CHAVE="$(printf '%s' "${CHAVE}" | tr -d '[:space:]')"
if [[ -z "${CHAVE}" ]]; then
	echo "Chave vazia. Nada foi gravado." >&2
	exit 1
fi

echo "Testando a chave com uma pergunta mínima..."
CORPO_PEDIDO="{\"model\":\"${MODELO}\",\"messages\":[{\"role\":\"user\",\"content\":\"Responda apenas: ok\"}],\"max_tokens\":5,\"thinking\":{\"type\":\"disabled\"}}"
SAIDA="$(printf 'Authorization: Bearer %s\n' "${CHAVE}" |
	curl -sS --max-time 60 -H @- -H 'content-type: application/json' \
		-d "${CORPO_PEDIDO}" -w '\n%{http_code}' "${URL}/chat/completions" || true)"
STATUS="${SAIDA##*$'\n'}"
RESPOSTA="${SAIDA%$'\n'*}"
if [[ "${STATUS}" != "200" ]]; then
	echo "O fornecedor recusou a chave (status ${STATUS}). Nada foi gravado." >&2
	exit 1
fi
echo "O fornecedor respondeu. Resposta completa (confira o campo \"usage\"):"
echo "${RESPOSTA}"

install -d -m 700 -o root -g root /etc/excalisidian
umask 077
printf 'EXCALISIDIAN_IA_CHAVE=%s\n' "${CHAVE}" >/etc/excalisidian/ia.env
chmod 600 /etc/excalisidian/ia.env
chown root:root /etc/excalisidian/ia.env
systemctl restart excalisidian-api
echo "Chave gravada e serviço reiniciado."
```

`servidor/implantacao/excalisidian-admin` — no comentário de uso, listar:

```
# Uso: excalisidian-admin premium <email>     (premium, 3.000 creditos de IA por mes)
#      excalisidian-admin superior <email>    (premium, 10.000 creditos de IA por mes)
#      excalisidian-admin gratis <email>
#      excalisidian-admin contas
#      excalisidian-admin uso <email>
#      excalisidian-admin vaults <email>
#      excalisidian-admin apagar-vault <email> <id>
```

`servidor/LEIAME.md` — acrescentar a seção "IA do Excalisidian" (depois da instalação, antes
de "Atualizar", seguindo as convenções do arquivo: `$`, **[muda a VPS]**, "Confere:"):

1. **Pré-requisito (dono do produto):** conta no fornecedor, saldo pré-pago e uma chave de API
   criada no painel dele. Ninguém além do dono do produto vê a chave.
2. **Instalar o serviço atualizado e o script [muda a VPS]:** copiar
   `implantacao/excalisidian-api.service` para `/etc/systemd/system/`, `sudo systemctl
   daemon-reload`; copiar `implantacao/excalisidian-configurar-ia` para `/usr/local/bin/` e
   `sudo chmod 755`; copiar `implantacao/excalisidian-admin` de novo para `/usr/local/bin/`.
   Confere: `systemctl cat excalisidian-api` mostra a linha `EnvironmentFile=-/etc/excalisidian/ia.env`.
3. **Gravar a chave [muda a VPS] — só o dono do produto:** `sudo excalisidian-configurar-ia`.
   Confere: a mensagem final "Chave gravada e serviço reiniciado." e
   `sudo ls -l /etc/excalisidian/ia.env` mostra `-rw------- root root`.
4. **Conferir:** no app (`$env:VITE_SERVIDOR="real"; npm run tauri dev`, conta premium), usar o
   agente com a IA do Excalisidian; depois, na VPS, `excalisidian-admin uso <email>` mostra
   pedidos e créditos. Trocar a chave: rodar o passo 3 de novo. Tirar a chave:
   `sudo rm /etc/excalisidian/ia.env && sudo systemctl restart excalisidian-api` (a IA passa a
   responder 503; conta e sincronização seguem).

Na seção de administração do LEIAME, acrescentar `superior` e `uso` à lista de comandos.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd servidor && npm test && npx tsc --noEmit && npm run empacotar` → tudo passa, e
`dist/servidor.js` e `dist/admin.js` são gerados.

- [ ] **Step 5: Commit**

```bash
git add servidor/src/admin.ts servidor/src/admin.test.ts servidor/implantacao/excalisidian-api.service servidor/implantacao/excalisidian-configurar-ia servidor/implantacao/excalisidian-admin servidor/LEIAME.md
git commit -m "feat(servidor): admin superior e uso, script da chave da IA e LEIAME"
```

(Não commitar `servidor/dist/` se ele não estiver versionado hoje — conferir com
`git status` antes.)

---

### Task 6: Implantação na VPS (orquestrador, com autorização)

Não é tarefa de agente. O orquestrador:

1. Roda `npm test` (raiz) e `cd servidor && npm test && npx tsc --noEmit && npm run empacotar`.
2. Mostra ao dono do produto a lista exata de comandos que mudam a VPS e espera autorização:
   backup manual (`sudo /usr/local/bin/...backup` conforme LEIAME), cópia do pacote, `npm ci
   --omit=dev`, instalação do `.service` novo + `daemon-reload`, cópia de
   `excalisidian-configurar-ia` e `excalisidian-admin`, `systemctl restart excalisidian-api`,
   `curl https://api.excalisidian.com/v1/saude`. Nada toca `hermes-gateway`, `orca-runtime`,
   `xvfb-orca`.
3. Confere que a migração 6 rodou (`excalisidian-admin contas` mostra a faixa) e que
   `POST /v1/chat/completions` sem sessão responde 401 e `GET /v1/creditos` sem sessão 401.
4. Passa ao dono do produto o passo da chave (`sudo excalisidian-configurar-ia`, numa sessão
   SSH dele) e pede a saída do campo `usage` que o script imprime — isso fecha a incerteza 33
   do doc 09 (onde vem o detalhe de cache). Atualizar o doc 09 com o resultado.
5. Roteiro de teste manual para o dono do produto: app com `VITE_SERVIDOR=real`, entrar na
   conta premium, configurar o agente com "IA do Excalisidian", escrever numa nota até o
   agente reagir e mandar uma mensagem no chat; o medidor mostra "N créditos restantes"; na
   VPS, `excalisidian-admin uso <email>` mostra os pedidos. Depois, `excalisidian-admin
   superior <email>`, fechar e reabrir o painel: o total passa a 10.000.
