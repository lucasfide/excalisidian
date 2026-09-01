import { describe, it, expect } from "vitest";

import { cn } from "./cn";

// O caso que motivou este arquivo: o tailwind-merge não lê o `@theme` do projeto, então
// `text-corpo`/`text-pequeno` (tamanhos da escala do doc 06) eram lidos como COR de texto e
// apagavam a cor declarada antes. O botão primário (`bg-musgo text-superficie` + `text-corpo`
// do tamanho) perdia o `text-superficie`, herdava `tinta` do body, e ficava ilegível nos DOIS
// temas — `tinta` e `musgo` escurecem/clareiam juntos, então dava 2,3:1 no claro e 2,2:1 no
// escuro. Ver o comentário em cn.ts.
describe("cn: escala tipográfica não pode apagar cor de texto", () => {
  it("mantém a cor quando o tamanho vem depois (botão primário padrão)", () => {
    const r = cn("bg-musgo text-superficie hover:bg-musgo/90", "h-9 gap-2 px-4 text-corpo");
    expect(r).toContain("text-superficie");
    expect(r).toContain("text-corpo");
  });

  it("mantém a cor com o tamanho compacto", () => {
    const r = cn(
      "bg-musgo text-superficie hover:bg-musgo/90",
      "h-[30px] gap-1.5 px-3 text-pequeno",
    );
    expect(r).toContain("text-superficie");
    expect(r).toContain("text-pequeno");
  });

  it("mantém a cor com o tamanho declarado antes", () => {
    expect(cn("text-corpo", "text-tinta-media")).toContain("text-tinta-media");
  });
});

describe("cn: conflitos de verdade continuam sendo resolvidos", () => {
  it("dois tamanhos: vence o último", () => {
    expect(cn("text-corpo", "text-pequeno")).toBe("text-pequeno");
  });

  it("duas cores: vence a última", () => {
    expect(cn("text-tinta", "text-superficie")).toBe("text-superficie");
  });

  it("conflito comum de espaçamento continua valendo", () => {
    expect(cn("px-4", "px-2")).toBe("px-2");
  });
});
