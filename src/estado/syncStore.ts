// src/estado/syncStore.ts
// O agendador e o status da sincronização (doc 17 §5 e §8; plano 09 Task 5). Liga o ciclo puro
// de `sync/motor.ts` ao vault de verdade: carrega o `EstadoSync` deste computador, decide
// QUANDO rodar um ciclo (ao iniciar, alguns segundos depois de uma mudança, a cada 60 s, ou por
// pedido explícito), garante um ciclo por vez, e expõe `status`/`ultimoCiclo`/
// `foraDaSincronizacao` para a interface — o plano 10 é quem liga isto na tela e no cofre da
// chave. Nada aqui toca `App.tsx` nem nenhum componente.
//
// SINAL DE MUDANÇA (escolha documentada, pedida pela Task 5): o watcher do vault ignora o eco
// da própria gravação atômica (doc 02 §10) — ele NÃO serve de sinal aqui, porque o motor de
// sincronização precisa saber TAMBÉM das gravações que este app fez (uma nota salva pelo
// autosave, ou por este mesmo motor ao aplicar um lote, tem que ser considerada no próximo
// ciclo). O sinal escolhido é a referência do campo `indice` do `vaultStore`
// (`useVaultStore.getState().indice`): toda gravação passa por `reindexarArquivo` ou
// `reindexar` antes de terminar — a gravação comum do editor, a resolução de conflito
// (`conflitosStore`), o próprio motor de sincronização ao aplicar um lote (via
// `EfeitosDeGravacao.reindexarArquivo`, chamado por `gravarComEfeitos`/`gravarLoteComEfeitos`),
// e o watcher reconciliando um evento externo de verdade — e cada uma dessas chamadas troca
// `indice` por um `Map` NOVO (`vaultStore.ts`: `reindexar`/`reindexarArquivo` terminam com
// `set({ indice: novo, ... })`, nunca mutam o Map antigo no lugar). Comparar a REFERÊNCIA do
// campo entre dois estados do zustand (`estado.indice !== anterior.indice`) é barato e cobre
// toda gravação sem reimplementar um deep-equal. A assinatura entra por injeção
// (`assinarMudancasNoIndice`, em `DepsSyncStore`) — este módulo não importa `vaultStore`
// direto, mesmo padrão de `registrarConflito`/`flushTudo` em `sync/motor.ts#ContextoCiclo`.
// `assinarMudancasNoIndiceReal`, no fim do arquivo, é a implementação real pronta pro plano 10.

import { create } from "zustand";

import {
  executarCiclo as executarCicloPadrao,
  type ContextoCiclo,
  type ErroCiclo,
  type ResultadoCiclo,
} from "../sync/motor";
import { carregarEstadoSync, salvarEstadoSync, type EstadoSync } from "../sync/estadoSync";
import * as coordenacaoReal from "../sync/coordenacao";
import type { Conflito } from "../sync/tipos";
import type { ServicoSync } from "../sync/ServicoSync";
import type { EntradaArquivo, VaultAdapter } from "../vault/VaultAdapter";
import type { EfeitosDeGravacao } from "../vault/efeitosDeGravacao";
import { tipoDoArquivo } from "../vault/arvore";
import { useVaultStore } from "./vaultStore";

/** Alguns segundos depois de cada lote de mudanças no índice (doc 17 §5) — várias mudanças
 * seguidas (autosave de várias notas, um lote grande reconciliado pelo watcher) reiniciam o
 * temporizador a cada uma; só a última dispara um ciclo, 5 s depois dela. */
const DEBOUNCE_MUDANCA_MS = 5000;

/** "A cada 60 s com o app aberto" (doc 17 §5). */
const INTERVALO_MS = 60000;

/** Nova tentativa depois de uma trava negada (doc 17 §8.1) — o dono atual (a janela do vault,
 * ou o segundo plano) deve estar perto de terminar o próprio ciclo. */
const NOVA_TENTATIVA_TRAVA_MS = 2000;

/** A trava de sincronização por vault (doc 17 §8.1, plano 12 Task 3), pelo mínimo que
 * `rodarCiclo` precisa dela — mesmo padrão de `registrarConflito`/`flushTudo` acima: só os dois
 * métodos usados, não o módulo `sync/coordenacao.ts` inteiro, para o teste poder injetar uma
 * trava falsa sem mockar `@tauri-apps/api/core`. */
export interface CoordenacaoSync {
  /** Devolve o token `dono` quando travou, `null` se já estava travado (doc 17 §8.1) — NÃO
   * reentrante: chamar de novo pela mesma janela devolve um `dono` novo ou `null`, nunca
   * reaproveita uma trava já concedida a esta janela (ver `trava_sync.rs`). */
  tentarTravarSync: (caminho: string) => Promise<string | null>;
  /** Só libera se `dono` for exatamente o token devolvido por `tentarTravarSync`. */
  liberarTravaSync: (caminho: string, dono: string) => Promise<void>;
}

/** Implementação real, sobre os comandos Rust (`sync/coordenacao.ts`) — o padrão quando
 * `DepsSyncStore.coordenacao` é omitido. */
const coordenacaoPadrao: CoordenacaoSync = {
  tentarTravarSync: coordenacaoReal.tentarTravarSync,
  liberarTravaSync: coordenacaoReal.liberarTravaSync,
};

/** Status exposto pra interface (doc 17 §8). `{ erro }` cobre os códigos de `ErroCiclo`
 * (os do servidor mais `"aplicar-lote"`) — a seção Sincronização das Configurações (plano 10)
 * é quem traduz o código pro texto do catálogo. `"pausado"` é reservado pro botão manual de
 * pausa do plano 10; esta task não tem nenhum jeito de chegar nele sozinha. */
export type StatusSync =
  | "desligado"
  | "sincronizando"
  | "sincronizado"
  | "sem-conexao"
  | "pausado"
  | { erro: ErroCiclo };

/** Tudo que o store não é dono, injetado em `iniciar` — o mesmo padrão de `ContextoCiclo`
 * (`sync/motor.ts`) e de `DepsResolucao`/`efeitosReais` (`estado/conflitosStore.ts`): o store
 * fica testável sem Tauri, sem servidor de verdade e sem os outros stores do zustand. O plano
 * 10 monta a versão real (adaptador do vault aberto, `ServicoSyncHttp`, `chaveDoVault` do
 * cofre, `efeitosReais()`, `registrarConflito`/`flushTudo`/`conflitosAbertos` dos stores reais,
 * `assinarMudancasNoIndiceReal`). */
export interface DepsSyncStore {
  adaptador: VaultAdapter;
  servico: ServicoSync;
  /** `chaveDoVault` (doc 17 §2) deste vault — nunca logada. Sem cofre ainda (plano 10), por
   * isso entra por parâmetro. */
  chaveDoVault: Uint8Array;
  efeitos: EfeitosDeGravacao;
  nomeDesteComputador: string;
  registrarConflito: (conflito: Conflito) => void;
  flushTudo: () => Promise<unknown>;
  conflitosAbertos: () => Set<string>;
  /** Ver o comentário do topo do arquivo — o sinal de "algo mudou" que dispara o ciclo 5 s
   * depois. Devolve uma função de cancelar a assinatura. */
  assinarMudancasNoIndice: (ouvinte: () => void) => () => void;
  /** Injetável só pros testes: um `executarCiclo` falso e controlável no lugar do de verdade
   * (`sync/motor.ts#executarCiclo`, o padrão quando omitido). */
  executarCiclo?: (ctx: ContextoCiclo) => Promise<ResultadoCiclo>;
  /** Injetável pros testes controlarem `criadoEm`/`agora` do ciclo — repassado a `ContextoCiclo`. */
  agora?: () => Date;
  /** Injetável só pros testes: a trava de sincronização por vault (doc 17 §8.1), no lugar da
   * real (`coordenacaoPadrao`, sobre os comandos Rust) — o padrão quando omitido. */
  coordenacao?: CoordenacaoSync;
}

interface SyncStoreState {
  raiz: string | null;
  status: StatusSync;
  ultimoCiclo: Date | null;
  foraDaSincronizacao: string[];

  /** Carrega o `EstadoSync` deste computador para `raiz`. Sem estado salvo: `"desligado"`, sem
   * agendar nada. Com estado: re-registra `conflitosPendentes` na `conflitosStore` (via
   * `deps.registrarConflito`) com a versão local lida do disco AGORA — se a leitura de um
   * caminho falhar (arquivo sumiu, permissão), aquele conflito não é re-registrado nesta
   * chamada e o pendente correspondente NÃO é apagado de `estado.conflitosPendentes` (ele
   * continua lá; o próximo `iniciar()` tenta de novo) — e agenda os gatilhos do ciclo. */
  iniciar(raiz: string, deps: DepsSyncStore): Promise<void>;
  /** Ao trocar ou fechar o vault: cancela toda assinatura e temporizador, e volta a
   * `"desligado"`. Um ciclo já em andamento termina, mas seu resultado é ignorado (a geração
   * mudou) — nada é persistido nem aplicado ao estado de um `iniciar()` seguinte. */
  parar(): void;
  /** Plano 10 Task 5: `ligarAoVault.ts` chama isto quando `listarVaults()` falhou com `rede`
   * ANTES de conseguir montar os `DepsSyncStore` (adaptador, serviço, chave do vault — nada
   * disso existe ainda sem uma resposta do servidor). Sem isto, um vault que JÁ está
   * sincronizado neste computador (tem `EstadoSync` gravado), mas abriu com o app offline,
   * ficaria com `raiz === null` — a seção Sincronização e o ícone do rodapé o veriam como "não
   * sincronizado" em vez de "sincronizado, sem conexão agora". Não deixa o store operante:
   * `deps`/`estadoEmMemoria` continuam `null`, então nenhum ciclo automático ou
   * `sincronizarAgora()` roda — quem tenta de novo é o temporizador de `ligarAoVault.ts`,
   * chamando `iniciar()` de verdade quando conseguir falar com o servidor. */
  iniciarPendente(raiz: string): void;
  /** "Sincronizar agora" (doc 17 §7): força uma tentativa mesmo se o agendamento automático
   * estiver parado por causa de `sessao`/`plano`/`espaco` (doc 17 §5) — é o gatilho que "algo
   * mudou" descrito lá. Um ciclo já em andamento vira só mais um pedido de "rodar de novo ao
   * terminar" (nunca dois em paralelo). No-op se `iniciar` nunca foi chamado com sucesso.
   */
  sincronizarAgora(): Promise<void>;
}

// --- estado não-reativo do agendador (mesmo padrão de `cancelarWatcher` em vaultStore.ts):
// não faz sentido re-renderizar a UI quando um timer é armado, e um `EstadoSync` mutável
// injetado no ciclo (ver JSDoc de `ContextoCiclo`) não pertence ao estado do zustand. ---

let deps: DepsSyncStore | null = null;
let estadoEmMemoria: EstadoSync | null = null;
let raizAtual: string | null = null;
/** Incrementada a cada `iniciar()`/`parar()` — um ciclo em andamento de uma geração antiga
 * descarta seu resultado ao terminar (`parar()` não pode cancelar uma promise em voo). */
let geracao = 0;
let cicloEmAndamento = false;
let pedidoDeNovo = false;
/** `true` depois de um erro que "para de agendar até algo mudar" (doc 17 §5: `sessao`,
 * `plano`, `espaco`) — os gatilhos automáticos (índice, 60 s) ficam mudos; `sincronizarAgora()`
 * continua funcionando (é o "algo mudou" que destrava). */
let paradoPorErroPersistente = false;
let timerDebounce: ReturnType<typeof setTimeout> | undefined;
let timerIntervalo: ReturnType<typeof setInterval> | undefined;
/** Nova tentativa 2 s depois de uma trava negada (doc 17 §8.1) — só uma agendada por vez: uma
 * trava negada de novo enquanto esta já espera não arma uma segunda (mesmo padrão do debounce
 * de mudança no índice, que reinicia em vez de empilhar). */
let timerNovaTentativaTrava: ReturnType<typeof setTimeout> | undefined;
let cancelarAssinaturaIndice: () => void = () => {};

function limparAgendamento(): void {
  if (timerDebounce !== undefined) clearTimeout(timerDebounce);
  if (timerIntervalo !== undefined) clearInterval(timerIntervalo);
  if (timerNovaTentativaTrava !== undefined) clearTimeout(timerNovaTentativaTrava);
  timerDebounce = undefined;
  timerIntervalo = undefined;
  timerNovaTentativaTrava = undefined;
  cancelarAssinaturaIndice();
  cancelarAssinaturaIndice = () => {};
}

export const useSyncStore = create<SyncStoreState>((set) => {
  /** Um ciclo (doc 17 §5). Nunca roda dois ao mesmo tempo: se já houver um em andamento,
   * marca `pedidoDeNovo` e devolve — quem estava rodando o refaz sozinho ao terminar. Persiste
   * o `EstadoSync` resultante DEPOIS do ciclo, com sucesso OU com falha (o motor só adota em
   * `estadoEmMemoria` o que deu certo — ver JSDoc de `executarCiclo`/`aplicarLote` — então
   * persistir sempre é seguro). Uma exceção inesperada do `executarCiclo` injetado (não um
   * `ResultadoCiclo` de erro) vira `{ erro: "servidor" }` em vez de propagar — nunca derruba o
   * app nem trava o agendador. */
  async function rodarCiclo(): Promise<void> {
    if (cicloEmAndamento) {
      pedidoDeNovo = true;
      return;
    }
    const depsAtuais = deps;
    const raiz = raizAtual;
    const estado = estadoEmMemoria;
    if (!depsAtuais || !raiz || !estado) return; // desligado — nada a fazer

    const minhaGeracao = geracao;
    const coordenacao = depsAtuais.coordenacao ?? coordenacaoPadrao;

    // Trava por vault (doc 17 §8.1, Review Focus 2): antes de rodar, garante que nenhuma outra
    // janela (nem o segundo plano) está sincronizando este vault agora. Negada = não é erro:
    // status fica como estava, e uma nova tentativa é agendada em 2 s — o dono atual deve
    // terminar logo. `dono` é um token novo por tentativa (não reentrante do lado Rust — ver
    // `trava_sync.rs`): a janela designada do segundo plano pode ser a MESMA janela de um vault
    // aberto, então o label sozinho não diferenciaria os dois ciclos.
    const dono = await coordenacao.tentarTravarSync(raiz);
    if (dono === null) {
      if (minhaGeracao === geracao && timerNovaTentativaTrava === undefined) {
        timerNovaTentativaTrava = setTimeout(() => {
          timerNovaTentativaTrava = undefined;
          if (minhaGeracao === geracao) void rodarCiclo();
        }, NOVA_TENTATIVA_TRAVA_MS);
      }
      return;
    }

    cicloEmAndamento = true;
    set({ status: "sincronizando" });

    const ctx: ContextoCiclo = {
      adaptador: depsAtuais.adaptador,
      servico: depsAtuais.servico,
      chave: depsAtuais.chaveDoVault,
      estado,
      efeitos: depsAtuais.efeitos,
      nomeDesteComputador: depsAtuais.nomeDesteComputador,
      registrarConflito: depsAtuais.registrarConflito,
      flushTudo: depsAtuais.flushTudo,
      conflitosAbertos: depsAtuais.conflitosAbertos,
      agora: depsAtuais.agora,
    };

    // `finally` cobre o ciclo INTEIRO, inclusive a persistência abaixo: uma falha em
    // `salvarEstadoSync` (disco cheio, permissão) não pode deixar `cicloEmAndamento` travado
    // em `true` para sempre — sem isto, todo gatilho seguinte só marcaria `pedidoDeNovo` e
    // nenhum ciclo rodaria de novo até o app fechar, sem status de erro nenhum na tela (achado
    // da revisão do plano 09, commit aae9361).
    try {
      let resultado: ResultadoCiclo;
      try {
        const executar = depsAtuais.executarCiclo ?? executarCicloPadrao;
        resultado = await executar(ctx);
      } catch {
        // Exceção inesperada do `executarCiclo` (não um `ResultadoCiclo` de erro): nunca
        // derruba o app.
        resultado = { ok: false, erro: "servidor", foraDaSincronizacao: [] };
      }

      // Persiste o resultado (sucesso ou falha) SEMPRE — mas só se `parar()` não mudou a
      // geração enquanto o ciclo estava em voo: um `iniciar()` seguinte pode já ter carregado
      // (ou não) um `EstadoSync` diferente, e gravar por cima aqui apagaria isso.
      if (minhaGeracao === geracao) {
        // Doc 17 §8 / plano 12 Task 4: a lista "Seus vaults" mostra "Sincronizado há X min" (a
        // partir de `ultimoCicloEm`) ou o erro do status (`ultimoErro`) — gravados no
        // `EstadoSync` ANTES de persistir, sucesso ou falha, sempre que o fim do ciclo ainda
        // vale para esta geração (mesma condição da persistência abaixo).
        const fimDoCiclo = depsAtuais.agora ? depsAtuais.agora() : new Date();
        estado.ultimoCicloEm = fimDoCiclo.toISOString();
        estado.ultimoErro = resultado.ok ? null : resultado.erro;
        try {
          await salvarEstadoSync(raiz, estado);
        } catch {
          // Falha ao GRAVAR o estado (não ao sincronizar): o `estado` em memória continua
          // valendo — nada foi perdido, só não foi pro disco ainda — e o próximo ciclo tenta
          // salvar de novo. Nunca propaga: isto roda dentro de `void rodarCiclo()`, e uma
          // rejeição não tratada aqui viraria um "unhandled rejection" global.
          resultado = { ok: false, erro: "servidor", foraDaSincronizacao: [] };
        }
      }

      if (minhaGeracao === geracao) {
        if (resultado.ok) {
          paradoPorErroPersistente = false;
          set({
            status: "sincronizado",
            ultimoCiclo: new Date(),
            foraDaSincronizacao: resultado.foraDaSincronizacao,
          });
        } else {
          aplicarErro(resultado.erro, resultado.foraDaSincronizacao);
        }
      }
    } finally {
      cicloEmAndamento = false;
      try {
        await coordenacao.liberarTravaSync(raiz, dono);
      } catch {
        // Falha ao liberar (IPC caiu, app fechando): não propaga — nunca derruba o app nem
        // trava o agendador. Uma trava presa a um label morto é limpa por
        // `WindowEvent::Destroyed` do lado Rust ao fechar esta janela.
      }
    }

    if (pedidoDeNovo) {
      pedidoDeNovo = false;
      if (minhaGeracao === geracao) void rodarCiclo();
    }
  }

  /** Doc 17 §5: `"rede"` vira `"sem-conexao"` e tenta de novo no próximo gatilho (não para de
   * agendar); `"sessao"`, `"plano"`, `"espaco"` param de agendar até `sincronizarAgora()` (ou
   * um `iniciar()` novo). Os demais códigos (`"fora-de-ordem"` esgotado, `"aplicar-lote"`,
   * `"servidor"`, `"nao-encontrado"`, `"ja-existe"`) não têm regra própria no doc — tratados
   * como falha que se tenta de novo sozinha (mesma postura de `"rede"`), só que sem o rótulo
   * especial de "sem conexão" na tela. */
  function aplicarErro(erro: ErroCiclo, foraDaSincronizacao: string[]): void {
    if (erro === "rede") {
      paradoPorErroPersistente = false;
      set({ status: "sem-conexao", foraDaSincronizacao });
      return;
    }
    if (erro === "sessao" || erro === "plano" || erro === "espaco") {
      paradoPorErroPersistente = true;
      set({ status: { erro }, foraDaSincronizacao });
      return;
    }
    paradoPorErroPersistente = false;
    set({ status: { erro }, foraDaSincronizacao });
  }

  /** Gatilho automático (ao iniciar, índice mudou, 60 s) — mudo enquanto
   * `paradoPorErroPersistente` (doc 17 §5). `sincronizarAgora()` NÃO passa por aqui: ela é o
   * próprio "algo mudou" que destrava. */
  function agendarAutomatico(): void {
    if (paradoPorErroPersistente) return;
    void rodarCiclo();
  }

  function aoIndiceMudar(): void {
    if (timerDebounce !== undefined) clearTimeout(timerDebounce);
    timerDebounce = setTimeout(() => {
      timerDebounce = undefined;
      agendarAutomatico();
    }, DEBOUNCE_MUDANCA_MS);
  }

  /** Lê `estado.conflitosPendentes` e registra cada um na fila da tela (`registrarConflito`),
   * com a versão LOCAL lida do disco agora — não a que estava em memória quando o app fechou
   * (doc 17 §5: sem isto, o próximo ciclo veria a versão local como "editada aqui" e a
   * enviaria por cima da remota). Se a leitura de um caminho falhar, aquele conflito
   * simplesmente não é re-registrado nesta chamada; o pendente em `estado.conflitosPendentes`
   * NÃO é apagado — fica pra próxima tentativa (o próximo `iniciar()`, ou o próprio ciclo, que
   * só tira um caminho de `conflitosPendentes` quando ele sai da fila da tela — ver
   * `resolverConflitosResolvidos` em `sync/motor.ts`). Uma versão remota "fantasma" (nunca
   * re-registrada) não é enviada por cima de nada: `mudancasParaEnviar` exclui todo caminho
   * ainda em `conflitosPendentes`, esteja ou não na fila da tela agora. */
  async function reregistrarConflitosPendentes(
    depsAtuais: DepsSyncStore,
    estado: EstadoSync,
  ): Promise<void> {
    const entradas = new Map<string, EntradaArquivo>();
    try {
      for (const e of await depsAtuais.adaptador.listar()) entradas.set(e.path, e);
    } catch {
      // Sem lista de entradas, cai no padrão `mtimeMs: Date.now()` abaixo por caminho.
    }

    for (const [caminho, pendente] of Object.entries(estado.conflitosPendentes)) {
      let localTexto: string;
      try {
        localTexto = await depsAtuais.adaptador.lerTexto(caminho);
      } catch {
        continue; // não registra este agora; o pendente continua em conflitosPendentes
      }
      const entrada = entradas.get(caminho);
      const conflito: Conflito = {
        caminho,
        tipo: tipoDoArquivo(caminho) === "drawing" ? "desenho" : "nota",
        local: {
          origem: "local",
          conteudo: localTexto,
          mtimeMs: entrada?.mtimeMs ?? Date.now(),
          dispositivo: depsAtuais.nomeDesteComputador,
        },
        remoto: {
          origem: "remoto",
          conteudo: pendente.conteudo,
          mtimeMs: new Date(pendente.criadoEm).getTime(),
          dispositivo: pendente.dispositivo,
        },
      };
      depsAtuais.registrarConflito(conflito);
    }
  }

  return {
    raiz: null,
    status: "desligado",
    ultimoCiclo: null,
    foraDaSincronizacao: [],

    async iniciar(raiz, novasDeps) {
      // Uma nova chamada de `iniciar` (troca de vault) invalida qualquer ciclo em voo da
      // geração anterior e qualquer agendamento antigo.
      limparAgendamento();
      geracao += 1;
      cicloEmAndamento = false;
      pedidoDeNovo = false;
      paradoPorErroPersistente = false;

      deps = novasDeps;
      raizAtual = raiz;

      const estado = await carregarEstadoSync(raiz);
      estadoEmMemoria = estado;

      if (!estado) {
        set({ raiz, status: "desligado", ultimoCiclo: null, foraDaSincronizacao: [] });
        return;
      }

      await reregistrarConflitosPendentes(novasDeps, estado);

      set({ raiz, status: "desligado", ultimoCiclo: null, foraDaSincronizacao: [] });

      cancelarAssinaturaIndice = novasDeps.assinarMudancasNoIndice(aoIndiceMudar);
      timerIntervalo = setInterval(() => agendarAutomatico(), INTERVALO_MS);

      // "Ao abrir o vault" (doc 17 §5) — dispara já, sem esperar o debounce nem os 60 s.
      // Não é `await`ado: `iniciar()` não bloqueia a interface por um ciclo inteiro.
      agendarAutomatico();
    },

    iniciarPendente(raiz) {
      // Mesma limpeza de `iniciar()`/`parar()`: qualquer agendamento ou ciclo em voo de uma
      // ligação anterior (vault trocado, ou uma tentativa `iniciar()` real que não deu tempo de
      // terminar) não pode continuar valendo depois disto.
      limparAgendamento();
      geracao += 1;
      deps = null;
      estadoEmMemoria = null;
      raizAtual = null;
      cicloEmAndamento = false;
      pedidoDeNovo = false;
      paradoPorErroPersistente = false;
      set({ raiz, status: "sem-conexao", ultimoCiclo: null, foraDaSincronizacao: [] });
    },

    parar() {
      limparAgendamento();
      geracao += 1; // qualquer ciclo em voo passa a ser de uma geração velha
      deps = null;
      estadoEmMemoria = null;
      raizAtual = null;
      cicloEmAndamento = false;
      pedidoDeNovo = false;
      paradoPorErroPersistente = false;
      set({ raiz: null, status: "desligado", ultimoCiclo: null, foraDaSincronizacao: [] });
    },

    async sincronizarAgora() {
      if (!deps || !raizAtual || !estadoEmMemoria) return; // desligado: nada a sincronizar
      // O próprio pedido é o "algo mudou" que destrava `sessao`/`plano`/`espaco` (doc 17 §5) —
      // por isso chama `rodarCiclo` direto, não `agendarAutomatico` (que ficaria mudo).
      await rodarCiclo();
    },
  };
});

/** Implementação real de `assinarMudancasNoIndice` (ver comentário do topo do arquivo),
 * pronta para o plano 10 injetar em `DepsSyncStore`. Não é usada por este módulo sozinho —
 * ninguém aqui importa `vaultStore` para os testes, só esta função (que os testes também não
 * precisam usar: injetam a própria assinatura falsa). */
export function assinarMudancasNoIndiceReal(ouvinte: () => void): () => void {
  return useVaultStore.subscribe((estadoAtual, estadoAnterior) => {
    if (estadoAtual.indice !== estadoAnterior.indice) ouvinte();
  });
}
