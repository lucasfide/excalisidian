// Store do painel de tarefas (doc 10 §8.2). Segura as tarefas em memória, aplica as regras
// de seção/ordem e persiste em .excalisidian/tarefas.json por escrita atômica, com debounce
// de 800 ms. O flush no fechamento da janela é async e roda pelo handler de close do Tauri
// em useAutosave (`_persistirAgora`); a troca de vault flush antes de trocar o adapter.

import { create } from "zustand";
import { toast } from "sonner";
import { load } from "@tauri-apps/plugin-store";

import type { Tarefa, Comentario, Secao } from "../tarefas/tipos";
import { parseTarefas, serializarTarefas, tarefasIlegivel } from "../tarefas/formatoTarefas";
import { secaoDe, dataDaSecao, agruparTarefas } from "../tarefas/agrupamento";
import { renormalizarSecao } from "../tarefas/ordem";
import { useVaultStore } from "./vaultStore";

export const CAMINHO_TAREFAS = ".excalisidian/tarefas.json";
const DEBOUNCE_MS = 800;

const CLAMP_LARGURA: [number, number] = [280, 480];
const DEFAULT_LARGURA = 320;

// Prefs de app do painel de tarefas: vivem no settings.json (mesmo arquivo que prefsStore),
// não no tarefas.json do vault. Painel aberto/fechado e largura da coluna.
const CHAVE_ABERTO = "painelTarefasAberto";
const CHAVE_LARGURA = "larguraPainelTarefas";

function clampLargura(px: number): number {
  return Math.min(CLAMP_LARGURA[1], Math.max(CLAMP_LARGURA[0], Math.round(px)));
}

async function gravarPref(chave: string, valor: unknown) {
  try {
    const s = await load("settings.json", { autoSave: false });
    await s.set(chave, valor);
    await s.save();
  } catch {
    // sem settings.json ainda (1ª execução): ignora
  }
}

let timer: number | undefined;
/** Último JSON escrito (ou lido) — pula a gravação quando nada mudou (RNF7). `null` depois de
 * uma carga que falhou/corrompeu: nesse estado o guard não bate, mas `tarefas` fica vazio,
 * então a 1ª gravação só acontece quando o usuário cria uma tarefa (doc 10 §2.2). */
let ultimoJson: string | null = null;

function novoId(prefixo: "t" | "c"): string {
  return `${prefixo}-${crypto.randomUUID().slice(0, 8)}`;
}

interface TarefasState {
  tarefas: Tarefa[];
  carregado: boolean;

  painelAberto: boolean;
  larguraPainel: number;
  concluidasExpandidas: boolean;
  tarefaAberta: string | null;

  carregarPrefs(): Promise<void>;
  alternarPainel(): void;
  definirLargura(px: number): void;
  alternarConcluidas(): void;
  abrirModal(id: string): void;
  fecharModal(): void;

  carregar(): Promise<void>;
  criar(secao: Secao, titulo: string, hoje: string): void;
  editarTitulo(id: string, titulo: string): void;
  alternarConcluida(id: string, hoje: string): void;
  moverTarefa(id: string, secaoAlvo: Secao, indiceAlvo: number, hoje: string): void;
  adicionarComentario(idTarefa: string, texto: string): void;
  editarComentario(idTarefa: string, idComentario: string, texto: string): void;
  removerComentario(idTarefa: string, idComentario: string): void;
  restaurarComentario(idTarefa: string, comentario: Comentario, indice: number): void;
  _persistirAgora(): Promise<void>;
}

function agendarPersistir() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    void useTarefasStore.getState()._persistirAgora();
  }, DEBOUNCE_MS);
}

/** Aplica um patch em `tarefas` e agenda a gravação. */
function mutar(fn: (ts: Tarefa[]) => Tarefa[]) {
  useTarefasStore.setState((s) => ({ tarefas: fn(s.tarefas) }));
  agendarPersistir();
}

export const useTarefasStore = create<TarefasState>(() => ({
  tarefas: [],
  carregado: false,

  painelAberto: true,
  larguraPainel: DEFAULT_LARGURA,
  concluidasExpandidas: false,
  tarefaAberta: null,

  async carregarPrefs() {
    try {
      const s = await load("settings.json", { autoSave: false });
      const aberto = await s.get<boolean>(CHAVE_ABERTO);
      const largura = await s.get<number>(CHAVE_LARGURA);
      useTarefasStore.setState({
        painelAberto: typeof aberto === "boolean" ? aberto : true,
        larguraPainel: typeof largura === "number" ? clampLargura(largura) : DEFAULT_LARGURA,
      });
    } catch {
      // padrões locais
    }
  },

  alternarPainel() {
    const proximo = !useTarefasStore.getState().painelAberto;
    useTarefasStore.setState({ painelAberto: proximo });
    void gravarPref(CHAVE_ABERTO, proximo);
  },

  definirLargura(px) {
    const larguraPainel = clampLargura(px);
    useTarefasStore.setState({ larguraPainel });
    void gravarPref(CHAVE_LARGURA, larguraPainel);
  },

  alternarConcluidas() {
    useTarefasStore.setState((s) => ({ concluidasExpandidas: !s.concluidasExpandidas }));
  },

  abrirModal(id) {
    useTarefasStore.setState({ tarefaAberta: id });
  },

  fecharModal() {
    useTarefasStore.setState({ tarefaAberta: null });
  },

  async carregar() {
    window.clearTimeout(timer);
    const adapter = useVaultStore.getState().adapter;
    if (!adapter) {
      ultimoJson = serializarTarefas({ versao: 1, tarefas: [] });
      useTarefasStore.setState({ tarefas: [], carregado: true, tarefaAberta: null });
      return;
    }
    try {
      if (await adapter.existe(CAMINHO_TAREFAS)) {
        const texto = await adapter.lerTexto(CAMINHO_TAREFAS);
        if (tarefasIlegivel(texto)) {
          toast("Não foi possível ler as tarefas. O arquivo pode estar corrompido; ele não será sobrescrito até você criar uma tarefa nova.");
          ultimoJson = serializarTarefas({ versao: 1, tarefas: [] });
          useTarefasStore.setState({ tarefas: [], carregado: true, tarefaAberta: null });
          return;
        }
        const dados = parseTarefas(texto);
        ultimoJson = serializarTarefas(dados);
        useTarefasStore.setState({ tarefas: dados.tarefas, carregado: true, tarefaAberta: null });
      } else {
        ultimoJson = serializarTarefas({ versao: 1, tarefas: [] });
        useTarefasStore.setState({ tarefas: [], carregado: true, tarefaAberta: null });
      }
    } catch {
      toast("Não foi possível ler as tarefas. O arquivo pode estar corrompido; ele não será sobrescrito até você criar uma tarefa nova.");
      ultimoJson = serializarTarefas({ versao: 1, tarefas: [] });
      useTarefasStore.setState({ tarefas: [], carregado: true, tarefaAberta: null });
    }
  },

  criar(secao, titulo, hoje) {
    const t = titulo.trim();
    if (!t) return;
    const vencimento = dataDaSecao(secao, hoje) ?? hoje;
    mutar((ts) => {
      const naSecao = ts.filter((x) => secaoDe(x, hoje) === secao);
      const ordem = naSecao.reduce((m, x) => Math.max(m, x.ordem), 0) + 10;
      const nova: Tarefa = {
        id: novoId("t"),
        titulo: t,
        vencimento,
        ordem,
        concluida: false,
        concluidaEm: null,
        criadaEm: new Date().toISOString(),
        comentarios: [],
      };
      return [...ts, nova];
    });
  },

  editarTitulo(id, titulo) {
    const t = titulo.trim();
    if (!t) return;
    mutar((ts) => ts.map((x) => (x.id === id ? { ...x, titulo: t } : x)));
  },

  alternarConcluida(id, hoje) {
    mutar((ts) =>
      ts.map((x) => {
        if (x.id !== id) return x;
        if (x.concluida) {
          return { ...x, concluida: false, concluidaEm: null, vencimento: hoje };
        }
        return { ...x, concluida: true, concluidaEm: new Date().toISOString() };
      }),
    );
  },

  moverTarefa(id, secaoAlvo, indiceAlvo, hoje) {
    mutar((ts) => {
      const alvo = ts.find((x) => x.id === id);
      if (!alvo) return ts;
      const dataAlvo = dataDaSecao(secaoAlvo, hoje);
      const atualizada: Tarefa = dataAlvo
        ? { ...alvo, vencimento: dataAlvo, concluida: false, concluidaEm: null }
        : alvo;

      const base = ts.map((x) => (x.id === id ? atualizada : x));
      // ids da seção alvo na ordem visual nova, com a tarefa movida inserida em indiceAlvo.
      const grupos = agruparTarefas(base, hoje);
      const idsAlvo = grupos[secaoAlvo].filter((x) => x.id !== id).map((x) => x.id);
      const pos = Math.max(0, Math.min(indiceAlvo, idsAlvo.length));
      idsAlvo.splice(pos, 0, id);
      const ordens = renormalizarSecao(idsAlvo);
      return base.map((x) => (x.id in ordens ? { ...x, ordem: ordens[x.id] } : x));
    });
  },

  adicionarComentario(idTarefa, texto) {
    const t = texto.trim();
    if (!t) return;
    const c: Comentario = { id: novoId("c"), texto: t, criadoEm: new Date().toISOString(), editadoEm: null };
    mutar((ts) => ts.map((x) => (x.id === idTarefa ? { ...x, comentarios: [...x.comentarios, c] } : x)));
  },

  editarComentario(idTarefa, idComentario, texto) {
    const t = texto.trim();
    if (!t) return;
    mutar((ts) =>
      ts.map((x) =>
        x.id !== idTarefa
          ? x
          : {
              ...x,
              comentarios: x.comentarios.map((c) =>
                c.id === idComentario ? { ...c, texto: t, editadoEm: new Date().toISOString() } : c,
              ),
            },
      ),
    );
  },

  removerComentario(idTarefa, idComentario) {
    mutar((ts) =>
      ts.map((x) =>
        x.id !== idTarefa ? x : { ...x, comentarios: x.comentarios.filter((c) => c.id !== idComentario) },
      ),
    );
  },

  restaurarComentario(idTarefa, comentario, indice) {
    mutar((ts) =>
      ts.map((x) => {
        if (x.id !== idTarefa) return x;
        const lista = [...x.comentarios];
        lista.splice(Math.max(0, Math.min(indice, lista.length)), 0, comentario);
        return { ...x, comentarios: lista };
      }),
    );
  },

  async _persistirAgora() {
    window.clearTimeout(timer);
    const adapter = useVaultStore.getState().adapter;
    if (!adapter) return;
    const json = serializarTarefas({ versao: 1, tarefas: useTarefasStore.getState().tarefas });
    if (json === ultimoJson) return;
    try {
      await adapter.criarPasta(".excalisidian");
      await adapter.escreverTexto(CAMINHO_TAREFAS, json);
      ultimoJson = json;
    } catch {
      toast("Não foi possível salvar as tarefas. Verifique a permissão da pasta do vault.");
    }
  },
}));
