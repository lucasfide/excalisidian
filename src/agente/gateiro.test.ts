// Doc 11 §12, itens 3 e 4: parse defensivo do gateiro e camada 0 pura.
import { describe, it, expect } from "vitest";

import {
  interpretarGateiro,
  deveConvidar,
  promptGateiro,
  GATEIRO_CHARS,
} from "./gateiro";
import {
  caracteresNovos,
  textoNovo,
  deveRodarCiclo,
  deveRodarGateiro,
  cresceuDemais,
  DIFUS_MINIMO_CHARS,
} from "./gatilhos";

describe("gateiro", () => {
  it("JSON limpo vira veredito", () => {
    const v = interpretarGateiro('{"valeParticipar": true, "tema": "arquitetura do sync", "confianca": 0.9}');
    expect(v).toEqual({ valeParticipar: true, tema: "arquitetura do sync", confianca: 0.9 });
  });

  it("JSON dentro de cerca de código também", () => {
    const v = interpretarGateiro('```json\n{"valeParticipar": false, "tema": "lista", "confianca": 0.2}\n```');
    expect(v?.valeParticipar).toBe(false);
  });

  it("texto antes do JSON não quebra", () => {
    const v = interpretarGateiro('Claro! {"valeParticipar": true, "tema": "nota", "confianca": 0.7} fim');
    expect(v?.tema).toBe("nota");
  });

  it("lixo, ausência de campo ou tema vazio devolvem null (nunca lança)", () => {
    expect(interpretarGateiro("não é json")).toBeNull();
    expect(interpretarGateiro('{"valeParticipar": "sim", "tema": "x", "confianca": 1}')).toBeNull();
    expect(interpretarGateiro('{"valeParticipar": true, "tema": "  ", "confianca": 1}')).toBeNull();
  });

  it("confianca fora de 0..1 é cortada", () => {
    expect(interpretarGateiro('{"valeParticipar": true, "tema": "a", "confianca": 7}')?.confianca).toBe(1);
  });

  it("deveConvidar exige valeParticipar E confiança mínima", () => {
    expect(deveConvidar({ valeParticipar: true, tema: "a", confianca: 0.5 })).toBe(true);
    expect(deveConvidar({ valeParticipar: true, tema: "a", confianca: 0.49 })).toBe(false);
    expect(deveConvidar({ valeParticipar: false, tema: "a", confianca: 1 })).toBe(false);
    expect(deveConvidar(null)).toBe(false);
  });

  it("prompt recorta a nota em 2.000 chars", () => {
    expect(promptGateiro("x".repeat(5000))).toHaveLength(GATEIRO_CHARS);
  });
});

describe("gatilhos", () => {
  it("caracteresNovos: 0 quando nada mudou, contagem quando cresceu", () => {
    expect(caracteresNovos("a\nb", "a\nb")).toBe(0);
    expect(caracteresNovos("a\nb", "a\nb\ncde")).toBe(4); // "cde" + 1 de quebra
    expect(caracteresNovos(null, "abc")).toBe(3);
  });

  it("caracteresNovos não pune reordenação nem conta linha repetida a mais", () => {
    expect(caracteresNovos("a\nb", "b\na")).toBe(0);
    expect(caracteresNovos("x\nx", "x\nx\nx")).toBe(2); // um "x" novo
  });

  it("textoNovo marca + e - por linha", () => {
    const d = textoNovo("um\ndois", "um\ntrês");
    expect(d).toContain("+ três");
    expect(d).toContain("- dois");
    // linha que permanece no multiconjunto não é remoção, mesmo trocando de posição
    expect(textoNovo("um\ndois", "um\ndois e meio\ndois")).toBe("+ dois e meio");
  });

  it("deveRodarCiclo exige aceite, volume e ausência de voo", () => {
    const base = {
      habilitado: true,
      pausado: false,
      participacao: "aceito",
      caracteresNovos: DIFUS_MINIMO_CHARS,
      emVoo: false,
    };
    expect(deveRodarCiclo(base)).toBe(true);
    expect(deveRodarCiclo({ ...base, participacao: undefined })).toBe(false);
    expect(deveRodarCiclo({ ...base, participacao: "recusado" })).toBe(false);
    expect(deveRodarCiclo({ ...base, caracteresNovos: DIFUS_MINIMO_CHARS - 1 })).toBe(false);
    expect(deveRodarCiclo({ ...base, emVoo: true })).toBe(false);
    expect(deveRodarCiclo({ ...base, pausado: true })).toBe(false);
  });

  it("deveRodarGateiro exige nota sem participação e tentativa elegível", () => {
    const base = {
      habilitado: true,
      pausado: false,
      semParticipacao: true,
      elegivel: true,
      notaSuficiente: true,
      emVoo: false,
    };
    expect(deveRodarGateiro(base)).toBe(true);
    expect(deveRodarGateiro({ ...base, semParticipacao: false })).toBe(false);
    expect(deveRodarGateiro({ ...base, notaSuficiente: false })).toBe(false);
    expect(deveRodarGateiro({ ...base, elegivel: false })).toBe(false);
  });

  it("cresceuDemais: +50% e pelo menos um difus inteiro (doc 11 §5.1)", () => {
    expect(cresceuDemais(1000, 1500)).toBe(true);
    expect(cresceuDemais(1000, 1100)).toBe(false);
    expect(cresceuDemais(100, 150)).toBe(false); // 50% mas abaixo do piso de 200
  });
});
