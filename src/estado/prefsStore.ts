// Preferências do app que sobrevivem ao fechar (settings.json via plugin-store — mesmo
// arquivo que TauriVaultAdapter usa pro caminho do vault, chave diferente). Tema e largura da
// coluna de texto; tamanho da janela e vaults recentes ficam para quando fizerem falta de
// verdade.

import { create } from "zustand";
import { load } from "@tauri-apps/plugin-store";
import { emit } from "@tauri-apps/api/event";

export type Tema = "sistema" | "claro" | "escuro";
export type LarguraNota = "pequena" | "media" | "full";

const CHAVE_TEMA = "tema";
const CHAVE_LARGURA_NOTA = "larguraNota";
const CHAVE_SIDEBAR_COLAPSADA = "sidebarColapsada";
const CHAVE_BARRA_FORMATACAO_ACOPLADA = "barraFormatacaoAcoplada";
const CHAVE_NOME_USUARIO = "nomeUsuario";
const CHAVE_ASCII_PEAKS_HABILITADO = "asciiPeaksHabilitado";
// Doc 12 §6 / doc 04 §5.1: preferência da máquina mudou numa janela → avisa as outras pra
// relerem o settings.json. Mesmo nome usado por agenteStore.ts para a config do agente
// (literal repetido nos dois arquivos — ver comentário em flushEntreJanelas.ts sobre por que
// não virou uma constante importada). Quem recebe só chama `carregar()`, nunca emite de volta.
const EVENTO_PREFS_MUDOU = "app://prefs-mudou";
const TEMAS_VALIDOS: readonly Tema[] = ["sistema", "claro", "escuro"];
const LARGURAS_VALIDAS: readonly LarguraNota[] = ["pequena", "media", "full"];

function ehTema(v: unknown): v is Tema {
  return typeof v === "string" && (TEMAS_VALIDOS as readonly string[]).includes(v);
}

function ehLarguraNota(v: unknown): v is LarguraNota {
  return typeof v === "string" && (LARGURAS_VALIDAS as readonly string[]).includes(v);
}

interface PrefsState {
  tema: Tema;
  larguraNota: LarguraNota;
  sidebarColapsada: boolean;
  /** Barra de formatação presa embaixo da nota em vez de flutuar acima do cursor. */
  barraFormatacaoAcoplada: boolean;
  // Doc 15 §2.1: `null` = nunca informado (onboarding pergunta, Home some sem nome); ""
  // significa "informado, sem nome" (usuário apagou o campo de propósito) — as duas coisas
  // são estados diferentes, por isso não colapsam num só valor.
  nomeUsuario: string | null;
  /** Fundo "picos em ASCII" da Home/aba em branco (doc 06, doc 09 ADR-28) — ligado por padrão;
   * o botão "Desabilitar shaders" no rodapé da Home mexe aqui. */
  asciiPeaksHabilitado: boolean;
  /** true assim que `carregar()` terminou — antes disso os campos acima são só o padrão local. */
  carregado: boolean;
  carregar(): Promise<void>;
  definirTema(tema: Tema): void;
  definirLarguraNota(largura: LarguraNota): void;
  alternarSidebar(): void;
  alternarBarraFormatacaoAcoplada(): void;
  definirNomeUsuario(nome: string): void;
  alternarAsciiPeaksHabilitado(): void;
}

export const usePrefsStore = create<PrefsState>((set) => ({
  tema: "sistema",
  larguraNota: "media",
  sidebarColapsada: false,
  barraFormatacaoAcoplada: false,
  nomeUsuario: null,
  asciiPeaksHabilitado: true,
  carregado: false,

  async carregar() {
    try {
      const store = await load("settings.json", { autoSave: false });
      const [
        temaSalvo,
        larguraSalva,
        sidebarColapsadaSalva,
        barraAcopladaSalva,
        nomeSalvo,
        asciiPeaksSalvo,
      ] = await Promise.all([
        store.get<Tema>(CHAVE_TEMA),
        store.get<LarguraNota>(CHAVE_LARGURA_NOTA),
        store.get<boolean>(CHAVE_SIDEBAR_COLAPSADA),
        store.get<boolean>(CHAVE_BARRA_FORMATACAO_ACOPLADA),
        store.get<string>(CHAVE_NOME_USUARIO),
        store.get<boolean>(CHAVE_ASCII_PEAKS_HABILITADO),
      ]);
      if (ehTema(temaSalvo)) set({ tema: temaSalvo });
      if (ehLarguraNota(larguraSalva)) set({ larguraNota: larguraSalva });
      if (typeof sidebarColapsadaSalva === "boolean") set({ sidebarColapsada: sidebarColapsadaSalva });
      if (typeof barraAcopladaSalva === "boolean") {
        set({ barraFormatacaoAcoplada: barraAcopladaSalva });
      }
      // Qualquer coisa que não seja string (nunca gravado, ou lixo) conta como "nunca
      // informado" — só uma string salva (mesmo vazia) vira nome.
      set({ nomeUsuario: typeof nomeSalvo === "string" ? nomeSalvo : null });
      if (typeof asciiPeaksSalvo === "boolean") set({ asciiPeaksHabilitado: asciiPeaksSalvo });
    } catch {
      // Sem preferência salva ainda (primeira execução): fica nos padrões locais.
    }
    set({ carregado: true });
  },

  definirTema(tema) {
    set({ tema });
    void (async () => {
      const store = await load("settings.json", { autoSave: false });
      await store.set(CHAVE_TEMA, tema);
      await store.save();
      await emit(EVENTO_PREFS_MUDOU);
    })();
  },

  definirLarguraNota(largura) {
    set({ larguraNota: largura });
    void (async () => {
      const store = await load("settings.json", { autoSave: false });
      await store.set(CHAVE_LARGURA_NOTA, largura);
      await store.save();
      await emit(EVENTO_PREFS_MUDOU);
    })();
  },

  alternarSidebar() {
    const sidebarColapsada = !usePrefsStore.getState().sidebarColapsada;
    set({ sidebarColapsada });
    void (async () => {
      const store = await load("settings.json", { autoSave: false });
      await store.set(CHAVE_SIDEBAR_COLAPSADA, sidebarColapsada);
      await store.save();
      // Decisão (relatada na tarefa): sidebar colapsada é layout da janela, não aparência —
      // cada janela podia ter seu próprio tamanho de conteúdo e "querer" a sidebar aberta ou
      // fechada por razões diferentes (uma janela mais estreita, por exemplo). Mesmo assim,
      // doc 04 §5.1 e doc 12 §6 listam explicitamente "sidebar colapsada" entre as
      // preferências compartilhadas — o contrato já fechou essa decisão como sincronizada.
      // Sincroniza por seguir o contrato; ver relatório desta tarefa se isso merecer
      // reabrir a decisão.
      await emit(EVENTO_PREFS_MUDOU);
    })();
  },

  alternarBarraFormatacaoAcoplada() {
    const barraFormatacaoAcoplada = !usePrefsStore.getState().barraFormatacaoAcoplada;
    set({ barraFormatacaoAcoplada });
    void (async () => {
      const store = await load("settings.json", { autoSave: false });
      await store.set(CHAVE_BARRA_FORMATACAO_ACOPLADA, barraFormatacaoAcoplada);
      await store.save();
      await emit(EVENTO_PREFS_MUDOU);
    })();
  },

  definirNomeUsuario(nome) {
    // Trim conforme doc 15 §2.1: string vazia é um valor válido ("informado, sem nome"), só
    // espaço nas pontas é que não conta.
    const nomeUsuario = nome.trim();
    set({ nomeUsuario });
    void (async () => {
      const store = await load("settings.json", { autoSave: false });
      await store.set(CHAVE_NOME_USUARIO, nomeUsuario);
      await store.save();
      await emit(EVENTO_PREFS_MUDOU);
    })();
  },

  alternarAsciiPeaksHabilitado() {
    const asciiPeaksHabilitado = !usePrefsStore.getState().asciiPeaksHabilitado;
    set({ asciiPeaksHabilitado });
    void (async () => {
      const store = await load("settings.json", { autoSave: false });
      await store.set(CHAVE_ASCII_PEAKS_HABILITADO, asciiPeaksHabilitado);
      await store.save();
      await emit(EVENTO_PREFS_MUDOU);
    })();
  },
}));
