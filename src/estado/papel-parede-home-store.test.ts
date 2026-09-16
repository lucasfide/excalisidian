import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  open: vi.fn(),
  readFile: vi.fn(),
  emit: vi.fn(async (..._args: unknown[]) => {}),
  listen: vi.fn(async (..._args: unknown[]) => () => {}),
  createObjectURL: vi.fn(),
  revokeObjectURL: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mocks.invoke(...args),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => mocks.open(...args),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: (...args: unknown[]) => mocks.readFile(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: (...args: unknown[]) => mocks.emit(...args),
  listen: (...args: unknown[]) => mocks.listen(...args),
}));

vi.mock("../assets/papeis-de-parede/a-morte-de-socrates.jpg", () => ({
  default: "/a-morte-de-socrates.jpg",
}));

import {
  EVENTO_PAPEL_PAREDE_HOME_MUDOU,
} from "../app/papel-de-parede-home";
import { usePapelParedeHomeStore } from "./papel-parede-home-store";

const store = () => usePapelParedeHomeStore.getState();

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.open.mockReset();
  mocks.readFile.mockReset();
  mocks.emit.mockClear();
  mocks.listen.mockClear();
  mocks.createObjectURL.mockReset();
  mocks.revokeObjectURL.mockReset();
  mocks.createObjectURL.mockReturnValue("blob:papel-parede");

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: mocks.createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: mocks.revokeObjectURL,
  });

  usePapelParedeHomeStore.setState({
    papelParedeUrl: "/a-morte-de-socrates.jpg",
    papelParedePersonalizado: false,
    papelParedeCarregando: false,
    erroPapelParede: null,
    papelParedeBlobUrl: null,
  });
});

describe("papelParedeHomeStore", () => {
  it("carrega o arquivo preparado como Blob URL", async () => {
    mocks.invoke.mockResolvedValue({
      path: "C:/AppData/wallpaper.webp",
      mime: "image/webp",
    });
    mocks.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]));

    await store().carregar();

    expect(mocks.invoke).toHaveBeenCalledWith("preparar_papel_parede_home");
    expect(mocks.readFile).toHaveBeenCalledWith("C:/AppData/wallpaper.webp");
    expect(store().papelParedeUrl).toBe("blob:papel-parede");
    expect(store().papelParedePersonalizado).toBe(true);
    expect(store().papelParedeCarregando).toBe(false);
  });

  it("volta ao padrão se o arquivo personalizado não puder ser lido", async () => {
    usePapelParedeHomeStore.setState({
      papelParedeUrl: "blob:anterior",
      papelParedePersonalizado: true,
      papelParedeBlobUrl: "blob:anterior",
    });
    mocks.invoke.mockResolvedValue({
      path: "C:/AppData/ausente.jpg",
      mime: "image/jpeg",
    });
    mocks.readFile.mockRejectedValue(new Error("arquivo ausente"));

    await store().carregar();

    expect(store().papelParedeUrl).toBe("/a-morte-de-socrates.jpg");
    expect(store().papelParedePersonalizado).toBe(false);
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith("blob:anterior");
  });

  it("usa o padrão silenciosamente se o arquivo gerenciado estiver inválido", async () => {
    mocks.invoke.mockRejectedValue(new Error("assinatura inválida"));

    await store().carregar();

    expect(store().papelParedeUrl).toBe("/a-morte-de-socrates.jpg");
    expect(store().papelParedePersonalizado).toBe(false);
    expect(store().erroPapelParede).toBeNull();
  });

  it("escolhe, importa e publica a mudança para as outras janelas", async () => {
    mocks.open.mockResolvedValue("C:/Imagens/minha-foto.png");
    mocks.invoke.mockResolvedValue({
      path: "C:/AppData/wallpaper.png",
      mime: "image/png",
    });
    mocks.readFile.mockResolvedValue(new Uint8Array([4, 5, 6]));

    await store().escolher();

    expect(mocks.open).toHaveBeenCalledWith({
      multiple: false,
      directory: false,
      filters: [
        { name: "Imagens", extensions: ["jpg", "jpeg", "png", "webp"] },
      ],
    });
    expect(mocks.invoke).toHaveBeenCalledWith(
      "importar_papel_parede_home",
      { path: "C:/Imagens/minha-foto.png" },
    );
    expect(store().papelParedeUrl).toBe("blob:papel-parede");
    expect(mocks.emit).toHaveBeenCalledWith(
      EVENTO_PAPEL_PAREDE_HOME_MUDOU,
      expect.objectContaining({ origem: expect.any(String) }),
    );
  });

  it("cancelar o seletor não altera o papel de parede", async () => {
    usePapelParedeHomeStore.setState({
      papelParedeUrl: "blob:anterior",
      papelParedePersonalizado: true,
      papelParedeBlobUrl: "blob:anterior",
    });
    mocks.open.mockResolvedValue(null);

    await store().escolher();

    expect(store().papelParedeUrl).toBe("blob:anterior");
    expect(store().papelParedePersonalizado).toBe(true);
    expect(store().papelParedeCarregando).toBe(false);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("mantém o fundo anterior e expõe erro quando a importação falha", async () => {
    usePapelParedeHomeStore.setState({
      papelParedeUrl: "blob:anterior",
      papelParedePersonalizado: true,
      papelParedeBlobUrl: "blob:anterior",
    });
    mocks.open.mockResolvedValue("C:/Imagens/quebrada.jpg");
    mocks.invoke.mockRejectedValue(new Error("falha nativa"));

    await store().escolher();

    expect(store().papelParedeUrl).toBe("blob:anterior");
    expect(store().papelParedePersonalizado).toBe(true);
    expect(store().erroPapelParede).toContain("fundo anterior foi mantido");
    expect(mocks.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("restaura o padrão e revoga a Blob URL anterior", async () => {
    usePapelParedeHomeStore.setState({
      papelParedeUrl: "blob:anterior",
      papelParedePersonalizado: true,
      papelParedeBlobUrl: "blob:anterior",
    });
    mocks.invoke.mockResolvedValue(undefined);

    await store().restaurar();

    expect(mocks.invoke).toHaveBeenCalledWith("remover_papel_parede_home");
    expect(store().papelParedeUrl).toBe("/a-morte-de-socrates.jpg");
    expect(store().papelParedePersonalizado).toBe(false);
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith("blob:anterior");
    expect(mocks.emit).toHaveBeenCalledWith(
      EVENTO_PAPEL_PAREDE_HOME_MUDOU,
      expect.objectContaining({ origem: expect.any(String) }),
    );
  });
});
