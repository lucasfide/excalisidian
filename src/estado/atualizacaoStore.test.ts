import { describe, it, expect, vi, beforeEach } from "vitest";

const relaunchMock = vi.fn();
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: () => relaunchMock(),
}));

import { useAtualizacaoStore } from "./atualizacaoStore";

const store = () => useAtualizacaoStore.getState();

beforeEach(() => {
  relaunchMock.mockClear();
  useAtualizacaoStore.setState({
    fase: "oculto",
    versao: null,
    notas: null,
    progresso: 0,
    mensagemErro: null,
  });
});

function updateFalso(overrides: { downloadAndInstall: (onEvent?: (e: unknown) => void) => Promise<void> }) {
  return {
    version: "0.2.0",
    body: "Notas do release.",
    ...overrides,
  } as never;
}

describe("atualizacaoStore", () => {
  it("oferecer() guarda a versão e as notas, e abre a fase 'disponivel'", () => {
    store().oferecer(updateFalso({ downloadAndInstall: async () => {} }));

    expect(store().fase).toBe("disponivel");
    expect(store().versao).toBe("0.2.0");
    expect(store().notas).toBe("Notas do release.");
  });

  it("aplicar() acompanha o progresso, chega a 100% e reinicia o app", async () => {
    const update = updateFalso({
      downloadAndInstall: async (onEvent) => {
        onEvent?.({ event: "Started", data: { contentLength: 200 } });
        onEvent?.({ event: "Progress", data: { chunkLength: 100 } });
        onEvent?.({ event: "Progress", data: { chunkLength: 100 } });
        onEvent?.({ event: "Finished" });
      },
    });
    store().oferecer(update);

    await store().aplicar();

    expect(store().progresso).toBe(1);
    expect(relaunchMock).toHaveBeenCalledTimes(1);
  });

  it("aplicar() com falha no download vai para a fase 'erro' e não reinicia", async () => {
    const update = updateFalso({
      downloadAndInstall: async () => {
        throw new Error("rede caiu");
      },
    });
    store().oferecer(update);

    await store().aplicar();

    expect(store().fase).toBe("erro");
    expect(store().mensagemErro).toBe(
      "Não foi possível baixar a atualização. Tente de novo mais tarde.",
    );
    expect(relaunchMock).not.toHaveBeenCalled();
  });

  it("adiar() esconde o diálogo sem mudar versão/notas", () => {
    store().oferecer(updateFalso({ downloadAndInstall: async () => {} }));

    store().adiar();

    expect(store().fase).toBe("oculto");
  });

  it("fechar() esconde o diálogo de erro e limpa a mensagem", () => {
    useAtualizacaoStore.setState({ fase: "erro", mensagemErro: "algo deu errado" });

    store().fechar();

    expect(store().fase).toBe("oculto");
    expect(store().mensagemErro).toBeNull();
  });
});
