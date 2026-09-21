import { describe, it, expect } from "vitest";

import { chaveDoErroVault } from "./mensagensErroVault";
import { PT_BR } from "../i18n/catalogo";

describe("chaveDoErroVault", () => {
  it("mapeia cada código que o Rust devolve", () => {
    expect(chaveDoErroVault("nome_vazio")).toBe("vault.erro.nomeVazio");
    expect(chaveDoErroVault("nome_invalido")).toBe("vault.erro.nomeInvalido");
    expect(chaveDoErroVault("existe")).toBe("vault.erro.existe");
    expect(chaveDoErroVault("pai_indisponivel")).toBe("vault.erro.paiIndisponivel");
  });

  it("código desconhecido cai no erro genérico de local indisponível", () => {
    expect(chaveDoErroVault("meteoro")).toBe("vault.erro.paiIndisponivel");
  });

  it("toda chave devolvida existe no catálogo", () => {
    for (const codigo of ["nome_vazio", "nome_invalido", "existe", "pai_indisponivel", "?"]) {
      expect(PT_BR[chaveDoErroVault(codigo)]).toBeTruthy();
    }
  });
});
