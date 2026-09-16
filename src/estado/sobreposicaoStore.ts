// Qual sobreposição de busca está aberta agora — PaletaComandos (Ctrl+P) ou PainelBusca
// (Ctrl+O / Ctrl+Shift+F, doc 13 §2.3: as duas teclas abrem a mesma busca unificada, que
// absorveu o QuickSwitcher). Uma de cada vez, como o dialogoStore (RaizSobreposicoes as
// monta, ver App.tsx).

import { create } from "zustand";

export type TipoSobreposicao = "comandos" | "busca";

interface SobreposicaoState {
  aberta: TipoSobreposicao | null;
  /** Última consulta digitada no PainelBusca, memória de sessão (doc 13 §1.1: reabrir traz
   * a última consulta, toda selecionada). Não persiste em disco — reinicia com o app. */
  ultimaConsulta: string;
  abrir(tipo: TipoSobreposicao): void;
  fechar(): void;
  definirUltimaConsulta(consulta: string): void;
}

export const useSobreposicaoStore = create<SobreposicaoState>((set, get) => ({
  aberta: null,
  ultimaConsulta: "",
  abrir(tipo) {
    // A mesma tecla (ou outra que abra a mesma sobreposição) com ela já aberta fecha em vez
    // de reabrir — mesma tecla alterna (doc 13 §1.1).
    set({ aberta: get().aberta === tipo ? null : tipo });
  },
  fechar() {
    set({ aberta: null });
  },
  definirUltimaConsulta(consulta) {
    set({ ultimaConsulta: consulta });
  },
}));
