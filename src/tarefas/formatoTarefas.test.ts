import { describe, it, expect } from "vitest";
import { parseTarefas, serializarTarefas, tarefasIlegivel, TAREFAS_VAZIO } from "./formatoTarefas";
import type { DadosTarefas } from "./tipos";

const exemplo: DadosTarefas = {
  versao: 1,
  tarefas: [
    {
      id: "t-0000bbbb",
      titulo: "Segunda",
      vencimento: "2026-09-12",
      ordem: 20,
      concluida: true,
      concluidaEm: "2026-09-10T14:03:11-03:00",
      criadaEm: "2026-09-09T09:00:00-03:00",
      comentarios: [
        { id: "c-1111", texto: "com [[Nota]]", criadoEm: "2026-09-09T09:05:00-03:00", editadoEm: "2026-09-09T10:00:00-03:00" },
      ],
    },
    {
      id: "t-0000aaaa",
      titulo: "Primeira",
      vencimento: "2026-09-11",
      ordem: 10,
      concluida: false,
      concluidaEm: null,
      criadaEm: "2026-09-09T09:01:00-03:00",
      comentarios: [],
    },
  ],
};

describe("serializarTarefas / parseTarefas", () => {
  it("round-trip idempotente", () => {
    const texto = serializarTarefas(exemplo);
    expect(serializarTarefas(parseTarefas(texto))).toBe(texto);
  });

  it("serializar duas vezes dá bytes idênticos", () => {
    expect(serializarTarefas(exemplo)).toBe(serializarTarefas(exemplo));
  });

  it("ordena as tarefas por id no arquivo", () => {
    const texto = serializarTarefas(exemplo);
    expect(texto.indexOf("t-0000aaaa")).toBeLessThan(texto.indexOf("t-0000bbbb"));
  });

  it("preserva a ordem de criação dos comentários", () => {
    const d = parseTarefas(serializarTarefas(exemplo));
    expect(d.tarefas.find((t) => t.id === "t-0000bbbb")!.comentarios[0].id).toBe("c-1111");
  });

  it("JSON inválido vira lista vazia", () => {
    expect(parseTarefas("{ não é json")).toEqual(TAREFAS_VAZIO);
  });

  it("schema errado vira lista vazia", () => {
    expect(parseTarefas(JSON.stringify({ foo: 1 }))).toEqual(TAREFAS_VAZIO);
  });

  it("descarta tarefa sem campos obrigatórios, mantém as válidas", () => {
    const bruto = JSON.stringify({
      versao: 1,
      tarefas: [
        { id: "t-ok", titulo: "ok", vencimento: "2026-09-10", criadaEm: "x", ordem: 5 },
        { id: "t-ruim" },
      ],
    });
    const d = parseTarefas(bruto);
    expect(d.tarefas.map((t) => t.id)).toEqual(["t-ok"]);
    expect(d.tarefas[0].concluida).toBe(false);
    expect(d.tarefas[0].comentarios).toEqual([]);
  });

  it("termina com uma quebra de linha", () => {
    expect(serializarTarefas(exemplo).endsWith("}\n")).toBe(true);
  });
});

describe("tarefasIlegivel", () => {
  it("texto vazio ou só espaço não é ilegível", () => {
    expect(tarefasIlegivel("")).toBe(false);
    expect(tarefasIlegivel("   \n")).toBe(false);
  });
  it("JSON quebrado é ilegível", () => {
    expect(tarefasIlegivel("{ nao json")).toBe(true);
  });
  it("objeto sem array tarefas é ilegível", () => {
    expect(tarefasIlegivel(JSON.stringify({ foo: 1 }))).toBe(true);
  });
  it("objeto com tarefas array (mesmo vazio) é legível", () => {
    expect(tarefasIlegivel(JSON.stringify({ versao: 1, tarefas: [] }))).toBe(false);
    expect(tarefasIlegivel(serializarTarefas(exemplo))).toBe(false);
  });
  it("versao desconhecida é ilegível", () => {
    expect(tarefasIlegivel(JSON.stringify({ versao: 2, tarefas: [] }))).toBe(true);
  });
});
