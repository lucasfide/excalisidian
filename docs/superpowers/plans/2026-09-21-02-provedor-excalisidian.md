# Provedor "IA do Excalisidian" — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fazer a IA do Excalisidian aparecer como mais um provedor no agente que já existe,
autenticada por token de sessão em vez de chave digitada, com saldo em créditos no lugar do
medidor de tokens.

**Architecture:** o servidor da IA fala o dialeto da OpenAI, que `cliente.ts` já implementa
e já envia como `Authorization: Bearer`. Isso reduz o trabalho a quatro coisas: uma entrada
nova no catálogo de provedores, um lugar de onde o token sai, dois modelos fixos em vez da
listagem por HTTP, e um medidor de créditos no lugar do de tokens. Nenhum dialeto novo,
nenhum caminho de rede novo.

**Tech Stack:** TypeScript, `@tauri-apps/plugin-http`, zustand, vitest.

**Spec:** `docs/superpowers/plans/2026-09-21-servicos-online-indice.md` (etapa 06 do
relatório "Excalisidian Premium"), `docs/11-agente-ia.md` §3 e §5.6.

## Global Constraints

- Português do Brasil em nomes de arquivo, componentes, variáveis e comentários.
- Interface em sentence case, sem emoji. Texto novo entra no catálogo do plano 01 —
  nunca literal no JSX.
- Nenhum valor de cor, fonte, espaçamento, raio ou sombra fora dos tokens de
  `src/estilos/globals.css`. Nenhuma classe de cor padrão do Tailwind.
- Testes só de módulos puros — não existe jsdom nem `.test.tsx` no projeto.
- `npm test` roda tudo. Arquivo `.test.ts` ao lado do módulo.
- **O agente continua desligado por padrão** e nenhuma chamada de rede acontece sem aceite
  explícito (`doc 11`, princípios). Este plano não afrouxa isso em nenhum ponto.
- **O modo com chave própria continua gratuito e intacto.** Nenhuma tarefa aqui remove,
  esconde ou degrada os seis provedores existentes.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/servico/base.ts` | A URL do serviço, num lugar só. O domínio ainda não está fechado (pendência do relatório) — trocar aqui troca em todo o app. |
| `src/servico/sessao.ts` | O token de sessão em memória, com leitor e escritor. O plano 03 passa a alimentá-lo; até lá devolve `null` e o provedor simplesmente não autentica. |
| `src/servico/creditos.ts` | Aritmética de saldo: quanto sobrou, em que nível de aviso está, como formatar. Puro. |
| `src/agente/tipos.ts` | Ganha `"excalisidian"` em `ProvedorId`. |
| `src/agente/provedores.ts` | Ganha os campos `exigeConta` e `modelosFixos`, e a entrada nova. |
| `src/agente/cliente.ts` | Ganha a origem alternativa do token no `cabecalhosBase`. |
| `src-tauri/capabilities/main.json` | Ganha o host do serviço no escopo de HTTP. |
| `src/ui/excalisidian/DialogoAgente.tsx` | Passo da chave é pulado quando o provedor exige conta; medidor mostra créditos. |

---

### Task 1: A URL do serviço e o porta-token de sessão

**Files:**
- Create: `src/servico/base.ts`
- Create: `src/servico/sessao.ts`
- Test: `src/servico/sessao.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `BASE_URL_SERVICO: string`, `hostDoServico(): string`,
  `tokenDaSessaoAtual(): string | null`,
  `definirTokenDaSessao(token: string | null): void`.

O porta-token é um módulo com estado, não um store zustand, por um motivo concreto:
`cliente.ts` é chamado de fora de componente React e não pode usar hook. O plano 03 vai
chamar `definirTokenDaSessao` de dentro do `contaStore` a cada login, logout e carga
inicial. Enquanto o plano 03 não existe, o valor é `null` e o provedor novo fica
inutilizável — que é o comportamento correto.

- [ ] **Step 1: Write the failing test**

```ts
// src/servico/sessao.test.ts
import { describe, it, expect, beforeEach } from "vitest";

import { tokenDaSessaoAtual, definirTokenDaSessao } from "./sessao";
import { BASE_URL_SERVICO, hostDoServico } from "./base";

describe("sessão do serviço", () => {
  beforeEach(() => definirTokenDaSessao(null));

  it("começa sem token", () => {
    expect(tokenDaSessaoAtual()).toBeNull();
  });

  it("guarda e devolve o token definido", () => {
    definirTokenDaSessao("abc123");
    expect(tokenDaSessaoAtual()).toBe("abc123");
  });

  it("definir null limpa, que é o que o logout faz", () => {
    definirTokenDaSessao("abc123");
    definirTokenDaSessao(null);
    expect(tokenDaSessaoAtual()).toBeNull();
  });

  it("token vazio ou só espaço conta como ausente", () => {
    definirTokenDaSessao("   ");
    expect(tokenDaSessaoAtual()).toBeNull();
  });
});

describe("base do serviço", () => {
  it("a URL é https e termina sem barra", () => {
    expect(BASE_URL_SERVICO.startsWith("https://")).toBe(true);
    expect(BASE_URL_SERVICO.endsWith("/")).toBe(false);
  });

  it("hostDoServico devolve só o host, para casar com o escopo do capability", () => {
    expect(hostDoServico()).toBe(new URL(BASE_URL_SERVICO).host);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/servico/sessao.test.ts`
Expected: FAIL — "Failed to resolve import ./sessao".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/servico/base.ts
// Endereço do serviço online do Excalisidian, num lugar só.
//
// ATENÇÃO: o domínio ainda NÃO está fechado — é pendência declarada do estudo de
// viabilidade (nome comercial e domínio). Trocar aqui troca em todo o app, mas trocar
// também exige atualizar o escopo de HTTP em src-tauri/capabilities/main.json, senão as
// chamadas morrem com FalhaAgente("escopo").

export const BASE_URL_SERVICO = "https://api.excalisidian.app/v1";

export function hostDoServico(): string {
  return new URL(BASE_URL_SERVICO).host;
}
```

```ts
// src/servico/sessao.ts
// O token de sessão em memória.
//
// Módulo com estado em vez de store zustand porque `cliente.ts` roda fora de componente e
// não pode chamar hook. Quem escreve aqui é o contaStore (plano 03), em todo login,
// logout e carga inicial. Nunca é persistido por este módulo: quem persiste é o contaStore,
// no settings.json.

let token: string | null = null;

export function tokenDaSessaoAtual(): string | null {
  return token;
}

export function definirTokenDaSessao(novo: string | null): void {
  const limpo = novo?.trim();
  token = limpo ? limpo : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/servico/sessao.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 5: Commit**

```bash
git add src/servico/base.ts src/servico/sessao.ts src/servico/sessao.test.ts
git commit -m "feat(servico): base url do servico e porta-token de sessao"
```

---

### Task 2: Créditos

**Files:**
- Create: `src/servico/creditos.ts`
- Test: `src/servico/creditos.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `interface SaldoCreditos { usados: number; total: number; renovaEm: number }`,
  `restantes(s: SaldoCreditos): number`,
  `fracaoUsada(s: SaldoCreditos): number`,
  `nivelDeAviso(s: SaldoCreditos): "ok" | "acabando" | "esgotado"`,
  `formatarCreditos(n: number): string`.

A decisão do relatório é que a cota é contada em créditos, e que a contagem que vale é a do
servidor. Este módulo não conta nada: ele **interpreta** o saldo que o servidor mandou.
Toda a aritmética fica aqui, pura e testada, e o componente só desenha.

- [ ] **Step 1: Write the failing test**

```ts
// src/servico/creditos.test.ts
import { describe, it, expect } from "vitest";

import {
  restantes,
  fracaoUsada,
  nivelDeAviso,
  formatarCreditos,
  type SaldoCreditos,
} from "./creditos";

const saldo = (usados: number, total: number): SaldoCreditos => ({
  usados,
  total,
  renovaEm: 0,
});

describe("restantes", () => {
  it("é o total menos o usado", () => {
    expect(restantes(saldo(300, 2000))).toBe(1700);
  });

  it("nunca é negativo, mesmo se o servidor deixar estourar", () => {
    expect(restantes(saldo(2500, 2000))).toBe(0);
  });
});

describe("fracaoUsada", () => {
  it("é a proporção do total", () => {
    expect(fracaoUsada(saldo(500, 2000))).toBe(0.25);
  });

  it("satura em 1 quando estourou", () => {
    expect(fracaoUsada(saldo(2500, 2000))).toBe(1);
  });

  it("total zero conta como tudo usado, não como divisão por zero", () => {
    expect(fracaoUsada(saldo(0, 0))).toBe(1);
  });
});

describe("nivelDeAviso", () => {
  it("é ok enquanto sobra mais de 10%", () => {
    expect(nivelDeAviso(saldo(0, 2000))).toBe("ok");
    expect(nivelDeAviso(saldo(1799, 2000))).toBe("ok");
  });

  it("vira acabando nos últimos 10%", () => {
    expect(nivelDeAviso(saldo(1800, 2000))).toBe("acabando");
    expect(nivelDeAviso(saldo(1999, 2000))).toBe("acabando");
  });

  it("vira esgotado quando não sobra nada", () => {
    expect(nivelDeAviso(saldo(2000, 2000))).toBe("esgotado");
    expect(nivelDeAviso(saldo(2500, 2000))).toBe("esgotado");
  });
});

describe("formatarCreditos", () => {
  it("usa separador de milhar", () => {
    expect(formatarCreditos(1700)).toBe("1.700");
  });

  it("não inventa casa decimal", () => {
    expect(formatarCreditos(5)).toBe("5");
  });

  it("arredonda para baixo, para nunca prometer crédito que não existe", () => {
    expect(formatarCreditos(1699.9)).toBe("1.699");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/servico/creditos.test.ts`
Expected: FAIL — "Failed to resolve import ./creditos".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/servico/creditos.ts
// Interpretação do saldo de créditos que o servidor manda. Nada aqui CONTA consumo: a
// contagem que vale é a do servidor (decisão do estudo de viabilidade — o medidor local do
// doc 11 §5.6 continua servindo só o modo com chave própria, onde quem paga é o usuário).

export interface SaldoCreditos {
  usados: number;
  total: number;
  /** Epoch em ms da próxima renovação da cota. */
  renovaEm: number;
}

/** Limiar do aviso "acabando": últimos 10% da cota. */
const LIMIAR_ACABANDO = 0.9;

export function restantes(s: SaldoCreditos): number {
  return Math.max(0, s.total - s.usados);
}

export function fracaoUsada(s: SaldoCreditos): number {
  if (s.total <= 0) return 1;
  return Math.min(1, s.usados / s.total);
}

export function nivelDeAviso(s: SaldoCreditos): "ok" | "acabando" | "esgotado" {
  if (restantes(s) <= 0) return "esgotado";
  return fracaoUsada(s) >= LIMIAR_ACABANDO ? "acabando" : "ok";
}

/** Sempre para baixo: arredondar para cima prometeria crédito que o servidor não tem. */
export function formatarCreditos(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(Math.floor(n));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/servico/creditos.test.ts`
Expected: PASS, 11 testes.

> Se `formatarCreditos(1700)` vier `"1 700"` em vez de `"1.700"`, o ambiente não tem o
> locale pt-BR completo. Nesse caso trocar a implementação por
> `Math.floor(n).toLocaleString("pt-BR")` não resolve — usar
> `String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")` e manter o teste como está.

- [ ] **Step 5: Commit**

```bash
git add src/servico/creditos.ts src/servico/creditos.test.ts
git commit -m "feat(servico): aritmetica de saldo de creditos"
```

---

### Task 3: O provedor no catálogo

**Files:**
- Modify: `src/agente/tipos.ts`
- Modify: `src/agente/provedores.ts`
- Modify: `src/agente/provedores.test.ts`
- Modify: `src-tauri/capabilities/main.json`

**Interfaces:**
- Consumes: `BASE_URL_SERVICO` de `../servico/base`.
- Produces: `ProvedorId` com `"excalisidian"`; `ProvedorInfo` com
  `exigeConta: boolean` e `modelosFixos: string[]`;
  `MODELO_LEITURA = "leitura-rapida"` e `MODELO_ACOMPANHAMENTO = "acompanhamento"`.

Os dois modelos são **identificadores lógicos**, não nomes de modelo do fornecedor. É isso
que permite trocar o modelo real por trás sem atualizar o aplicativo — a proteção contra o
risco "fornecedor de IA muda preço ou sai do ar" do estudo de viabilidade. O nome do
fornecedor não aparece em lugar nenhum da interface.

`modelosFixos` existe porque o assistente do `doc 11 §3` lista modelos chamando
`GET {base}/models`. Nosso serviço não expõe catálogo: são dois modelos, sempre os mesmos.

- [ ] **Step 1: Write the failing test**

Acrescentar em `src/agente/provedores.test.ts`:

```ts
  it("o catálogo tem os seis provedores originais mais o do Excalisidian", () => {
    const ids = PROVEDORES.map((p) => p.id);
    expect(new Set(ids)).toEqual(
      new Set<ProvedorId>([
        "openai",
        "anthropic",
        "gemini",
        "openrouter",
        "alibaba",
        "ollama",
        "excalisidian",
      ]),
    );
  });

  it("só o provedor do Excalisidian exige conta", () => {
    const comConta = PROVEDORES.filter((p) => p.exigeConta).map((p) => p.id);
    expect(comConta).toEqual(["excalisidian"]);
  });

  it("o provedor do Excalisidian não pede chave digitada", () => {
    expect(provedorDe("excalisidian").precisaChave).toBe(false);
  });

  it("o provedor do Excalisidian fala o dialeto da OpenAI, sem código de transporte novo", () => {
    expect(provedorDe("excalisidian").dialecto).toBe("openai");
  });

  it("o provedor do Excalisidian traz os dois modelos lógicos e não lista por HTTP", () => {
    expect(provedorDe("excalisidian").modelosFixos).toEqual([
      MODELO_LEITURA,
      MODELO_ACOMPANHAMENTO,
    ]);
  });

  it("nenhum outro provedor tem modelos fixos", () => {
    const comFixos = PROVEDORES.filter((p) => p.modelosFixos.length > 0).map((p) => p.id);
    expect(comFixos).toEqual(["excalisidian"]);
  });

  it("a descrição do provedor não cita o fornecedor do modelo", () => {
    const texto = `${provedorDe("excalisidian").nome} ${provedorDe("excalisidian").descricao}`;
    expect(texto.toLowerCase()).not.toMatch(/deepseek|openai|anthropic|gemini/);
  });
```

Acrescentar `MODELO_LEITURA` e `MODELO_ACOMPANHAMENTO` ao import de `./provedores` no topo
do arquivo de teste.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/agente/provedores.test.ts`
Expected: FAIL — o primeiro teste já quebra, porque o catálogo tem seis entradas.

- [ ] **Step 3: Write minimal implementation**

Em `src/agente/tipos.ts`, acrescentar o id à união:

```ts
export type ProvedorId =
  | "anthropic"
  | "openai"
  | "gemini"
  | "openrouter"
  | "alibaba"
  | "ollama"
  | "excalisidian";
```

Em `src/agente/provedores.ts`, importar a base e declarar os modelos lógicos:

```ts
import { BASE_URL_SERVICO } from "../servico/base";

/** Identificadores LÓGICOS, não nomes de modelo do fornecedor. O servidor decide qual
 * modelo real atende cada um — é o que permite trocar de fornecedor sem atualizar o app. */
export const MODELO_LEITURA = "leitura-rapida";
export const MODELO_ACOMPANHAMENTO = "acompanhamento";
```

Acrescentar dois campos à interface `ProvedorInfo`:

```ts
  /** Autentica por sessão da conta, não por chave digitada. Só o provedor próprio. */
  exigeConta: boolean;
  /** Catálogo fixo de modelos; vazio significa listar por HTTP como o doc 11 §3 manda. */
  modelosFixos: string[];
```

Acrescentar `exigeConta: false` e `modelosFixos: []` **às seis entradas existentes** (o
TypeScript vai apontar cada uma), e a entrada nova, em primeiro lugar no array para
aparecer primeiro no assistente:

```ts
  {
    id: "excalisidian",
    nome: "IA do Excalisidian",
    descricao: "Incluída no plano premium. Sem chave, sem conta em outro serviço.",
    dialecto: "openai",
    baseUrlPadrao: BASE_URL_SERVICO,
    precisaChave: false,
    exigeConta: true,
    modelosFixos: [MODELO_LEITURA, MODELO_ACOMPANHAMENTO],
    suportaWebSearch: false,
    paginaDeChave: "",
    sugeridosGateiro: [MODELO_LEITURA],
    sugeridosAssistente: [MODELO_ACOMPANHAMENTO],
    precos: {},
  },
```

Em `src-tauri/capabilities/main.json`, acrescentar o host ao escopo de `http:default`,
junto dos que já estão lá:

```json
        { "url": "https://api.excalisidian.app/*" },
```

> Sem essa linha, toda chamada ao provedor novo morre em `FalhaAgente("escopo")` —
> `cliente.ts` já trata e a mensagem aponta o campo "Avançado", o que seria confuso aqui.
> Se o domínio mudar em `src/servico/base.ts`, esta linha muda junto.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/agente/provedores.test.ts`
Expected: PASS, incluindo os 7 novos.

Depois: `npm test` inteiro. Qualquer teste que faça `switch` exaustivo sobre `ProvedorId`
vai acusar o caso faltando — corrigir cada um tratando `excalisidian` igual aos de dialeto
`openai`.

- [ ] **Step 5: Commit**

```bash
git add src/agente/tipos.ts src/agente/provedores.ts src/agente/provedores.test.ts src-tauri/capabilities/main.json
git commit -m "feat(agente): provedor IA do Excalisidian no catalogo"
```

---

### Task 4: Autenticação por sessão no transporte

**Files:**
- Modify: `src/agente/cliente.ts`
- Modify: `src/agente/cliente.test.ts`

**Interfaces:**
- Consumes: `tokenDaSessaoAtual` de `../servico/sessao`; `ProvedorInfo`.
- Produces: `cabecalhosBase` passa a resolver o token por conta própria quando
  `provedor.exigeConta`; nova `FalhaAgente("sessao")` quando não há token.

O dialeto `openai` já monta `Authorization: Bearer ${chave}`. A única mudança é **de onde a
chave vem**: do `ctx.chave` digitado, ou da sessão. Nenhuma linha de rede muda.

Falta de token não pode virar erro de rede nem chamada anônima: vira um código próprio, para
a interface poder dizer "entre na sua conta" em vez de "a chave foi recusada".

- [ ] **Step 1: Write the failing test**

Acrescentar em `src/agente/cliente.test.ts`:

```ts
import { definirTokenDaSessao } from "../servico/sessao";
// ...

describe("autenticação por sessão", () => {
  afterEach(() => definirTokenDaSessao(null));

  it("provedor que exige conta usa o token da sessão como Bearer", () => {
    definirTokenDaSessao("tok-abc");
    const cabecalhos = cabecalhosBase({
      provedor: provedorDe("excalisidian"),
      baseUrl: BASE_URL_SERVICO,
      modelo: MODELO_LEITURA,
      thinking: "padrao",
    });
    expect(cabecalhos.Authorization).toBe("Bearer tok-abc");
  });

  it("provedor que exige conta ignora chave digitada, se alguém puser uma", () => {
    definirTokenDaSessao("tok-abc");
    const cabecalhos = cabecalhosBase({
      provedor: provedorDe("excalisidian"),
      chave: "sk-nao-deveria-ser-usada",
      baseUrl: BASE_URL_SERVICO,
      modelo: MODELO_LEITURA,
      thinking: "padrao",
    });
    expect(cabecalhos.Authorization).toBe("Bearer tok-abc");
  });

  it("sem sessão, falha com código próprio em vez de chamar sem autenticação", () => {
    expect(() =>
      cabecalhosBase({
        provedor: provedorDe("excalisidian"),
        baseUrl: BASE_URL_SERVICO,
        modelo: MODELO_LEITURA,
        thinking: "padrao",
      }),
    ).toThrow(expect.objectContaining({ codigo: "sessao" }));
  });

  it("provedor de chave própria continua usando a chave digitada", () => {
    definirTokenDaSessao("tok-abc");
    const cabecalhos = cabecalhosBase({
      provedor: provedorDe("openai"),
      chave: "sk-minha",
      baseUrl: "https://api.openai.com/v1",
      modelo: "gpt-5.4-mini",
      thinking: "padrao",
    });
    expect(cabecalhos.Authorization).toBe("Bearer sk-minha");
  });
});
```

Isso exige que `cabecalhosBase` seja exportado. Trocar `function cabecalhosBase` por
`export function cabecalhosBase` em `cliente.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/agente/cliente.test.ts`
Expected: FAIL — `cabecalhosBase` não é exportado, e o código `"sessao"` não existe.

- [ ] **Step 3: Write minimal implementation**

Em `src/agente/tipos.ts`, acrescentar o código ao `ErroAgente`:

```ts
export type ErroAgente =
  | "chave" // 401/403
  | "sessao" // provedor exige conta e não há sessão ativa
  | "cota" // 429
  | "modelo" // 404
  | "rede" // exceção de conexão
  | "escopo" // base URL fora do escopo permitido pelo capability
  | "resposta" // corpo inesperado
  | "provedor"; // qualquer outro status
```

Em `src/agente/cliente.ts`:

```ts
import { tokenDaSessaoAtual } from "../servico/sessao";

/** A credencial da chamada: chave digitada, ou token da sessão quando o provedor é o
 * nosso. Falta de sessão para aqui — chamar sem autenticação daria 401 e a interface
 * diria "chave recusada", que é a mensagem errada. */
function credencial(ctx: ContextoChamada): string | undefined {
  if (!ctx.provedor.exigeConta) return ctx.chave;
  const token = tokenDaSessaoAtual();
  if (!token) throw new FalhaAgente("sessao", "sem sessão ativa");
  return token;
}

export function cabecalhosBase(ctx: ContextoChamada): Record<string, string> {
  const cabecalhos: Record<string, string> = { "content-type": "application/json" };
  const chave = credencial(ctx);
  switch (ctx.provedor.dialecto) {
    case "openai":
      if (chave) cabecalhos.Authorization = `Bearer ${chave}`;
      break;
    case "anthropic":
      cabecalhos["x-api-key"] = chave ?? "";
      cabecalhos["anthropic-version"] = "2023-06-01";
      break;
    case "gemini":
      // chave vai na query; nada aqui.
      break;
  }
  return cabecalhos;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS. Se algum `switch` sobre `ErroAgente` reclamar do caso `"sessao"` faltando,
tratar junto com `"chave"` por enquanto — a mensagem própria entra na Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/agente/tipos.ts src/agente/cliente.ts src/agente/cliente.test.ts
git commit -m "feat(agente): autenticacao por sessao no transporte do provedor proprio"
```

---

### Task 5: O assistente e o medidor

**Files:**
- Modify: `src/ui/excalisidian/DialogoAgente.tsx`
- Modify: `src/ui/excalisidian/PainelAgente.tsx`
- Modify: `src/i18n/catalogo.ts`

**Interfaces:**
- Consumes: `provedorDe`, `MODELO_LEITURA`, `MODELO_ACOMPANHAMENTO`, `nivelDeAviso`,
  `formatarCreditos`, `restantes`, `useTexto`.
- Produces: nada consumido por outra tarefa.

Sem teste automatizado — é interface, e o projeto não testa componente. A aritmética que
importa já está coberta na Task 2.

- [ ] **Step 1: Acrescentar os textos ao catálogo**

Em `src/i18n/catalogo.ts`, em `PT_BR` e a tradução correspondente em `EN`:

```ts
  "agente.erro.sessao": "Entre na sua conta do Excalisidian para usar a IA incluída no plano.",
  "agente.creditos.restantes": "{restantes} créditos restantes",
  "agente.creditos.acabando": "Seus créditos estão acabando.",
  "agente.creditos.esgotado": "Seus créditos deste mês acabaram. A cota renova em {data}.",
  "agente.passo.conta": "Conta",
  "agente.passo.contaExplicacao":
    "A IA do Excalisidian usa a sua conta. Não é preciso chave de API.",
```

Traduções:

```ts
  "agente.erro.sessao": "Sign in to your Excalisidian account to use the AI included in your plan.",
  "agente.creditos.restantes": "{restantes} credits left",
  "agente.creditos.acabando": "You are running low on credits.",
  "agente.creditos.esgotado": "You are out of credits for this month. Your quota renews on {data}.",
  "agente.passo.conta": "Account",
  "agente.passo.contaExplicacao":
    "Excalisidian AI uses your account. No API key needed.",
```

- [ ] **Step 2: Ajustar o assistente de configuração**

Em `DialogoAgente.tsx`, o assistente tem cinco passos (`doc 11 §6.3`). Duas mudanças,
ambas condicionadas a `provedorDe(provedorEscolhido).exigeConta`:

1. **Passo 2 (chave):** quando o provedor exige conta, o passo continua aparecendo no
   indicador de etapas, mas sem o campo de chave — exatamente como o Ollama já faz hoje.
   Em vez do campo, o texto `t("agente.passo.contaExplicacao")`, e o rótulo do passo passa
   a ser `t("agente.passo.conta")`. Se não houver sessão ativa, o botão "Continuar" fica
   desabilitado e aparece `t("agente.erro.sessao")`.
2. **Passos 3 e 4 (modelos):** quando `modelosFixos` não está vazio, **não chamar**
   `GET {base}/models`. Preencher a lista com `modelosFixos` e não mostrar o campo
   "Outro modelo…" — o usuário não pode digitar um modelo que o nosso serviço não conhece.

Reaproveitar os componentes de lista e cartão que o arquivo já tem. Não criar estilo novo.

- [ ] **Step 3: Ajustar o medidor**

Em `PainelAgente.tsx`, o medidor de uso do `doc 11 §5.6` mostra tokens. Quando o provedor
ativo tem `exigeConta`, mostrar créditos no lugar:

```tsx
// texto: t("agente.creditos.restantes", { restantes: formatarCreditos(restantes(saldo)) })
// nivelDeAviso(saldo) === "acabando"  → linha com t("agente.creditos.acabando")
// nivelDeAviso(saldo) === "esgotado"  → linha com t("agente.creditos.esgotado", { data })
```

Cores dos níveis saem dos tokens do design system: `--color-ocre` para "acabando",
`--color-bordo` para "esgotado". Nenhum hex literal.

O saldo vem do servidor. Enquanto o endpoint não existe, manter `saldo` como `null` e não
renderizar o medidor de créditos — nunca exibir número inventado.

- [ ] **Step 4: Mensagem do erro de sessão**

Onde `PainelAgente.tsx` traduz `ErroAgente` em texto (§7 do `doc 11`), acrescentar o caso
`"sessao"` com `t("agente.erro.sessao")`.

- [ ] **Step 5: Verificar no app**

Conferir se já existe um `npm run tauri dev` na porta 1420. Abrir o assistente do agente:
o cartão "IA do Excalisidian" deve aparecer em primeiro lugar; escolhê-lo deve levar a um
passo de conta sem campo de chave, com o aviso de entrar na conta; os passos de modelo
devem listar os dois modelos lógicos sem chamar a rede. Conferir que os seis provedores
antigos continuam funcionando exatamente como antes.

- [ ] **Step 6: Commit**

```bash
git add src/ui/excalisidian/DialogoAgente.tsx src/ui/excalisidian/PainelAgente.tsx src/i18n/catalogo.ts
git commit -m "feat(agente): assistente sem chave e medidor de creditos para o provedor proprio"
```

---

## Fora deste plano

- O endpoint de saldo (`GET /creditos`) e o servidor que atende `/chat/completions`. Este
  plano deixa o app pronto para consumi-los.
- A troca do modelo real por trás dos identificadores lógicos: é decisão de servidor.
- Cobrança e upgrade de plano — plano 03.
