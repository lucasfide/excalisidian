// Coordenação de flush entre janelas (doc 12 §6, doc 04 §5.1): cada vault vive na própria
// janela/contexto JS, então "atualizar o app" só é seguro se TODAS as janelas abertas
// gravarem suas pendências antes do `relaunch` — não só aquela onde o usuário clicou em
// "Atualizar agora". Duas partes:
//
// - `flusharTodasAsJanelas()`: chamado pela janela que está aplicando a atualização. Drena a
//   si mesma direto (sem ida e volta de evento) e pede às outras que se drenem, agregando o
//   resultado.
// - `instalarOuvintesEntreJanelas()`: chamado por TODA janela no boot (App.tsx, fora desta
//   tarefa). Responde ao pedido de flush de outra janela, e recarrega preferências
//   compartilhadas quando outra janela avisa que mudou algo no settings.json.
//
// `emit` manda pra todas as janelas (inclusive quem emitiu); por isso o pedido de flush leva
// a label de quem pediu, e cada janela ignora o próprio pedido — ela já se drenou direto, uma
// segunda drenagem via evento seria redundante (e reentrante, já que o flush de documentos não
// foi desenhado pra rodar duas vezes em paralelo).

import { emit, listen } from "@tauri-apps/api/event";
import { getAllWebviewWindows, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import { flusharTudoAntesDeSair, type ResultadoFlushGeral } from "../estado/flushGeral";
import { usePrefsStore } from "../estado/prefsStore";
import { useAgenteStore } from "../estado/agenteStore";
import { useContaStore } from "../estado/contaStore";

const EVENTO_FLUSH_PEDIDO = "app://flush-pedido";
const EVENTO_FLUSH_RESPOSTA = "app://flush-resposta";
// Mesmo nome usado por prefsStore.ts, agenteStore.ts e contaStore.ts ao gravar uma mudança
// compartilhada — mantido como literal nos quatro arquivos (T4 não cria um módulo de
// constantes novo) em vez de um import cruzado que criaria um ciclo entre flushEntreJanelas e
// os stores.
const EVENTO_PREFS_MUDOU = "app://prefs-mudou";

/** Timeout de doc 12 §6: janela que não responde nesse prazo conta como falha. */
const TIMEOUT_FLUSH_MS = 5000;

interface PedidoFlush {
  id: string;
  /** Label de quem emitiu o pedido — usado só para a própria janela se reconhecer e ignorar. */
  origem: string;
}

interface RespostaFlush extends ResultadoFlushGeral {
  id: string;
  /** Label de quem respondeu — usado para prefixar falhas/bloqueados (doc 12 §6). */
  label: string;
}

export interface ResultadoFlushEntreJanelas extends ResultadoFlushGeral {
  /** Labels das janelas que não responderam dentro do timeout. */
  semResposta: string[];
}

function gerarIdPedido(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Agregação pura do resultado (testável sem Tauri): junta as falhas/bloqueados do próprio
 * flush com os das respostas recebidas, prefixando os das outras janelas com o label — assim
 * o usuário sabe de qual janela veio cada pendência (doc 12 §6). `tarefasOk` é um E lógico:
 * uma falha em qualquer janela já é falha para o conjunto.
 */
export function agregarResultadoFlush(
  proprio: ResultadoFlushGeral,
  respostas: RespostaFlush[],
  labelsEsperados: string[],
): ResultadoFlushEntreJanelas {
  const falhas = [...proprio.falhas];
  const bloqueados = [...proprio.bloqueados];
  let tarefasOk = proprio.tarefasOk;
  const responderam = new Set<string>();

  for (const r of respostas) {
    responderam.add(r.label);
    falhas.push(...r.falhas.map((f) => `${r.label}: ${f}`));
    bloqueados.push(...r.bloqueados.map((b) => `${r.label}: ${b}`));
    if (!r.tarefasOk) tarefasOk = false;
  }

  const semResposta = labelsEsperados.filter((l) => !responderam.has(l));
  return { falhas, bloqueados, tarefasOk, semResposta };
}

/**
 * Drena esta janela e pede o mesmo às demais, esperando até `TIMEOUT_FLUSH_MS` por uma
 * resposta de cada uma. Janela que não responde a tempo entra em `semResposta` — quem chama
 * decide o que fazer (hoje: `atualizacaoStore.aplicar()` trata como pendência e pergunta antes
 * de instalar).
 */
export async function flusharTodasAsJanelas(): Promise<ResultadoFlushEntreJanelas> {
  const atual = getCurrentWebviewWindow();
  const todas = await getAllWebviewWindows();
  const outrasLabels = todas.map((w) => w.label).filter((l) => l !== atual.label);
  const id = gerarIdPedido();
  const respostas: RespostaFlush[] = [];

  // Regista o ouvinte de resposta ANTES de emitir o pedido — senão uma janela rápida poderia
  // responder antes de existir alguém escutando.
  const pendentes = new Set(outrasLabels);
  const esperar =
    pendentes.size === 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          let terminou = false;
          const concluir = () => {
            if (terminou) return;
            terminou = true;
            resolve();
          };
          const timeoutId = setTimeout(concluir, TIMEOUT_FLUSH_MS);
          void listen<RespostaFlush>(EVENTO_FLUSH_RESPOSTA, (evento) => {
            const r = evento.payload;
            if (r.id !== id || !pendentes.has(r.label)) return;
            pendentes.delete(r.label);
            respostas.push(r);
            if (pendentes.size === 0) {
              clearTimeout(timeoutId);
              concluir();
            }
          });
        });

  const [proprio] = await Promise.all([
    flusharTudoAntesDeSair(),
    emit(EVENTO_FLUSH_PEDIDO, { id, origem: atual.label } satisfies PedidoFlush),
  ]);

  await esperar;

  return agregarResultadoFlush(proprio, respostas, outrasLabels);
}

/**
 * Instala, nesta janela, os dois ouvintes de coordenação entre janelas. Chamado uma vez pelo
 * App.tsx (fora desta tarefa — T3). Devolve a função de limpeza dos dois `listen`.
 */
export function instalarOuvintesEntreJanelas(): () => void {
  let cancelado = false;
  const limpezas: Array<() => void> = [];

  void listen<PedidoFlush>(EVENTO_FLUSH_PEDIDO, async (evento) => {
    const pedido = evento.payload;
    const atual = getCurrentWebviewWindow();
    // `emit` chega em todas as janelas, inclusive em quem pediu — ela já se drenou direto em
    // `flusharTodasAsJanelas`, então uma segunda drenagem aqui seria redundante.
    if (pedido.origem === atual.label) return;
    const resultado = await flusharTudoAntesDeSair();
    await emit(EVENTO_FLUSH_RESPOSTA, {
      id: pedido.id,
      label: atual.label,
      ...resultado,
    } satisfies RespostaFlush);
  }).then((unlisten) => {
    if (cancelado) unlisten();
    else limpezas.push(unlisten);
  });

  // Preferências da máquina (tema, largura da nota, sidebar colapsada, config do agente e o
  // token da conta) são compartilhadas no settings.json (doc 04 §5.1): quem mudou já gravou em
  // disco antes de emitir, então aqui é só reler. Nunca re-emite a partir daqui — é a metade
  // "recebe" do contrato, re-emitir criaria um laço entre as janelas.
  void listen(EVENTO_PREFS_MUDOU, () => {
    void usePrefsStore.getState().carregar();
    void useAgenteStore.getState().carregar();
    // `sincronizarComCofre`, não `carregar`: `carregar` faz `renovar`, que troca o token no
    // servidor — o token velho (do pedido do agente em andamento, ou de outra janela) daria 401.
    void useContaStore.getState().sincronizarComCofre();
  }).then((unlisten) => {
    if (cancelado) unlisten();
    else limpezas.push(unlisten);
  });

  return () => {
    cancelado = true;
    for (const unlisten of limpezas) unlisten();
  };
}
