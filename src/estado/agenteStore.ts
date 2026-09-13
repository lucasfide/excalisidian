// Estado e orquestração do agente de IA (doc 11 §4, §5). A config persiste no
// settings.json (chave `agente`) e só se edita pelo assistente; a participação no
// `agente/<hash>/participacao.json` via memoria.ts.
//
// Invariantes:
// - sem config ou `habilitado === false`: nenhuma chamada de rede, nada renderiza (RF11.2);
// - nenhuma chamada de rede sem gatilho local (gatilhos.ts): inatividade + volume de diff;
// - o agente NUNCA escreve em nota (doc 11 §10.6): sugestão vive só no painel.

import { create } from "zustand";
import { load } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";

import type {
  ConfigAgente,
  MensagemChat,
  StatusAgente,
  UsoSimples,
} from "../agente/tipos";
import { baseUrlEfetiva, provedorDe } from "../agente/provedores";
import { completar, listarModelos, textoDoErro } from "../agente/cliente";
import { somarUso, usoVazio } from "../agente/orcamento";
import {
  SYSTEM_GATEIRO,
  interpretarGateiro,
  deveConvidar,
  promptGateiro,
} from "../agente/gateiro";
import {
  GATEIRO_NOTA_MINIMA_CHARS,
  INATIVIDADE_CICLO_MS,
  INATIVIDADE_GATEIRO_MS,
  caracteresNovos,
  cresceuDemais,
  deveRodarCiclo,
  deveRodarGateiro,
  textoNovo,
} from "../agente/gatilhos";
import { systemAssistente, montarPrompt, interpretarCiclo, type SugestaoAgente } from "../agente/assistente";
import { palavrasChave, recuperarNotasRelacionadas } from "../agente/recuperacao";
import {
  adicionarFatos,
  carregarConversas,
  carregarFatos,
  carregarParticipacao,
  carregarResumos,
  limparMemoria as limparMemoriaDisco,
  salvarConversas,
  salvarFatos,
  salvarParticipacao,
  salvarResumos,
  pastaAgenteRelativa,
  type ConversaSalva,
  type Fato,
  type Participacao,
  type Resumo,
} from "../agente/memoria";
import { useDocumentosStore } from "./documentosStore";
import { useWorkspaceStore } from "./workspaceStore";
import { useVaultStore } from "./vaultStore";

const CHAVE_CONFIG = "agente";
const CONTEXTO_NOTA_CHARS = 6000;
/** Resumos gerados por ciclo (os demais entram com trecho cru) — teto de custo local. */
const RESUMOS_POR_CICLO = 3;
const FALHAS_PARA_ERRO_VISIVEL = 3;

function ehConfigAgente(v: unknown): v is ConfigAgente {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.habilitado === "boolean" &&
    typeof c.provedor === "string" &&
    typeof c.modeloGateiro === "string" &&
    typeof c.modeloAssistente === "string"
  );
}

function systemConversa(caminho: string | null, nota: string | null): string {
  const base =
    "Você é o assistente de escrita do Excalisidian, um app de notas local. " +
    "Responda em português do Brasil, direto, em prosa corrida (markdown leve é permitido). " +
    "Você não escreve em arquivos: sugestões de texto são respostas no chat, e o usuário decide o que fazer com elas.";
  if (caminho && nota) {
    return `${base}\nO usuário está na nota «${caminho}»:\n\n${nota}`;
  }
  return `${base}\nNenhuma nota está aberta agora.`;
}

export interface Convite {
  path: string;
  tema: string;
}

interface AgenteState {
  config: ConfigAgente | null;
  carregado: boolean;
  status: StatusAgente;
  erroAtual: string | null;
  pausado: boolean;
  painelAberto: boolean;
  assistenteAberto: boolean;
  /** Conversas manuais por nota (chave: caminho; "" = sem nota aberta). */
  conversas: Record<string, MensagemChat[]>;
  usoSessao: UsoSimples;

  raiz: string | null;
  participacao: Record<string, Participacao>;
  convite: Convite | null;
  sugestoes: Record<string, SugestaoAgente[]>;
  /** Memória de longo prazo (doc 11 §2.2): fatos propostos pelo assistente. */
  fatos: Fato[];

  carregar(): Promise<void>;
  aplicarConfig(config: ConfigAgente): Promise<void>;
  definirHabilitado(habilitado: boolean): Promise<void>;
  abrirAssistente(): void;
  fecharAssistente(): void;
  alternarPainel(): void;
  pausar(): void;
  retomar(): void;
  testarConexao(config?: ConfigAgente): Promise<string | null>;
  enviarMensagem(texto: string): Promise<void>;
  limparConversa(): void;

  /** Chamado na abertura/troca de vault: carrega participação e resumos do vault novo. */
  aoAbrirVault(raiz: string): Promise<void>;
  /** Liga os timers de inatividade aos stores (chamado uma vez pelo App). */
  conectarGatilhos(): void;
  responderConvite(resposta: "aceitar" | "adiar" | "recusar"): void;
  dispensarSugestao(id: string): void;
  /** Rename/move de nota migra a entrada (doc 11 §2.2). Pastas: as chaves antigas ficam
   * órfãs e as notas mudadas podem render um convite novo — ponta aceita. */
  migrarParticipacao(antigo: string, novo: string): void;
  apagarFato(id: string): void;
  /** "Abrir pasta do agente" (doc 11 §6.3). Devolve mensagem de erro ou null. */
  abrirPasta(): Promise<string | null>;
  /** "Limpar memória": apaga participação, resumos, fatos e conversas; nunca notas. */
  limparMemoria(): Promise<void>;
}

// ——— estado de agendamento (fora do zustand: timers e voos, não renderizam) ———

let emVoo = new Set<string>();
let timerCiclo: number | undefined;
let timerGateiro: number | undefined;
let ultimoCicloTexto: Record<string, string> = {};
let tentativasGateiro: Record<string, { chars: number }> = {};
let falhasSeguidas = 0;
let gatilhosLigados = false;
let resumosCache: Record<string, Resumo> = {};
let timerPersistirParticipacao: number | undefined;
let timerPersistirResumos: number | undefined;
let timerPersistirFatos: number | undefined;
let timerPersistirConversas: number | undefined;

function notaAtivaAtual(): { path: string; texto: string } | null {
  const path = useWorkspaceStore.getState().caminhoAtivo;
  if (!path || path.toLowerCase().endsWith(".draw.md")) return null;
  const doc = useDocumentosStore.getState().docs.get(path);
  if (!doc) return null;
  return { path, texto: doc.conteudoEditor };
}

function statusBase(s: Pick<AgenteState, "config" | "pausado">): StatusAgente {
  if (!s.config || !s.config.habilitado) return "desligado";
  return s.pausado ? "pausado" : "ocioso";
}

export const useAgenteStore = create<AgenteState>((set, get) => {
  // ——— persistência com debounce da memória ———
  function agendarPersistirParticipacao() {
    if (!get().raiz) return;
    window.clearTimeout(timerPersistirParticipacao);
    timerPersistirParticipacao = window.setTimeout(() => {
      const raiz = get().raiz;
      if (raiz) void salvarParticipacao(raiz, get().participacao);
    }, 500);
  }
  function agendarPersistirResumos() {
    const raiz = get().raiz;
    if (!raiz) return;
    window.clearTimeout(timerPersistirResumos);
    timerPersistirResumos = window.setTimeout(
      () => void salvarResumos(raiz, resumosCache),
      2000,
    );
  }
  function agendarPersistirFatos() {
    if (!get().raiz) return;
    window.clearTimeout(timerPersistirFatos);
    timerPersistirFatos = window.setTimeout(() => {
      const raiz = get().raiz;
      if (raiz) void salvarFatos(raiz, get().fatos);
    }, 1000);
  }
  function agendarPersistirConversas() {
    if (!get().raiz) return;
    window.clearTimeout(timerPersistirConversas);
    timerPersistirConversas = window.setTimeout(() => {
      const raiz = get().raiz;
      if (!raiz) return;
      const mapa: Record<string, ConversaSalva> = {};
      for (const [path, mensagens] of Object.entries(get().conversas)) {
        if (mensagens.length === 0) continue;
        mapa[path] = { atualizadaEm: new Date().toISOString(), mensagens };
      }
      void salvarConversas(raiz, mapa);
    }, 1000);
  }

  function agendar() {
    const s = get();
    window.clearTimeout(timerCiclo);
    window.clearTimeout(timerGateiro);
    if (!s.config?.habilitado || s.pausado) return;
    const ativa = notaAtivaAtual();
    if (!ativa) return;
    const { path, texto } = ativa;
    const part = s.participacao[path];
    if (part === "aceito") {
      timerCiclo = window.setTimeout(() => void cicloSePuder(path), INATIVIDADE_CICLO_MS);
    } else if (!part) {
      // um convite por vez: com convite pendente, não se agenda outro gateiro
      // (doc 11 §5.2 — o usuário responde primeiro).
      if (s.convite) return;
      timerGateiro = window.setTimeout(
        () => void gateiroSePuder(path),
        INATIVIDADE_GATEIRO_MS,
      );
    } else if (part === "adiado") {
      if (s.convite) return;
      const tentativa = tentativasGateiro[path];
      if (tentativa && cresceuDemais(tentativa.chars, texto.length)) {
        timerGateiro = window.setTimeout(
          () => void gateiroSePuder(path),
          INATIVIDADE_GATEIRO_MS,
        );
      }
    }
  }

  async function gateiroSePuder(path: string) {
    const s = get();
    const doc = useDocumentosStore.getState().docs.get(path);
    if (!s.config?.habilitado || !doc) return;
    const texto = doc.conteudoEditor;
    const tentativa = tentativasGateiro[path];
    if (
      !deveRodarGateiro({
        habilitado: true,
        pausado: s.pausado,
        semParticipacao: !s.participacao[path],
        elegivel: !tentativa || cresceuDemais(tentativa.chars, texto.length),
        notaSuficiente: texto.length >= GATEIRO_NOTA_MINIMA_CHARS,
        emVoo: emVoo.has(path),
      })
    ) {
      return;
    }
    emVoo.add(path);
    tentativasGateiro[path] = { chars: texto.length };
    set((st) => ({ status: st.pausado ? st.status : "pensando" }));
    try {
      const cfg = s.config;
      const r = await completar({
        provedor: provedorDe(cfg.provedor),
        chave: cfg.chaves[cfg.provedor],
        baseUrl: baseUrlEfetiva(cfg.provedor, cfg.baseUrls),
        modelo: cfg.modeloGateiro,
        thinking: cfg.thinking,
        system: SYSTEM_GATEIRO,
        mensagens: [{ papel: "usuario", texto: promptGateiro(texto) }],
        maxTokens: 200,
      });
      set((st) => ({ usoSessao: somarUso(st.usoSessao, r.uso) }));
      const veredito = interpretarGateiro(r.texto);
      if (deveConvidar(veredito)) {
        set({ convite: { path, tema: veredito.tema } });
        if (!get().painelAberto) set({ painelAberto: true });
      }
      // sem convite: `tentativasGateiro` já segura a próxima tentativa até a nota
      // crescer >50% (doc 11 §5.1 — "recusar não pergunta de novo" vale para o
      // `recusado` explícito; o "não vale" silencioso pode voltar se o assunto mudar).
    } catch {
      // gateiro silencioso: erro de rede aqui não merece UI (doc 11 §7).
    } finally {
      emVoo.delete(path);
      set((st) => ({ status: st.status === "pensando" ? statusBase(st) : st.status }));
      agendar();
    }
  }

  async function cicloSePuder(path: string) {
    const s = get();
    const doc = useDocumentosStore.getState().docs.get(path);
    if (!s.config?.habilitado || !doc) return;
    const texto = doc.conteudoEditor;
    if (
      !deveRodarCiclo({
        habilitado: true,
        pausado: s.pausado,
        participacao: s.participacao[path],
        caracteresNovos: caracteresNovos(ultimoCicloTexto[path] ?? null, texto),
        emVoo: emVoo.has(path),
      })
    ) {
      return;
    }
    await rodarCiclo(path, texto);
  }

  async function rodarCiclo(path: string, texto: string) {
    const cfg = get().config;
    const adapter = useVaultStore.getState().adapter;
    if (!cfg || !adapter) return;
    emVoo.add(path);
    set((st) => ({ status: st.pausado ? st.status : "pensando", erroAtual: null }));
    try {
      const ultimo = ultimoCicloTexto[path] ?? null;
      const diff = textoNovo(ultimo, texto);
      const indice = useVaultStore.getState().indice;
      const termos = palavrasChave(diff === "" ? texto : diff);
      const vizinhos = new Set<string>();
      for (const b of useVaultStore.getState().links.backlinks.get(path) ?? []) {
        vizinhos.add(b.origem);
      }
      const meta = indice.get(path);
      // outLinks não guardam caminho resolvido (doc 02 §6) — resolve pela regra do índice.
      const resolver = useVaultStore.getState().resolver;
      const adicionarAlvo = (l: { target: string }) => {
        if (!l.target) return;
        const r = resolver(l.target, path);
        if (r) vizinhos.add(r);
      };
      for (const l of meta?.outLinks ?? []) adicionarAlvo(l);
      for (const l of meta?.embeds ?? []) adicionarAlvo(l);
      vizinhos.delete(path);

      const relacionadas = await recuperarNotasRelacionadas({
        caminhoAtual: path,
        termos,
        lerTexto: (p) => adapter.lerTexto(p),
        vizinhos: [...vizinhos],
        tituloDe: (p) => indice.get(p)?.title ?? p.slice(p.lastIndexOf("/") + 1),
      });

      // resumo em cache quando existir; sem ele, trecho cru. Gera resumo dos top N com o
      // modelo gateiro (barato), no mesmo ciclo (doc 11 §5.5).
      const material = [];
      let gerados = 0;
      for (const r of relacionadas) {
        const metaR = indice.get(r.path);
        const cache = resumosCache[r.path];
        let textoR = r.trecho;
        if (cache && metaR && cache.mtimeMs === metaR.mtimeMs && cache.size === metaR.size) {
          textoR = cache.resumo;
        } else if (metaR && gerados < RESUMOS_POR_CICLO) {
          gerados++;
          try {
            const bruto = await adapter.lerTexto(r.path);
            const res = await completar({
              provedor: provedorDe(cfg.provedor),
              chave: cfg.chaves[cfg.provedor],
              baseUrl: baseUrlEfetiva(cfg.provedor, cfg.baseUrls),
              modelo: cfg.modeloGateiro,
              thinking: cfg.thinking,
              system:
                "Resuma a nota em até 60 palavras, em português do Brasil, " +
                "dizendo sobre o que ela é. Só o resumo, sem título nem comentário.",
              mensagens: [{ papel: "usuario", texto: bruto.slice(0, 6000) }],
              maxTokens: 200,
            });
            textoR = res.texto.trim();
            set((st) => ({ usoSessao: somarUso(st.usoSessao, res.uso) }));
            if (textoR) {
              resumosCache[r.path] = { mtimeMs: metaR.mtimeMs, size: metaR.size, resumo: textoR };
              agendarPersistirResumos();
            }
          } catch {
            // sem resumo: o trecho cru mesmo assim (doc 11 §5.5)
          }
        }
        material.push({ path: r.path, titulo: r.titulo, texto: textoR });
      }

      const r = await completar({
        provedor: provedorDe(cfg.provedor),
        chave: cfg.chaves[cfg.provedor],
        baseUrl: baseUrlEfetiva(cfg.provedor, cfg.baseUrls),
        modelo: cfg.modeloAssistente,
        thinking: cfg.thinking,
        system: systemAssistente(path),
        mensagens: [
          {
            papel: "usuario",
            texto: montarPrompt({
              caminho: path,
              nota: texto,
              diff,
              relacionadas: material,
              fatos: get().fatos.map((f) => f.texto),
            }),
          },
        ],
        maxTokens: 1500,
      });
      set((st) => ({ usoSessao: somarUso(st.usoSessao, r.uso) }));
      const parsed = interpretarCiclo(r.texto, (c) => indice.has(c));
      if (parsed) {
        set((st) => ({
          sugestoes: { ...st.sugestoes, [path]: parsed.sugestoes },
          fatos: adicionarFatos(st.fatos, parsed.novosFatos, path),
        }));
        agendarPersistirFatos();
      }
      ultimoCicloTexto[path] = texto;
      falhasSeguidas = 0;
    } catch (e) {
      falhasSeguidas++;
      // ciclo em segundo plano só grita na terceira falha seguida (doc 11 §7).
      if (falhasSeguidas >= FALHAS_PARA_ERRO_VISIVEL) {
        set({ status: "erro", erroAtual: textoDoErro(e) });
      } else {
        set((st) => ({ status: statusBase(st) }));
      }
    } finally {
      emVoo.delete(path);
      set((st) => ({ status: st.status === "pensando" ? statusBase(st) : st.status }));
      agendar();
    }
  }

  return {
    config: null,
    carregado: false,
    status: "desligado",
    erroAtual: null,
    pausado: false,
    painelAberto: false,
    assistenteAberto: false,
    conversas: {},
    usoSessao: usoVazio(),

    raiz: null,
    participacao: {},
    convite: null,
    sugestoes: {},
    fatos: [],

    async carregar() {
      try {
        const store = await load("settings.json", { autoSave: false });
        const salva = store.get<ConfigAgente>(CHAVE_CONFIG);
        if (ehConfigAgente(salva)) {
          set({ config: salva });
          set((s) => ({ status: statusBase(s) }));
        }
      } catch {
        // sem configuração salva: agente simplesmente não existe
      }
      set({ carregado: true });
      // A config pode ter chegado depois do vault aberto (boot concorrente): os timers
      // só fazem sentido a partir daqui.
      agendar();
    },

    async aplicarConfig(config) {
      set({ config, erroAtual: null });
      set((s) => ({ status: statusBase(s) }));
      const store = await load("settings.json", { autoSave: false });
      await store.set(CHAVE_CONFIG, config);
      await store.save();
      agendar();
    },

    async definirHabilitado(habilitado) {
      const atual = get().config;
      if (!atual) return;
      await get().aplicarConfig({ ...atual, habilitado });
      if (!habilitado) {
        window.clearTimeout(timerCiclo);
        window.clearTimeout(timerGateiro);
        set({ painelAberto: false, convite: null });
      }
    },

    abrirAssistente() {
      set({ assistenteAberto: true });
    },

    fecharAssistente() {
      set({ assistenteAberto: false });
    },

    alternarPainel() {
      if (get().config?.habilitado) set((s) => ({ painelAberto: !s.painelAberto }));
    },

    pausar() {
      window.clearTimeout(timerCiclo);
      window.clearTimeout(timerGateiro);
      set({ pausado: true, status: "pausado" });
    },

    retomar() {
      set((s) => {
        const pausado = false;
        return { pausado, status: statusBase({ config: s.config, pausado }) };
      });
      agendar();
    },

    async testarConexao(config) {
      const cfg = config ?? get().config;
      if (!cfg) return "Configure o provedor primeiro.";
      try {
        const provedor = provedorDe(cfg.provedor);
        await listarModelos({
          provedor,
          chave: cfg.chaves[cfg.provedor] ?? "",
          baseUrl: baseUrlEfetiva(cfg.provedor, cfg.baseUrls),
          modelo: cfg.modeloGateiro || "_",
          thinking: cfg.thinking,
        });
        return null;
      } catch (e) {
        return textoDoErro(e);
      }
    },

    async enviarMensagem(texto) {
      const cfg = get().config;
      const envio = texto.trim();
      if (!cfg || !cfg.habilitado || get().pausado || !envio) return;
      const ativa = notaAtivaAtual();
      const chave = ativa ? ativa.path : "";
      const anexar = (msg: MensagemChat) =>
        set((s) => ({ conversas: { ...s.conversas, [chave]: [...(s.conversas[chave] ?? []), msg] } }));
      anexar({ papel: "usuario", texto: envio });
      set({ status: "pensando", erroAtual: null });
      try {
        const nota = ativa ? ativa.texto.slice(0, CONTEXTO_NOTA_CHARS) : null;
        const resposta = await completar({
          provedor: provedorDe(cfg.provedor),
          chave: cfg.chaves[cfg.provedor],
          baseUrl: baseUrlEfetiva(cfg.provedor, cfg.baseUrls),
          modelo: cfg.modeloAssistente,
          thinking: cfg.thinking,
          system: systemConversa(ativa ? ativa.path : null, nota),
          mensagens: (get().conversas[chave] ?? []).slice(-12),
        });
        anexar({ papel: "assistente", texto: resposta.texto });
        set((s) => ({
          usoSessao: somarUso(s.usoSessao, resposta.uso),
          status: statusBase(s),
        }));
        agendarPersistirConversas();
      } catch (e) {
        // A mensagem do usuário fica na conversa e o erro aparece no rodapé — fazer o
        // texto digitado sumir seria pior que o erro visível (RF11.15).
        set({ status: "erro", erroAtual: textoDoErro(e) });
      }
    },

    limparConversa() {
      const ativa = notaAtivaAtual();
      const chave = ativa ? ativa.path : "";
      set((s) => ({ conversas: { ...s.conversas, [chave]: [] }, erroAtual: null }));
      agendarPersistirConversas();
    },

    async aoAbrirVault(raiz) {
      window.clearTimeout(timerCiclo);
      window.clearTimeout(timerGateiro);
      emVoo = new Set();
      ultimoCicloTexto = {};
      tentativasGateiro = {};
      resumosCache = await carregarResumos(raiz);
      const conversasSalvas = await carregarConversas(raiz);
      set({
        raiz,
        participacao: await carregarParticipacao(raiz),
        convite: null,
        sugestoes: {},
        fatos: await carregarFatos(raiz),
        conversas: Object.fromEntries(
          Object.entries(conversasSalvas).map(([k, v]) => [k, v.mensagens]),
        ),
      });
      agendar();
    },

    conectarGatilhos() {
      if (gatilhosLigados) return;
      gatilhosLigados = true;
      // qualquer mudança de docs (tecla) ou de aba re-agenda os timers de inatividade.
      useDocumentosStore.subscribe((state, prev) => {
        if (state.docs !== prev.docs) agendar();
      });
      useWorkspaceStore.subscribe((state, prev) => {
        if (state.caminhoAtivo !== prev.caminhoAtivo) agendar();
      });
      agendar();
    },

    responderConvite(resposta) {
      const convite = get().convite;
      if (!convite) return;
      set({ convite: null });
      if (resposta === "aceitar") {
        set((s) => ({ participacao: { ...s.participacao, [convite.path]: "aceito" } }));
        agendarPersistirParticipacao();
        void cicloSePuder(convite.path);
      } else if (resposta === "recusar") {
        set((s) => ({ participacao: { ...s.participacao, [convite.path]: "recusado" } }));
        agendarPersistirParticipacao();
      } else {
        set((s) => ({ participacao: { ...s.participacao, [convite.path]: "adiado" } }));
        agendarPersistirParticipacao();
      }
      agendar();
    },

    dispensarSugestao(id) {
      const ativa = notaAtivaAtual();
      if (!ativa) return;
      const lista = get().sugestoes[ativa.path];
      if (!lista) return;
      set((s) => ({
        sugestoes: { ...s.sugestoes, [ativa.path]: lista.filter((x) => x.id !== id) },
      }));
    },

    migrarParticipacao(antigo, novo) {
      if (antigo === novo) return;
      set((s) => {
        const participacao = { ...s.participacao };
        if (participacao[antigo]) {
          participacao[novo] = participacao[antigo];
          delete participacao[antigo];
        }
        const sugestoes = { ...s.sugestoes };
        if (sugestoes[antigo]) {
          sugestoes[novo] = sugestoes[antigo];
          delete sugestoes[antigo];
        }
        const convite =
          s.convite && s.convite.path === antigo
            ? { ...s.convite, path: novo }
            : s.convite;
        return { participacao, sugestoes, convite };
      });
      if (ultimoCicloTexto[antigo]) {
        ultimoCicloTexto[novo] = ultimoCicloTexto[antigo];
        delete ultimoCicloTexto[antigo];
      }
      if (tentativasGateiro[antigo]) {
        tentativasGateiro[novo] = tentativasGateiro[antigo];
        delete tentativasGateiro[antigo];
      }
      agendarPersistirParticipacao();
    },

    apagarFato(id) {
      set((s) => ({ fatos: s.fatos.filter((f) => f.id !== id) }));
      agendarPersistirFatos();
    },

    async abrirPasta() {
      const raiz = get().raiz;
      if (!raiz) return "Nenhum vault aberto.";
      try {
        const base = await appDataDir();
        const caminho = await join(base, "com.excalisidian.app", ...pastaAgenteRelativa(raiz).split("/"));
        await invoke("revelar_pasta", { path: caminho });
        return null;
      } catch (e) {
        return `Não foi possível abrir a pasta. ${String(e)}`;
      }
    },

    async limparMemoria() {
      const raiz = get().raiz;
      if (!raiz) return;
      window.clearTimeout(timerPersistirParticipacao);
      window.clearTimeout(timerPersistirResumos);
      window.clearTimeout(timerPersistirFatos);
      window.clearTimeout(timerPersistirConversas);
      resumosCache = {};
      ultimoCicloTexto = {};
      tentativasGateiro = {};
      set({ participacao: {}, sugestoes: {}, fatos: [], conversas: {}, convite: null });
      await limparMemoriaDisco(raiz);
    },
  };
});
