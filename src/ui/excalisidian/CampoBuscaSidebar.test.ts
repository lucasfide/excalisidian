import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ehMacMock } = vi.hoisted(() => ({ ehMacMock: vi.fn(() => false) }));
vi.mock("../../app/glossario/teclas", async (orig) => ({
  ...(await orig<typeof import("../../app/glossario/teclas")>()),
  ehMac: ehMacMock,
}));

import { rotuloDoAtalho } from "../../app/glossario/teclas";
import CampoBuscaSidebar from "./CampoBuscaSidebar";

describe("rótulo de atalho da busca", () => {
  beforeEach(() => ehMacMock.mockReturnValue(false));

  it("no Windows e no Linux continua CTRL O", () => {
    expect(renderToStaticMarkup(createElement(CampoBuscaSidebar))).toContain(">CTRL O<");
    expect(rotuloDoAtalho("Mod-t", false)).toBe("CTRL T");
  });

  it("no macOS mostra ⌘ e nenhum CTRL", () => {
    ehMacMock.mockReturnValue(true);
    const html = renderToStaticMarkup(createElement(CampoBuscaSidebar));
    expect(html).toContain(">⌘ O<");
    expect(html).not.toContain("CTRL");
    expect(rotuloDoAtalho("Mod-d", true)).toBe("⌘ D");
  });
});
