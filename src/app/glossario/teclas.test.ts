import { describe, it, expect } from "vitest";
import { rotulosDoCombo } from "./teclas";

describe("rotulosDoCombo", () => {
  it("Mod vira Ctrl fora do Mac", () => expect(rotulosDoCombo("Mod-Shift-x", false)).toEqual(["Ctrl", "Shift", "X"]));
  it("Mod vira ⌘ e Alt vira ⌥ no Mac", () => expect(rotulosDoCombo("Mod-Alt-g", true)).toEqual(["⌘", "⌥", "G"]));
  it("setas viram símbolo", () => expect(rotulosDoCombo("Alt-ArrowUp", false)).toEqual(["Alt", "↑"]));
  it("teclas nomeadas", () => {
    expect(rotulosDoCombo("Enter", false)).toEqual(["Enter"]);
    expect(rotulosDoCombo("Shift-Tab", false)).toEqual(["Shift", "Tab"]);
    expect(rotulosDoCombo("F3", false)).toEqual(["F3"]);
  });
  it("hífen e vírgula como tecla", () => {
    expect(rotulosDoCombo("Mod--", false)).toEqual(["Ctrl", "-"]);
    expect(rotulosDoCombo("Mod-,", false)).toEqual(["Ctrl", ","]);
  });
  it("faixa numérica literal", () => expect(rotulosDoCombo("Mod-1…9", false)).toEqual(["Ctrl", "1…9"]));
  it("letra sozinha (ferramenta do desenho)", () => expect(rotulosDoCombo("v", false)).toEqual(["V"]));
});
