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

/** Resultado de consultar o saldo: distingue por que falhou, para "Testar conexão" dizer a
 * verdade (sessão vencida, plano grátis, ou só sem rede). */
export type ResultadoCreditos =
  | { ok: true; saldo: SaldoCreditos }
  | { ok: false; motivo: "sessao" | "plano" | "rede" };

export async function buscarSaldoCreditos(
  token: string,
  baseUrl: string = BASE_URL_SERVICO,
  fetchImpl: typeof fetch = fetchTauri as unknown as typeof fetch,
): Promise<SaldoCreditos | null> {
  const r = await consultarCreditos(token, baseUrl, fetchImpl);
  return r.ok ? r.saldo : null;
}

export async function consultarCreditos(
  token: string,
  baseUrl: string = BASE_URL_SERVICO,
  fetchImpl: typeof fetch = fetchTauri as unknown as typeof fetch,
): Promise<ResultadoCreditos> {
  try {
    // Mesmo cast de ServicoContaHttp: `connectTimeout` é do fetch do Tauri, ausente do
    // RequestInit do DOM; dublês de teste ignoram o campo.
    const res = await fetchImpl(`${baseUrl}/creditos`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      connectTimeout: TIMEOUT_MS,
    } as RequestInit);
    if (res.status === 401) return { ok: false, motivo: "sessao" };
    if (res.status === 403) return { ok: false, motivo: "plano" };
    if (res.status !== 200) return { ok: false, motivo: "rede" };
    const corpo = (await res.json()) as Record<string, unknown> | null;
    if (!corpo || !ehNumero(corpo.usados) || !ehNumero(corpo.total) || !ehNumero(corpo.renovaEm)) {
      return { ok: false, motivo: "rede" };
    }
    return { ok: true, saldo: { usados: corpo.usados, total: corpo.total, renovaEm: corpo.renovaEm } };
  } catch {
    return { ok: false, motivo: "rede" };
  }
}
