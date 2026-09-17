import { describe, it, expect, beforeEach } from "vitest";
import { useSobreposicaoStore } from "./sobreposicaoStore";

beforeEach(() => {
  useSobreposicaoStore.setState({ aberta: null, ultimaConsulta: "" });
});

describe("sobreposicaoStore", () => {
  it("abrir define o tipo aberto", () => {
    useSobreposicaoStore.getState().abrir("busca");
    expect(useSobreposicaoStore.getState().aberta).toBe("busca");
  });

  it("abrir permite a sobreposição da galeria", () => {
    useSobreposicaoStore.getState().abrir("galeria");
    expect(useSobreposicaoStore.getState().aberta).toBe("galeria");
  });

  it("abrir com o mesmo tipo já aberto fecha (mesma tecla alterna, doc 13 §1.1)", () => {
    useSobreposicaoStore.getState().abrir("busca");
    useSobreposicaoStore.getState().abrir("busca");
    expect(useSobreposicaoStore.getState().aberta).toBeNull();
  });

  it("abrir um tipo diferente troca em vez de fechar", () => {
    useSobreposicaoStore.getState().abrir("busca");
    useSobreposicaoStore.getState().abrir("comandos");
    expect(useSobreposicaoStore.getState().aberta).toBe("comandos");
  });

  it("fechar sempre limpa, mesmo sem nada aberto", () => {
    useSobreposicaoStore.getState().fechar();
    expect(useSobreposicaoStore.getState().aberta).toBeNull();
  });

  it("ultimaConsulta é memória de sessão: sobrevive a fechar/abrir", () => {
    useSobreposicaoStore.getState().abrir("busca");
    useSobreposicaoStore.getState().definirUltimaConsulta("reuniao");
    useSobreposicaoStore.getState().fechar();
    expect(useSobreposicaoStore.getState().ultimaConsulta).toBe("reuniao");

    useSobreposicaoStore.getState().abrir("busca");
    expect(useSobreposicaoStore.getState().ultimaConsulta).toBe("reuniao");
  });
});
