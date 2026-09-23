# Conta e sessão — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dar ao app uma conta opcional — entrar, sair, saber qual é o plano e manter a
sessão entre execuções — sem que nada disso atrapalhe quem nunca vai criar conta.

**Architecture:** a fronteira com o servidor é a interface `ServicoConta`, com duas
implementações: uma falsa em memória, que é a que os testes usam, e uma HTTP, que é a que o
app usa. O `contaStore` guarda o estado, persiste só o token no `settings.json` e avisa o
porta-token do plano 02 a cada mudança. Nenhum componente conversa com a rede.

**Tech Stack:** TypeScript, zustand, `@tauri-apps/plugin-store`, `@tauri-apps/plugin-http`,
vitest.

**Spec:** `docs/superpowers/plans/2026-09-21-servicos-online-indice.md` (etapa 05 do
relatório "Excalisidian Premium").

## Global Constraints

- Português do Brasil em nomes de arquivo, componentes, variáveis e comentários.
- Interface em sentence case, sem emoji. Texto novo entra no catálogo do plano 01.
- Nenhum valor de cor, fonte, espaçamento, raio ou sombra fora dos tokens de
  `src/estilos/globals.css`. Nenhuma classe de cor padrão do Tailwind.
- Testes só de módulos puros — não existe jsdom nem `.test.tsx` no projeto.
- **O app funciona inteiro sem conta.** Nenhuma tela bloqueia, nenhum aviso recorrente,
  nenhuma tela de login na abertura. Quem nunca criar conta não deve notar diferença.
- **A senha nunca é persistida em disco.** Só o token.
- Depende do plano 01 (`useTexto`, catálogo) e do plano 02 (`definirTokenDaSessao`,
  `BASE_URL_SERVICO`).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/conta/tipos.ts` | `Sessao`, `PlanoAssinatura`, `ErroConta`, `FalhaConta`. Folha de dependências. |
| `src/conta/ServicoConta.ts` | A interface. Quatro métodos, nada mais. |
| `src/conta/ServicoContaFake.ts` | Implementação em memória, para teste e para desenvolver sem servidor. |
| `src/conta/ServicoContaHttp.ts` | Implementação real sobre `plugin-http`. |
| `src/conta/codigoDeRecuperacao.ts` | Geração e formatação do código que o usuário guarda. Puro. |
| `src/estado/contaStore.ts` | Estado, persistência do token e ligação com o porta-token. |
| `src/ui/excalisidian/DialogoPreferencias.tsx` | A seção "Conta". |

---

### Task 1: Tipos, interface e implementação falsa

**Files:**
- Create: `src/conta/tipos.ts`
- Create: `src/conta/ServicoConta.ts`
- Create: `src/conta/ServicoContaFake.ts`
- Test: `src/conta/ServicoContaFake.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  type PlanoAssinatura = "gratis" | "premium";
  interface Sessao { token: string; email: string; plano: PlanoAssinatura; expiraEm: number }
  type ErroConta = "credenciais" | "emailEmUso" | "rede" | "servidor" | "expirada";
  class FalhaConta extends Error { readonly codigo: ErroConta }
  interface ServicoConta {
    entrar(email: string, senha: string): Promise<Sessao>;
    criar(email: string, senha: string): Promise<Sessao>;
    renovar(token: string): Promise<Sessao>;
    sair(token: string): Promise<void>;
  }
  class ServicoContaFake implements ServicoConta {
    constructor(contas?: Record<string, { senha: string; plano: PlanoAssinatura }>);
  }
  ```

`FalhaConta` copia a forma de `FalhaAgente`, que já existe em `src/agente/tipos.ts` — mesmo
padrão de código normalizado, mesma razão: a mensagem de interface é montada por quem
mostra, não por quem lança.

- [ ] **Step 1: Write the failing test**

```ts
// src/conta/ServicoContaFake.test.ts
import { describe, it, expect } from "vitest";

import { ServicoContaFake } from "./ServicoContaFake";
import { FalhaConta } from "./tipos";

const fake = () =>
  new ServicoContaFake({ "ana@exemplo.com": { senha: "segredo123", plano: "premium" } });

describe("ServicoContaFake", () => {
  it("entrar com credenciais certas devolve sessão com o plano da conta", async () => {
    const s = await fake().entrar("ana@exemplo.com", "segredo123");
    expect(s.email).toBe("ana@exemplo.com");
    expect(s.plano).toBe("premium");
    expect(s.token).toBeTruthy();
    expect(s.expiraEm).toBeGreaterThan(Date.now());
  });

  it("entrar com senha errada falha com código de credenciais", async () => {
    await expect(fake().entrar("ana@exemplo.com", "errada")).rejects.toThrow(
      expect.objectContaining({ codigo: "credenciais" }),
    );
  });

  it("entrar com email desconhecido dá o mesmo erro, para não revelar quem tem conta", async () => {
    await expect(fake().entrar("ninguem@exemplo.com", "qualquer")).rejects.toThrow(
      expect.objectContaining({ codigo: "credenciais" }),
    );
  });

  it("email é comparado sem diferenciar maiúscula", async () => {
    const s = await fake().entrar("ANA@Exemplo.com", "segredo123");
    expect(s.email).toBe("ana@exemplo.com");
  });

  it("criar conta nova devolve sessão no plano grátis", async () => {
    const s = await fake().criar("nova@exemplo.com", "outrasenha");
    expect(s.plano).toBe("gratis");
  });

  it("criar conta com email já usado falha", async () => {
    await expect(fake().criar("ana@exemplo.com", "outrasenha")).rejects.toThrow(
      expect.objectContaining({ codigo: "emailEmUso" }),
    );
  });

  it("renovar token válido devolve sessão nova com validade esticada", async () => {
    const servico = fake();
    const antiga = await servico.entrar("ana@exemplo.com", "segredo123");
    const nova = await servico.renovar(antiga.token);
    expect(nova.email).toBe("ana@exemplo.com");
    expect(nova.expiraEm).toBeGreaterThanOrEqual(antiga.expiraEm);
  });

  it("renovar token desconhecido falha como sessão expirada", async () => {
    await expect(fake().renovar("tok-invalido")).rejects.toThrow(
      expect.objectContaining({ codigo: "expirada" }),
    );
  });

  it("sair invalida o token", async () => {
    const servico = fake();
    const s = await servico.entrar("ana@exemplo.com", "segredo123");
    await servico.sair(s.token);
    await expect(servico.renovar(s.token)).rejects.toThrow(
      expect.objectContaining({ codigo: "expirada" }),
    );
  });

  it("sair com token já inválido não explode", async () => {
    await expect(fake().sair("tok-invalido")).resolves.toBeUndefined();
  });

  it("FalhaConta é Error e carrega o código", () => {
    const e = new FalhaConta("rede");
    expect(e).toBeInstanceOf(Error);
    expect(e.codigo).toBe("rede");
    expect(e.name).toBe("FalhaConta");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/conta/ServicoContaFake.test.ts`
Expected: FAIL — "Failed to resolve import ./ServicoContaFake".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/conta/tipos.ts
// Tipos da conta. Sem import: folha de dependências, igual src/agente/tipos.ts.

export type PlanoAssinatura = "gratis" | "premium";

export interface Sessao {
  token: string;
  email: string;
  plano: PlanoAssinatura;
  /** Epoch em ms. Passou disso, `renovar` é obrigatório antes de usar. */
  expiraEm: number;
}

export type ErroConta =
  | "credenciais" // email ou senha não conferem
  | "emailEmUso" // criação com email já cadastrado
  | "rede" // não deu para falar com o servidor
  | "servidor" // o servidor respondeu erro inesperado
  | "expirada"; // token não vale mais

/** Mesmo padrão de `FalhaAgente`: código normalizado aqui, texto da interface em quem mostra. */
export class FalhaConta extends Error {
  constructor(
    public readonly codigo: ErroConta,
    message?: string,
  ) {
    super(message ?? codigo);
    this.name = "FalhaConta";
  }
}
```

```ts
// src/conta/ServicoConta.ts
// A fronteira com o servidor de conta. Quatro métodos e nada mais: tudo que o app precisa
// saber sobre autenticação cabe aqui. Duas implementações — Fake (memória) e Http (real).

import type { Sessao } from "./tipos";

export interface ServicoConta {
  entrar(email: string, senha: string): Promise<Sessao>;
  criar(email: string, senha: string): Promise<Sessao>;
  /** Troca um token ainda válido por outro com validade esticada. */
  renovar(token: string): Promise<Sessao>;
  /** Invalida o token no servidor. Token já inválido não é erro. */
  sair(token: string): Promise<void>;
}
```

```ts
// src/conta/ServicoContaFake.ts
// Conta em memória: é o que os testes usam e o que roda enquanto o servidor não existe.
// Nada aqui é seguro nem pretende ser — senha em texto puro, token sequencial. O ponto é
// exercitar todo o caminho de estado e de interface sem rede.

import type { ServicoConta } from "./ServicoConta";
import { FalhaConta, type PlanoAssinatura, type Sessao } from "./tipos";

const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

interface ContaGuardada {
  senha: string;
  plano: PlanoAssinatura;
}

const normalizar = (email: string) => email.trim().toLowerCase();

export class ServicoContaFake implements ServicoConta {
  private contas: Map<string, ContaGuardada>;
  private sessoes = new Map<string, string>(); // token → email
  private proximo = 1;

  constructor(contas: Record<string, ContaGuardada> = {}) {
    this.contas = new Map(
      Object.entries(contas).map(([email, dados]) => [normalizar(email), dados]),
    );
  }

  private abrirSessao(email: string): Sessao {
    const conta = this.contas.get(email);
    if (!conta) throw new FalhaConta("credenciais");
    const token = `tok-fake-${this.proximo++}`;
    this.sessoes.set(token, email);
    return { token, email, plano: conta.plano, expiraEm: Date.now() + DURACAO_SESSAO_MS };
  }

  async entrar(email: string, senha: string): Promise<Sessao> {
    const chave = normalizar(email);
    const conta = this.contas.get(chave);
    // Email inexistente e senha errada dão o MESMO erro de propósito: responder coisas
    // diferentes conta a um estranho quem tem conta aqui.
    if (!conta || conta.senha !== senha) throw new FalhaConta("credenciais");
    return this.abrirSessao(chave);
  }

  async criar(email: string, senha: string): Promise<Sessao> {
    const chave = normalizar(email);
    if (this.contas.has(chave)) throw new FalhaConta("emailEmUso");
    this.contas.set(chave, { senha, plano: "gratis" });
    return this.abrirSessao(chave);
  }

  async renovar(token: string): Promise<Sessao> {
    const email = this.sessoes.get(token);
    if (!email) throw new FalhaConta("expirada");
    this.sessoes.delete(token);
    return this.abrirSessao(email);
  }

  async sair(token: string): Promise<void> {
    this.sessoes.delete(token);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/conta/ServicoContaFake.test.ts`
Expected: PASS, 11 testes.

- [ ] **Step 5: Commit**

```bash
git add src/conta/tipos.ts src/conta/ServicoConta.ts src/conta/ServicoContaFake.ts src/conta/ServicoContaFake.test.ts
git commit -m "feat(conta): interface ServicoConta e implementacao em memoria"
```

---

### Task 2: A implementação HTTP

**Files:**
- Create: `src/conta/ServicoContaHttp.ts`
- Test: `src/conta/ServicoContaHttp.test.ts`

**Interfaces:**
- Consumes: `ServicoConta`, `FalhaConta`, `Sessao`, `BASE_URL_SERVICO`.
- Produces: `class ServicoContaHttp implements ServicoConta`, com
  `constructor(baseUrl?: string, fetchImpl?: typeof fetch)`.

O `fetch` entra pelo construtor para o teste poder injetar um dublê. O padrão vem de
`@tauri-apps/plugin-http` — o mesmo que `cliente.ts` usa, e pela mesma razão: a chamada sai
do Rust, sem CORS e sem a credencial passar pelo WebView.

Mapa de status para código, fixo: `401` → `credenciais` em `entrar`/`criar` e `expirada`
em `renovar`; `409` → `emailEmUso`; exceção de rede → `rede`; qualquer outro → `servidor`.

- [ ] **Step 1: Write the failing test**

```ts
// src/conta/ServicoContaHttp.test.ts
import { describe, it, expect, vi } from "vitest";

import { ServicoContaHttp } from "./ServicoContaHttp";

const BASE = "https://api.exemplo.test/v1";

const resposta = (status: number, corpo: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => corpo }) as Response;

const sessaoValida = {
  token: "tok-1",
  email: "ana@exemplo.com",
  plano: "premium",
  expiraEm: Date.now() + 1000,
};

describe("ServicoContaHttp", () => {
  it("entrar manda email e senha no corpo e devolve a sessão do servidor", async () => {
    const falso = vi.fn(async () => resposta(200, sessaoValida));
    const servico = new ServicoContaHttp(BASE, falso as unknown as typeof fetch);

    const s = await servico.entrar("ana@exemplo.com", "segredo123");

    expect(s.token).toBe("tok-1");
    expect(s.plano).toBe("premium");
    const [url, init] = falso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/sessoes`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "ana@exemplo.com",
      senha: "segredo123",
    });
  });

  it("401 em entrar vira credenciais", async () => {
    const falso = vi.fn(async () => resposta(401, {}));
    const servico = new ServicoContaHttp(BASE, falso as unknown as typeof fetch);
    await expect(servico.entrar("a@b.c", "x")).rejects.toThrow(
      expect.objectContaining({ codigo: "credenciais" }),
    );
  });

  it("409 em criar vira emailEmUso", async () => {
    const falso = vi.fn(async () => resposta(409, {}));
    const servico = new ServicoContaHttp(BASE, falso as unknown as typeof fetch);
    await expect(servico.criar("a@b.c", "x")).rejects.toThrow(
      expect.objectContaining({ codigo: "emailEmUso" }),
    );
  });

  it("401 em renovar vira expirada, não credenciais", async () => {
    const falso = vi.fn(async () => resposta(401, {}));
    const servico = new ServicoContaHttp(BASE, falso as unknown as typeof fetch);
    await expect(servico.renovar("tok-velho")).rejects.toThrow(
      expect.objectContaining({ codigo: "expirada" }),
    );
  });

  it("renovar manda o token no Authorization", async () => {
    const falso = vi.fn(async () => resposta(200, sessaoValida));
    const servico = new ServicoContaHttp(BASE, falso as unknown as typeof fetch);
    await servico.renovar("tok-velho");
    const [, init] = falso.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-velho");
  });

  it("exceção de rede vira rede", async () => {
    const falso = vi.fn(async () => {
      throw new Error("connection refused");
    });
    const servico = new ServicoContaHttp(BASE, falso as unknown as typeof fetch);
    await expect(servico.entrar("a@b.c", "x")).rejects.toThrow(
      expect.objectContaining({ codigo: "rede" }),
    );
  });

  it("500 vira servidor", async () => {
    const falso = vi.fn(async () => resposta(500, {}));
    const servico = new ServicoContaHttp(BASE, falso as unknown as typeof fetch);
    await expect(servico.entrar("a@b.c", "x")).rejects.toThrow(
      expect.objectContaining({ codigo: "servidor" }),
    );
  });

  it("corpo sem token vira servidor, não sessão quebrada", async () => {
    const falso = vi.fn(async () => resposta(200, { email: "a@b.c" }));
    const servico = new ServicoContaHttp(BASE, falso as unknown as typeof fetch);
    await expect(servico.entrar("a@b.c", "x")).rejects.toThrow(
      expect.objectContaining({ codigo: "servidor" }),
    );
  });

  it("sair com token inválido não propaga erro", async () => {
    const falso = vi.fn(async () => resposta(401, {}));
    const servico = new ServicoContaHttp(BASE, falso as unknown as typeof fetch);
    await expect(servico.sair("tok-velho")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/conta/ServicoContaHttp.test.ts`
Expected: FAIL — "Failed to resolve import ./ServicoContaHttp".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/conta/ServicoContaHttp.ts
// A implementação real, sobre o fetch do plugin-http (reqwest em Rust — sem CORS, e a
// senha não passa pelo WebView). O fetch entra pelo construtor para o teste injetar dublê.
//
// Lembrete: o host precisa estar no escopo de http do src-tauri/capabilities/main.json,
// senão o reqwest recusa antes de sair da máquina.

import { fetch as fetchTauri } from "@tauri-apps/plugin-http";

import { BASE_URL_SERVICO } from "../servico/base";
import type { ServicoConta } from "./ServicoConta";
import { FalhaConta, type ErroConta, type Sessao } from "./tipos";

const TIMEOUT_MS = 20_000;

function ehSessao(v: unknown): v is Sessao {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.token === "string" &&
    s.token.length > 0 &&
    typeof s.email === "string" &&
    (s.plano === "gratis" || s.plano === "premium") &&
    typeof s.expiraEm === "number"
  );
}

export class ServicoContaHttp implements ServicoConta {
  constructor(
    private readonly baseUrl: string = BASE_URL_SERVICO,
    private readonly fetchImpl: typeof fetch = fetchTauri as unknown as typeof fetch,
  ) {}

  private async pedir(
    caminho: string,
    init: RequestInit,
    seNaoAutorizado: ErroConta,
  ): Promise<Sessao> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${caminho}`, {
        ...init,
        connectTimeout: TIMEOUT_MS,
      } as RequestInit);
    } catch (e) {
      throw new FalhaConta("rede", e instanceof Error ? e.message : String(e));
    }
    if (res.status === 401 || res.status === 403) throw new FalhaConta(seNaoAutorizado);
    if (res.status === 409) throw new FalhaConta("emailEmUso");
    if (res.status < 200 || res.status >= 300) throw new FalhaConta("servidor");

    let corpo: unknown;
    try {
      corpo = await res.json();
    } catch {
      throw new FalhaConta("servidor", "resposta não é JSON");
    }
    if (!ehSessao(corpo)) throw new FalhaConta("servidor", "resposta sem sessão válida");
    return corpo;
  }

  entrar(email: string, senha: string): Promise<Sessao> {
    return this.pedir(
      "/sessoes",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, senha }),
      },
      "credenciais",
    );
  }

  criar(email: string, senha: string): Promise<Sessao> {
    return this.pedir(
      "/contas",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, senha }),
      },
      "credenciais",
    );
  }

  renovar(token: string): Promise<Sessao> {
    return this.pedir(
      "/sessoes/renovar",
      {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      },
      "expirada",
    );
  }

  /** Sair é melhor-esforço: se o servidor recusar, o app esquece o token de qualquer jeito.
   * Deixar o usuário preso numa sessão porque o logout falhou seria pior. */
  async sair(token: string): Promise<void> {
    try {
      await this.fetchImpl(`${this.baseUrl}/sessoes`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        connectTimeout: TIMEOUT_MS,
      } as RequestInit);
    } catch {
      // silêncio proposital
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/conta/ServicoContaHttp.test.ts`
Expected: PASS, 9 testes.

- [ ] **Step 5: Commit**

```bash
git add src/conta/ServicoContaHttp.ts src/conta/ServicoContaHttp.test.ts
git commit -m "feat(conta): implementacao http do servico de conta"
```

---

### Task 3: O `contaStore`

**Files:**
- Create: `src/estado/contaStore.ts`
- Test: `src/estado/contaStore.test.ts`

**Interfaces:**
- Consumes: `ServicoConta`, `Sessao`, `FalhaConta`, `definirTokenDaSessao` de
  `../servico/sessao`.
- Produces: `useContaStore` com
  `{ sessao: Sessao | null; carregado: boolean; ocupado: boolean; erro: ErroConta | null;
  definirServico(s: ServicoConta): void; carregar(): Promise<void>;
  entrar(email, senha): Promise<boolean>; criar(email, senha): Promise<boolean>;
  sair(): Promise<void> }`,
  e `plano(): PlanoAssinatura` derivado (`"gratis"` quando não há sessão).

Copiar a forma de `prefsStore.ts`: constante `CHAVE_*`, `load("settings.json", { autoSave: false })`,
`carregado` virando `true` no fim de `carregar()`.

Duas regras que os testes cobram:
- **Só o token é persistido.** Email e plano vêm do `renovar` na abertura, porque plano
  muda no servidor (o usuário assinou pelo site) e um valor velho em disco mentiria.
- **`definirTokenDaSessao` é chamado em toda transição**, inclusive na falha do `renovar`.
  Esquecer isso deixa o agente tentando usar um token morto.

- [ ] **Step 1: Write the failing test**

```ts
// src/estado/contaStore.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

import { useContaStore } from "./contaStore";
import { ServicoContaFake } from "../conta/ServicoContaFake";
import { tokenDaSessaoAtual, definirTokenDaSessao } from "../servico/sessao";

const guardados: Record<string, unknown> = {};

vi.mock("@tauri-apps/plugin-store", () => ({
  load: async () => ({
    get: async (k: string) => guardados[k],
    set: async (k: string, v: unknown) => {
      guardados[k] = v;
    },
    delete: async (k: string) => {
      delete guardados[k];
    },
    save: async () => {},
  }),
}));

const comConta = () =>
  new ServicoContaFake({ "ana@exemplo.com": { senha: "segredo123", plano: "premium" } });

describe("contaStore", () => {
  beforeEach(() => {
    for (const k of Object.keys(guardados)) delete guardados[k];
    definirTokenDaSessao(null);
    useContaStore.setState({ sessao: null, carregado: false, ocupado: false, erro: null });
    useContaStore.getState().definirServico(comConta());
  });

  it("começa sem sessão", () => {
    expect(useContaStore.getState().sessao).toBeNull();
    expect(useContaStore.getState().plano()).toBe("gratis");
  });

  it("entrar guarda a sessão e espelha o token no porta-token", async () => {
    const ok = await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    expect(ok).toBe(true);
    expect(useContaStore.getState().sessao?.email).toBe("ana@exemplo.com");
    expect(useContaStore.getState().plano()).toBe("premium");
    expect(tokenDaSessaoAtual()).toBe(useContaStore.getState().sessao?.token);
  });

  it("entrar persiste só o token, nunca a senha nem o email", async () => {
    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    expect(guardados.tokenConta).toBe(useContaStore.getState().sessao?.token);
    expect(JSON.stringify(guardados)).not.toContain("segredo123");
    expect(JSON.stringify(guardados)).not.toContain("ana@exemplo.com");
  });

  it("entrar com senha errada guarda o código do erro e não abre sessão", async () => {
    const ok = await useContaStore.getState().entrar("ana@exemplo.com", "errada");
    expect(ok).toBe(false);
    expect(useContaStore.getState().erro).toBe("credenciais");
    expect(useContaStore.getState().sessao).toBeNull();
    expect(tokenDaSessaoAtual()).toBeNull();
  });

  it("sair limpa estado, disco e porta-token", async () => {
    await useContaStore.getState().entrar("ana@exemplo.com", "segredo123");
    await useContaStore.getState().sair();
    expect(useContaStore.getState().sessao).toBeNull();
    expect(guardados.tokenConta).toBeUndefined();
    expect(tokenDaSessaoAtual()).toBeNull();
  });

  it("carregar sem token salvo termina sem sessão e marca carregado", async () => {
    await useContaStore.getState().carregar();
    expect(useContaStore.getState().sessao).toBeNull();
    expect(useContaStore.getState().carregado).toBe(true);
  });

  it("carregar com token salvo renova e traz o plano do servidor", async () => {
    const servico = comConta();
    useContaStore.getState().definirServico(servico);
    const inicial = await servico.entrar("ana@exemplo.com", "segredo123");
    guardados.tokenConta = inicial.token;

    await useContaStore.getState().carregar();

    expect(useContaStore.getState().sessao?.plano).toBe("premium");
    expect(tokenDaSessaoAtual()).toBe(useContaStore.getState().sessao?.token);
  });

  it("carregar com token morto limpa o disco em silêncio, sem erro na tela", async () => {
    guardados.tokenConta = "tok-que-nao-existe";
    await useContaStore.getState().carregar();
    expect(useContaStore.getState().sessao).toBeNull();
    expect(useContaStore.getState().erro).toBeNull();
    expect(guardados.tokenConta).toBeUndefined();
    expect(tokenDaSessaoAtual()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/estado/contaStore.test.ts`
Expected: FAIL — "Failed to resolve import ./contaStore".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/estado/contaStore.ts
// Estado da conta. Só o TOKEN é persistido: email e plano vêm do `renovar` na abertura,
// porque o plano muda no servidor (o usuário assina pelo site) e um valor velho em disco
// mentiria para o medidor de créditos.
//
// Toda transição espelha o token em `definirTokenDaSessao` — é de lá que `cliente.ts` puxa
// a credencial do provedor próprio. Esquecer um caminho deixa o agente com token morto.

import { create } from "zustand";
import { load } from "@tauri-apps/plugin-store";

import type { ServicoConta } from "../conta/ServicoConta";
import { ServicoContaHttp } from "../conta/ServicoContaHttp";
import { FalhaConta, type ErroConta, type PlanoAssinatura, type Sessao } from "../conta/tipos";
import { definirTokenDaSessao } from "../servico/sessao";

const CHAVE_TOKEN = "tokenConta";

async function abrirStore() {
  return load("settings.json", { autoSave: false });
}

async function gravarToken(token: string | null): Promise<void> {
  const store = await abrirStore();
  if (token) await store.set(CHAVE_TOKEN, token);
  else await store.delete(CHAVE_TOKEN);
  await store.save();
}

function codigoDe(e: unknown): ErroConta {
  return e instanceof FalhaConta ? e.codigo : "servidor";
}

interface ContaState {
  sessao: Sessao | null;
  /** true assim que `carregar()` terminou. Antes disso, "sem sessão" ainda não é conclusão. */
  carregado: boolean;
  ocupado: boolean;
  erro: ErroConta | null;
  servico: ServicoConta;
  definirServico(s: ServicoConta): void;
  plano(): PlanoAssinatura;
  carregar(): Promise<void>;
  entrar(email: string, senha: string): Promise<boolean>;
  criar(email: string, senha: string): Promise<boolean>;
  sair(): Promise<void>;
}

export const useContaStore = create<ContaState>((set, get) => ({
  sessao: null,
  carregado: false,
  ocupado: false,
  erro: null,
  servico: new ServicoContaHttp(),

  definirServico(servico) {
    set({ servico });
  },

  plano() {
    return get().sessao?.plano ?? "gratis";
  },

  async carregar() {
    const store = await abrirStore();
    const token = await store.get<string>(CHAVE_TOKEN);
    if (!token) {
      definirTokenDaSessao(null);
      set({ carregado: true });
      return;
    }
    try {
      const sessao = await get().servico.renovar(token);
      definirTokenDaSessao(sessao.token);
      await gravarToken(sessao.token);
      set({ sessao, carregado: true });
    } catch {
      // Token morto na abertura NÃO é erro de tela: o usuário não pediu nada. Limpa e
      // segue — o app inteiro funciona sem conta.
      definirTokenDaSessao(null);
      await gravarToken(null);
      set({ sessao: null, carregado: true });
    }
  },

  async entrar(email, senha) {
    set({ ocupado: true, erro: null });
    try {
      const sessao = await get().servico.entrar(email, senha);
      definirTokenDaSessao(sessao.token);
      await gravarToken(sessao.token);
      set({ sessao, ocupado: false });
      return true;
    } catch (e) {
      definirTokenDaSessao(null);
      set({ sessao: null, ocupado: false, erro: codigoDe(e) });
      return false;
    }
  },

  async criar(email, senha) {
    set({ ocupado: true, erro: null });
    try {
      const sessao = await get().servico.criar(email, senha);
      definirTokenDaSessao(sessao.token);
      await gravarToken(sessao.token);
      set({ sessao, ocupado: false });
      return true;
    } catch (e) {
      definirTokenDaSessao(null);
      set({ sessao: null, ocupado: false, erro: codigoDe(e) });
      return false;
    }
  },

  async sair() {
    const token = get().sessao?.token;
    set({ sessao: null, erro: null });
    definirTokenDaSessao(null);
    await gravarToken(null);
    if (token) await get().servico.sair(token);
  },
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/estado/contaStore.test.ts`
Expected: PASS, 8 testes.

- [ ] **Step 5: Ligar o carregamento na abertura**

Em `src/main.tsx` (ou onde `usePrefsStore.getState().carregar()` já é chamado na abertura),
acrescentar `void useContaStore.getState().carregar();` **na mesma altura**. Não bloquear a
renderização esperando: o app tem que abrir sem internet como sempre abriu.

- [ ] **Step 6: Commit**

```bash
git add src/estado/contaStore.ts src/estado/contaStore.test.ts src/main.tsx
git commit -m "feat(conta): contaStore com sessao persistida e espelho no porta-token"
```

---

### Task 4: Código de recuperação

> **Superada em 23/09/2026.** Decisão tomada: não vai existir código de recuperação. O
> módulo `src/conta/codigoDeRecuperacao.ts` e seu teste serão removidos. Ver ADR-33 em
> `docs/09-decisoes-e-incertezas.md` e `docs/16-codigo-de-recuperacao.md` §9. Esta tarefa
> fica registrada abaixo, não apagada, como histórico de como o código chegou a existir.

**Files:**
- Create: `src/conta/codigoDeRecuperacao.ts`
- Test: `src/conta/codigoDeRecuperacao.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `gerarCodigoDeRecuperacao(aleatorio?: (n: number) => Uint8Array): string`,
  `formatarCodigo(codigo: string): string`,
  `normalizarCodigo(entrada: string): string`,
  `codigoValido(entrada: string): boolean`.

O relatório fecha que o sync é sem leitura pelo servidor, e a consequência é que não existe
"esqueci minha senha". O código de recuperação é a única volta atrás — por isso ele é
gerado e mostrado **na criação da conta**, e o usuário confirma que guardou.

Alfabeto sem `0`, `O`, `1`, `I` e `L`: o código vai ser copiado à mão de um papel, e esses
cinco são os que as pessoas erram.

A derivação da chave de criptografia a partir deste código pertence ao plano de sync, que
depende de servidor. Aqui fica só a geração e a validação de forma, que são puras.

- [ ] **Step 1: Write the failing test**

```ts
// src/conta/codigoDeRecuperacao.test.ts
import { describe, it, expect } from "vitest";

import {
  gerarCodigoDeRecuperacao,
  formatarCodigo,
  normalizarCodigo,
  codigoValido,
  ALFABETO,
} from "./codigoDeRecuperacao";

const sequencial = (n: number) => Uint8Array.from({ length: n }, (_, i) => i);

describe("gerarCodigoDeRecuperacao", () => {
  it("tem 24 caracteres do alfabeto seguro", () => {
    const codigo = gerarCodigoDeRecuperacao(sequencial);
    expect(codigo).toHaveLength(24);
    for (const c of codigo) expect(ALFABETO).toContain(c);
  });

  it("não usa caracteres que se confundem à mão", () => {
    for (const ruim of ["0", "O", "1", "I", "L"]) {
      expect(ALFABETO).not.toContain(ruim);
    }
  });

  it("duas chamadas com aleatório real não coincidem", () => {
    expect(gerarCodigoDeRecuperacao()).not.toBe(gerarCodigoDeRecuperacao());
  });
});

describe("formatarCodigo", () => {
  it("quebra em grupos de quatro separados por hífen", () => {
    expect(formatarCodigo("ABCDEFGHJKMNPQRSTUVWXYZ2")).toBe(
      "ABCD-EFGH-JKMN-PQRS-TUVW-XYZ2",
    );
  });
});

describe("normalizarCodigo", () => {
  it("tira hífen, espaço e caixa", () => {
    expect(normalizarCodigo(" abcd-efgh ijkm ")).toBe("ABCDEFGHJKM".slice(0, 11));
  });

  it("um código formatado volta ao original", () => {
    const codigo = gerarCodigoDeRecuperacao(sequencial);
    expect(normalizarCodigo(formatarCodigo(codigo))).toBe(codigo);
  });
});

describe("codigoValido", () => {
  it("aceita o código gerado, formatado ou não", () => {
    const codigo = gerarCodigoDeRecuperacao(sequencial);
    expect(codigoValido(codigo)).toBe(true);
    expect(codigoValido(formatarCodigo(codigo))).toBe(true);
    expect(codigoValido(formatarCodigo(codigo).toLowerCase())).toBe(true);
  });

  it("recusa comprimento errado", () => {
    expect(codigoValido("ABCD")).toBe(false);
  });

  it("recusa caractere fora do alfabeto", () => {
    expect(codigoValido("0".repeat(24))).toBe(false);
  });
});
```

> O teste de `normalizarCodigo` com `" abcd-efgh ijkm "` espera `"ABCDEFGHJKM"` porque o
> `I` sai do alfabeto e é descartado junto com hífen e espaço. Implementar exatamente
> assim: normalizar descarta tudo que não é do alfabeto.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/conta/codigoDeRecuperacao.test.ts`
Expected: FAIL — "Failed to resolve import ./codigoDeRecuperacao".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/conta/codigoDeRecuperacao.ts
// O código que o usuário guarda ou imprime na criação da conta.
//
// Existe porque o sync não é legível pelo servidor: não há "esqueci minha senha", e este
// código é a única volta atrás. A derivação da chave de criptografia a partir dele mora no
// plano de sync; aqui é só geração e forma, que são puras e testáveis hoje.
//
// Alfabeto sem 0, O, 1, I e L: o código vai ser copiado à mão de um papel.

export const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const TAMANHO = 24;
const GRUPO = 4;

function aleatorioPadrao(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function gerarCodigoDeRecuperacao(
  aleatorio: (n: number) => Uint8Array = aleatorioPadrao,
): string {
  const bytes = aleatorio(TAMANHO);
  let codigo = "";
  for (let i = 0; i < TAMANHO; i++) {
    codigo += ALFABETO[bytes[i] % ALFABETO.length];
  }
  return codigo;
}

/** Grupos de quatro com hífen: é assim que fica legível num papel. */
export function formatarCodigo(codigo: string): string {
  const grupos: string[] = [];
  for (let i = 0; i < codigo.length; i += GRUPO) {
    grupos.push(codigo.slice(i, i + GRUPO));
  }
  return grupos.join("-");
}

/** Aceita o que a pessoa digitar: caixa baixa, hífen, espaço. Descarta o que não é do
 * alfabeto em vez de recusar — quem digitou "O" quis dizer alguma coisa, e recusar a
 * colagem inteira por causa de um caractere seria hostil. A validação de tamanho pega o
 * erro de verdade. */
export function normalizarCodigo(entrada: string): string {
  return entrada
    .toUpperCase()
    .split("")
    .filter((c) => ALFABETO.includes(c))
    .join("");
}

export function codigoValido(entrada: string): boolean {
  return normalizarCodigo(entrada).length === TAMANHO;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/conta/codigoDeRecuperacao.test.ts`
Expected: PASS, 9 testes.

- [ ] **Step 5: Commit**

```bash
git add src/conta/codigoDeRecuperacao.ts src/conta/codigoDeRecuperacao.test.ts
git commit -m "feat(conta): codigo de recuperacao com alfabeto sem caracteres ambiguos"
```

---

### Task 5: A seção "Conta" nas preferências

**Files:**
- Modify: `src/ui/excalisidian/DialogoPreferencias.tsx`
- Modify: `src/i18n/catalogo.ts`

**Interfaces:**
- Consumes: `useContaStore`, `useTexto`.
- Produces: nada consumido por outra tarefa.

Sem teste automatizado — interface. A lógica já está coberta na Task 3.

- [ ] **Step 1: Acrescentar os textos ao catálogo**

Em `PT_BR`:

```ts
  "conta.titulo": "Conta",
  "conta.descricaoDeslogado":
    "Entrar é opcional. O Excalisidian funciona inteiro sem conta, offline.",
  "conta.email": "E-mail",
  "conta.senha": "Senha",
  "conta.entrar": "Entrar",
  "conta.criar": "Criar conta",
  "conta.sair": "Sair",
  "conta.conectadoComo": "Conectado como {email}",
  "conta.plano.gratis": "Plano grátis",
  "conta.plano.premium": "Plano premium",
  "conta.erro.credenciais": "E-mail ou senha não conferem.",
  "conta.erro.emailEmUso": "Já existe uma conta com esse e-mail.",
  "conta.erro.rede": "Não foi possível falar com o servidor. Verifique a conexão.",
  "conta.erro.servidor": "O servidor respondeu de um jeito inesperado. Tente de novo.",
  "conta.erro.expirada": "Sua sessão expirou. Entre de novo.",
```

Em `EN`:

```ts
  "conta.titulo": "Account",
  "conta.descricaoDeslogado":
    "Signing in is optional. Excalisidian works fully offline, without an account.",
  "conta.email": "Email",
  "conta.senha": "Password",
  "conta.entrar": "Sign in",
  "conta.criar": "Create account",
  "conta.sair": "Sign out",
  "conta.conectadoComo": "Signed in as {email}",
  "conta.plano.gratis": "Free plan",
  "conta.plano.premium": "Premium plan",
  "conta.erro.credenciais": "Email or password do not match.",
  "conta.erro.emailEmUso": "An account with this email already exists.",
  "conta.erro.rede": "Could not reach the server. Check your connection.",
  "conta.erro.servidor": "The server responded unexpectedly. Try again.",
  "conta.erro.expirada": "Your session expired. Sign in again.",
```

- [ ] **Step 2: Implementar a seção**

Acrescentar uma seção "Conta" em `DialogoPreferencias.tsx`, copiando a estrutura e as
classes das seções já existentes. Dois estados:

- **Sem sessão:** a descrição de `conta.descricaoDeslogado`, campos de e-mail e senha, e
  dois botões — "Entrar" e "Criar conta". Enquanto `ocupado`, os botões ficam
  desabilitados. Havendo `erro`, mostrar `t(\`conta.erro.${erro}\`)` abaixo dos campos.
- **Com sessão:** `t("conta.conectadoComo", { email })`, o rótulo do plano e o botão
  "Sair".

O campo de senha usa `type="password"` e **nunca** é preenchido de volta — o store não
guarda senha e não há de onde tirar.

A seção não aparece em lugar nenhum além das preferências: nada de banner na Home, nada de
aviso na abertura. É a leitura literal de "não seremos invasivos".

- [ ] **Step 3: Verificar no app**

Conferir se já existe um `npm run tauri dev` na porta 1420. Sem servidor no ar, "Entrar"
deve mostrar a mensagem de rede — e não travar o diálogo. Conferir que o resto das
preferências continua igual.

- [ ] **Step 4: Commit**

```bash
git add src/ui/excalisidian/DialogoPreferencias.tsx src/i18n/catalogo.ts
git commit -m "feat(conta): secao de conta nas preferencias"
```

---

## Fora deste plano

- O servidor de conta e o de cobrança.
- Recuperação de senha da conta (o servidor decide) — o código de recuperação da Task 4 é
  do **conteúdo sincronizado**, não do login.
- Exclusão de conta pela interface: exigida por GDPR e LGPD, e depende de endpoint.
  Entra no plano do servidor.
- Derivação de chave a partir do código de recuperação — plano de sync.

---

### Task 6: Ligar a conta ao agente

**Files:**
- Modify: `src/servico/base.ts`
- Modify: `src/ui/excalisidian/DialogoAgente.tsx`
- Modify: `src/estado/agenteStore.ts`
- Modify: `src/estado/agenteStore.test.ts`

**Interfaces:**
- Consumes: `useContaStore` (Task 3), `CONTA_DISPONIVEL`, `provedorDe`.
- Produces: nada consumido por outra tarefa.

Esta tarefa não estava no plano original. Ela existe porque o plano 02 (provedor próprio)
terminou com três pendências que só podem fechar depois que a conta existir, e que foram
registradas na revisão final daquele plano. Sem esta tarefa, o provedor pago continua
invisível e o trabalho do plano 02 fica inerte.

**As três pendências:**

1. **`CONTA_DISPONIVEL` continua `false`.** A constante em `src/servico/base.ts` esconde do
   assistente todo provedor com `exigeConta`. Ela existe porque, sem tela de conta, o cartão
   era um beco sem saída: aparecia em primeiro lugar e o botão de continuar ficava
   permanentemente desabilitado, mandando entrar numa conta que não existia.

2. **A leitura da sessão no assistente não é reativa.** `DialogoAgente.tsx` chama
   `tokenDaSessaoAtual()` durante o render, e `src/servico/sessao.ts` é um módulo com estado
   que não notifica ninguém. Entrar na conta com o assistente aberto deixaria o botão
   desabilitado e o aviso na tela até um re-render por outro motivo. O porta-token continua
   existindo para `cliente.ts`, que roda fora de React — o que muda é só quem a **interface**
   consulta.

3. **"Testar conexão" devolve sucesso sem testar nada.** `agenteStore.ts` pula
   `listarModelos` quando o provedor tem `modelosFixos`, e `DialogoPreferencias` traduz isso
   em "Conexão funcionando." Para o provedor próprio isso é um sucesso maquiado: não
   verifica sessão nem servidor.

- [ ] **Step 1: Write the failing test**

Em `src/estado/agenteStore.test.ts`, acrescentar ao `describe` existente:

```ts
  it("testar conexão do provedor próprio falha sem sessão, em vez de dizer que funciona", async () => {
    definirTokenDaSessao(null);
    const erro = await useAgenteStore.getState().testarConexao({
      provedor: "excalisidian",
      chave: "",
      baseUrl: BASE_URL_SERVICO,
      modelo: MODELO_LEITURA,
    });
    expect(erro).not.toBeNull();
  });

  it("testar conexão do provedor próprio não chama listarModelos", async () => {
    definirTokenDaSessao("tok-valido");
    await useAgenteStore.getState().testarConexao({
      provedor: "excalisidian",
      chave: "",
      baseUrl: BASE_URL_SERVICO,
      modelo: MODELO_LEITURA,
    });
    expect(listarModelosMock).not.toHaveBeenCalled();
  });
```

> Adaptar os nomes ao que o arquivo de teste já usa para o mock de `listarModelos` e para a
> assinatura real de `testarConexao` — não renomear o que já está lá.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/estado/agenteStore.test.ts`
Expected: FAIL no primeiro teste — hoje devolve `null` (sucesso) sem sessão.

- [ ] **Step 3: Write minimal implementation**

Três mudanças, uma por pendência:

```ts
// 1. src/servico/base.ts
// A tela de conta existe desde o plano 03; o provedor próprio pode aparecer.
export const CONTA_DISPONIVEL = true;
```

```ts
// 2. src/ui/excalisidian/DialogoAgente.tsx
// A interface lê a sessão do store (reativo); `sessao.ts` continua servindo `cliente.ts`,
// que roda fora de React e não pode usar hook.
const sessao = useContaStore((s) => s.sessao);
const semSessao = sessao === null;
```

Remover o import e a chamada de `tokenDaSessaoAtual` deste arquivo. Nenhum outro consumidor
de `sessao.ts` muda.

```ts
// 3. src/estado/agenteStore.ts, em testarConexao
// Provedor por conta: não há endpoint de listagem, então o que se testa é a sessão.
// Dizer "funcionando" sem verificar nada seria pior que não ter botão.
if (provedor.exigeConta) {
  return tokenDaSessaoAtual() ? null : "sessao";
}
```

> O valor devolvido tem que ser do mesmo tipo que os outros caminhos de `testarConexao` já
> devolvem. Ler a função inteira antes de editar e seguir o que ela já faz.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test` inteiro e `npm run build`.
Expected: PASS, build limpo.

- [ ] **Step 5: Verificar no app**

Conferir se já existe um `npm run tauri dev` na porta 1420. Abrir o assistente do agente: a
"IA do Excalisidian" agora deve aparecer na lista. Sem entrar na conta, o passo de conta
deve desabilitar o botão e mostrar o aviso. Entrar na conta **com o assistente aberto** e
confirmar que o aviso some sozinho — é exatamente o que a pendência 2 conserta.

- [ ] **Step 6: Commit**

```bash
git add src/servico/base.ts src/ui/excalisidian/DialogoAgente.tsx src/estado/agenteStore.ts src/estado/agenteStore.test.ts
git commit -m "feat(conta): liga a conta ao agente e mostra o provedor proprio"
```
