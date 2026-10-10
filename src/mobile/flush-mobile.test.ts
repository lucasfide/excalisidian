import { describe, expect, it } from "vitest";

import { flushMobileConcluido } from "./flush-mobile";

describe("flush mobile antes da navegação", () => {
  it("só libera a transição quando nota, canvas e tarefas foram drenados", () => {
    expect(flushMobileConcluido({ falhas: [], bloqueados: [], tarefasOk: true })).toBe(true);
    expect(flushMobileConcluido({ falhas: ["Nota.md"], bloqueados: [], tarefasOk: true })).toBe(false);
    expect(flushMobileConcluido({ falhas: [], bloqueados: ["Canvas.draw.md"], tarefasOk: true })).toBe(false);
    expect(flushMobileConcluido({ falhas: [], bloqueados: [], tarefasOk: false })).toBe(false);
  });
});
