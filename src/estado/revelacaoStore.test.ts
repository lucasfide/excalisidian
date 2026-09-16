import { describe, it, expect, beforeEach } from "vitest";

import { useRevelacaoStore } from "./revelacaoStore";

beforeEach(() => {
  useRevelacaoStore.setState({ pendente: null });
});

describe("revelacaoStore", () => {
  it("consumir devolve o texto e limpa o pendente", () => {
    useRevelacaoStore.getState().pedir("Nota.md", "trecho procurado");

    expect(useRevelacaoStore.getState().consumir("Nota.md")).toBe("trecho procurado");
    expect(useRevelacaoStore.getState().pendente).toBeNull();
  });

  it("consumir de outro caminho não mexe no pedido pendente", () => {
    useRevelacaoStore.getState().pedir("Nota.md", "trecho procurado");

    expect(useRevelacaoStore.getState().consumir("Outra.md")).toBeNull();
    expect(useRevelacaoStore.getState().pendente?.path).toBe("Nota.md");
  });

  it("consumir duas vezes: a segunda não revela de novo (remount não repete)", () => {
    useRevelacaoStore.getState().pedir("Nota.md", "trecho");
    useRevelacaoStore.getState().consumir("Nota.md");

    expect(useRevelacaoStore.getState().consumir("Nota.md")).toBeNull();
  });

  it("seq incrementa a cada pedido, mesmo com o mesmo texto — permite revelar de novo", () => {
    useRevelacaoStore.getState().pedir("Nota.md", "trecho");
    const primeiro = useRevelacaoStore.getState().pendente;

    useRevelacaoStore.getState().pedir("Nota.md", "trecho");
    const segundo = useRevelacaoStore.getState().pendente;

    expect(primeiro?.seq).toBeDefined();
    expect(segundo?.seq).toBeGreaterThan(primeiro!.seq);
  });

  it("um novo pedido sobrescreve um pedido anterior não consumido", () => {
    useRevelacaoStore.getState().pedir("A.md", "um");
    useRevelacaoStore.getState().pedir("B.md", "dois");

    expect(useRevelacaoStore.getState().consumir("A.md")).toBeNull();
    expect(useRevelacaoStore.getState().consumir("B.md")).toBe("dois");
  });
});
