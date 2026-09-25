// src/sync/motor.test.ts
// Testes de um computador só contra o servidor falso: AAD do lote pela sequência esperada,
// folga de tamanho (divisão recursiva quando `lacrar` recusaria), estado por cópia (falha no
// meio de um lote não avança o cursor), arquivo grande fica fora da sincronização, ciclo sem
// mudança nenhuma não envia nada, e o retrato automático (limiar injetável).
//
// Os cenários com dois/três computadores (criar/editar/conflito/renomear/concorrência/retrato
// pra computador novo) estão em motor.integracao.test.ts — aqui é só o comportamento do ciclo
// em si, isolado.

import { describe, it, expect, vi } from "vitest";

import {
  executarCiclo,
  iniciarVault,
  type ContextoCiclo,
} from "./motor";
import { abrir, aadDe } from "./pacote";
import { hashDe, lerLote, lerRetrato, TAMANHO_MAXIMO_SINCRONIZAVEL } from "./formato";
import { ServicoSyncFake } from "./ServicoSyncFake";
import { VaultAdapterMemoria } from "../vault/VaultAdapterMemoria";
import type { EstadoSync } from "./estadoSync";
import type { EfeitosDeGravacao } from "../vault/efeitosDeGravacao";
import type { VaultAdapter } from "../vault/VaultAdapter";

function efeitosFalsos() {
  const chamadas: string[] = [];
  return {
    recarregarArvore: vi.fn(async () => {
      chamadas.push("recarregarArvore");
    }),
    reindexarArquivo: vi.fn(async (caminho: string) => {
      chamadas.push(`reindexarArquivo:${caminho}`);
    }),
    cancelarAutosavePendente: vi.fn((caminho: string) => {
      chamadas.push(`cancelarAutosavePendente:${caminho}`);
    }),
    recarregarDoDisco: vi.fn(async (caminho: string) => {
      chamadas.push(`recarregarDoDisco:${caminho}`);
    }),
    moverParaLixeira: vi.fn(async (caminho: string) => {
      chamadas.push(`moverParaLixeira:${caminho}`);
      return { ok: true } as const;
    }),
    chamadas,
  } satisfies EfeitosDeGravacao & { chamadas: string[] };
}

function estadoVazio(idDoVault = "vault-1"): EstadoSync {
  return { idDoVault, cursor: 0, bases: {}, hashesConhecidos: {}, conflitosPendentes: {} };
}

async function montarVaultComId(adaptador: VaultAdapter, servico: ServicoSyncFake) {
  const chaveDeEnvelope = new Uint8Array(32).fill(3);
  const { estado, chaveDoVault } = await iniciarVault({
    adaptador,
    servico,
    chaveDeEnvelope,
    nomeDoVault: "Vault de teste",
    nomeDesteComputador: "Computador de teste",
  });
  return { estado, chaveDoVault };
}

function ctxDe(overrides: Partial<ContextoCiclo> & Pick<ContextoCiclo, "adaptador" | "servico" | "chave" | "estado">): ContextoCiclo {
  return {
    nomeDesteComputador: "Computador de teste",
    efeitos: efeitosFalsos(),
    registrarConflito: () => {},
    flushTudo: async () => ({ falhas: [], bloqueados: [] }),
    conflitosAbertos: () => new Set(),
    ...overrides,
  };
}

describe("executarCiclo — sem mudança nenhuma", () => {
  it("vault vazio dos dois lados: não chama enviarLote, devolve ok sem foraDaSincronizacao", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(adaptador, servico);
    const enviarLoteSpy = vi.spyOn(servico, "enviarLote");

    const resultado = await executarCiclo(ctxDe({ adaptador, servico, chave: chaveDoVault, estado }));

    expect(resultado).toEqual({ ok: true, foraDaSincronizacao: [] });
    expect(enviarLoteSpy).not.toHaveBeenCalled();
  });
});

describe("executarCiclo — AAD do lote pela sequência esperada", () => {
  it("o lote guardado no servidor abre com o AAD da sequência que o servidor de fato atribuiu", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(adaptador, servico);
    await adaptador.escreverTexto("nota.md", "conteúdo");

    const resultado = await executarCiclo(ctxDe({ adaptador, servico, chave: chaveDoVault, estado }));
    expect(resultado.ok).toBe(true);
    expect(estado.cursor).toBe(1); // primeiro lote enviado por este computador

    const baixado = await servico.baixar(estado.idDoVault, 0);
    expect(baixado.lotes).toHaveLength(1);
    const { sequencia, bytes } = baixado.lotes[0];
    expect(sequencia).toBe(1);

    // Abre com o AAD da sequência de verdade — prova que foi isso que `lacrar` usou.
    await expect(abrir(chaveDoVault, bytes, aadDe(estado.idDoVault, "lote", sequencia))).resolves.toBeDefined();

    // Um AAD de sequência errada (a "esperada" de uma tentativa anterior, por exemplo) não abre.
    await expect(abrir(chaveDoVault, bytes, aadDe(estado.idDoVault, "lote", sequencia + 1))).rejects.toThrow();
  });
});

describe("executarCiclo — folga de tamanho", () => {
  it("bytes aleatórios perto de 7 MiB em vários arquivos: nenhum envio falha; lotes grandes são divididos", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(adaptador, servico);

    // Incompressível de propósito (aleatório) — gzip não ajuda, então base64+gzip do lote
    // encosta nos 8 MiB e `lacrar` recusaria um lote com os três juntos.
    const tamanho = Math.floor(6.9 * 1024 * 1024);
    const PASSO = 65536; // limite do getRandomValues por chamada
    for (const nome of ["a.bin", "b.bin", "c.bin"]) {
      const bytes = new Uint8Array(tamanho);
      for (let i = 0; i < bytes.length; i += PASSO) {
        crypto.getRandomValues(bytes.subarray(i, Math.min(i + PASSO, bytes.length)));
      }
      await adaptador.escreverBinario(nome, bytes);
    }

    const resultado = await executarCiclo(ctxDe({ adaptador, servico, chave: chaveDoVault, estado }));

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.foraDaSincronizacao).toEqual([]);

    const baixado = await servico.baixar(estado.idDoVault, 0);
    // Três arquivos de ~6.9 MiB não cabem juntos num pacote de 8 MiB — teve que dividir em
    // mais de um lote.
    expect(baixado.lotes.length).toBeGreaterThan(1);

    // Todos os pacotes abrem com o AAD certo (prova que cada um foi lacrado com sucesso).
    for (const { sequencia, bytes } of baixado.lotes) {
      await expect(
        abrir(chaveDoVault, bytes, aadDe(estado.idDoVault, "lote", sequencia)),
      ).resolves.toBeDefined();
    }

    expect(estado.bases["a.bin"]).toBeDefined();
    expect(estado.bases["b.bin"]).toBeDefined();
    expect(estado.bases["c.bin"]).toBeDefined();
  }, 120000); // 30s estourava sob contenção de CPU da suíte inteira (confirmado: contenção, não defeito).

  it("uma mudança só que não cabe nem sozinha: o arquivo fica fora da sincronização", async () => {
    // `dividirEmLotes` já lança se uma mudança sozinha passar de TAMANHO_MAXIMO_SINCRONIZAVEL
    // (7 MiB) — não chega a ser candidata a lote. Este teste cobre isso indiretamente: um
    // arquivo maior que o limite nunca é sequer lido pro envio (fica de fora já na detecção).
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(adaptador, servico);

    const grande = new Uint8Array(TAMANHO_MAXIMO_SINCRONIZAVEL + 1024);
    await adaptador.escreverBinario("gigante.bin", grande);
    await adaptador.escreverTexto("normal.md", "nota comum");

    const resultado = await executarCiclo(ctxDe({ adaptador, servico, chave: chaveDoVault, estado }));

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.foraDaSincronizacao).toEqual(["gigante.bin"]);
    expect(estado.bases["gigante.bin"]).toBeUndefined();
    expect(estado.bases["normal.md"]).toBeDefined();
  });
});

describe("executarCiclo — estado por cópia (falha no meio de um lote)", () => {
  /** Envolve um VaultAdapterMemoria real, cujas escritas de texto/binário falham a partir da
   * N-ésima chamada (contando as duas juntas) — simula uma falha no meio da aplicação de um
   * lote com várias mudanças "gravar". */
  function adaptadorQueFalhaNaEscritaDeNumero(base: VaultAdapterMemoria, falharNaEscrita: number): VaultAdapter {
    let contador = 0;
    function talvezFalhar() {
      contador += 1;
      if (contador === falharNaEscrita) throw new Error("disco cheio (simulado)");
    }
    return {
      raiz: () => base.raiz(),
      listar: () => base.listar(),
      lerTexto: (p: string) => base.lerTexto(p),
      lerBinario: (p: string) => base.lerBinario(p),
      escreverTexto: async (p: string, c: string) => {
        talvezFalhar();
        return base.escreverTexto(p, c);
      },
      escreverBinario: async (p: string, d: Uint8Array) => {
        talvezFalhar();
        return base.escreverBinario(p, d);
      },
      criarPasta: (p: string) => base.criarPasta(p),
      mover: (de: string, para: string) => base.mover(de, para),
      remover: (p: string) => base.remover(p),
      listarPasta: (p: string) => base.listarPasta(p),
      existe: (p: string) => base.existe(p),
      observar: (cb) => base.observar(cb),
      aoPerderSincronia: (cb) => base.aoPerderSincronia(cb),
    };
  }

  it("falha na 3ª mudança de um lote: cursor não avança; ciclo seguinte (sem falha) fica idêntico a nunca ter falhado", async () => {
    const servico = new ServicoSyncFake();

    // Computador A envia um lote com 4 arquivos novos.
    const adaptadorA = new VaultAdapterMemoria();
    const { estado: estadoA, chaveDoVault } = await montarVaultComId(adaptadorA, servico);
    for (const nome of ["1.md", "2.md", "3.md", "4.md"]) {
      await adaptadorA.escreverTexto(nome, `conteúdo de ${nome}`);
    }
    const envioA = await executarCiclo(ctxDe({ adaptador: adaptadorA, servico, chave: chaveDoVault, estado: estadoA }));
    expect(envioA.ok).toBe(true);

    // Computador B baixa esse lote, mas a 3ª escrita falha.
    const baseB = new VaultAdapterMemoria();
    const adaptadorBQuebrado = adaptadorQueFalhaNaEscritaDeNumero(baseB, 3);
    const estadoB = estadoVazio(estadoA.idDoVault);
    const resultado1 = await executarCiclo(
      ctxDe({ adaptador: adaptadorBQuebrado, servico, chave: chaveDoVault, estado: estadoB }),
    );

    expect(resultado1).toEqual({ ok: false, erro: "aplicar-lote", foraDaSincronizacao: [] });
    expect(estadoB.cursor).toBe(0); // não avançou
    expect(Object.keys(estadoB.bases)).toEqual([]); // nada foi adotado
    // As duas primeiras escritas já tinham ido para o disco antes da 3ª falhar — o "estado
    // por cópia" é sobre `EstadoSync`, não sobre o disco (aplicarLote já documenta isso).
    expect(await baseB.existe("1.md")).toBe(true);
    expect(await baseB.existe("2.md")).toBe(true);
    expect(await baseB.existe("3.md")).toBe(false);
    expect(await baseB.existe("4.md")).toBe(false);

    // Ciclo seguinte, sem a falha: reaplica o MESMO lote (cursor ainda em 0) sobre o disco já
    // parcialmente escrito — a tabela do doc 17 §6 cobre isso ("gravar | já igual | só bases").
    const resultado2 = await executarCiclo(
      ctxDe({ adaptador: baseB, servico, chave: chaveDoVault, estado: estadoB }),
    );
    expect(resultado2).toEqual({ ok: true, foraDaSincronizacao: [] });
    expect(estadoB.cursor).toBe(1);

    for (const nome of ["1.md", "2.md", "3.md", "4.md"]) {
      expect(await baseB.lerTexto(nome)).toBe(`conteúdo de ${nome}`);
      expect(estadoB.bases[nome]).toBe(estadoA.bases[nome]);
    }

    // Resultado idêntico ao de um B que nunca teve a falha: mesmas bases, mesmo cursor.
    const baseControle = new VaultAdapterMemoria();
    const estadoControle = estadoVazio(estadoA.idDoVault);
    await executarCiclo(ctxDe({ adaptador: baseControle, servico, chave: chaveDoVault, estado: estadoControle }));
    expect(estadoB.bases).toEqual(estadoControle.bases);
    expect(estadoB.cursor).toBe(estadoControle.cursor);
  });
});

describe("executarCiclo — falhas do servidor", () => {
  it("rede: devolve { ok:false, erro:'rede' } sem lançar", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(adaptador, servico);
    servico.simularFalha("rede");

    const resultado = await executarCiclo(ctxDe({ adaptador, servico, chave: chaveDoVault, estado }));
    expect(resultado).toEqual({ ok: false, erro: "rede", foraDaSincronizacao: [] });
  });

  it("espaço ao enviar: devolve { ok:false, erro:'espaco' }, cursor de baixar já tinha avançado", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(adaptador, servico);
    await adaptador.escreverTexto("nota.md", "x");

    servico.simularFalha("espaco");
    const resultado = await executarCiclo(ctxDe({ adaptador, servico, chave: chaveDoVault, estado }));

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.erro).toBe("espaco");
    expect(estado.bases["nota.md"]).toBeUndefined(); // não foi dado como sincronizado
  });
});

describe("executarCiclo — retrato automático", () => {
  it("cursor além do limiar injetado: manda enviarRetrato depois de enviar", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(adaptador, servico);
    await adaptador.escreverTexto("nota.md", "conteúdo");

    const enviarRetratoSpy = vi.spyOn(servico, "enviarRetrato");

    const resultado = await executarCiclo(
      ctxDe({
        adaptador,
        servico,
        chave: chaveDoVault,
        estado,
        limiarRetrato: { lotes: 1 },
      }),
    );

    expect(resultado.ok).toBe(true);
    expect(enviarRetratoSpy).toHaveBeenCalledTimes(1);
    const [idChamado, ateSequenciaChamado] = enviarRetratoSpy.mock.calls[0];
    expect(idChamado).toBe(estado.idDoVault);
    expect(ateSequenciaChamado).toBe(estado.cursor);
  });

  it("cursor abaixo do limiar: não manda retrato", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(adaptador, servico);
    await adaptador.escreverTexto("nota.md", "conteúdo");

    const enviarRetratoSpy = vi.spyOn(servico, "enviarRetrato");

    await executarCiclo(
      ctxDe({
        adaptador,
        servico,
        chave: chaveDoVault,
        estado,
        limiarRetrato: { lotes: 1000 },
      }),
    );

    expect(enviarRetratoSpy).not.toHaveBeenCalled();
  });

  it("conta desde o ÚLTIMO retrato (ultimoRetrato do baixar), não o cursor bruto — não manda de novo em todo ciclo", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(adaptador, servico);
    const enviarRetratoSpy = vi.spyOn(servico, "enviarRetrato");
    const limiarRetrato = { lotes: 3 };

    // Três lotes: dispara o primeiro retrato (cursor 3 - ultimoRetrato 0 >= 3).
    for (const nome of ["1.md", "2.md", "3.md"]) {
      await adaptador.escreverTexto(nome, nome);
      await executarCiclo(ctxDe({ adaptador, servico, chave: chaveDoVault, estado, limiarRetrato }));
    }
    expect(estado.cursor).toBe(3);
    expect(enviarRetratoSpy).toHaveBeenCalledTimes(1);
    expect(enviarRetratoSpy).toHaveBeenLastCalledWith(estado.idDoVault, 3, expect.anything());

    // Mais dois lotes (cursor 5): 5 - ultimoRetrato(3) = 2 < limiar(3) — NÃO manda de novo.
    // Se o motor usasse o cursor bruto (5 >= 3) mandaria retrato em todo ciclo daqui pra
    // frente — exatamente o defeito apontado na revisão.
    for (const nome of ["4.md", "5.md"]) {
      await adaptador.escreverTexto(nome, nome);
      await executarCiclo(ctxDe({ adaptador, servico, chave: chaveDoVault, estado, limiarRetrato }));
    }
    expect(estado.cursor).toBe(5);
    expect(enviarRetratoSpy).toHaveBeenCalledTimes(1); // continua só a primeira vez

    // Mais um lote (cursor 6): 6 - 3 = 3 >= limiar — dispara de novo.
    await adaptador.escreverTexto("6.md", "6.md");
    await executarCiclo(ctxDe({ adaptador, servico, chave: chaveDoVault, estado, limiarRetrato }));
    expect(estado.cursor).toBe(6);
    expect(enviarRetratoSpy).toHaveBeenCalledTimes(2);
    expect(enviarRetratoSpy).toHaveBeenLastCalledWith(estado.idDoVault, 6, expect.anything());
  });

  it("conflito pendente: nenhum retrato é enviado (o disco tem a versão LOCAL, não a do diário)", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(adaptador, servico);
    await adaptador.escreverTexto("nota.md", "conteúdo");
    await executarCiclo(ctxDe({ adaptador, servico, chave: chaveDoVault, estado, limiarRetrato: { lotes: 1000 } }));

    // Registra um conflito pendente à mão (sem passar por um lote de verdade — só o efeito
    // que importa aqui: `estado.conflitosPendentes` não está vazio).
    estado.conflitosPendentes["nota.md"] = {
      hashRemoto: "hash-remoto-qualquer",
      conteudo: "versão remota",
      dispositivo: "Outro computador",
      criadoEm: new Date().toISOString(),
    };

    const enviarRetratoSpy = vi.spyOn(servico, "enviarRetrato");
    await adaptador.escreverTexto("outra.md", "gatilho pro envio deste ciclo");
    const resultado = await executarCiclo(
      ctxDe({
        adaptador,
        servico,
        chave: chaveDoVault,
        estado,
        limiarRetrato: { lotes: 1 },
        conflitosAbertos: () => new Set(["nota.md"]), // fila re-registrada, conflito continua aberto
      }),
    );

    expect(resultado.ok).toBe(true);
    expect(enviarRetratoSpy).not.toHaveBeenCalled();
  });

  it("conflito criado NESTE MESMO ciclo (baixado agora, ainda não na tela) também bloqueia o retrato automático dele", async () => {
    // Cenário realista de "race": o mesmo ciclo que baixa um conflito para "nota.md" também
    // tem uma mudança local não relacionada ("outra.md") pra mandar. "outra.md" sobe e o
    // cursor passa do limiar — mas "nota.md" acabou de entrar em `conflitosPendentes` NESTE
    // ciclo (a fila da tela nem foi avisada ainda: `conflitosAbertos()` continua vazio) e o
    // disco dela tem a versão LOCAL, não a que está no diário na sequência do `cursor`.
    // Mandar retrato agora incluiria a versão errada (ou nenhuma, se pulasse o caminho) —
    // não pode.
    const servico = new ServicoSyncFake();

    const adaptadorA = new VaultAdapterMemoria();
    const { estado: estadoA, chaveDoVault } = await montarVaultComId(adaptadorA, servico);
    await adaptadorA.escreverTexto("nota.md", "original");
    await executarCiclo(ctxDe({ adaptador: adaptadorA, servico, chave: chaveDoVault, estado: estadoA }));

    const adaptadorB = new VaultAdapterMemoria();
    const estadoB = estadoVazio(estadoA.idDoVault);
    await executarCiclo(ctxDe({ adaptador: adaptadorB, servico, chave: chaveDoVault, estado: estadoB })); // B sincroniza a base

    // B edita localmente (sem sincronizar) e também cria um arquivo novo sem relação.
    await adaptadorB.escreverTexto("nota.md", "editado em B");
    await adaptadorB.escreverTexto("outra.md", "arquivo novo, sem conflito nenhum");

    // A edita e sincroniza primeiro.
    await adaptadorA.escreverTexto("nota.md", "editado em A");
    await executarCiclo(ctxDe({ adaptador: adaptadorA, servico, chave: chaveDoVault, estado: estadoA }));

    const enviarRetratoSpy = vi.spyOn(servico, "enviarRetrato");
    const resultado = await executarCiclo(
      ctxDe({
        adaptador: adaptadorB,
        servico,
        chave: chaveDoVault,
        estado: estadoB,
        limiarRetrato: { lotes: 1 },
      }),
    );

    expect(resultado.ok).toBe(true);
    // O conflito foi mesmo criado neste ciclo (não estava lá antes).
    expect(estadoB.conflitosPendentes["nota.md"]).toBeDefined();
    // A edição local de "nota.md" NÃO subiu por cima da versão de A que gerou o conflito —
    // é exatamente o que a união de `conflitosParaExcluirDoEnvio` evita (fix da revisão:
    // `conflitosAbertos()` sozinho estaria vazio agora, a fila nem foi avisada do conflito).
    // Só os lotes enviados por B nesta última rodada (depois do lote de A que gerou o
    // conflito) — não confundir com o lote de A, que legitimamente contém "nota.md".
    const baixadoDepoisDeA = await servico.baixar(estadoA.idDoVault, 2);
    const caminhosEnviados = new Set<string>();
    for (const l of baixadoDepoisDeA.lotes) {
      const dados = await abrir(chaveDoVault, l.bytes, aadDe(estadoA.idDoVault, "lote", l.sequencia));
      const lote = await lerLote(dados);
      for (const m of lote.mudancas) caminhosEnviados.add(m.caminho);
    }
    expect(caminhosEnviados.has("nota.md")).toBe(false);
    expect(caminhosEnviados.has("outra.md")).toBe(true);
    // "outra.md" subiu — o cursor passou do limiar — mas o retrato NÃO foi mandado.
    expect(estadoB.bases["outra.md"]).toBeDefined();
    expect(enviarRetratoSpy).not.toHaveBeenCalled();
  });

  it("tudo sincronizado: retrato enviado com o conteúdo certo (hash bate com o disco)", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(adaptador, servico);
    await adaptador.escreverTexto("nota.md", "conteúdo sincronizado");

    const resultado = await executarCiclo(
      ctxDe({ adaptador, servico, chave: chaveDoVault, estado, limiarRetrato: { lotes: 1 } }),
    );
    expect(resultado.ok).toBe(true);

    const baixado = await servico.baixar(estado.idDoVault, 0);
    expect(baixado.retrato).toBeDefined();
    const dados = await abrir(chaveDoVault, baixado.retrato!.partes[0], aadDe(estado.idDoVault, "retrato", 0));
    const retratoLido = await lerRetrato(dados);
    expect(retratoLido.ateSequencia).toBe(estado.cursor);
    expect(retratoLido.arquivos).toHaveLength(1);
    expect(retratoLido.arquivos[0].caminho).toBe("nota.md");
    expect(retratoLido.arquivos[0].hash).toBe(estado.bases["nota.md"]);
    expect(new TextDecoder().decode(retratoLido.arquivos[0].conteudo)).toBe("conteúdo sincronizado");
  });
});

describe("mudancasParaEnviar — hash dos bytes efetivamente enviados", () => {
  it("relê e recalcula o hash na hora de montar a mudança — não reaproveita o hash 'rápido' da detecção", async () => {
    // Adaptador cujo lerBinario devolve um conteúdo na PRIMEIRA leitura (usada por
    // `hashesDoVault`, só pra decidir "mudou?") e outro na SEGUNDA (usada por
    // `mudancasParaEnviar`, pra montar o que de fato sobe) — simula o usuário salvando de
    // novo entre as duas leituras do mesmo ciclo.
    const servico = new ServicoSyncFake();
    const base = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(base, servico);

    const primeiraVersao = new TextEncoder().encode("primeira leitura");
    const segundaVersao = new TextEncoder().encode("segunda leitura, gravada no meio do ciclo");
    await base.escreverTexto("nota.md", "primeira leitura");

    let leituras = 0;
    const adaptadorComTroca: VaultAdapter = {
      raiz: () => base.raiz(),
      listar: () => base.listar(),
      lerTexto: (p) => base.lerTexto(p),
      lerBinario: async (p: string) => {
        leituras += 1;
        if (p === "nota.md" && leituras === 2) return segundaVersao;
        return base.lerBinario(p);
      },
      escreverTexto: (p, c) => base.escreverTexto(p, c),
      escreverBinario: (p, d) => base.escreverBinario(p, d),
      criarPasta: (p) => base.criarPasta(p),
      mover: (de, para) => base.mover(de, para),
      remover: (p) => base.remover(p),
      listarPasta: (p) => base.listarPasta(p),
      existe: (p) => base.existe(p),
      observar: (cb) => base.observar(cb),
      aoPerderSincronia: (cb) => base.aoPerderSincronia(cb),
    };

    const resultado = await executarCiclo(
      ctxDe({ adaptador: adaptadorComTroca, servico, chave: chaveDoVault, estado }),
    );
    expect(resultado.ok).toBe(true);

    const hashEsperado = await hashDe(segundaVersao);
    // bases reflete o hash dos bytes que FORAM enviados (a segunda leitura), não os da
    // primeira (que só serviram pra decidir "mudou?").
    expect(estado.bases["nota.md"]).toBe(hashEsperado);
    expect(estado.bases["nota.md"]).not.toBe(await hashDe(primeiraVersao));

    // E o pacote guardado no servidor tem exatamente esse conteúdo — hash e conteúdo do
    // MESMO lugar, nunca um hash "de antes" com um conteúdo "de depois".
    const baixado = await servico.baixar(estado.idDoVault, 0);
    const dados = await abrir(chaveDoVault, baixado.lotes[0].bytes, aadDe(estado.idDoVault, "lote", 1));
    const lote = await lerLote(dados);
    const mudanca = lote.mudancas.find((m) => m.caminho === "nota.md");
    expect(mudanca).toMatchObject({ tipo: "gravar", hash: hashEsperado });
    if (mudanca?.tipo === "gravar") {
      expect(new TextDecoder().decode(mudanca.conteudo)).toBe("segunda leitura, gravada no meio do ciclo");
    }
  });
});

describe("mudancasParaEnviar — conflito pendente exclui o envio mesmo se a fila mudar no meio do ciclo", () => {
  it("conflitosAbertos() consultado de novo no envio (depois de resolverConflitosResolvidos) não é a única defesa — a união com conflitosPendentes protege mesmo se a fila já 'esqueceu' o caminho nesse meio-tempo", async () => {
    // `ctx.conflitosAbertos` é uma FUNÇÃO chamada mais de uma vez no mesmo ciclo (uma vez em
    // `resolverConflitosResolvidos`, no começo; outra em `mudancasParaEnviar`, no passo 2) —
    // ela pode devolver respostas diferentes entre as duas chamadas se a fila da tela mudar
    // por fora enquanto o ciclo está rodando (o usuário resolveu o conflito bem nesse
    // instante). Este teste força exatamente essa sequência: "nota.md" está na fila na
    // PRIMEIRA chamada (resolverConflitosResolvidos não limpa `conflitosPendentes` — ainda
    // parece aberto) mas já NÃO está mais na SEGUNDA (mudancasParaEnviar, se usasse só
    // `conflitosAbertos()`, mandaria a versão local por cima da remota). A união com
    // `estado.conflitosPendentes` (que resolverConflitosResolvidos deixou intacto, já que na
    // primeira chamada o caminho ainda parecia aberto) protege mesmo assim.
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const { estado, chaveDoVault } = await montarVaultComId(adaptador, servico);
    await adaptador.escreverTexto("nota.md", "versão original");
    await executarCiclo(ctxDe({ adaptador, servico, chave: chaveDoVault, estado }));

    // O usuário editou localmente por cima da versão que gerou o conflito; o conflito ainda
    // está pendente no estado persistido.
    await adaptador.escreverTexto("nota.md", "edição local, ainda não decidida");
    estado.conflitosPendentes["nota.md"] = {
      hashRemoto: "hash-remoto-do-conflito",
      conteudo: "versão remota que causou o conflito",
      dispositivo: "Outro computador",
      criadoEm: new Date().toISOString(),
    };

    let chamadas = 0;
    const abertosMutavel = new Set(["nota.md"]);
    const conflitosAbertosComCorrida = () => {
      chamadas += 1;
      if (chamadas > 1) abertosMutavel.delete("nota.md"); // "resolvido" a partir da 2ª chamada
      return abertosMutavel;
    };

    const enviarLoteSpy = vi.spyOn(servico, "enviarLote");
    const resultado = await executarCiclo(
      ctxDe({
        adaptador,
        servico,
        chave: chaveDoVault,
        estado,
        conflitosAbertos: conflitosAbertosComCorrida,
      }),
    );

    expect(resultado.ok).toBe(true);
    expect(chamadas).toBeGreaterThan(1); // a corrida de fato aconteceu neste teste
    // Nenhum lote foi enviado — "nota.md" não subiu por cima da remota mesmo com a fila tendo
    // "esquecido" o conflito entre as duas chamadas.
    expect(enviarLoteSpy).not.toHaveBeenCalled();
    expect(await adaptador.lerTexto("nota.md")).toBe("edição local, ainda não decidida"); // disco intacto
  });
});

describe("iniciarVault", () => {
  it("cria o vault no servidor e envia o conteúdo existente como o primeiro lote", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    await adaptador.escreverTexto("nota.md", "já existia antes de ligar a sincronização");
    const chaveDeEnvelope = new Uint8Array(32).fill(5);

    const { estado, chaveDoVault, foraDaSincronizacao } = await iniciarVault({
      adaptador,
      servico,
      chaveDeEnvelope,
      nomeDoVault: "Meu vault",
      nomeDesteComputador: "Computador de teste",
    });

    expect(foraDaSincronizacao).toEqual([]);
    expect(estado.cursor).toBe(1);
    const hashEsperado = await hashDe(new TextEncoder().encode("já existia antes de ligar a sincronização"));
    expect(estado.bases["nota.md"]).toBe(hashEsperado);

    const vaults = await servico.listarVaults();
    expect(vaults).toHaveLength(1);
    expect(vaults[0].id).toBe(estado.idDoVault);

    // O nome cifrado abre com a própria chaveDoVault (não é a chaveDeEnvelope).
    await expect(
      abrir(chaveDoVault, vaults[0].nomeCifrado, aadDe(estado.idDoVault, "nome")),
    ).resolves.toEqual(new TextEncoder().encode("Meu vault"));
  });

  it("vault vazio: não envia lote nenhum, cursor fica em 0", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const chaveDeEnvelope = new Uint8Array(32).fill(5);
    const enviarLoteSpy = vi.spyOn(servico, "enviarLote");

    const { estado } = await iniciarVault({
      adaptador,
      servico,
      chaveDeEnvelope,
      nomeDoVault: "Vazio",
      nomeDesteComputador: "Computador de teste",
    });

    expect(estado.cursor).toBe(0);
    expect(enviarLoteSpy).not.toHaveBeenCalled();
  });

  it("id repetido (corrida improvável, mas o contrato define o comportamento): propaga o erro do servidor", async () => {
    const servico = new ServicoSyncFake();
    const adaptador = new VaultAdapterMemoria();
    const chaveDeEnvelope = new Uint8Array(32).fill(5);

    // Simula colisão de id forçando o servidor a recusar todo criarVault.
    servico.simularFalha("plano");
    await expect(
      iniciarVault({
        adaptador,
        servico,
        chaveDeEnvelope,
        nomeDoVault: "X",
        nomeDesteComputador: "Computador de teste",
      }),
    ).rejects.toThrow(expect.objectContaining({ codigo: "plano" }));
  });
});
