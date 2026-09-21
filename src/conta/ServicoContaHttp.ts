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
      // O cast é seguro: a implementação padrão é sempre o fetch do Tauri (que aceita
      // `connectTimeout`, ausente do RequestInit padrão do DOM); o `fetchImpl` injetado
      // nos testes é um dublê que ignora esse campo.
      res = await this.fetchImpl(`${this.baseUrl}${caminho}`, {
        ...init,
        connectTimeout: TIMEOUT_MS,
      } as RequestInit);
    } catch (e) {
      throw new FalhaConta("rede", e instanceof Error ? e.message : String(e));
    }
    if (res.status === 401) throw new FalhaConta(seNaoAutorizado);
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
      // Mesmo cast seguro de `pedir`: fetch real do Tauri em produção, dublê em teste.
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
