// Teste de deriva (plano 2026-09-19, Tarefa A): o catálogo não pode mentir sobre o que o
// código faz. Confere ids únicos, formato dos combos e que toda tecla dos keymaps próprios do
// editor (formatação, quebra de bloco, selecionar corpo) está listada no glossário.

import { describe, it, expect } from "vitest";
import { CATALOGO_ATALHOS, atalhoPorId } from "./catalogoAtalhos";
import { TECLAS_FORMATACAO } from "../../editor/extensoes/atalhosFormatacao";
import { TECLAS_QUEBRA_DE_BLOCO } from "../../editor/extensoes/quebraDeBloco";
import { TECLAS_SELECIONAR_CORPO } from "../../editor/extensoes/selecionarCorpoDaNota";

const todasAsTeclas = new Set(CATALOGO_ATALHOS.flatMap((a) => a.teclas));

describe("catálogo de atalhos", () => {
  it("ids únicos", () => {
    const ids = CATALOGO_ATALHOS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("toda linha tem tecla ou gesto", () => {
    for (const a of CATALOGO_ATALHOS) expect(a.teclas.length > 0 || !!a.gesto).toBe(true);
  });
  it.each([
    ["formatação", TECLAS_FORMATACAO],
    ["quebra de bloco", TECLAS_QUEBRA_DE_BLOCO],
    ["selecionar corpo", TECLAS_SELECIONAR_CORPO],
  ])("deriva: toda tecla do keymap de %s está no glossário", (_, teclas) => {
    for (const t of teclas) expect(todasAsTeclas, t).toContain(t);
  });
  it("Ctrl+K insere link na nota", () => {
    expect(atalhoPorId("link")?.teclas).toContain("Mod-k");
  });
  it("combos seguem a ordem Mod, Alt, Shift", () => {
    for (const t of todasAsTeclas) {
      // "Mod-1…9" é faixa literal; "Mod--" tem o próprio "-" como tecla final (zoom out) —
      // dividir por "-" ingenuamente sobraria um segmento vazio. Nenhum dos dois tem mais de
      // um modificador pra checar ordem.
      if (t === "Mod-1…9" || t === "Mod--") continue;
      const mods = t.split("-").slice(0, -1);
      const ordem = ["Mod", "Alt", "Shift"];
      expect(mods, t).toEqual([...mods].sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b)));
    }
  });
});
