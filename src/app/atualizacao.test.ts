import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-updater");
vi.mock("sonner");
vi.mock("../estado/atualizacaoStore");

import { verificarAtualizacao } from "./atualizacao";
import { check } from "@tauri-apps/plugin-updater";
import { toast } from "sonner";
import { useAtualizacaoStore } from "../estado/atualizacaoStore";

const checkMock = vi.mocked(check);
const toastMock = vi.mocked(toast);
const toastErrorMock = vi.mocked(toast).error;
const storeMock = vi.mocked(useAtualizacaoStore);

beforeEach(() => {
  checkMock.mockReset();
  toastMock.mockReset();
  toastErrorMock.mockReset();
  storeMock.getState.mockReturnValue({
    oferecer: vi.fn(),
    fase: "oculto",
    versao: null,
    notas: null,
    progresso: 0,
    mensagemErro: null,
  } as never);
});

describe("verificarAtualizacao", () => {
  it("silenciosa + sem atualização: não mostra nada", async () => {
    checkMock.mockResolvedValue(null);

    await verificarAtualizacao({ silencioso: true });

    expect(toastMock).not.toHaveBeenCalled();
    expect(storeMock.getState().oferecer).not.toHaveBeenCalled();
  });

  it("manual + sem atualização: avisa que já está atualizado", async () => {
    checkMock.mockResolvedValue(null);

    await verificarAtualizacao({ silencioso: false });

    expect(toastMock).toHaveBeenCalledWith("Você já está na versão mais recente.");
  });

  it("com atualização disponível: oferece, silenciosa ou não", async () => {
    const update = { version: "0.2.0" } as never;
    checkMock.mockResolvedValue(update);

    await verificarAtualizacao({ silencioso: true });

    expect(storeMock.getState().oferecer).toHaveBeenCalledWith(update);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("silenciosa + erro: não lança e não avisa", async () => {
    checkMock.mockRejectedValue(new Error("rede caiu"));

    await expect(verificarAtualizacao({ silencioso: true })).resolves.toBeUndefined();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("manual + erro: avisa com toast.error", async () => {
    checkMock.mockRejectedValue(new Error("rede caiu"));

    await verificarAtualizacao({ silencioso: false });

    expect(toastErrorMock).toHaveBeenCalledWith("Não foi possível verificar atualizações.");
  });
});
