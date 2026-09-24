// src/sync/motor.integracao.test.ts
// Todos os casos do doc 17 §10 e da lista da Task 4 do plano 09: dois "computadores"
// simulados (dois VaultAdapterMemoria) sincronizando pela mesma chave, com um ServicoSyncFake
// compartilhado, e efeitos falsos que registram chamadas — cada teste confere o disco dos DOIS
// lados E os efeitos visíveis relevantes (lição de 23/09: só olhar o disco não basta).

import { describe, it, expect, vi } from "vitest";

import { executarCiclo, iniciarVault, baixarVault, type ContextoCiclo } from "./motor";
import { hashDe } from "./formato";
import { ServicoSyncFake } from "./ServicoSyncFake";
import type { ServicoSync } from "./ServicoSync";
import { VaultAdapterMemoria } from "../vault/VaultAdapterMemoria";
import type { VaultAdapter } from "../vault/VaultAdapter";
import { caminhoLivre } from "../vault/criar";
import { nomeBase } from "../vault/caminhos";
import type { EstadoSync } from "./estadoSync";
import type { EfeitosDeGravacao } from "../vault/efeitosDeGravacao";
import type { Conflito, Resolucao } from "./tipos";
import { operacoesPara } from "./resolucao";

// --- infraestrutura de teste: um "computador" com adaptador, efeitos falsos e fila de
// conflitos falsa (o suficiente pra exercitar o motor sem montar o zustand) ---

/** `moverParaLixeira` de verdade move o arquivo (`vault/lixeira.ts#excluir`) — a fake precisa
 * fazer o mesmo no `VaultAdapterMemoria` deste computador, senão o próximo ciclo veria o
 * arquivo "apagado" (fora de `bases`, que `aplicarLote` já limpou) ainda presente no disco e o
 * reenviaria como se fosse novo, um artefato do teste que não existe no produto real. */
function efeitosFalsos(adaptador: VaultAdapter) {
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
      await adaptador.criarPasta(".trash");
      const destino = await caminhoLivre(`.trash/${nomeBase(caminho)}`, "", adaptador);
      await adaptador.mover(caminho, destino);
      return { ok: true } as const;
    }),
    chamadas,
  } satisfies EfeitosDeGravacao & { chamadas: string[] };
}

function filaDeConflitosFalsa() {
  const abertos = new Set<string>();
  const conflitos = new Map<string, Conflito>();
  return {
    abertos,
    registrar: (c: Conflito) => {
      abertos.add(c.caminho);
      conflitos.set(c.caminho, c);
    },
    conflitoDe: (caminho: string) => conflitos.get(caminho),
    /** Simula o usuário resolvendo o conflito na tela (equivalente a
     * `conflitosStore.resolver`, sem o zustand): aplica a operação escolhida no disco e tira
     * o caminho da fila. */
    async resolver(
      caminho: string,
      resolucao: Resolucao,
      adaptador: VaultAdapterMemoria,
      quando: Date,
    ) {
      const conflito = conflitos.get(caminho);
      if (!conflito) return;
      for (const op of operacoesPara(conflito, resolucao, quando)) {
        await adaptador.escreverTexto(op.caminho, op.conteudo);
      }
      abertos.delete(caminho);
      conflitos.delete(caminho);
    },
  };
}

interface Computador {
  nome: string;
  adaptador: VaultAdapterMemoria;
  efeitos: ReturnType<typeof efeitosFalsos>;
  fila: ReturnType<typeof filaDeConflitosFalsa>;
}

function novoComputador(nome: string, adaptadorExistente?: VaultAdapterMemoria): Computador {
  const adaptador = adaptadorExistente ?? new VaultAdapterMemoria();
  return {
    nome,
    adaptador,
    efeitos: efeitosFalsos(adaptador),
    fila: filaDeConflitosFalsa(),
  };
}

function ctxDe(
  comp: Computador,
  servico: ServicoSync,
  chave: Uint8Array,
  estado: EstadoSync,
  opcoes: { agora?: () => Date } = {},
): ContextoCiclo {
  return {
    adaptador: comp.adaptador,
    servico,
    chave,
    estado,
    efeitos: comp.efeitos,
    nomeDesteComputador: comp.nome,
    registrarConflito: comp.fila.registrar,
    flushTudo: async () => ({ falhas: [], bloqueados: [] }),
    conflitosAbertos: () => comp.fila.abertos,
    agora: opcoes.agora,
  };
}

/** Cria o vault em A (`iniciarVault`) e baixa em B (`baixarVault`) — os dois exercitam o
 * caminho real de "ligar" e "baixar pra pasta vazia" do doc 17 §7, com envelope de verdade. */
async function configurarParSincronizado() {
  const servico = new ServicoSyncFake();
  const chaveDeEnvelope = new Uint8Array(32).fill(11);

  const compA = novoComputador("Computador A");
  const { estado: estadoA, chaveDoVault } = await iniciarVault({
    adaptador: compA.adaptador,
    servico,
    chaveDeEnvelope,
    nomeDoVault: "Vault de teste",
  });

  const [{ id, envelope }] = await servico.listarVaults();

  const compB = novoComputador("Computador B");
  const estadoB = await baixarVault({
    adaptador: compB.adaptador,
    servico,
    chaveDeEnvelope,
    idDoVault: id,
    envelope,
    efeitos: compB.efeitos,
    nomeDesteComputador: compB.nome,
    registrarConflito: compB.fila.registrar,
    flushTudo: async () => ({ falhas: [], bloqueados: [] }),
  });

  return { servico, chaveDeEnvelope, chaveDoVault, idDoVault: id, compA, estadoA, compB, estadoB };
}

async function ciclo(comp: Computador, servico: ServicoSync, chave: Uint8Array, estado: EstadoSync) {
  const resultado = await executarCiclo(ctxDe(comp, servico, chave, estado));
  expect(resultado.ok).toBe(true);
  return resultado;
}

describe("motor — criar em A aparece em B", () => {
  it("nota nova em A chega em B com o mesmo conteúdo e os efeitos visíveis certos", async () => {
    const { servico, chaveDoVault, compA, estadoA, compB, estadoB } = await configurarParSincronizado();

    await compA.adaptador.escreverTexto("bem-vinda.md", "# Bem-vinda\n\nprimeira nota");
    await ciclo(compA, servico, chaveDoVault, estadoA);
    await ciclo(compB, servico, chaveDoVault, estadoB);

    expect(await compB.adaptador.lerTexto("bem-vinda.md")).toBe("# Bem-vinda\n\nprimeira nota");
    expect(compB.efeitos.chamadas).toEqual([
      "cancelarAutosavePendente:bem-vinda.md",
      "recarregarArvore",
      "reindexarArquivo:bem-vinda.md",
      "recarregarDoDisco:bem-vinda.md",
    ]);
    expect(estadoB.bases["bem-vinda.md"]).toBe(estadoA.bases["bem-vinda.md"]);
  });
});

describe("motor — editar em A atualiza B", () => {
  it("edição em A (arquivo que B já tinha e não mexeu) chega em B", async () => {
    const { servico, chaveDoVault, compA, estadoA, compB, estadoB } = await configurarParSincronizado();

    await compA.adaptador.escreverTexto("nota.md", "versão 1");
    await ciclo(compA, servico, chaveDoVault, estadoA);
    await ciclo(compB, servico, chaveDoVault, estadoB);
    compB.efeitos.chamadas.length = 0;

    await compA.adaptador.escreverTexto("nota.md", "versão 2");
    await ciclo(compA, servico, chaveDoVault, estadoA);
    await ciclo(compB, servico, chaveDoVault, estadoB);

    expect(await compB.adaptador.lerTexto("nota.md")).toBe("versão 2");
    expect(compB.efeitos.chamadas).toContain("recarregarDoDisco:nota.md");
  });
});

describe("motor — editar nos dois vira conflito em B", () => {
  it("as duas versões certas aparecem no conflito, nada é sobrescrito", async () => {
    const { servico, chaveDoVault, compA, estadoA, compB, estadoB } = await configurarParSincronizado();

    await compA.adaptador.escreverTexto("nota.md", "original");
    await ciclo(compA, servico, chaveDoVault, estadoA);
    await ciclo(compB, servico, chaveDoVault, estadoB);

    // Os dois editam sem sincronizar ainda — o mesmo instante, os dois sobre a mesma base.
    await compB.adaptador.escreverTexto("nota.md", "editado em B");
    await compA.adaptador.escreverTexto("nota.md", "editado em A");

    // A sincroniza primeiro (nada novo pra baixar: o servidor ainda só tem o "original").
    await ciclo(compA, servico, chaveDoVault, estadoA);

    // B sincroniza por último: baixa a edição de A, vê que TAMBÉM mexeu localmente desde a
    // base → conflito em B (quem baixa por último é quem vê o conflito — quem já publicou
    // não baixa a própria mudança de volta).
    const resultado = await executarCiclo(ctxDe(compB, servico, chaveDoVault, estadoB));

    expect(resultado.ok).toBe(true);
    // B não regravou nada por cima: o disco de B continua com a versão local dele.
    expect(await compB.adaptador.lerTexto("nota.md")).toBe("editado em B");
    expect(compB.fila.abertos.has("nota.md")).toBe(true);
    const conflito = compB.fila.conflitoDe("nota.md")!;
    expect(conflito.local.conteudo).toBe("editado em B");
    expect(conflito.remoto.conteudo).toBe("editado em A");
    expect(conflito.remoto.dispositivo).toBe("Computador A");
    expect(estadoB.conflitosPendentes["nota.md"]).toBeDefined();
  });
});

describe("motor — resolver o conflito em B chega a A", () => {
  it("depois de resolver em B, a versão escolhida sobe no próximo ciclo e A recebe", async () => {
    const { servico, chaveDoVault, compA, estadoA, compB, estadoB } = await configurarParSincronizado();

    await compA.adaptador.escreverTexto("nota.md", "original");
    await ciclo(compA, servico, chaveDoVault, estadoA);
    await ciclo(compB, servico, chaveDoVault, estadoB);

    await compB.adaptador.escreverTexto("nota.md", "editado em B");
    await compA.adaptador.escreverTexto("nota.md", "editado em A");
    await ciclo(compA, servico, chaveDoVault, estadoA);
    await executarCiclo(ctxDe(compB, servico, chaveDoVault, estadoB)); // vira conflito em B

    expect(compB.fila.abertos.has("nota.md")).toBe(true);

    // Usuário resolve em B: "ficar com a local" (a que B tinha escrito).
    await compB.fila.resolver("nota.md", { acao: "ficarCom", origem: "local" }, compB.adaptador, new Date());
    expect(compB.fila.abertos.has("nota.md")).toBe(false);

    // Próximo ciclo em B: o pendente sai (motor detecta que não está mais na fila) e
    // bases[caminho] = hashRemoto; a versão escolhida é uma edição local comum a partir daí.
    const resultadoB = await executarCiclo(ctxDe(compB, servico, chaveDoVault, estadoB));
    expect(resultadoB.ok).toBe(true);
    expect(estadoB.conflitosPendentes["nota.md"]).toBeUndefined();

    // A baixa e recebe a versão escolhida em B.
    const resultadoA = await executarCiclo(ctxDe(compA, servico, chaveDoVault, estadoA));
    expect(resultadoA.ok).toBe(true);
    expect(await compA.adaptador.lerTexto("nota.md")).toBe("editado em B");
  });
});

describe("motor — apagar em A com edição em B mantém a nota (apagar nunca vence editar)", () => {
  it("a nota editada em B volta para A", async () => {
    const { servico, chaveDoVault, compA, estadoA, compB, estadoB } = await configurarParSincronizado();

    await compA.adaptador.escreverTexto("nota.md", "conteúdo original");
    await ciclo(compA, servico, chaveDoVault, estadoA);
    await ciclo(compB, servico, chaveDoVault, estadoB);

    // B edita e sincroniza primeiro.
    await compB.adaptador.escreverTexto("nota.md", "editado em B antes do apagar");
    await ciclo(compB, servico, chaveDoVault, estadoB);

    // A apaga (sem saber da edição de B) e sincroniza.
    await compA.adaptador.remover("nota.md");
    await ciclo(compA, servico, chaveDoVault, estadoA);

    // B baixa o "apagar" de A, mas B editou desde a base — não apaga, reenvia a própria versão.
    const resultadoB = await executarCiclo(ctxDe(compB, servico, chaveDoVault, estadoB));
    expect(resultadoB.ok).toBe(true);
    expect(await compB.adaptador.existe("nota.md")).toBe(true);
    expect(await compB.adaptador.lerTexto("nota.md")).toBe("editado em B antes do apagar");

    // A baixa de novo (o "reenvio" de B chega como um "gravar" comum) e recebe a nota de volta.
    const resultadoA = await executarCiclo(ctxDe(compA, servico, chaveDoVault, estadoA));
    expect(resultadoA.ok).toBe(true);
    expect(await compA.adaptador.existe("nota.md")).toBe(true);
    expect(await compA.adaptador.lerTexto("nota.md")).toBe("editado em B antes do apagar");
    expect(compA.efeitos.chamadas).toContain("reindexarArquivo:nota.md");
  });
});

describe("motor — renomear em A aparece renomeado em B", () => {
  it("o nome antigo some em B (vai pra lixeira de lá) e o novo nome aparece com o conteúdo", async () => {
    const { servico, chaveDoVault, compA, estadoA, compB, estadoB } = await configurarParSincronizado();

    await compA.adaptador.escreverTexto("antigo.md", "conteúdo da nota");
    await ciclo(compA, servico, chaveDoVault, estadoA);
    await ciclo(compB, servico, chaveDoVault, estadoB);

    // Renomear = apagar + gravar (doc 17 §4.1).
    await compA.adaptador.mover("antigo.md", "novo.md");
    await ciclo(compA, servico, chaveDoVault, estadoA);

    const resultadoB = await executarCiclo(ctxDe(compB, servico, chaveDoVault, estadoB));
    expect(resultadoB.ok).toBe(true);

    expect(await compB.adaptador.existe("antigo.md")).toBe(false);
    expect(await compB.adaptador.existe("novo.md")).toBe(true);
    expect(await compB.adaptador.lerTexto("novo.md")).toBe("conteúdo da nota");
    // O antigo caminho passou pela lixeira de B (doc 17 §4.4: cada computador tem a própria).
    expect(compB.efeitos.moverParaLixeira).toHaveBeenCalledWith("antigo.md");
  });
});

describe("motor — A e B enviando 'ao mesmo tempo' não perdem nenhuma mudança", () => {
  it("B envia primeiro; A recebe fora-de-ordem, baixa, aplica e reenvia — as duas mudanças sobrevivem", async () => {
    const { servico, chaveDoVault, compA, estadoA, compB, estadoB } = await configurarParSincronizado();

    // Os dois detectam mudança sobre o MESMO cursor (0): A ainda não sabe de B, B ainda não
    // sabe de A.
    await compA.adaptador.escreverTexto("de-a.md", "criado em A");
    await compB.adaptador.escreverTexto("de-b.md", "criado em B");

    // Servidor que injeta a corrida de verdade: na primeira vez que A chama enviarLote (já
    // com o lote pronto, prestes a mandar), B termina o ciclo dele por completo primeiro —
    // isso é o que força o "esperoUltima" de A a ficar desatualizado, e o fora-de-ordem do
    // servidor é genuíno (não simulado por fora).
    let jaDisparouCorrida = false;
    // Não usar `{ ...servico }`: os métodos de `ServicoSyncFake` vivem no protótipo da classe,
    // não como propriedades próprias — um spread copiaria só os campos privados (`vaults`,
    // `falhar`) e deixaria os métodos `undefined`. Delega explicitamente cada um.
    const servicoComCorrida: ServicoSync = {
      listarVaults: (...args) => servico.listarVaults(...args),
      criarVault: (...args) => servico.criarVault(...args),
      baixar: (...args) => servico.baixar(...args),
      enviarRetrato: (...args) => servico.enviarRetrato(...args),
      apagarVault: (...args) => servico.apagarVault(...args),
      enviarLote: async (id, esperoUltima, bytes) => {
        if (!jaDisparouCorrida) {
          jaDisparouCorrida = true;
          const resultadoB = await executarCiclo(ctxDe(compB, servico, chaveDoVault, estadoB));
          expect(resultadoB.ok).toBe(true);
        }
        return servico.enviarLote(id, esperoUltima, bytes);
      },
    };

    const resultadoA = await executarCiclo(ctxDe(compA, servicoComCorrida, chaveDoVault, estadoA));
    expect(resultadoA.ok).toBe(true);

    // B, depois de terminar o próprio ciclo, ainda não tem o arquivo de A — um ciclo a mais
    // (gatilho seguinte, na vida real) resolve.
    const resultadoBFinal = await executarCiclo(ctxDe(compB, servico, chaveDoVault, estadoB));
    expect(resultadoBFinal.ok).toBe(true);

    // As duas mudanças sobreviveram nos dois lados — nada foi perdido pela corrida.
    expect(await compA.adaptador.lerTexto("de-a.md")).toBe("criado em A");
    expect(await compA.adaptador.lerTexto("de-b.md")).toBe("criado em B");
    expect(await compB.adaptador.lerTexto("de-a.md")).toBe("criado em A");
    expect(await compB.adaptador.lerTexto("de-b.md")).toBe("criado em B");
    expect(jaDisparouCorrida).toBe(true);
  });
});

describe("motor — computador novo C recebe tudo de retrato + lotes", () => {
  it("C baixa o retrato (conteúdo antigo) e os lotes seguintes (conteúdo novo)", async () => {
    const { servico, chaveDeEnvelope, chaveDoVault, idDoVault, compA, estadoA, compB, estadoB } =
      await configurarParSincronizado();

    await compA.adaptador.escreverTexto("velha.md", "conteúdo velho, vai pro retrato");
    await ciclo(compA, servico, chaveDoVault, estadoA);
    await ciclo(compB, servico, chaveDoVault, estadoB);

    // Força um retrato agora (limiar 1 lote) — normalmente aconteceria só depois de 200.
    const resultadoRetrato = await executarCiclo(
      ctxDe(compA, servico, chaveDoVault, estadoA, {}),
    );
    void resultadoRetrato;
    // O ciclo acima não teve mudança local (nada mudou desde o último envio), então não
    // dispara o retrato automático (só acontece depois de ENVIAR algo). Cria mais uma
    // mudança para o retrato ser considerado.
    const ctxAcomRetrato: ContextoCiclo = {
      ...ctxDe(compA, servico, chaveDoVault, estadoA),
      limiarRetrato: { lotes: 1, bytesBrutos: Number.POSITIVE_INFINITY },
    };
    await compA.adaptador.escreverTexto("gatilho.md", "só pra ter algo pra enviar");
    const comRetrato = await executarCiclo(ctxAcomRetrato);
    expect(comRetrato.ok).toBe(true);

    // Depois do retrato, mais uma mudança normal (vai como lote, não entra no retrato).
    await compA.adaptador.escreverTexto("nova.md", "conteúdo novo, vai como lote depois do retrato");
    await ciclo(compA, servico, chaveDoVault, estadoA);

    // Computador C, pasta vazia, baixa tudo.
    const compC = novoComputador("Computador C");
    const [{ envelope }] = await servico.listarVaults();
    const estadoC = await baixarVault({
      adaptador: compC.adaptador,
      servico,
      chaveDeEnvelope,
      idDoVault,
      envelope,
      efeitos: compC.efeitos,
      nomeDesteComputador: compC.nome,
      registrarConflito: compC.fila.registrar,
      flushTudo: async () => ({ falhas: [], bloqueados: [] }),
    });

    expect(await compC.adaptador.lerTexto("velha.md")).toBe("conteúdo velho, vai pro retrato");
    expect(await compC.adaptador.lerTexto("gatilho.md")).toBe("só pra ter algo pra enviar");
    expect(await compC.adaptador.lerTexto("nova.md")).toBe("conteúdo novo, vai como lote depois do retrato");
    expect(estadoC.cursor).toBe(estadoA.cursor);
    // Efeito visível também para C, mesmo caminho de sempre.
    expect(compC.efeitos.recarregarArvore).toHaveBeenCalled();
    expect(compC.efeitos.reindexarArquivo).toHaveBeenCalledWith("nova.md");
  });
});

describe("motor — conflito pendente sobrevive a 'fechar e abrir'", () => {
  it("recarregar o EstadoSync (serializado) entre ciclos mantém o conflito e não sobrescreve a versão remota", async () => {
    const { servico, chaveDoVault, compA, estadoA, compB, estadoB } = await configurarParSincronizado();

    await compA.adaptador.escreverTexto("nota.md", "original");
    await ciclo(compA, servico, chaveDoVault, estadoA);
    await ciclo(compB, servico, chaveDoVault, estadoB);

    await compB.adaptador.escreverTexto("nota.md", "editado em B");
    await compA.adaptador.escreverTexto("nota.md", "editado em A");
    await ciclo(compA, servico, chaveDoVault, estadoA);
    await executarCiclo(ctxDe(compB, servico, chaveDoVault, estadoB)); // conflito em B

    expect(estadoB.conflitosPendentes["nota.md"]).toBeDefined();

    // "Fechar e abrir": serializa e recarrega o EstadoSync — simula o app fechando com o
    // conflito ainda aberto (o comentário do doc 17 §5 é exatamente sobre isto). A fila da
    // tela (fora do EstadoSync, em memória) também é "perdida" e precisa ser re-registrada —
    // é o que o doc diz que acontece ao reabrir o vault.
    const estadoBRecarregado: EstadoSync = JSON.parse(JSON.stringify(estadoB));
    const compBReaberto = novoComputador("Computador B", compB.adaptador); // mesmo disco
    // Re-registra o conflito pendente na fila da tela, como o app faz ao abrir o vault
    // (plano 10/estado da fila) — sem isto ele pareceria "resolvido" e a base avançaria.
    compBReaberto.fila.abertos.add("nota.md");

    // Um ciclo depois de reabrir: o pendente continua lá, a versão local (a de B) NÃO é
    // enviada por cima da remota.
    const resultado = await executarCiclo(ctxDe(compBReaberto, servico, chaveDoVault, estadoBRecarregado));
    expect(resultado.ok).toBe(true);
    expect(estadoBRecarregado.conflitosPendentes["nota.md"]).toBeDefined();
    expect(await compBReaberto.adaptador.lerTexto("nota.md")).toBe("editado em B"); // disco intacto

    // Do lado de A, a versão de A continua lá também — nada foi sobrescrito por engano.
    const resultadoA = await executarCiclo(ctxDe(compA, servico, chaveDoVault, estadoA));
    expect(resultadoA.ok).toBe(true);
    expect(await compA.adaptador.lerTexto("nota.md")).toBe("editado em A");
  });
});

describe("motor — binário em conflito vira duas cópias", () => {
  it("a remota é gravada ao lado com o nome de conflito; a local de B não é tocada", async () => {
    const { servico, chaveDoVault, compA, estadoA, compB, estadoB } = await configurarParSincronizado();

    const original = new Uint8Array([1, 2, 3]);
    await compA.adaptador.escreverBinario("foto.png", original);
    await ciclo(compA, servico, chaveDoVault, estadoA);
    await ciclo(compB, servico, chaveDoVault, estadoB);

    // B edita localmente sem sincronizar ainda (mesmo motivo do teste de conflito de texto:
    // se B sincronizasse agora, o próprio ciclo de B atualizaria `estado.bases` para o hash
    // da própria escrita, e a chegada da versão de A pareceria "não mexi" em vez de conflito).
    const localB = new Uint8Array([9, 9, 9]);
    await compB.adaptador.escreverBinario("foto.png", localB);

    const remotaA = new Uint8Array([4, 5, 6]);
    await compA.adaptador.escreverBinario("foto.png", remotaA);
    const agoraFixo = () => new Date("2026-09-24T12:00:00.000Z");
    await executarCiclo({ ...ctxDe(compA, servico, chaveDoVault, estadoA), agora: agoraFixo });

    const resultadoB = await executarCiclo({ ...ctxDe(compB, servico, chaveDoVault, estadoB), agora: agoraFixo });
    expect(resultadoB.ok).toBe(true);

    // Binário não vai pra fila de conflito da tela — "manter as duas" é automático.
    expect(compB.fila.abertos.has("foto.png")).toBe(false);
    expect(await compB.adaptador.lerBinario("foto.png")).toEqual(localB); // local intacta

    const nomeEsperado = "foto (conflito de 24-09-2026, Computador A).png";
    expect(await compB.adaptador.existe(nomeEsperado)).toBe(true);
    expect(await compB.adaptador.lerBinario(nomeEsperado)).toEqual(remotaA);

    // Doc 17 §6: "bases[original] = hashRemoto" faz o PRÓXIMO passo de detecção ver a local
    // como "mexida" e reenviá-la por cima — mas aqui baixar/detectar/enviar são passos do
    // MESMO ciclo (doc 17 §5), não ciclos separados, então a reenviada já acontece antes deste
    // `executarCiclo` devolver: ao final, `bases["foto.png"]` reflete de novo o hash da local
    // (que acabou de subir), não o hashRemoto intermediário — convergência mais rápida, mesma
    // regra.
    const hashLocal = await hashDe(localB);
    expect(estadoB.bases["foto.png"]).toBe(hashLocal);
  });
});

describe("motor — arquivo acima do limite fica fora e é listado", () => {
  it("foraDaSincronizacao lista o caminho; o outro computador nunca recebe o arquivo", async () => {
    const { servico, chaveDoVault, compA, estadoA, compB, estadoB } = await configurarParSincronizado();

    const grande = new Uint8Array(7 * 1024 * 1024 + 1);
    await compA.adaptador.escreverBinario("gigante.bin", grande);
    await compA.adaptador.escreverTexto("normal.md", "nota comum");

    const resultado = await executarCiclo(ctxDe(compA, servico, chaveDoVault, estadoA));
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.foraDaSincronizacao).toEqual(["gigante.bin"]);

    await ciclo(compB, servico, chaveDoVault, estadoB);
    expect(await compB.adaptador.existe("gigante.bin")).toBe(false);
    expect(await compB.adaptador.existe("normal.md")).toBe(true);
  });
});
