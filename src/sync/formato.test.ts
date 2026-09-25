// src/sync/formato.test.ts
import { describe, it, expect } from "vitest";

import {
  TAMANHO_MAXIMO_SINCRONIZAVEL,
  FormatoInvalido,
  serializarLote,
  lerLote,
  dividirEmLotes,
  serializarRetrato,
  lerRetrato,
  dividirRetrato,
  hashDe,
  type Lote,
  type Mudanca,
  type Retrato,
} from "./formato";

describe("serializarLote / lerLote", () => {
  it("ida e volta preserva texto com acentos (NFC) e conteúdo binário", async () => {
    const texto = "café com açúcar, à moda antiga".normalize("NFC");
    const binario = new Uint8Array([0, 1, 2, 255, 254, 128, 127]);

    const lote: Lote = {
      versao: 1,
      dispositivo: "Notebook do Lucas",
      criadoEm: "2026-09-24T12:00:00.000Z",
      mudancas: [
        {
          tipo: "gravar",
          caminho: "notas/café.md",
          base: null,
          hash: await hashDe(new TextEncoder().encode(texto)),
          conteudo: new TextEncoder().encode(texto),
        },
        {
          tipo: "gravar",
          caminho: "anexos/imagem.png",
          base: "a".repeat(64),
          hash: await hashDe(binario),
          conteudo: binario,
        },
        {
          tipo: "apagar",
          caminho: "notas/antiga.md",
          base: "b".repeat(64),
        },
      ],
    };

    const bytes = await serializarLote(lote);
    const relido = await lerLote(bytes);

    expect(relido.versao).toBe(1);
    expect(relido.dispositivo).toBe(lote.dispositivo);
    expect(relido.criadoEm).toBe(lote.criadoEm);
    expect(relido.mudancas).toHaveLength(3);

    const primeira = relido.mudancas[0];
    expect(primeira.tipo).toBe("gravar");
    if (primeira.tipo === "gravar") {
      expect(new TextDecoder().decode(primeira.conteudo)).toBe(texto);
      expect(primeira.base).toBeNull();
    }

    const segunda = relido.mudancas[1];
    expect(segunda.tipo).toBe("gravar");
    if (segunda.tipo === "gravar") {
      expect(segunda.conteudo).toEqual(binario);
      expect(segunda.base).toBe("a".repeat(64));
    }

    const terceira = relido.mudancas[2];
    expect(terceira).toEqual({ tipo: "apagar", caminho: "notas/antiga.md", base: "b".repeat(64) });
  });

  it("ida e volta preserva conteúdo grande sem estourar a pilha do base64", async () => {
    // 1 MiB já é muito maior que o limite de argumentos de qualquer spread/apply
    // (`String.fromCharCode(...bytes)` estouraria bem antes disso); usar mais que isso só
    // deixa o teste lento sem provar nada a mais. Timeout maior porque, com a suíte inteira
    // rodando em paralelo, o gzip de 1 MiB pode competir por CPU.
    const grande = new Uint8Array(1024 * 1024);
    for (let i = 0; i < grande.length; i++) grande[i] = i % 256;

    const lote: Lote = {
      versao: 1,
      dispositivo: "Notebook do Lucas",
      criadoEm: "2026-09-24T12:00:00.000Z",
      mudancas: [
        {
          tipo: "gravar",
          caminho: "anexos/grande.bin",
          base: null,
          hash: await hashDe(grande),
          conteudo: grande,
        },
      ],
    };

    const bytes = await serializarLote(lote);
    const relido = await lerLote(bytes);
    const mudanca = relido.mudancas[0];
    expect(mudanca.tipo).toBe("gravar");
    if (mudanca.tipo === "gravar") {
      expect(mudanca.conteudo).toEqual(grande);
    }
  }, 20000);

  it("lerLote recusa versão diferente de 1", async () => {
    const lote: Lote = {
      versao: 1,
      dispositivo: "d",
      criadoEm: "2026-09-24T12:00:00.000Z",
      mudancas: [],
    };
    const bytes = await serializarLote(lote);
    const texto = new TextDecoder().decode(await descomprimirParaTeste(bytes));
    const adulterado = texto.replace('"versao":1', '"versao":2');
    const bytesAdulterados = await comprimirParaTeste(new TextEncoder().encode(adulterado));

    await expect(lerLote(bytesAdulterados)).rejects.toBeInstanceOf(FormatoInvalido);
  });

  it("lerLote recusa hash malformado", async () => {
    const lote: Lote = {
      versao: 1,
      dispositivo: "d",
      criadoEm: "2026-09-24T12:00:00.000Z",
      mudancas: [
        {
          tipo: "gravar",
          caminho: "a.md",
          base: null,
          hash: "não é hex",
          conteudo: new Uint8Array([1]),
        },
      ],
    };
    const bytes = await serializarLote(lote);
    await expect(lerLote(bytes)).rejects.toBeInstanceOf(FormatoInvalido);
  });

  it("lerLote recusa caminho com barra invertida", async () => {
    const lote: Lote = {
      versao: 1,
      dispositivo: "d",
      criadoEm: "2026-09-24T12:00:00.000Z",
      mudancas: [
        {
          tipo: "gravar",
          caminho: "notas\\arquivo.md",
          base: null,
          hash: "a".repeat(64),
          conteudo: new Uint8Array([1]),
        },
      ],
    };
    const bytes = await serializarLote(lote);
    await expect(lerLote(bytes)).rejects.toBeInstanceOf(FormatoInvalido);
  });

  it("lerLote recusa bytes que não descomprimem", async () => {
    const lixo = new Uint8Array([1, 2, 3, 4, 5]);
    await expect(lerLote(lixo)).rejects.toBeInstanceOf(FormatoInvalido);
  });

  it("lerLote recusa gzip corrompido sem deixar rejeição não tratada", async () => {
    const rejeicoesNaoTratadas: unknown[] = [];
    const ouvinte = (motivo: unknown) => rejeicoesNaoTratadas.push(motivo);
    process.on("unhandledRejection", ouvinte);
    try {
      const lixo = new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]);
      await expect(lerLote(lixo)).rejects.toBeInstanceOf(FormatoInvalido);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(rejeicoesNaoTratadas).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", ouvinte);
    }
  });

  it("o erro de lerLote não ecoa o conteúdo inválido", async () => {
    const segredo = "SENHA-SECRETA-NAO-PODE-APARECER";
    const lote: Lote = {
      versao: 1,
      dispositivo: "d",
      criadoEm: "2026-09-24T12:00:00.000Z",
      mudancas: [
        {
          tipo: "gravar",
          caminho: "a.md",
          base: null,
          hash: segredo,
          conteudo: new TextEncoder().encode(segredo),
        },
      ],
    };
    const bytes = await serializarLote(lote);
    try {
      await lerLote(bytes);
      throw new Error("deveria ter lançado");
    } catch (erro) {
      expect(erro).toBeInstanceOf(FormatoInvalido);
      expect(String((erro as Error).message)).not.toContain(segredo);
    }
  });
});

describe("dividirEmLotes", () => {
  it("nunca ultrapassa o limite e preserva a ordem das mudanças", () => {
    const mudancas: Mudanca[] = [];
    for (let i = 0; i < 10; i++) {
      mudancas.push({
        tipo: "gravar",
        caminho: `arquivo-${i}.bin`,
        base: null,
        hash: "a".repeat(64),
        conteudo: new Uint8Array(3 * 1024 * 1024), // 3 MiB cada, 10 no total = 30 MiB
      });
    }

    const lotes = dividirEmLotes(mudancas, "Notebook do Lucas", "2026-09-24T12:00:00.000Z");

    expect(lotes.length).toBeGreaterThan(1);

    for (const lote of lotes) {
      const pesoDoLote = lote.mudancas.reduce(
        (soma, m) => soma + (m.tipo === "gravar" ? m.conteudo.byteLength : 0),
        0,
      );
      expect(pesoDoLote).toBeLessThanOrEqual(TAMANHO_MAXIMO_SINCRONIZAVEL);
    }

    const caminhosOriginais = mudancas.map((m) => m.caminho);
    const caminhosRemontados = lotes.flatMap((lote) => lote.mudancas.map((m) => m.caminho));
    expect(caminhosRemontados).toEqual(caminhosOriginais);
  });

  it("lança para uma única mudança maior que o tamanho máximo sincronizável", () => {
    const mudancas: Mudanca[] = [
      {
        tipo: "gravar",
        caminho: "grande-demais.bin",
        base: null,
        hash: "a".repeat(64),
        conteudo: new Uint8Array(TAMANHO_MAXIMO_SINCRONIZAVEL + 1),
      },
    ];

    expect(() => dividirEmLotes(mudancas, "Notebook do Lucas", "2026-09-24T12:00:00.000Z")).toThrow();
  });

  it("lote sem mudanças produz lista vazia", () => {
    expect(dividirEmLotes([], "Notebook do Lucas", "2026-09-24T12:00:00.000Z")).toEqual([]);
  });
});

describe("serializarRetrato / lerRetrato", () => {
  it("ida e volta preserva os arquivos", async () => {
    const retrato: Retrato = {
      versao: 1,
      ateSequencia: 42,
      arquivos: [
        { caminho: "notas/a.md", hash: "a".repeat(64), conteudo: new TextEncoder().encode("conteúdo à parte") },
        { caminho: "anexos/b.png", hash: "b".repeat(64), conteudo: new Uint8Array([9, 8, 7]) },
      ],
    };

    const bytes = await serializarRetrato(retrato);
    const relido = await lerRetrato(bytes);

    expect(relido.versao).toBe(1);
    expect(relido.ateSequencia).toBe(42);
    expect(relido.arquivos).toHaveLength(2);
    expect(new TextDecoder().decode(relido.arquivos[0].conteudo)).toBe("conteúdo à parte");
    expect(relido.arquivos[1].conteudo).toEqual(new Uint8Array([9, 8, 7]));
  });

  it("lerRetrato recusa versão diferente de 1", async () => {
    const retrato: Retrato = { versao: 1, ateSequencia: 1, arquivos: [] };
    const bytes = await serializarRetrato(retrato);
    const texto = new TextDecoder().decode(await descomprimirParaTeste(bytes));
    const adulterado = texto.replace('"versao":1', '"versao":9');
    const bytesAdulterados = await comprimirParaTeste(new TextEncoder().encode(adulterado));

    await expect(lerRetrato(bytesAdulterados)).rejects.toBeInstanceOf(FormatoInvalido);
  });

  it("lerRetrato recusa gzip corrompido sem deixar rejeição não tratada", async () => {
    const rejeicoesNaoTratadas: unknown[] = [];
    const ouvinte = (motivo: unknown) => rejeicoesNaoTratadas.push(motivo);
    process.on("unhandledRejection", ouvinte);
    try {
      const lixo = new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]);
      await expect(lerRetrato(lixo)).rejects.toBeInstanceOf(FormatoInvalido);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(rejeicoesNaoTratadas).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", ouvinte);
    }
  });
});

describe("dividirRetrato", () => {
  it("um retrato grande sai em partes que remontam o original", () => {
    const arquivos = [];
    for (let i = 0; i < 6; i++) {
      arquivos.push({
        caminho: `arquivo-${i}.bin`,
        hash: "a".repeat(64),
        conteudo: new Uint8Array(3 * 1024 * 1024), // 3 MiB cada, 6 no total = 18 MiB
      });
    }
    const retrato: Retrato = { versao: 1, ateSequencia: 200, arquivos };

    const partes = dividirRetrato(retrato);

    expect(partes.length).toBeGreaterThan(1);
    for (const parte of partes) {
      expect(parte.ateSequencia).toBe(200);
      const peso = parte.arquivos.reduce((soma, a) => soma + a.conteudo.byteLength, 0);
      expect(peso).toBeLessThanOrEqual(TAMANHO_MAXIMO_SINCRONIZAVEL);
    }

    const caminhosRemontados = partes.flatMap((p) => p.arquivos.map((a) => a.caminho));
    expect(caminhosRemontados).toEqual(arquivos.map((a) => a.caminho));
  });
});

describe("hashDe", () => {
  it("bate com o vetor conhecido de SHA-256 de 'abc'", async () => {
    const hash = await hashDe(new TextEncoder().encode("abc"));
    expect(hash).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

// Auxiliares só do teste, para adulterar o JSON dentro do gzip sem duplicar a implementação.
async function descomprimirParaTeste(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

async function comprimirParaTeste(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
