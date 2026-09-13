// Qual sobreposição de busca está aberta agora — QuickSwitcher (Ctrl+O), PaletaComandos
// (Ctrl+P) ou PainelBusca (Ctrl+Shift+F). Uma de cada vez, como o dialogoStore
// (RaizSobreposicoes as monta, ver App.tsx).

import { create } from "zustand";

export type TipoSobreposicao = "switcher" | "comandos" | "busca";

interface SobreposicaoState {
  aberta: TipoSobreposicao | null;
  abrir(tipo: TipoSobreposicao): void;
  fechar(): void;
}

export const useSobreposicaoStore = create<SobreposicaoState>((set, get) => ({
  aberta: null,
  abrir(tipo) {
    // Ctrl+O com o switcher já aberto fecha em vez de reabrir (mesma tecla alterna).
    set({ aberta: get().aberta === tipo ? null : tipo });
  },
  fechar() {
    set({ aberta: null });
  },
}));
