// Doc 11 §12, item 6 (parte de memória): round-trip dos arquivos e poda de resumos.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { stores } = vi.hoisted(() => ({
  stores: new Map<string, Map<string, unknown>>(),
}));
vi.mock("@tauri-apps/plugin-store", () => ({
  load: async (nome: string) => {
    if (!stores.has(nome)) stores.set(nome, new Map());
    const mem = stores.get(nome)!;
    return {
      get: async (k: string) => mem.get(k),
      set: async (k: string, v: unknown) => void mem.set(k, v),
      save: async () => {},
      delete: async (k: string) => void mem.delete(k),
    };
  },
}));

import {
  adicionarFatos,
  proporFatos,
  confirmarFato,
  atualizarFato,
  rejeitarFato,
  criarPreferenciaUsuario,
  selecionarFatosRelevantes,
  MAX_FATO_CHARS,
  ORCAMENTO_FATOS_PROMPT,
  carregarConversas,
  carregarFatos,
  carregarParticipacao,
  carregarResumos,
  limparMemoria,
  salvarConversas,
  salvarFatos,
  salvarParticipacao,
  salvarResumos,
  pastaAgenteRelativa,
  podarAnalises,
} from "./memoria";
import { hashVault } from "../indice/cache";

const RAIZ = "C:/vault";

beforeEach(() => stores.clear());

describe("memoria", () => {
  it("participação round-trip; arquivo inexistente é mapa vazio", async () => {
    expect(await carregarParticipacao(RAIZ)).toEqual({});
    await salvarParticipacao(RAIZ, { "a.md": "recusado", "b.md": "aceito" });
    expect(await carregarParticipacao(RAIZ)).toEqual({
      "a.md": "recusado",
      "b.md": "aceito",
    });
  });

  it("resumos round-trip por caminho", async () => {
    await salvarResumos(RAIZ, {
      "x.md": { mtimeMs: 5, size: 10, resumo: "nota sobre y" },
    });
    expect(await carregarResumos(RAIZ)).toEqual({
      "x.md": { mtimeMs: 5, size: 10, resumo: "nota sobre y" },
    });
  });

  it("resumos acima de 400 são podados pelos mais antigos por inserção", async () => {
    const mapa: Record<string, { mtimeMs: number; size: number; resumo: string }> = {};
    for (let i = 0; i < 450; i++) {
      mapa[`n${i}.md`] = { mtimeMs: i, size: 1, resumo: "r" };
    }
    await salvarResumos(RAIZ, mapa);
    const lidos = await carregarResumos(RAIZ);
    expect(Object.keys(lidos)).toHaveLength(400);
    expect(lidos["n0.md"]).toBeUndefined();
    expect(lidos["n449.md"]).toBeDefined();
  });

  it("os arquivos vivem na pasta do vault certo, separados por vault", async () => {
    await salvarParticipacao(RAIZ, { "a.md": "aceito" });
    await salvarParticipacao("C:/outro", { "b.md": "recusado" });
    expect(await carregarParticipacao(RAIZ)).toEqual({ "a.md": "aceito" });
    expect(await carregarParticipacao("C:/outro")).toEqual({ "b.md": "recusado" });
    expect(pastaAgenteRelativa(RAIZ)).toBe(`agente/${hashVault(RAIZ)}`);
  });

  it("JSON corrompido no cache é tratado como vazio (nunca trava)", async () => {
    stores.set(`agente/${hashVault(RAIZ)}/participacao.json`, new Map([
      ["dados", { version: 999, dados: "não importa" }],
    ]));
    expect(await carregarParticipacao(RAIZ)).toEqual({});
  });

  it("strings antigas do modelo não são gravadas como memória estruturada", () => {
    const atuais: import("./memoria").Fato[] = [];
    expect(adicionarFatos(atuais, ["usa Core para o backend"], "N.md")).toBe(atuais);
  });

  it("proporFatos valida a citação e cria candidatos pendentes sem substituir confirmados", () => {
    const atuais = [{
      id: "antigo", texto: "O editor prefere respostas breves", notaOrigem: "A.md", criadoEm: "2026-01-01",
      categoria: "preferencia" as const, escopo: "vault" as const, caminhoProjeto: null,
      chave: "estilo-resposta", trechoEvidencia: "Prefiro respostas breves.", fonte: "nota" as const, estado: "confirmado" as const,
    }];
    const resultado = proporFatos(atuais, [
      { categoria: "preferencia", escopo: "vault", chave: "estilo-resposta", texto: "Prefere respostas detalhadas", trechoEvidencia: "Prefiro respostas detalhadas." },
      { categoria: "preferencia", escopo: "vault", chave: "inventado", texto: "Usa Rust", trechoEvidencia: "Usa Rust." },
      { categoria: "convencao", escopo: "projeto", caminhoProjeto: "Projetos/Outro", chave: "fora", texto: "Convenção alheia", trechoEvidencia: "Prefiro respostas detalhadas." },
    ], "A.md", "Prefiro respostas detalhadas.", new Date("2026-09-13T00:00:00Z"));
    expect(resultado).toHaveLength(2);
    expect(resultado[0].estado).toBe("confirmado");
    expect(resultado[1]).toMatchObject({ estado: "pendente", texto: "Prefere respostas detalhadas", notaOrigem: "A.md", trechoEvidencia: "Prefiro respostas detalhadas." });
  });

  it("confirma por chave e só então substitui a versão anterior", () => {
    const antigos = [{
      id: "old", texto: "Prefere respostas breves", notaOrigem: "A.md", criadoEm: "2026-01-01",
      categoria: "preferencia" as const, escopo: "vault" as const, caminhoProjeto: null,
      chave: "estilo", trechoEvidencia: "Prefiro respostas breves", estado: "confirmado" as const,
    }];
    const pendentes = proporFatos(antigos, [{
      categoria: "preferencia", escopo: "vault", chave: "estilo", texto: "Prefere respostas detalhadas", trechoEvidencia: "Prefiro respostas detalhadas",
    }], "A.md", "Prefiro respostas detalhadas", new Date("2026-09-13T00:00:00Z"));
    const antesDeConfirmar = selecionarFatosRelevantes(pendentes, "respostas breves", 4800, "A.md");
    expect(antesDeConfirmar).toContain("Prefere respostas breves");
    expect(antesDeConfirmar).not.toContain("Prefere respostas detalhadas");
    const confirmados = confirmarFato(pendentes, pendentes[1].id);
    expect(confirmados[0].estado).toBe("substituido");
    expect(confirmados[1].estado).toBe("confirmado");
    expect(selecionarFatosRelevantes(confirmados, "respostas", 4800, "A.md")).toContain("Prefere respostas detalhadas");
  });

  it("promove legado somente por confirmação explícita e exige editar texto longo antes", () => {
    const legado: import("./memoria").Fato[] = [
      { id: "legado", texto: "Convenção histórica", notaOrigem: "N.md", criadoEm: "2025-01-01" },
      { id: "longo", texto: "x".repeat(MAX_FATO_CHARS + 1), notaOrigem: null, criadoEm: "2025-01-01" },
    ];
    const confirmado = confirmarFato(legado, "legado", new Date("2026-09-13T00:00:00Z"));
    expect(confirmado[0]).toMatchObject({ estado: "confirmado", categoria: "convencao", escopo: "vault", fonte: "usuario", trechoEvidencia: null, notaOrigem: "N.md" });
    expect(confirmarFato(legado, "longo")).toBe(legado);
  });

  it("novos candidatos não removem fatos confirmados existentes", () => {
    const confirmado: import("./memoria").Fato = {
      id: "fixo", texto: "Fato durável", notaOrigem: "N.md", criadoEm: "2025-01-01",
      categoria: "convencao", escopo: "vault", chave: "duravel", estado: "confirmado",
    };
    const candidatos = Array.from({ length: 101 }, (_, indice) => ({
      categoria: "glossario" as const, escopo: "vault" as const,
      chave: `chave-${indice}`, texto: `candidato ${indice}`, trechoEvidencia: "evidência",
    }));
    const resultado = proporFatos([confirmado], candidatos, "N.md", "evidência");
    expect(resultado).toHaveLength(101);
    expect(resultado[0]).toBe(confirmado);
    expect(resultado.filter((fato) => fato.estado === "pendente")).toHaveLength(100);
  });

  it("normaliza caminhos do projeto ao substituir pela mesma chave", () => {
    const atuais: import("./memoria").Fato[] = [{
      id: "anterior", texto: "Termo anterior", notaOrigem: "Projetos/A/Nota.md", criadoEm: "2026-01-01",
      categoria: "glossario", escopo: "projeto", caminhoProjeto: "Projetos/A", chave: "termo", estado: "confirmado",
    }];
    const pendentes = proporFatos(atuais, [{
      categoria: "glossario", escopo: "projeto", caminhoProjeto: "Projetos\\A\\", chave: "termo", texto: "Termo atualizado", trechoEvidencia: "Termo atualizado",
    }], "Projetos/A/Nota.md", "Termo atualizado");
    const resultado = confirmarFato(pendentes, pendentes[1].id);
    expect(resultado[0].estado).toBe("substituido");
    expect(resultado[1].estado).toBe("confirmado");
  });

  it("não reapresenta texto idêntico já confirmado ou legado", () => {
    const atuais: import("./memoria").Fato[] = [
      { id: "confirmado", texto: "Termo definido no glossário", notaOrigem: "N.md", criadoEm: "2026-01-01", estado: "confirmado", categoria: "glossario", escopo: "vault", chave: "termo" },
      { id: "legado", texto: "Convenção histórica", notaOrigem: null, criadoEm: "2025-01-01" },
    ];
    const resultado = proporFatos(atuais, [
      { categoria: "glossario", escopo: "vault", chave: "novo", texto: "  termo definido NO glossário ", trechoEvidencia: "termo definido no glossário" },
      { categoria: "convencao", escopo: "vault", chave: "outra", texto: "Convenção histórica", trechoEvidencia: "Convenção histórica" },
    ], "N.md", "termo definido no glossário; Convenção histórica");
    expect(resultado).toBe(atuais);
  });

  it("rejeita fatos acima de 500 code points sem truncar os demais", () => {
    const longo = "x".repeat(MAX_FATO_CHARS + 1);
    const emoji = "😀".repeat(MAX_FATO_CHARS + 1);
    const resultado = proporFatos([], [
      { categoria: "glossario", escopo: "vault", chave: "curto", texto: "Fato curto", trechoEvidencia: "curto" },
      { categoria: "glossario", escopo: "vault", chave: "longo", texto: longo, trechoEvidencia: "curto" },
      { categoria: "glossario", escopo: "vault", chave: "emoji", texto: emoji, trechoEvidencia: "curto" },
    ], "A.md", "curto");
    expect(resultado.map((fato) => fato.texto)).toEqual(["Fato curto"]);
  });

  it("seleciona fatos relevantes inteiros e desempata por recência dentro do orçamento", () => {
    const fatos: import("./memoria").Fato[] = [
      { id: "antigo", texto: "Convenção do backend Core", notaOrigem: null, criadoEm: "2026-01-01", estado: "confirmado", categoria: "convencao", escopo: "vault", chave: "backend" },
      { id: "recente", texto: "Preferência pelo backend Core", notaOrigem: null, criadoEm: "2026-02-01", estado: "confirmado", categoria: "preferencia", escopo: "vault", chave: "backend" },
      { id: "irrelevante", texto: "Glossário de jardinagem", notaOrigem: null, criadoEm: "2026-03-01", estado: "confirmado", categoria: "glossario", escopo: "vault", chave: "jardinagem" },
    ];
    expect(selecionarFatosRelevantes(fatos, "O backend Core está descrito aqui")).toEqual([
      "Preferência pelo backend Core",
      "Convenção do backend Core",
      "Glossário de jardinagem",
    ]);
    expect(
      selecionarFatosRelevantes(fatos, "sem termos em comum", 24),
    ).toEqual(["Glossário de jardinagem"]);
    expect(ORCAMENTO_FATOS_PROMPT).toBe(4800);
  });

  it("o fallback de recência respeita o orçamento sem cortar fatos", () => {
    const fatos: import("./memoria").Fato[] = [
      { id: "a", texto: "a".repeat(300), notaOrigem: null, criadoEm: "2026-01-01", estado: "confirmado", categoria: "convencao", escopo: "vault", chave: "a" },
      { id: "b", texto: "b".repeat(300), notaOrigem: null, criadoEm: "2026-02-01", estado: "confirmado", categoria: "convencao", escopo: "vault", chave: "b" },
    ];
    expect(selecionarFatosRelevantes(fatos, "", 301)).toEqual(["b".repeat(300)]);
  });

  it("seleciona só memória confirmada no escopo da nota, respeitando a fronteira do caminho", () => {
    const fatos: import("./memoria").Fato[] = [
      { id: "vault", texto: "Preferência geral", notaOrigem: null, criadoEm: "2026-01-01", estado: "confirmado", categoria: "preferencia", escopo: "vault", chave: "p" },
      { id: "projeto", texto: "Glossário do projeto", notaOrigem: null, criadoEm: "2026-02-01", estado: "confirmado", categoria: "glossario", escopo: "projeto", caminhoProjeto: "Projetos/A", chave: "x" },
      { id: "outro", texto: "Outra pasta", notaOrigem: null, criadoEm: "2026-03-01", estado: "confirmado", categoria: "convencao", escopo: "projeto", caminhoProjeto: "Projetos/AB", chave: "x" },
      { id: "legacy", texto: "Legado", notaOrigem: null, criadoEm: "2026-04-01" },
      { id: "pending", texto: "Candidato", notaOrigem: null, criadoEm: "2026-05-01", estado: "pendente", categoria: "preferencia", escopo: "vault", chave: "q" },
    ];
    expect(selecionarFatosRelevantes(fatos, "", 4800, "Projetos/A/Nota.md")).toEqual(["Glossário do projeto", "Preferência geral"]);
    expect(selecionarFatosRelevantes(fatos, "", 4800, "Projetos/AB/Nota.md")).toEqual(["Outra pasta", "Preferência geral"]);
  });

  it("editar e rejeitar são ações explícitas e preferência criada pelo usuário já é confirmada", () => {
    const candidatos = proporFatos([], [{ categoria: "preferencia", escopo: "vault", chave: "tom", texto: "Prefere tom formal", trechoEvidencia: "tom formal" }], "A.md", "tom formal");
    const rejeitado = rejeitarFato(candidatos, candidatos[0].id);
    expect(rejeitado[0].estado).toBe("rejeitado");
    const editado = atualizarFato(candidatos, candidatos[0].id, "Prefere tom direto");
    expect(editado[0]).toMatchObject({ fonte: "usuario", notaOrigem: null, trechoEvidencia: null, texto: "Prefere tom direto" });
    const usuario = criarPreferenciaUsuario([], "Prefere respostas curtas", new Date("2026-09-13T00:00:00Z"));
    expect(usuario[0]).toMatchObject({ estado: "confirmado", fonte: "usuario", categoria: "preferencia" });
    expect(criarPreferenciaUsuario(usuario, "  PREFERE respostas curtas ")).toBe(usuario);
  });

  it("fatos e conversas round-trip; limparMemoria esvazia tudo", async () => {
    await salvarFatos(RAIZ, [
      { id: "f-1", texto: "t", notaOrigem: null, criadoEm: "2026-09-13" },
    ]);
    await salvarConversas(RAIZ, {
      "N.md": { atualizadaEm: "2026-09-13", mensagens: [{ papel: "usuario", texto: "oi" }] },
    });
    expect((await carregarFatos(RAIZ))[0].texto).toBe("t");
    expect((await carregarConversas(RAIZ))["N.md"].mensagens).toHaveLength(1);

    await limparMemoria(RAIZ);
    expect(await carregarFatos(RAIZ)).toEqual([]);
    expect(await carregarConversas(RAIZ)).toEqual({});
    expect(await carregarParticipacao(RAIZ)).toEqual({});
    expect(await carregarResumos(RAIZ)).toEqual({});
  });
});

describe("podarAnalises", () => {
  const analise = (n: number, estado: "concluido" | "em-andamento" = "concluido") => ({
    id: `a${n}`, papel: "assistente" as const, texto: `a${n}`, tipo: "analise" as const, estado,
  });

  it("abaixo do limite não muda nada", () => {
    const msgs = [analise(1), { papel: "usuario" as const, texto: "oi" }, analise(2)];
    expect(podarAnalises(msgs, 20)).toEqual(msgs);
  });

  it("corta só análises, as mais antigas, e mantém a ordem do resto", () => {
    const msgs = [
      analise(1), { papel: "usuario" as const, texto: "u1" },
      analise(2), { papel: "assistente" as const, texto: "r1", tipo: "mensagem" as const },
      analise(3), analise(4),
    ];
    expect(podarAnalises(msgs, 2).map((m) => m.texto)).toEqual(["u1", "r1", "a3", "a4"]);
  });

  it("usa 20 como limite padrão", () => {
    const msgs = Array.from({ length: 25 }, (_, i) => analise(i));
    const r = podarAnalises(msgs);
    expect(r).toHaveLength(20);
    expect(r[0].id).toBe("a5");
  });

  it("nunca remove análise em andamento", () => {
    const msgs = [analise(1, "em-andamento"), analise(2), analise(3)];
    expect(podarAnalises(msgs, 1).map((m) => m.id)).toEqual(["a1"]);
  });
});
