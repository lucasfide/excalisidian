// src/sync/segundoPlano.ts
// Sincronização em segundo plano dos vaults fechados (doc 17 §8.1, plano 12 Task 5): todo
// vault sincronizado deste computador, mas sem janela mostrando ele agora, sincroniza sozinho
// enquanto o app está aberto — uma rodada ao instalar e a cada 60 s, só pela janela designada
// (a de menor label entre as abertas, reavaliada a cada rodada: se ela fechar, outra assume).
//
// Em segundo plano os efeitos de tela são nulos (`efeitosNulos()`, `sync/motor.ts`) — não há
// árvore, índice nem aba desse vault nesta janela para atualizar — e um conflito nunca entra na
// fila da tela: `registrarConflito`/`flushTudo` são no-ops; `conflitosAbertos` lê os pendentes
// persistidos para que a falta de uma fila visual não pareça uma resolução do usuário,
// então um conflito que o motor encontrar fica só em `estado.conflitosPendentes` (persistido por
// `executarCiclo`, doc 17 §5) e aparece na lista "Seus vaults" como "N conflitos — abra o vault
// para resolver" (Task 4/6). Quando o usuário abre esse vault numa janela, ela re-registra os
// pendentes na fila de verdade (já é assim hoje, `syncStore.iniciar`).
//
// `DepsSegundoPlano` injeta TUDO (mesmo padrão de `ContextoCiclo`/`DepsSyncStore`): testável sem
// Tauri, sem servidor de verdade e sem zustand. `iniciarSegundoPlanoReal`, no fim do arquivo, é a
// implementação real que `cicloDeVidaSync.ts` instala.

import {
  executarCiclo as executarCicloPadrao,
  efeitosNulos,
  type ContextoCiclo,
  type ErroCiclo,
  type ResultadoCiclo,
} from "./motor";
import {
  carregarEstadoSync,
  salvarEstadoSync,
  lerNomeDoComputador,
  type EstadoSync,
} from "./estadoSync";
import { vaultsAbertos, tentarTravarSync, liberarTravaSync, chaveDeVault } from "./coordenacao";
import { listarRecentes } from "../vault/vaultsRecentes";
import { servicoSyncAtual } from "./servicoSyncAtual";
import { abrirEnvelope } from "./pacote";
import { TauriVaultAdapter } from "../vault/TauriVaultAdapter";
import { useContaStore } from "../estado/contaStore";
import type { ServicoSync } from "./ServicoSync";
import type { VaultAdapter } from "../vault/VaultAdapter";

/** "A cada 60 s" (doc 17 §8.1). */
const INTERVALO_MS = 60_000;

/** Tudo que uma rodada de segundo plano precisa, injetado — nenhum destes campos é importado
 * direto por `rodar`/`executarRodada`, mesmo padrão de `ContextoCiclo` (`sync/motor.ts`) e
 * `DepsSyncStore` (`estado/syncStore.ts`). */
export interface DepsSegundoPlano {
  /** `contaStore.carregado`. */
  contaCarregada: () => boolean;
  /** `contaStore.plano() === "premium"`. */
  contaPremium: () => boolean;
  /** `contaStore.chaveDeEnvelopeAtual()`. */
  chaveDeEnvelopeAtual: () => Promise<Uint8Array | null>;
  listarRecentes: () => Promise<{ caminho: string }[]>;
  carregarEstadoSync: (raiz: string) => Promise<EstadoSync | null>;
  salvarEstadoSync: (raiz: string, estado: EstadoSync) => Promise<void>;
  /** Chaves normalizadas dos vaults abertos em alguma janela (`coordenacao.vaultsAbertos`). */
  vaultsAbertos: () => Promise<string[]>;
  tentarTravarSync: (caminho: string) => Promise<string | null>;
  liberarTravaSync: (caminho: string, dono: string) => Promise<void>;
  /** Mesma normalização de `coordenacao.chaveDeVault`, para comparar um caminho com o que
   * `vaultsAbertos()` devolve. */
  chaveDeVault: (caminho: string) => string;
  /** Nunca usado para criar a pasta — só para decidir se pula (doc 17 §8.1, Review Focus 3). */
  existePasta: (caminho: string) => Promise<boolean>;
  /** A menor label entre as janelas abertas agora é a designada (doc 17 §8.1) — reavaliado a
   * cada rodada. */
  souJanelaDesignada: () => Promise<boolean>;
  servico: ServicoSync;
  abrirEnvelope: (
    chaveDeEnvelope: Uint8Array,
    envelope: Uint8Array,
    idDoVault: string,
  ) => Promise<Uint8Array>;
  /** `TauriVaultAdapter.abrir(caminho)` — concede o escopo de FS e devolve o adaptador, sem
   * mexer em recentes (o vault já está nos recentes, senão não chegaríamos aqui). */
  abrirAdaptador: (caminho: string) => Promise<VaultAdapter>;
  nomeDesteComputador: () => Promise<string>;
  /** Injetável só pros testes: um `executarCiclo` falso no lugar do de verdade
   * (`sync/motor.ts#executarCiclo`, o padrão quando omitido). */
  executarCiclo?: (ctx: ContextoCiclo) => Promise<ResultadoCiclo>;
  /** Injetável pros testes controlarem `ultimoCicloEm`. */
  agora?: () => Date;
  /** Injetável pros testes trocarem o intervalo de 60 s por algo mais rápido. */
  intervaloMs?: number;
}

async function gravarComSilencio(
  deps: Pick<DepsSegundoPlano, "salvarEstadoSync">,
  caminho: string,
  estado: EstadoSync,
): Promise<void> {
  try {
    await deps.salvarEstadoSync(caminho, estado);
  } catch {
    // Falha ao GRAVAR o estado (não ao sincronizar) não pode derrubar a rodada — mesma postura
    // de `syncStore.rodarCiclo`; o `estado` em memória local desta rodada só existia aqui mesmo.
  }
}

/** Deps mínimas para sincronizar UM vault fechado (`rodarVault`, abaixo) — subconjunto de
 * `DepsSegundoPlano`. Task 6 (revisão de code review, commit 3d536f5): `SecaoSincronizacao.tsx`
 * reaproveita `rodarVault` para "Sincronizar agora" num vault fechado nesta janela, em vez de
 * manter uma segunda cópia da mesma trava/efeitos-nulos/`executarCiclo` — um `DepsSegundoPlano`
 * completo sempre serve aqui (estrutural: só tem campos a mais). */
export type DepsRodarVault = Pick<
  DepsSegundoPlano,
  | "carregarEstadoSync"
  | "salvarEstadoSync"
  | "existePasta"
  | "tentarTravarSync"
  | "liberarTravaSync"
  | "vaultsAbertos"
  | "chaveDeVault"
  | "servico"
  | "abrirEnvelope"
  | "abrirAdaptador"
  | "executarCiclo"
  | "agora"
>;

/** Um vault por vez (Task 5): abre o envelope, roda `executarCiclo` com efeitos nulos e grava
 * `ultimoCicloEm`/`ultimoErro`. Qualquer falha (envelope que não abre, adaptador que não abre,
 * exceção do próprio ciclo) é registrada em `estado.ultimoErro` e NÃO propaga — quem chama
 * (`executarRodada`) segue para o próximo vault. */
async function sincronizarUmVault(
  deps: DepsRodarVault,
  caminho: string,
  estado: EstadoSync,
  registro: { id: string; envelope: Uint8Array } | undefined,
  chaveDeEnvelope: Uint8Array,
  nomeDesteComputador: string,
  agora: () => Date,
): Promise<void> {
  if (!registro) {
    // O vault não está (mais) na lista da nuvem agora — pode ser falha de rede momentânea na
    // listagem, ou o vault ter sido apagado do servidor. A lista "Seus vaults" (Task 4) já não
    // conclui sozinha que foi apagado; o segundo plano segue a mesma postura: não é erro deste
    // ciclo, só não há nada a sincronizar agora.
    return;
  }

  let ultimoErro: ErroCiclo | null = null;
  try {
    let chaveDoVault: Uint8Array;
    try {
      chaveDoVault = await deps.abrirEnvelope(chaveDeEnvelope, registro.envelope, registro.id);
    } catch {
      // Envelope que não abre com a chave desta conta — este vault foi criado com a senha de
      // outra conta (plano 13 Task 2, doc 17 §8). Pulado com `ultimoErro: "outra-senha"`, não
      // derruba a rodada; a chave no cofre não é tocada aqui (o segundo plano nunca mexeu nela).
      estado.ultimoErro = "outra-senha";
      estado.ultimoCicloEm = agora().toISOString();
      await gravarComSilencio(deps, caminho, estado);
      return;
    }

    const adaptador = await deps.abrirAdaptador(caminho);

    const ctx: ContextoCiclo = {
      adaptador,
      servico: deps.servico,
      chave: chaveDoVault,
      estado,
      // Efeitos nulos: não há árvore/aba desse vault nesta janela (doc 17 §8.1).
      efeitos: efeitosNulos(),
      nomeDesteComputador,
      // Nunca entra na fila da tela — fica só em `estado.conflitosPendentes` (persistido pelo
      // motor). `flushTudo` não faz nada: não há aba deste vault nesta janela para gravar.
      registrarConflito: () => {},
      flushTudo: async () => {},
      conflitosAbertos: () => new Set(Object.keys(estado.conflitosPendentes)),
      agora: deps.agora,
    };

    let resultado: ResultadoCiclo;
    try {
      const executar = deps.executarCiclo ?? executarCicloPadrao;
      resultado = await executar(ctx);
    } catch {
      resultado = { ok: false, erro: "servidor", foraDaSincronizacao: [] };
    }

    ultimoErro = resultado.ok ? null : resultado.erro;
  } catch {
    ultimoErro = "servidor";
  }

  estado.ultimoCicloEm = agora().toISOString();
  estado.ultimoErro = ultimoErro;
  await gravarComSilencio(deps, caminho, estado);
}

/** Pula (nunca sincroniza) se: não é recente com `EstadoSync`, a pasta não existe (nunca é
 * criada — Review Focus 3), a trava é negada, ou está aberto em alguma janela (Review Focus 2).
 *
 * `vaultsAbertos()` é consultado de novo AQUI, depois de já ter a trava — não reaproveita uma
 * lista pega no início da rodada (revisão pós-commit d9346a7): entre o início da rodada e a vez
 * deste vault, alguém pode ter aberto ele numa janela; se o segundo plano confiasse só na lista
 * velha, a trava não evitaria a corrida (ela só impede DOIS ciclos ao mesmo tempo, não decide
 * QUAL dos dois devia nem rodar) — as escritas do segundo plano podiam cair depois que a janela
 * nova já carregou as abas, e se a própria janela designada for quem abriu o vault, o registro
 * de "escrita própria" faz o watcher ignorar o evento e a aba fica com a versão antiga. A trava
 * é sempre liberada com o token, inclusive se o ciclo lançar ou se este check encontrar o vault
 * aberto (Review Focus 2).
 *
 * Exportada (Task 6, revisão pós-commit 3d536f5): é a mesma função que "Sincronizar agora"
 * chama, em `SecaoSincronizacao.tsx`, para um item da lista "Seus vaults" que está sincronizado
 * mas fechado nesta janela — uma cópia própria da trava/efeitos-nulos/`executarCiclo` ali seria
 * a mesma regra duas vezes (e já tinha ficado sem a checagem fresca de `vaultsAbertos()` depois
 * da trava). Quando pula porque o vault está aberto em outra janela (ou a trava foi negada, ou a
 * pasta sumiu), esta função não sinaliza nada de especial — devolve normalmente sem tocar em
 * `estado.ultimoErro`; quem chama nunca deveria mostrar isso como um erro novo (a janela dona
 * sincroniza sozinha). */
export async function rodarVault(
  deps: DepsRodarVault,
  caminho: string,
  nuvem: { id: string; envelope: Uint8Array }[],
  chaveDeEnvelope: Uint8Array,
  nomeDesteComputador: string,
  agora: () => Date,
): Promise<void> {
  const estado = await deps.carregarEstadoSync(caminho);
  if (!estado) return; // não é recente com EstadoSync

  if (!(await deps.existePasta(caminho))) return; // pasta apagada/movida — não recria, não sincroniza

  const dono = await deps.tentarTravarSync(caminho);
  if (dono === null) return; // outra janela (ou o próprio segundo plano de outra rodada) já trava

  try {
    const abertos = await deps.vaultsAbertos();
    if (abertos.includes(deps.chaveDeVault(caminho))) return; // aberto agora — ela sincroniza sozinha

    const registro = nuvem.find((v) => v.id === estado.idDoVault);
    await sincronizarUmVault(deps, caminho, estado, registro, chaveDeEnvelope, nomeDesteComputador, agora);
  } finally {
    try {
      await deps.liberarTravaSync(caminho, dono);
    } catch {
      // Falha ao liberar (IPC caiu, app fechando) nunca propaga — mesma postura de
      // `syncStore.rodarCiclo`. Uma trava presa a um label morto é limpa pelo lado Rust ao
      // fechar a janela (`WindowEvent::Destroyed`).
    }
  }
}

/** Uma rodada completa (doc 17 §8.1): só roda na janela designada, só com sessão premium, conta
 * carregada e chave de envelope; baixa a lista da nuvem uma vez, e sincroniza cada vault
 * recente elegível, um de cada vez — a falha de um nunca impede os demais. Exportada para os
 * testes chamarem direto, sem depender do agendamento de `iniciarSegundoPlano`. */
export async function executarRodada(deps: DepsSegundoPlano): Promise<void> {
  if (!(await deps.souJanelaDesignada())) return;
  if (!deps.contaCarregada() || !deps.contaPremium()) return;

  const chaveDeEnvelope = await deps.chaveDeEnvelopeAtual();
  if (!chaveDeEnvelope) return;

  let nuvem;
  try {
    nuvem = await deps.servico.listarVaults();
  } catch {
    // Sem lista da nuvem, não há como decidir nada nesta rodada — tenta de novo na próxima.
    return;
  }

  const recentes = await deps.listarRecentes();
  const nomeDesteComputador = await deps.nomeDesteComputador();
  const agora = deps.agora ?? (() => new Date());

  for (const recente of recentes) {
    try {
      await rodarVault(deps, recente.caminho, nuvem, chaveDeEnvelope, nomeDesteComputador, agora);
    } catch {
      // Um vault por vez; falha de um (inclusive uma exceção não coberta pelos try/catch de
      // dentro) não pode impedir os demais.
    }
  }
}

/** Instala o segundo plano: uma rodada já ao chamar, e depois a cada 60 s (ou `deps.intervaloMs`
 * nos testes). Devolve "parar", que cancela o intervalo — uma rodada já em andamento termina
 * sozinha, só não agenda mais nenhuma. */
export function iniciarSegundoPlano(deps: DepsSegundoPlano): () => void {
  let parado = false;
  let rodadaEmAndamento = false;

  async function tick(): Promise<void> {
    if (parado || rodadaEmAndamento) return;
    rodadaEmAndamento = true;
    try {
      await executarRodada(deps);
    } catch {
      // Nunca propaga: uma rodada que falhar de um jeito imprevisto não pode matar o intervalo.
    } finally {
      rodadaEmAndamento = false;
    }
  }

  void tick();
  const intervalo = setInterval(() => void tick(), deps.intervaloMs ?? INTERVALO_MS);

  return () => {
    parado = true;
    clearInterval(intervalo);
  };
}

// --- implementação real (para `cicloDeVidaSync.ts`) ---

async function souJanelaDesignadaReal(): Promise<boolean> {
  const { getAllWebviewWindows, getCurrentWebviewWindow } = await import(
    "@tauri-apps/api/webviewWindow"
  );
  const janelas = await getAllWebviewWindows();
  if (janelas.length === 0) return true;
  const menorLabel = janelas.map((j) => j.label).sort()[0];
  return menorLabel === getCurrentWebviewWindow().label;
}

/** `vault_existe` (Rust, `is_dir`) não depende de permissão de escopo; o `exists` do
 * plugin-fs lança para um vault que nenhuma janela abriu nesta execução, e isso o fazia
 * passar por "pasta apagada" e nunca sincronizar. */
export async function existePastaReal(caminho: string): Promise<boolean> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("vault_existe", { path: caminho });
  } catch {
    return false;
  }
}

/** Monta `iniciarSegundoPlano` com as dependências reais — `cicloDeVidaSync.ts` chama isto uma
 * vez por janela. Import dinâmico das APIs do Tauri (`souJanelaDesignadaReal`/`existePastaReal`)
 * para os testes de `cicloDeVidaSync.ts` (que mockam `./segundoPlano` inteiro) não precisarem
 * de um Tauri de verdade só para importar este módulo. */
export function iniciarSegundoPlanoReal(): () => void {
  return iniciarSegundoPlano({
    contaCarregada: () => useContaStore.getState().carregado,
    contaPremium: () => useContaStore.getState().plano() === "premium",
    chaveDeEnvelopeAtual: () => useContaStore.getState().chaveDeEnvelopeAtual(),
    listarRecentes,
    carregarEstadoSync,
    salvarEstadoSync,
    vaultsAbertos,
    tentarTravarSync,
    liberarTravaSync,
    chaveDeVault,
    existePasta: existePastaReal,
    souJanelaDesignada: souJanelaDesignadaReal,
    servico: servicoSyncAtual(),
    abrirEnvelope,
    abrirAdaptador: (caminho) => TauriVaultAdapter.abrir(caminho),
    nomeDesteComputador: lerNomeDoComputador,
  });
}
