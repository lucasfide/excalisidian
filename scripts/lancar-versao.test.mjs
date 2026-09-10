import { describe, it, expect } from "vitest";
import {
  substituirVersaoEmJson,
  versaoDoCargoToml,
} from "./lancar-versao.mjs";

describe("lancar-versao", () => {
  it("troca a versão num JSON no formato do package.json, mantendo o resto", () => {
    const original =
      JSON.stringify({ name: "excalisidian", version: "0.1.0", private: true }, null, 2) +
      "\n";
    const resultado = substituirVersaoEmJson(original, "0.2.0");
    expect(JSON.parse(resultado)).toEqual({
      name: "excalisidian",
      version: "0.2.0",
      private: true,
    });
  });

  it("troca a versão num JSON no formato do tauri.conf.json, mantendo o resto", () => {
    const original =
      JSON.stringify({ productName: "Excalisidian", version: "0.1.0" }, null, 2) + "\n";
    const resultado = substituirVersaoEmJson(original, "0.2.0");
    expect(JSON.parse(resultado)).toEqual({ productName: "Excalisidian", version: "0.2.0" });
  });

  it("troca só a versão do pacote no Cargo.toml, sem tocar versão de dependência", () => {
    const original = [
      "[package]",
      'name = "excalisidian"',
      'version = "0.1.0"',
      "",
      "[dependencies]",
      'tauri = { version = "2", features = [] }',
      "",
    ].join("\n");
    const resultado = versaoDoCargoToml(original, "0.2.0");
    expect(resultado).toContain('tauri = { version = "2", features = [] }');
    expect(resultado.match(/^version = "0\.2\.0"$/m)).toBeTruthy();
  });
});
