// src/estado/conflitosStore.ts
// A fila de conflitos abertos e a aplicação da decisão do usuário.
//
// A escrita sai pelo VaultAdapter, que já faz tmp + rename (doc 02 §10) — este store nunca
// chama writeTextFile. E o conflito só sai da fila DEPOIS de a escrita terminar: sumir com
// o aviso por causa de um disco cheio deixaria o usuário sem saber que houve conflito.
//
// `resolver` também recarrega a árvore e reindexa cada caminho gravado (mesmo motivo de
// `vault/criar.ts`/`renomear.ts`: o watcher ignora o eco da própria gravação, então ninguém
// além de quem gravou vai atualizar árvore/índice) e, se o caminho original estiver aberto
// numa aba, recarrega a aba pro conteúdo escolhido — cancelando o autosave pendente ANTES de
// escrever, pra não existir uma janela em que ele regrave o conteúdo antigo por cima
// (ADR-32, "Decisões tomadas na execução").

import { create } from "zustand";

import { operacoesPara } from "../sync/resolucao";
import type { Conflito, Resolucao } from "../sync/tipos";
import type { VaultAdapter } from "../vault/VaultAdapter";
import { caminhoLivre } from "../vault/criar";
import { dividirExtensao, nomeBase, pastaDe } from "../vault/caminhos";
import { efeitosReais, type EfeitosDeGravacao } from "../vault/efeitosDeGravacao";

/** Efeitos que `resolver` precisa disparar depois de gravar, além da própria escrita
 * (doc 02 §10: o watcher ignora a própria gravação atômica, então ninguém além de quem
 * gravou vai recarregar a árvore/índice — "demorou pra aparecer" era exatamente essa lacuna).
 * Reexporta `EfeitosDeGravacao` (plano 09, `vault/efeitosDeGravacao.ts`): o motor de
 * sincronização precisa exatamente da mesma sequência, então não existe mais uma cópia
 * própria daqui — só o nome antigo, para quem já importa `DepsResolucao`. Por padrão aponta
 * pro vaultStore/documentosStore reais; testes injetam versões falsas pra não precisar montar
 * os dois stores do zustand só pra testar `resolver`. */
export type DepsResolucao = EfeitosDeGravacao;

const depsReais = efeitosReais;

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
    deps?: DepsResolucao,
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

  async resolver(caminho, resolucao, adaptador, quando = new Date(), deps = depsReais()) {
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
      const caminhosGravados: string[] = [];
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
        if (caminhoFinal === caminho) {
          // Vamos sobrescrever o caminho que pode estar aberto numa aba AGORA: cancela o
          // autosave pendente ANTES de escrever. Sem isto, o timer da aba dispararia depois
          // da nossa escrita e regravaria o conteúdo antigo do editor por cima da versão que
          // o usuário acabou de escolher — não pode existir essa janela de tempo.
          deps.cancelarAutosavePendente(caminho);
        }
        await adaptador.escreverTexto(caminhoFinal, op.conteudo);
        caminhosGravados.push(caminhoFinal);
      }

      if (caminhosGravados.length > 0) {
        // Eco do watcher pra própria gravação atômica é ignorado de propósito (doc 02 §10):
        // sem isto aqui, o arquivo só apareceria na árvore/índice quando outra ação
        // qualquer recarregasse — "demorou pra aparecer" era exatamente esta lacuna.
        await deps.recarregarArvore();
        for (const c of caminhosGravados) {
          await deps.reindexarArquivo(c);
        }
      }
      if (caminhosGravados.includes(caminho)) {
        // O caminho original foi sobrescrito ("ficar com a outra versão"): se ele estiver
        // aberto numa aba, ela passa a mostrar a versão escolhida agora, não na próxima vez
        // que algo tocar o disco. `recarregarDoDisco` não faz nada se a aba não existir.
        await deps.recarregarDoDisco(caminho);
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
