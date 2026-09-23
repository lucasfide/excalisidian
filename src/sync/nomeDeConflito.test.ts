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
