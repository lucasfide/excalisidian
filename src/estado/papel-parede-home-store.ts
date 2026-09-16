import { create } from "zustand";

import {
  carregarPapelParedeHome,
  escolherPapelParedeHome,
  notificarMudancaPapelParedeHome,
  obterPapelParedeHomePadrao,
  restaurarPapelParedeHome,
  type PapelParedeHomeCarregado,
} from "../app/papel-de-parede-home";

export interface PapelParedeHomeState {
  papelParedeUrl: string;
  papelParedePersonalizado: boolean;
  papelParedeCarregando: boolean;
  erroPapelParede: string | null;
  papelParedeBlobUrl: string | null;
  carregar(): Promise<void>;
  escolher(): Promise<void>;
  restaurar(): Promise<void>;
  limparErro(): void;
}

const papelParedePadrao = obterPapelParedeHomePadrao();

export const usePapelParedeHomeStore = create<PapelParedeHomeState>(
  (set, get) => {
    function aplicar(papelParede: PapelParedeHomeCarregado): void {
      const blobUrlAnterior = get().papelParedeBlobUrl;

      set({
        papelParedeUrl: papelParede.url,
        papelParedePersonalizado: papelParede.personalizado,
        papelParedeBlobUrl: papelParede.blobUrl,
        papelParedeCarregando: false,
        erroPapelParede: null,
      });

      if (blobUrlAnterior && blobUrlAnterior !== papelParede.blobUrl) {
        URL.revokeObjectURL(blobUrlAnterior);
      }
    }

    async function notificarOutrasJanelas(): Promise<void> {
      try {
        await notificarMudancaPapelParedeHome();
      } catch {
        set({
          erroPapelParede:
            "O papel de parede foi alterado nesta janela, mas não foi possível sincronizar as outras.",
        });
      }
    }

    return {
      papelParedeUrl: papelParedePadrao.url,
      papelParedePersonalizado: false,
      papelParedeCarregando: false,
      erroPapelParede: null,
      papelParedeBlobUrl: null,

      async carregar() {
        set({ papelParedeCarregando: true, erroPapelParede: null });
        try {
          aplicar(await carregarPapelParedeHome());
        } catch {
          set({
            papelParedeCarregando: false,
            erroPapelParede:
              "Não foi possível carregar o papel de parede. O fundo anterior foi mantido.",
          });
        }
      },

      async escolher() {
        set({ papelParedeCarregando: true, erroPapelParede: null });
        let papelParede: PapelParedeHomeCarregado | null;
        try {
          papelParede = await escolherPapelParedeHome();
        } catch {
          set({
            papelParedeCarregando: false,
            erroPapelParede:
              "Não foi possível escolher o papel de parede. O fundo anterior foi mantido.",
          });
          return;
        }

        if (!papelParede) {
          set({ papelParedeCarregando: false });
          return;
        }

        aplicar(papelParede);
        await notificarOutrasJanelas();
      },

      async restaurar() {
        set({ papelParedeCarregando: true, erroPapelParede: null });
        let papelParede: PapelParedeHomeCarregado;
        try {
          papelParede = await restaurarPapelParedeHome();
        } catch {
          set({
            papelParedeCarregando: false,
            erroPapelParede:
              "Não foi possível restaurar o papel de parede. O fundo anterior foi mantido.",
          });
          return;
        }

        aplicar(papelParede);
        await notificarOutrasJanelas();
      },

      limparErro() {
        set({ erroPapelParede: null });
      },
    };
  },
);
