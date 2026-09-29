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
import { emit } from "@tauri-apps/api/event";

import type {
  ConfigAgente,
  MensagemChat,
  StatusAgente,
  UsoSimples,
} from "../agente/tipos";
import { FalhaAgente } from "../agente/tipos";
import { baseUrlEfetiva, provedorDe, PROVEDORES } from "../agente/provedores";
import { completar, listarModelos, textoDoErro } from "../agente/cliente";
import { tokenDaSessaoAtual } from "../servico/sessao";
import { buscarSaldoCreditos } from "../servico/saldoCreditos";
import type { SaldoCreditos } from "../servico/creditos";
import { decidirModoServidor } from "../servico/modoServidor";
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
import { esperaAposFalha } from "../agente/tentativas";
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
import { useContaStore } from "./contaStore";

const CHAVE_CONFIG = "agente";
// Doc 12 §6 / doc 04 §5.1: config do agente é preferência da máquina como tema e largura da
// nota, compartilhada no settings.json entre janelas. Mesmo evento que prefsStore.ts emite —
// quem ouve (flushEntreJanelas.ts) já chama `carregar()` das duas ao receber; aqui só falta
// emitir depois de salvar. Literal repetido (não importado de prefsStore.ts) para não criar
// uma dependência entre os dois stores só por causa do nome do evento.
const EVENTO_PREFS_MUDOU = "app://prefs-mudou";
const CONTEXTO_NOTA_CHARS = 6000;
/** Resumos gerados por ciclo (os demais entram com trecho cru) — teto de custo local. */
const RESUMOS_POR_CICLO = 3;
const FALHAS_PARA_ERRO_VISIVEL = 3;
/** Com os créditos esgotados, confere o saldo a cada 30 min para voltar sozinho (doc 11 §5.0). */
const CONSULTA_SALDO_PAUSA_MS = 30 * 60_000;

function ehConfigAgente(v: unknown): v is ConfigAgente {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.habilitado === "boolean" &&
    typeof c.provedor === "string" &&
    // id fora do catálogo (downgrade de versão, edição à mão) precisa cair no padrão
    // aqui, não derrubar o render de quem confia que `provedor` é sempre conhecido.
    PROVEDORES.some((p) => p.id === c.provedor) &&
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

/** O que a análise do gateiro decidiu sobre a nota ativa — exibido no painel para o
 * resultado nunca ficar invisível (a decisão "não vale" é legítima, sumir sem dizer é que
 * não era). */
export type AnaliseNota = "convite" | "nao-vale" | "erro";

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
  /** Saldo da IA do Excalisidian vindo do servidor; null = desconhecido, medidor oculto. */
  saldoCreditos: SaldoCreditos | null;
  /** Busca o saldo no servidor (só provedor próprio, com sessão, fora do modo local de DEV). */
  atualizarSaldo: () => Promise<void>;

  raiz: string | null;
  participacao: Record<string, Participacao>;
  convite: Convite | null;
  /** path → veredito da última análise do gateiro nesta sessão (painel mostra a linha). */
  analises: Record<string, AnaliseNota>;
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
// true só para os erros definitivos do provedor próprio (sessao/plano — ver gateiroSePuder e
// rodarCiclo). Erros transitórios (rede, cota, etc.) também podem deixar `status` em "erro"
// depois de FALHAS_PARA_ERRO_VISIVEL tentativas, mas continuam reagendando normalmente — só
// esta flag bloqueia `agendar()`, porque só ela significa "tentar de novo é inútil até algo
// mudar" (a sessão, via conectarGatilhos, ou a config, via aplicarConfig).
let erroDefinitivo = false;
// Novas tentativas (doc 11 §5.0/§5.1): falhas seguidas por nota e até quando a nota fica em
// espera. Em memória — reiniciar o app zera, e é o que se quer.
let falhasGateiro: Record<string, number> = {};
let falhasCiclo: Record<string, number> = {};
let bloqueadoAte: Record<string, number> = {};
// Créditos da IA própria esgotados: segundo plano parado até haver saldo (entrarPausaPorCreditos).
let pausaPorCreditos = false;
let timerSaldoPausa: number | undefined;
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

/** `completar` com uma segunda chance para o 401 do provedor próprio. Outra janela pode ter
 * trocado o token (`renovar`, entrar) enquanto este pedido voava com o token velho: o cofre
 * tem o token novo e o usuário continua logado. Então, num `FalhaAgente("sessao")`, adota o
 * token do cofre (`sincronizarComCofre`, que nunca renova) e, SE ele mudou para outro não
 * nulo, repete UMA vez. Token igual, ou sem token, ou segundo 401: repropaga, e os catch
 * existentes decidem o que é definitivo. */
async function completarComSessao(pedido: Parameters<typeof completar>[0]) {
  const tokenUsado = tokenDaSessaoAtual();
  try {
    return await completar(pedido);
  } catch (e) {
    if (!(e instanceof FalhaAgente) || e.codigo !== "sessao" || !pedido.provedor.exigeConta) throw e;
    await useContaStore.getState().sincronizarComCofre();
    const tokenAgora = tokenDaSessaoAtual();
    if (tokenAgora === null || tokenAgora === tokenUsado) throw e;
    return completar(pedido);
  }
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

  // Texto da pausa por créditos: limpar a conversa ou retomar não pode apagar o motivo enquanto
  // a pausa durar — o agente ficaria parado sem dizer por quê.
  let textoPausaCreditos: string | null = null;

  function sairDaPausaPorCreditos() {
    pausaPorCreditos = false;
    textoPausaCreditos = null;
    window.clearInterval(timerSaldoPausa);
    timerSaldoPausa = undefined;
  }

  function entrarPausaPorCreditos(e: unknown) {
    pausaPorCreditos = true;
    textoPausaCreditos = textoDoErro(e);
    set({ status: "erro", erroAtual: textoPausaCreditos });
    if (timerSaldoPausa === undefined) {
      timerSaldoPausa = window.setInterval(() => void get().atualizarSaldo(), CONSULTA_SALDO_PAUSA_MS);
    }
  }

  /** Qualquer resposta boa do provedor prova que sessão, plano e créditos estão em ordem:
   * cobre quem virou premium depois de um 403 e quem recarregou créditos. */
  function aoSucessoDoProvedor() {
    if (!erroDefinitivo && !pausaPorCreditos) return;
    erroDefinitivo = false;
    sairDaPausaPorCreditos();
    set((s) => ({ status: s.status === "erro" ? statusBase(s) : s.status, erroAtual: null }));
    agendar();
  }

  /** Espera de uma nota: a inatividade normal ou o que faltar da espera por falha, o maior. */
  function esperaDaNota(path: string, inatividadeMs: number): number {
    const bloqueio = bloqueadoAte[path];
    return bloqueio === undefined ? inatividadeMs : Math.max(inatividadeMs, bloqueio - Date.now());
  }

  function agendar() {
    const s = get();
    window.clearTimeout(timerCiclo);
    window.clearTimeout(timerGateiro);
    // erro definitivo (sessao/plano do provedor próprio): reagendar bateria de novo na cara
    // do servidor a cada intervalo de inatividade, para sempre. Erros transitórios (rede,
    // cota) não entram aqui — continuam reagendando como já faziam. Só sai daqui quando a
    // sessão mudar (conectarGatilhos) ou a config for reaplicada (aplicarConfig já limpa
    // erroAtual e chama agendar de novo).
    if (erroDefinitivo || pausaPorCreditos) return;
    if (!s.config?.habilitado || s.pausado) return;
    const ativa = notaAtivaAtual();
    if (!ativa) return;
    const { path, texto } = ativa;
    const part = s.participacao[path];
    if (part === "aceito") {
      timerCiclo = window.setTimeout(
        () => void cicloSePuder(path),
        esperaDaNota(path, INATIVIDADE_CICLO_MS),
      );
    } else if (!part) {
      // um convite por vez: com convite pendente, não se agenda outro gateiro
      // (doc 11 §5.2 — o usuário responde primeiro).
      if (s.convite) return;
      timerGateiro = window.setTimeout(
        () => void gateiroSePuder(path),
        esperaDaNota(path, INATIVIDADE_GATEIRO_MS),
      );
    } else if (part === "adiado") {
      if (s.convite) return;
      const tentativa = tentativasGateiro[path];
      if (tentativa && cresceuDemais(tentativa.chars, texto.length)) {
        timerGateiro = window.setTimeout(
          () => void gateiroSePuder(path),
          esperaDaNota(path, INATIVIDADE_GATEIRO_MS),
        );
      }
    }
  }

  /** Falha transitória do gateiro (erro do provedor ou resposta que não parseia): espera
   * crescente por nota; esgotadas as esperas, só uma nota 50% maior libera nova leitura. */
  function registrarFalhaGateiro(path: string) {
    const falhas = (falhasGateiro[path] ?? 0) + 1;
    const espera = esperaAposFalha(falhas);
    if (espera === null) {
      delete falhasGateiro[path];
      return;
    }
    falhasGateiro[path] = falhas;
    bloqueadoAte[path] = Date.now() + espera;
    delete tentativasGateiro[path];
  }

  async function gateiroSePuder(path: string) {
    const s = get();
    const doc = useDocumentosStore.getState().docs.get(path);
    if (!s.config?.habilitado || !doc || pausaPorCreditos) return;
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
      const r = await completarComSessao({
        provedor: provedorDe(cfg.provedor),
        chave: cfg.chaves[cfg.provedor],
        baseUrl: baseUrlEfetiva(cfg.provedor, cfg.baseUrls),
        modelo: cfg.modeloGateiro,
        thinking: cfg.thinking,
        system: SYSTEM_GATEIRO,
        mensagens: [{ papel: "usuario", texto: promptGateiro(texto) }],
        // 500, não 200: em modelos de raciocínio os tokens de thinking contam no teto,
        // e um corte no meio do JSON virava "resposta inválida" invisível (achado em
        // uso real, 13/09).
        maxTokens: 500,
      });
      set((st) => ({ usoSessao: somarUso(st.usoSessao, r.uso) }));
      aoSucessoDoProvedor();
      const veredito = interpretarGateiro(r.texto);
      if (veredito) {
        delete falhasGateiro[path];
        delete bloqueadoAte[path];
      }
      if (deveConvidar(veredito)) {
        set({
          convite: { path, tema: veredito.tema },
          analises: { ...get().analises, [path]: "convite" },
        });
        if (!get().painelAberto) set({ painelAberto: true });
      } else if (veredito) {
        set((st) => ({ analises: { ...st.analises, [path]: "nao-vale" } }));
      } else {
        // resposta que não parseia: trata como erro, não como "não vale" — e libera a
        // próxima tentativa (a guarda de +50% é para decisão legítima, não para pane).
        set((st) => ({ analises: { ...st.analises, [path]: "erro" } }));
        registrarFalhaGateiro(path);
      }
    } catch (e) {
      // sessão ausente/expirada, ou conta sem direito à IA (403 do provedor próprio): sobe
      // para erroAtual, como os outros caminhos do store já fazem, em vez de virar só
      // "análise falhou" — os dois são estados definitivos (não transitórios como rede/cota),
      // e o usuário precisa saber por que o gateiro parou, mesmo que a ação seguinte difira
      // (entrar na conta vs. mudar de plano — nenhum botão aqui distingue os dois).
      const definitivo =
        e instanceof FalhaAgente && (e.codigo === "sessao" || e.codigo === "plano");
      if (definitivo) {
        erroDefinitivo = true;
        set({ status: "erro", erroAtual: textoDoErro(e) });
      }
      const semCreditos = e instanceof FalhaAgente && e.codigo === "creditos";
      if (semCreditos) entrarPausaPorCreditos(e);
      // gateiro silencioso: demais erros não viram faixa, mas ficam na linha de status do
      // painel. Sessão/plano/créditos param tudo até algo mudar (a tentativa fica liberada);
      // o resto segue a espera crescente.
      set((st) => ({ analises: { ...st.analises, [path]: "erro" } }));
      if (definitivo || semCreditos) delete tentativasGateiro[path];
      else registrarFalhaGateiro(path);
    } finally {
      emVoo.delete(path);
      set((st) => ({ status: st.status === "pensando" ? statusBase(st) : st.status }));
      agendar();
    }
  }

  async function cicloSePuder(path: string) {
    const s = get();
    const doc = useDocumentosStore.getState().docs.get(path);
    if (!s.config?.habilitado || !doc || pausaPorCreditos) return;
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

  /** Falha transitória do ciclo: espera crescente por nota; esgotadas as esperas, só 200
   * caracteres novos liberam nova rodada. */
  function registrarFalhaCiclo(path: string, texto: string) {
    const falhas = (falhasCiclo[path] ?? 0) + 1;
    const espera = esperaAposFalha(falhas);
    if (espera === null) {
      delete falhasCiclo[path];
      ultimoCicloTexto[path] = texto;
      return;
    }
    falhasCiclo[path] = falhas;
    bloqueadoAte[path] = Date.now() + espera;
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
            const res = await completarComSessao({
              provedor: provedorDe(cfg.provedor),
              chave: cfg.chaves[cfg.provedor],
              baseUrl: baseUrlEfetiva(cfg.provedor, cfg.baseUrls),
              modelo: cfg.modeloGateiro,
              thinking: cfg.thinking,
              system:
                "Resuma a nota em até 60 palavras, em português do Brasil, " +
                "dizendo sobre o que ela é. Só o resumo, sem título nem comentário.",
              mensagens: [{ papel: "usuario", texto: bruto.slice(0, 6000) }],
              maxTokens: 500,
            });
            textoR = res.texto.trim();
            set((st) => ({ usoSessao: somarUso(st.usoSessao, res.uso) }));
            if (textoR) {
              resumosCache[r.path] = { mtimeMs: metaR.mtimeMs, size: metaR.size, resumo: textoR };
              agendarPersistirResumos();
            }
          } catch (e) {
            // Só "modelo" e "resposta" (o modelo falhou neste resumo) caem no trecho cru. Qualquer
            // outra falha (rede, sessão, plano, cota, créditos, provedor, escopo, chave) vale
            // para o pedido principal também: aborta o ciclo, que já aplica espera/definitivo/
            // pausa. Sem isso, offline o ciclo faria até 4 pedidos por rodada.
            if (e instanceof FalhaAgente && e.codigo !== "modelo" && e.codigo !== "resposta") throw e;
            // sem resumo: o trecho cru mesmo assim (doc 11 §5.5)
          }
        }
        material.push({ path: r.path, titulo: r.titulo, texto: textoR });
      }

      const r = await completarComSessao({
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
      aoSucessoDoProvedor();
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
      delete falhasCiclo[path];
      delete bloqueadoAte[path];
    } catch (e) {
      // sessão ausente/expirada ou conta sem direito à IA: definitivo, grita na hora — não
      // faz sentido esperar mais duas falhas seguidas para um erro que não é transitório
      // (mesmo raciocínio do catch do gateiro, acima).
      if (e instanceof FalhaAgente && (e.codigo === "sessao" || e.codigo === "plano")) {
        erroDefinitivo = true;
        set({ status: "erro", erroAtual: textoDoErro(e) });
      } else if (e instanceof FalhaAgente && e.codigo === "creditos") {
        entrarPausaPorCreditos(e);
      } else {
        registrarFalhaCiclo(path, texto);
        falhasSeguidas++;
        // ciclo em segundo plano só grita na terceira falha seguida (doc 11 §7).
        if (falhasSeguidas >= FALHAS_PARA_ERRO_VISIVEL) {
          set({ status: "erro", erroAtual: textoDoErro(e) });
        } else {
          set((st) => ({ status: statusBase(st) }));
        }
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
    saldoCreditos: null,
    atualizarSaldo: async () => {
      const cfg = get().config;
      // Mesmo padrão de contaStore: `import.meta.env.DEV` literal para o ramo sumir do build de
      // produção. Com a conta de teste do DEV (servidor local), não há saldo real para buscar.
      const modoLocal =
        import.meta.env.DEV &&
        decidirModoServidor({ dev: import.meta.env.DEV, variavelServidor: import.meta.env.VITE_SERVIDOR }) ===
          "local";
      const token = tokenDaSessaoAtual();
      if (!cfg || !provedorDe(cfg.provedor).exigeConta || modoLocal || !token) {
        set({ saldoCreditos: null });
        return;
      }
      const saldo = await buscarSaldoCreditos(token);
      set({ saldoCreditos: saldo });
      // voltou a haver crédito (renovação do mês ou recarga): sai da pausa sozinho
      if (pausaPorCreditos && saldo && saldo.usados < saldo.total) {
        sairDaPausaPorCreditos();
        set((s) => ({ status: statusBase(s), erroAtual: null }));
        agendar();
      }
    },

    raiz: null,
    participacao: {},
    convite: null,
    analises: {},
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
      erroDefinitivo = false;
      sairDaPausaPorCreditos();
      set({ config, erroAtual: null });
      set((s) => ({ status: statusBase(s) }));
      const store = await load("settings.json", { autoSave: false });
      await store.set(CHAVE_CONFIG, config);
      await store.save();
      await emit(EVENTO_PREFS_MUDOU);
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
        if (pausaPorCreditos) return { pausado, status: "erro" as const, erroAtual: textoPausaCreditos };
        return { pausado, status: statusBase({ config: s.config, pausado }) };
      });
      agendar();
    },

    async testarConexao(config) {
      const cfg = config ?? get().config;
      if (!cfg) return "Configure o provedor primeiro.";
      const provedor = provedorDe(cfg.provedor);
      // Provedor por conta: não há GET /models a bater (doc 11 §3) — o que existe para
      // testar é a sessão. Devolver "funcionando" sem checar nada seria um sucesso
      // maquiado; aqui falha com a mensagem traduzida de erro de sessão quando não há
      // sessão (mesmo mecanismo dos outros ramos — textoDoErro), e não bate no endpoint
      // de listagem que o serviço não expõe quando há.
      if (provedor.exigeConta) {
        return tokenDaSessaoAtual() ? null : textoDoErro(new FalhaAgente("sessao"));
      }
      try {
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
        const resposta = await completarComSessao({
          provedor: provedorDe(cfg.provedor),
          chave: cfg.chaves[cfg.provedor],
          baseUrl: baseUrlEfetiva(cfg.provedor, cfg.baseUrls),
          modelo: cfg.modeloAssistente,
          thinking: cfg.thinking,
          system: systemConversa(ativa ? ativa.path : null, nota),
          mensagens: (get().conversas[chave] ?? []).slice(-12),
        });
        aoSucessoDoProvedor();
        anexar({ papel: "assistente", texto: resposta.texto });
        set((s) => ({
          usoSessao: somarUso(s.usoSessao, resposta.uso),
          status: statusBase(s),
        }));
        agendarPersistirConversas();
      } catch (e) {
        // A mensagem do usuário fica na conversa e o erro aparece no rodapé — fazer o
        // texto digitado sumir seria pior que o erro visível (RF11.15).
        if (e instanceof FalhaAgente && e.codigo === "creditos") {
          entrarPausaPorCreditos(e);
        } else {
          set({ status: "erro", erroAtual: textoDoErro(e) });
        }
      }
    },

    limparConversa() {
      const ativa = notaAtivaAtual();
      const chave = ativa ? ativa.path : "";
      set((s) => ({ conversas: { ...s.conversas, [chave]: [] }, erroAtual: pausaPorCreditos ? textoPausaCreditos : null }));
      agendarPersistirConversas();
    },

    async aoAbrirVault(raiz) {
      window.clearTimeout(timerCiclo);
      window.clearTimeout(timerGateiro);
      emVoo = new Set();
      ultimoCicloTexto = {};
      tentativasGateiro = {};
      falhasGateiro = {};
      falhasCiclo = {};
      bloqueadoAte = {};
      resumosCache = await carregarResumos(raiz);
      const conversasSalvas = await carregarConversas(raiz);
      set({
        raiz,
        participacao: await carregarParticipacao(raiz),
        convite: null,
        analises: {},
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
      // sessão mudou (entrar/sair/renovar) enquanto o agente estava parado num erro
      // definitivo (sessao/plano): reavalia. Isto só lê e reage a `useContaStore` — nunca
      // escreve nele — então não pode disparar este mesmo assinante de volta (sem laço).
      useContaStore.subscribe((state, prev) => {
        if (state.sessao !== prev.sessao && (erroDefinitivo || pausaPorCreditos)) {
          erroDefinitivo = false;
          sairDaPausaPorCreditos();
          set((s) => ({ status: statusBase(s), erroAtual: null }));
          agendar();
        }
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
      falhasGateiro = {};
      falhasCiclo = {};
      bloqueadoAte = {};
      set({ participacao: {}, sugestoes: {}, fatos: [], conversas: {}, convite: null });
      await limparMemoriaDisco(raiz);
    },
  };
});
