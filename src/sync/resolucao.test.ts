// src/sync/resolucao.test.ts
import { describe, it, expect } from "vitest";

import { operacoesPara } from "./resolucao";
import type { Conflito } from "./tipos";

const quando = new Date(2026, 8, 21);

const conflito = (caminho = "Diário/reunião.md"): Conflito => ({
  caminho,
  tipo: caminho.endsWith(".draw.md") ? "desenho" : "nota",
  local: { origem: "local", conteudo: "versão daqui", mtimeMs: 2, dispositivo: "Desktop" },
  remoto: { origem: "remoto", conteudo: "versão de lá", mtimeMs: 1, dispositivo: "Notebook" },
});

describe("operacoesPara", () => {
  it("ficar com a local não escreve nada, porque o disco já tem isso", () => {
    expect(operacoesPara(conflito(), { acao: "ficarCom", origem: "local" }, quando)).toEqual([]);
  });

  it("ficar com a remota sobrescreve o caminho original", () => {
    expect(operacoesPara(conflito(), { acao: "ficarCom", origem: "remoto" }, quando)).toEqual([
      { tipo: "escrever", caminho: "Diário/reunião.md", conteudo: "versão de lá" },
    ]);
  });

  it("manter as duas grava a remota numa cópia e não toca no original", () => {
    expect(operacoesPara(conflito(), { acao: "manterAmbas" }, quando)).toEqual([
      {
        tipo: "escrever",
        caminho: "Diário/reunião (conflito de 21-09-2026, Notebook).md",
        conteudo: "versão de lá",
      },
    ]);
  });

  it("a cópia é carimbada com o dispositivo de onde a versão remota veio", () => {
    const c = conflito();
    c.remoto.dispositivo = "Tablet da Ana";
    const [op] = operacoesPara(c, { acao: "manterAmbas" }, quando);
    expect(op.caminho).toContain("Tablet da Ana");
    expect(op.caminho).not.toContain("Desktop");
  });

  it("manter as duas preserva .draw.md na cópia", () => {
    const [op] = operacoesPara(conflito("mapa.draw.md"), { acao: "manterAmbas" }, quando);
    expect(op.caminho).toBe("mapa (conflito de 21-09-2026, Notebook).draw.md");
  });

  it("nenhuma resolução remove arquivo — só existe operação de escrita", () => {
    const todas = [
      ...operacoesPara(conflito(), { acao: "ficarCom", origem: "local" }, quando),
      ...operacoesPara(conflito(), { acao: "ficarCom", origem: "remoto" }, quando),
      ...operacoesPara(conflito(), { acao: "manterAmbas" }, quando),
    ];
    expect(todas.every((op) => op.tipo === "escrever")).toBe(true);
  });
});
