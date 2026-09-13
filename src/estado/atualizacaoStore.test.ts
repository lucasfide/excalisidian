import { describe, it, expect, vi, beforeEach } from "vitest";

const relaunchMock = vi.fn();
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: () => relaunchMock(),
}));

// O flush completo puxa documentosStore/tarefasStore (que usam `window` e plugins do
// Tauri); aqui ele é simulado e controlado pelo teste.
interface ResultadoFlushFalso {
  falhas: string[];
  bloqueados: string[];
  tarefasOk: boolean;
}
const flushMock = vi.fn(
  async (): Promise<ResultadoFlushFalso> => ({ falhas: [], bloqueados: [], tarefasOk: true }),
);
vi.mock("./flushGeral", () => ({
  flusharTudoAntesDeSair: () => flushMock(),
}));

const confirmarMock = vi.fn(async () => false);
vi.mock("./dialogoStore", () => ({
  confirmar: () => confirmarMock(),
}));

import { useAtualizacaoStore } from "./atualizacaoStore";

const store = () => useAtualizacaoStore.getState();

beforeEach(() => {
  relaunchMock.mockClear();
  flushMock.mockClear();
  flushMock.mockImplementation(async () => ({ falhas: [], bloqueados: [], tarefasOk: true }));
  confirmarMock.mockClear();
  confirmarMock.mockImplementation(async () => false);
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

  it("aplicar() com download bem-sucedido mas falha no relaunch vai para a fase 'reiniciar'", async () => {
    relaunchMock.mockRejectedValueOnce(new Error("relaunch failed"));
    const update = updateFalso({
      downloadAndInstall: async (onEvent) => {
        onEvent?.({ event: "Started", data: { contentLength: 100 } });
        onEvent?.({ event: "Progress", data: { chunkLength: 100 } });
        onEvent?.({ event: "Finished" });
      },
    });
    store().oferecer(update);

    await store().aplicar();

    expect(store().fase).toBe("reiniciar");
    expect(store().mensagemErro).toBeNull();
    expect(store().progresso).toBe(1);
  });

  it("adiar() esconde o diálogo sem mudar versão/notas", () => {
    store().oferecer(updateFalso({ downloadAndInstall: async () => {} }));

    store().adiar();

    expect(store().fase).toBe("oculto");
    expect(store().versao).toBe("0.2.0");
    expect(store().notas).toBe("Notas do release.");
  });

  it("fechar() esconde o diálogo de erro e limpa a mensagem", () => {
    useAtualizacaoStore.setState({ fase: "erro", mensagemErro: "algo deu errado" });

    store().fechar();

    expect(store().fase).toBe("oculto");
    expect(store().mensagemErro).toBeNull();
  });

  // Regressão do achado 06 da auditoria de 12/09: downloadAndInstall encerra o processo
  // no Windows, então o flush completo tem que acontecer ANTES da instalação.
  it("aplicar() drena as pendências antes de baixar a atualização", async () => {
    const download = vi.fn(async () => {});
    store().oferecer(updateFalso({ downloadAndInstall: download }));

    await store().aplicar();

    expect(flushMock).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledTimes(1);
    expect(flushMock.mock.invocationCallOrder[0]).toBeLessThan(
      download.mock.invocationCallOrder[0],
    );
  });

  it("aplicar() com flush falho pergunta e não instala se o usuário cancelar", async () => {
    flushMock.mockImplementation(async () => ({
      falhas: ["Nota.md"],
      bloqueados: [],
      tarefasOk: true,
    }));
    const download = vi.fn(async () => {});
    store().oferecer(updateFalso({ downloadAndInstall: download }));

    await store().aplicar();

    expect(confirmarMock).toHaveBeenCalledTimes(1);
    expect(download).not.toHaveBeenCalled();
    expect(relaunchMock).not.toHaveBeenCalled();
    expect(store().fase).toBe("disponivel");
  });

  it("aplicar() com flush falho instala quando o usuário confirma", async () => {
    flushMock.mockImplementation(async () => ({
      falhas: [],
      bloqueados: ["Nota.md"],
      tarefasOk: true,
    }));
    confirmarMock.mockImplementation(async () => true);
    const download = vi.fn(async () => {});
    store().oferecer(updateFalso({ downloadAndInstall: download }));

    await store().aplicar();

    expect(download).toHaveBeenCalledTimes(1);
    expect(relaunchMock).toHaveBeenCalledTimes(1);
  });
});
