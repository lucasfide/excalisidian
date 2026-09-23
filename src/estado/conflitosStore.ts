// src/estado/conflitosStore.ts
// A fila de conflitos abertos e a aplicação da decisão do usuário.
//
// A escrita sai pelo VaultAdapter, que já faz tmp + rename (doc 02 §10) — este store nunca
// chama writeTextFile. E o conflito só sai da fila DEPOIS de a escrita terminar: sumir com
// o aviso por causa de um disco cheio deixaria o usuário sem saber que houve conflito.

import { create } from "zustand";

import { operacoesPara } from "../sync/resolucao";
import type { Conflito, Resolucao } from "../sync/tipos";
import type { VaultAdapter } from "../vault/VaultAdapter";
import { caminhoLivre } from "../vault/criar";
import { dividirExtensao, nomeBase, pastaDe } from "../vault/caminhos";

interface ConflitosState {
  conflitos: Conflito[];
  conflitoDe(caminho: string): Conflito | undefined;
  registrar(conflito: Conflito): void;
  limpar(): void;
  resolver(
    caminho: string,
    resolucao: Resolucao,
    adaptador: VaultAdapter,
    quando?: Date,
  ): Promise<void>;
}

export const useConflitosStore = create<ConflitosState>((set, get) => ({
  conflitos: [],

  conflitoDe(caminho) {
    return get().conflitos.find((c) => c.caminho === caminho);
  },

  registrar(conflito) {
    set((estado) => ({
      // Um caminho tem no máximo um conflito aberto: o novo substitui o velho.
      conflitos: [...estado.conflitos.filter((c) => c.caminho !== conflito.caminho), conflito],
    }));
  },

  limpar() {
    set({ conflitos: [] });
  },

  async resolver(caminho, resolucao, adaptador, quando = new Date()) {
    const conflito = get().conflitoDe(caminho);
    if (!conflito) return;

    for (const op of operacoesPara(conflito, resolucao, quando)) {
      // `nomeDaCopiaDeConflito` (usado por operacoesPara) não vê o disco: se a mesma nota
      // tiver dois conflitos no mesmo dia vindos do mesmo dispositivo, e o usuário escolher
      // "manter as duas" nas duas vezes, o nome carimbado repete. `escreverTexto` grava por
      // troca de arquivo sem checar se o destino existe — a segunda escrita apagaria a
      // primeira cópia sem aviso e sem volta, o que este fluxo existe para evitar (ADR-15).
      // Por isso, só para a cópia de "manter as duas" (nunca para "ficar com a remota", que
      // sobrescreve o original de propósito), resolvemos o caminho final com caminhoLivre,
      // que numera em vez de sobrescrever.
      let caminhoFinal = op.caminho;
      if (resolucao.acao === "manterAmbas") {
        const pasta = pastaDe(op.caminho);
        const { base, ext } = dividirExtensao(nomeBase(op.caminho));
        const baseComPasta = pasta ? `${pasta}/${base}` : base;
        caminhoFinal = await caminhoLivre(baseComPasta, ext, adaptador);
      }
      await adaptador.escreverTexto(caminhoFinal, op.conteudo);
    }

    set((estado) => ({ conflitos: estado.conflitos.filter((c) => c.caminho !== caminho) }));
  },
}));
