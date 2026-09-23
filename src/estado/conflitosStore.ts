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
  /** Caminhos com uma resolução em andamento agora. Um Set porque só importa pertencimento
   * (é "está sendo resolvido ou não?", nunca ordem nem contagem) e checar `.has()` é O(1). */
  emResolucaoSet: Set<string>;
  conflitoDe(caminho: string): Conflito | undefined;
  registrar(conflito: Conflito): void;
  limpar(): void;
  /** True enquanto o caminho tem uma resolução em andamento — a tela usa isto pra desabilitar
   * os botões (defesa em profundidade: o guard abaixo já protege o store sozinho). */
  emResolucao(caminho: string): boolean;
  resolver(
    caminho: string,
    resolucao: Resolucao,
    adaptador: VaultAdapter,
    quando?: Date,
  ): Promise<void>;
}

export const useConflitosStore = create<ConflitosState>((set, get) => ({
  conflitos: [],
  emResolucaoSet: new Set(),

  conflitoDe(caminho) {
    return get().conflitos.find((c) => c.caminho === caminho);
  },

  emResolucao(caminho) {
    return get().emResolucaoSet.has(caminho);
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

    // Trava contra chamadas CONCORRENTES para o mesmo caminho — um duplo clique, por exemplo.
    // Sem isto, duas chamadas de `resolver` disparadas antes da primeira terminar veriam o
    // mesmo "próximo nome livre" (caminhoLivre confere `existe()` antes de escrever) e a
    // segunda escrita apagaria a primeira cópia sem aviso: o mesmo defeito que a numeração
    // fecha para chamadas em sequência, aqui entrando por concorrência. A tela vai desabilitar
    // os botões também, mas o store tem que ser seguro por si só (defesa em profundidade).
    if (get().emResolucaoSet.has(caminho)) return;
    set((estado) => ({ emResolucaoSet: new Set(estado.emResolucaoSet).add(caminho) }));

    try {
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
    } finally {
      // Sai do conjunto tanto no sucesso quanto na falha — preso aqui, o conflito nunca mais
      // poderia ser resolvido.
      set((estado) => {
        const novo = new Set(estado.emResolucaoSet);
        novo.delete(caminho);
        return { emResolucaoSet: novo };
      });
    }
  },
}));
