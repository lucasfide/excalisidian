import { describe, it, expect } from "vitest";

import { mensagemFalhaAbrir } from "./mensagemFalhaAbrir";
import { PT_BR } from "../i18n/catalogo";

describe("mensagemFalhaAbrir", () => {
  it("reconhece a mensagem exata do relato (os error 3) e extrai o nome do caminho", () => {
    const erro =
      'IO error for operation on C:\\Users\\alguem\\Vaults\\Teste sincronização: The system cannot find the path specified. (os error 3)';
    expect(mensagemFalhaAbrir(erro, "C:\\Users\\alguem\\Vaults\\Teste sincronização")).toEqual({
      chave: "vault.erroAbrir.pastaNaoEncontrada",
      valores: { nome: "Teste sincronização" },
    });
  });

  it("reconhece os error 2 (arquivo não encontrado)", () => {
    const erro = "IO error: The system cannot find the file specified. (os error 2)";
    expect(mensagemFalhaAbrir(erro, "C:\\Vaults\\Sumido")).toEqual({
      chave: "vault.erroAbrir.pastaNaoEncontrada",
      valores: { nome: "Sumido" },
    });
  });

  it("reconhece variações textuais em inglês", () => {
    expect(
      mensagemFalhaAbrir("cannot find the path specified", "/home/user/MeuVault"),
    ).toEqual({ chave: "vault.erroAbrir.pastaNaoEncontrada", valores: { nome: "MeuVault" } });
    expect(
      mensagemFalhaAbrir("cannot find the file specified", "/home/user/MeuVault"),
    ).toEqual({ chave: "vault.erroAbrir.pastaNaoEncontrada", valores: { nome: "MeuVault" } });
    expect(
      mensagemFalhaAbrir("No such file or directory (os error 2)", "/home/user/MeuVault"),
    ).toEqual({ chave: "vault.erroAbrir.pastaNaoEncontrada", valores: { nome: "MeuVault" } });
  });

  it("reconhece as mensagens em português do Windows", () => {
    expect(
      mensagemFalhaAbrir("O sistema não pode encontrar o caminho especificado.", "C:\\X\\Y"),
    ).toEqual({ chave: "vault.erroAbrir.pastaNaoEncontrada", valores: { nome: "Y" } });
    expect(
      mensagemFalhaAbrir("O sistema não pode encontrar o arquivo especificado.", "C:\\X\\Y"),
    ).toEqual({ chave: "vault.erroAbrir.pastaNaoEncontrada", valores: { nome: "Y" } });
  });

  it("pasta não encontrada sem caminho conhecido cai no genérico", () => {
    expect(mensagemFalhaAbrir("os error 3", undefined)).toEqual({
      chave: "vault.erroAbrir.generico",
    });
  });

  it("qualquer outro erro cai no genérico", () => {
    expect(mensagemFalhaAbrir("access is denied (os error 5)", "C:\\X\\Y")).toEqual({
      chave: "vault.erroAbrir.generico",
    });
    expect(mensagemFalhaAbrir("erro desconhecido qualquer")).toEqual({
      chave: "vault.erroAbrir.generico",
    });
  });

  it("nunca devolve a string crua do erro em `chave`", () => {
    const resultado = mensagemFalhaAbrir("qualquer coisa", "C:\\X\\Y");
    expect(Object.values(PT_BR)).not.toContain(resultado);
    expect(typeof resultado.chave).toBe("string");
    expect(resultado.chave.startsWith("vault.erroAbrir.")).toBe(true);
  });

  it("toda chave devolvida existe no catálogo", () => {
    expect(PT_BR[mensagemFalhaAbrir("os error 3", "C:\\X\\Y").chave]).toBeTruthy();
    expect(PT_BR[mensagemFalhaAbrir("outra coisa").chave]).toBeTruthy();
  });
});
