import { describe, it, expect } from "vitest";
import {
  addDias, sabadoDaSemana, intervaloDaSemana, formatarIntervalo,
  secaoDe, dataDaSecao, agruparTarefas,
} from "./agrupamento";
import type { Tarefa } from "./tipos";

// 2026-09-09 é uma quarta-feira. Semana dom 06 → sáb 12.
const HOJE = "2026-09-09";

function tarefa(over: Partial<Tarefa>): Tarefa {
  return {
    id: over.id ?? "t-x",
    titulo: "t",
    vencimento: over.vencimento ?? HOJE,
    ordem: over.ordem ?? 10,
    concluida: over.concluida ?? false,
    concluidaEm: over.concluidaEm ?? null,
    criadaEm: "2026-09-01T00:00:00-03:00",
    comentarios: [],
  };
}

describe("helpers de data", () => {
  it("addDias", () => {
    expect(addDias("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDias("2026-09-09", -3)).toBe("2026-09-06");
  });
  it("sabadoDaSemana: quarta → sábado da mesma semana", () => {
    expect(sabadoDaSemana("2026-09-09")).toBe("2026-09-12");
  });
  it("sabadoDaSemana: sábado → o próprio dia", () => {
    expect(sabadoDaSemana("2026-09-12")).toBe("2026-09-12");
  });
  it("sabadoDaSemana: domingo → sábado seguinte", () => {
    expect(sabadoDaSemana("2026-09-13")).toBe("2026-09-19");
  });
  it("intervaloDaSemana", () => {
    expect(intervaloDaSemana("2026-09-12")).toEqual({ inicio: "2026-09-06", fim: "2026-09-12" });
  });
  it("formatarIntervalo mesmo mês", () => {
    expect(formatarIntervalo("2026-09-06", "2026-09-12")).toBe("6–12 de setembro");
  });
  it("formatarIntervalo cruzando o mês", () => {
    expect(formatarIntervalo("2026-09-28", "2026-10-04")).toBe("28 de setembro – 4 de outubro");
  });
});

describe("secaoDe", () => {
  it("cada seção", () => {
    expect(secaoDe(tarefa({ vencimento: "2026-09-08" }), HOJE)).toBe("atrasado");
    expect(secaoDe(tarefa({ vencimento: "2026-09-09" }), HOJE)).toBe("hoje");
    expect(secaoDe(tarefa({ vencimento: "2026-09-10" }), HOJE)).toBe("amanha");
    expect(secaoDe(tarefa({ vencimento: "2026-09-11" }), HOJE)).toBe("essa-semana");
    expect(secaoDe(tarefa({ vencimento: "2026-09-12" }), HOJE)).toBe("essa-semana");
    expect(secaoDe(tarefa({ vencimento: "2026-09-13" }), HOJE)).toBe("proxima-semana");
  });
  it("concluída no passado fica em concluidas, não em atrasado", () => {
    expect(secaoDe(tarefa({ vencimento: "2026-09-01", concluida: true, concluidaEm: "2026-09-02T00:00:00-03:00" }), HOJE)).toBe("concluidas");
  });
  it("vencimento além da próxima semana ainda cai em proxima-semana", () => {
    expect(secaoDe(tarefa({ vencimento: "2026-10-15" }), HOJE)).toBe("proxima-semana");
  });
  it("virada da semana: sábado → hoje; domingo seguinte → atrasado", () => {
    const t = tarefa({ vencimento: "2026-09-12" });
    expect(secaoDe(t, "2026-09-12")).toBe("hoje");
    expect(secaoDe(t, "2026-09-13")).toBe("atrasado");
  });
});

describe("dataDaSecao", () => {
  it("valores", () => {
    expect(dataDaSecao("hoje", HOJE)).toBe("2026-09-09");
    expect(dataDaSecao("amanha", HOJE)).toBe("2026-09-10");
    expect(dataDaSecao("essa-semana", HOJE)).toBe("2026-09-12");
    expect(dataDaSecao("proxima-semana", HOJE)).toBe("2026-09-19");
    expect(dataDaSecao("concluidas", HOJE)).toBeNull();
    expect(dataDaSecao("atrasado", HOJE)).toBeNull();
  });
});

describe("agruparTarefas", () => {
  it("ordena as não-concluídas por ordem asc", () => {
    const g = agruparTarefas(
      [tarefa({ id: "b", vencimento: HOJE, ordem: 20 }), tarefa({ id: "a", vencimento: HOJE, ordem: 10 })],
      HOJE,
    );
    expect(g.hoje.map((t) => t.id)).toEqual(["a", "b"]);
  });
  it("ordena concluidas por concluidaEm desc", () => {
    const g = agruparTarefas(
      [
        tarefa({ id: "velha", concluida: true, concluidaEm: "2026-09-01T10:00:00-03:00" }),
        tarefa({ id: "nova", concluida: true, concluidaEm: "2026-09-08T10:00:00-03:00" }),
      ],
      HOJE,
    );
    expect(g.concluidas.map((t) => t.id)).toEqual(["nova", "velha"]);
  });
});
