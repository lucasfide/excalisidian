// servidor/src/limiteDeTentativas.test.ts
// O limite de tentativas é em memória (doc 18 §3) — sem varredura, o mapa de chaves
// (uma por IP e uma por e-mail já vistos) cresce para sempre enquanto o processo vive,
// mesmo depois de a janela de 1 minuto de cada chave passar. Este teste prova que uma
// varredura oportunista libera as chaves vencidas.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LimiteDeTentativas } from "./limiteDeTentativas";

describe("LimiteDeTentativas", () => {
  it("permite até 10 tentativas por minuto na mesma chave e recusa a 11ª", () => {
    const limite = new LimiteDeTentativas();
    for (let i = 0; i < 10; i++) {
      expect(limite.registrar("chave-x")).toBe(true);
    }
    expect(limite.registrar("chave-x")).toBe(false);
  });

  it("chaves de duas contas diferentes têm limites independentes", () => {
    const limite = new LimiteDeTentativas();
    for (let i = 0; i < 10; i++) limite.registrar("a");
    expect(limite.registrar("a")).toBe(false);
    expect(limite.registrar("b")).toBe(true);
  });
});

describe("LimiteDeTentativas — varredura oportunista", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("libera chaves cuja janela já passou, em vez de guardá-las para sempre", () => {
    const limite = new LimiteDeTentativas();

    for (let i = 0; i < 60; i++) limite.registrar(`velha-${i}`);
    expect(limite.tamanhoParaTeste()).toBe(60);

    // Passa da janela de 1 minuto: as 60 chaves antigas não têm mais tentativa válida.
    vi.advanceTimersByTime(61_000);

    // Chamadas suficientes para a varredura oportunista rodar de novo.
    for (let i = 0; i < 60; i++) limite.registrar(`nova-${i}`);

    // Só as chaves novas (dentro da janela) continuam em memória — as vencidas saíram.
    expect(limite.tamanhoParaTeste()).toBe(60);
  });
});
