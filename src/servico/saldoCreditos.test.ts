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
