import { describe, it, expect, beforeEach } from "vitest";

import {
  useDialogoStore,
  pedirTexto,
  confirmar,
} from "./dialogoStore";

const store = () => useDialogoStore.getState();

beforeEach(() => {
  useDialogoStore.setState({ atual: null });
});

const pedidoTexto = {
  titulo: "Nova nota",
  rotulo: "Nome",
  valorInicial: "",
  textoConfirmar: "Criar",
};

describe("dialogoStore — substituto de window.prompt/confirm", () => {
  it("pedirTexto abre o diálogo e resolve com o que o usuário respondeu", async () => {
    const promessa = pedirTexto(pedidoTexto);
    expect(store().atual?.tipo).toBe("texto");

    store().responder("Minha nota");

    await expect(promessa).resolves.toBe("Minha nota");
    expect(store().atual).toBeNull();
  });

  it("cancelar resolve com null, não rejeita", async () => {
    const promessa = pedirTexto(pedidoTexto);
    store().responder(null);
    await expect(promessa).resolves.toBeNull();
  });

  it("confirmar resolve com true só quando confirmado", async () => {
    const sim = confirmar({ titulo: "Apagar?", textoConfirmar: "Apagar" });
    store().responder(true);
    await expect(sim).resolves.toBe(true);

    const nao = confirmar({ titulo: "Apagar?", textoConfirmar: "Apagar" });
    store().responder(false);
    await expect(nao).resolves.toBe(false);
  });

  it("abrir um segundo diálogo cancela o primeiro em vez de deixá-lo pendurado", async () => {
    const primeiro = pedirTexto({ ...pedidoTexto, titulo: "Primeiro" });
    const segundo = pedirTexto({ ...pedidoTexto, titulo: "Segundo" });

    await expect(primeiro).resolves.toBeNull();
    expect(store().atual?.titulo).toBe("Segundo");

    store().responder("ok");
    await expect(segundo).resolves.toBe("ok");
  });

  it("responder sem diálogo aberto não quebra", () => {
    expect(() => store().responder("nada")).not.toThrow();
  });
});
