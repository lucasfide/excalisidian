// src/sync/ServicoSyncHttp.ts
// A implementação real de ServicoSync, sobre o fetch do plugin-http (reqwest em Rust — sem
// CORS). Mesmo padrão de src/conta/ServicoContaHttp.ts: o fetch entra pelo construtor para
// o teste injetar um dublê, e o cast de RequestInit é o mesmo (connectTimeout só existe no
// fetch do Tauri). Mapeamento HTTP do doc 17 §9.1.
//
// Lembrete: o host precisa estar no escopo de http do src-tauri/capabilities/main.json
// (já está: https://api.excalisidian.app/*), senão o reqwest recusa antes de sair da máquina.

import { fetch as fetchTauri } from "@tauri-apps/plugin-http";

import { tokenDaSessaoAtual } from "../servico/sessao";
import { BASE_URL_SERVICO } from "../servico/base";
import { deBase64, paraBase64 } from "./base64";
import type { ServicoSync } from "./ServicoSync";
import { FalhaSync, type ErroSync, type ResultadoBaixar, type VaultSincronizado } from "./tiposServidor";

const TIMEOUT_MS = 20_000;

/** Só os dois códigos que o servidor pode mandar num corpo 409 (doc 17 §9.1). Qualquer outro
 * valor, ou corpo sem `codigo`, é 409 malformado — vira `servidor`. */
function codigo409(corpo: unknown): "fora-de-ordem" | "ja-existe" | null {
  if (typeof corpo !== "object" || corpo === null) return null;
  const valor = (corpo as Record<string, unknown>).codigo;
  return valor === "fora-de-ordem" || valor === "ja-existe" ? valor : null;
}

export class ServicoSyncHttp implements ServicoSync {
  constructor(
    private readonly baseUrl: string = BASE_URL_SERVICO,
    private readonly fetchImpl: typeof fetch = fetchTauri as unknown as typeof fetch,
  ) {}

  /** Faz a chamada autenticada e traduz o status HTTP para `FalhaSync` (doc 17 §9.1). Sem
   * token de sessão, nem tenta a rede: `FalhaSync("sessao")` direto. */
  private async chamar(caminho: string, init: RequestInit = {}): Promise<Response> {
    const token = tokenDaSessaoAtual();
    if (!token) throw new FalhaSync("sessao");

    let res: Response;
    try {
      // O cast é seguro: a implementação padrão é sempre o fetch do Tauri (que aceita
      // `connectTimeout`, ausente do RequestInit padrão do DOM); o `fetchImpl` injetado nos
      // testes é um dublê que ignora esse campo.
      res = await this.fetchImpl(`${this.baseUrl}${caminho}`, {
        ...init,
        headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
        connectTimeout: TIMEOUT_MS,
      } as RequestInit);
    } catch (e) {
      throw new FalhaSync("rede", e instanceof Error ? e.message : String(e));
    }

    if (res.status === 401) throw new FalhaSync("sessao");
    if (res.status === 403) throw new FalhaSync("plano");
    if (res.status === 404) throw new FalhaSync("nao-encontrado");
    if (res.status === 409) {
      let corpo: unknown;
      try {
        corpo = await res.json();
      } catch {
        throw new FalhaSync("servidor", "409 sem corpo JSON válido");
      }
      const codigo = codigo409(corpo);
      if (!codigo) throw new FalhaSync("servidor", "409 com código desconhecido");
      throw new FalhaSync(codigo as ErroSync);
    }
    if (res.status === 413 || res.status === 507) throw new FalhaSync("espaco");
    if (res.status < 200 || res.status >= 300) throw new FalhaSync("servidor");

    return res;
  }

  private async corpoJson(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch {
      throw new FalhaSync("servidor", "resposta não é JSON");
    }
  }

  async listarVaults(): Promise<VaultSincronizado[]> {
    const res = await this.chamar("/sync/vaults", { method: "GET" });
    const corpo = await this.corpoJson(res);
    if (!Array.isArray(corpo)) throw new FalhaSync("servidor", "resposta não é uma lista");
    return corpo.map((item) => {
      if (typeof item !== "object" || item === null) throw new FalhaSync("servidor", "vault malformado");
      const o = item as Record<string, unknown>;
      if (typeof o.id !== "string" || typeof o.nomeCifrado !== "string" || typeof o.envelope !== "string") {
        throw new FalhaSync("servidor", "vault malformado");
      }
      return { id: o.id, nomeCifrado: deBase64(o.nomeCifrado), envelope: deBase64(o.envelope) };
    });
  }

  async criarVault(id: string, nomeCifrado: Uint8Array, envelope: Uint8Array): Promise<void> {
    await this.chamar("/sync/vaults", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, nomeCifrado: paraBase64(nomeCifrado), envelope: paraBase64(envelope) }),
    });
  }

  async baixar(id: string, aposSequencia: number): Promise<ResultadoBaixar> {
    const res = await this.chamar(
      `/sync/vaults/${encodeURIComponent(id)}/pacotes?apos=${aposSequencia}`,
      { method: "GET" },
    );
    const corpo = await this.corpoJson(res);
    if (typeof corpo !== "object" || corpo === null) throw new FalhaSync("servidor", "resposta malformada");
    const o = corpo as Record<string, unknown>;

    if (typeof o.ultimoRetrato !== "number") throw new FalhaSync("servidor", "ultimoRetrato ausente");
    if (!Array.isArray(o.lotes)) throw new FalhaSync("servidor", "lotes ausentes");

    const lotes = o.lotes.map((bruto) => {
      if (typeof bruto !== "object" || bruto === null) throw new FalhaSync("servidor", "lote malformado");
      const l = bruto as Record<string, unknown>;
      if (typeof l.sequencia !== "number" || typeof l.bytes !== "string") {
        throw new FalhaSync("servidor", "lote malformado");
      }
      return { sequencia: l.sequencia, bytes: deBase64(l.bytes) };
    });

    let retrato: ResultadoBaixar["retrato"];
    if (o.retrato !== undefined) {
      if (typeof o.retrato !== "object" || o.retrato === null) {
        throw new FalhaSync("servidor", "retrato malformado");
      }
      const r = o.retrato as Record<string, unknown>;
      if (typeof r.ateSequencia !== "number" || !Array.isArray(r.partes)) {
        throw new FalhaSync("servidor", "retrato malformado");
      }
      const partes = r.partes.map((parte) => {
        if (typeof parte !== "string") throw new FalhaSync("servidor", "parte do retrato malformada");
        return deBase64(parte);
      });
      retrato = { ateSequencia: r.ateSequencia, partes };
    }

    return { retrato, lotes, ultimoRetrato: o.ultimoRetrato };
  }

  async enviarLote(id: string, esperoUltima: number, bytes: Uint8Array): Promise<number> {
    const res = await this.chamar(`/sync/vaults/${encodeURIComponent(id)}/lotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ esperoUltima, bytes: paraBase64(bytes) }),
    });
    const corpo = await this.corpoJson(res);
    if (typeof corpo !== "object" || corpo === null) throw new FalhaSync("servidor", "resposta malformada");
    const sequencia = (corpo as Record<string, unknown>).sequencia;
    if (typeof sequencia !== "number") throw new FalhaSync("servidor", "sequencia ausente");
    return sequencia;
  }

  async enviarRetrato(id: string, ateSequencia: number, partes: Uint8Array[]): Promise<void> {
    await this.chamar(`/sync/vaults/${encodeURIComponent(id)}/retratos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ateSequencia, partes: partes.map(paraBase64) }),
    });
  }

  async apagarVault(id: string): Promise<void> {
    await this.chamar(`/sync/vaults/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
}
