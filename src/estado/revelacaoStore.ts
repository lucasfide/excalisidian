// Pedido pendente de "revelar um trecho": a busca (B3) pede pra rolar até uma linha depois
// de abrir a nota (doc 13 §2.2 / §1.5). Um slot só, porque só existe uma navegação em curso
// por vez — não uma fila por caminho. `seq` existe para o mesmo texto poder ser revelado
// duas vezes seguidas (ex.: clicar o mesmo trecho de novo): sem ele, um efeito do React que
// compara `pendente` por igualdade estrutural não veria mudança nenhuma.
//
// Quem consome é o EditorNota da própria nota (`caminho === pendente.path`), tanto se ela já
// está montada (o efeito reage à mudança do store) quanto se ainda vai montar (o efeito de
// montagem lê o pendente assim que o handle do editor existe). Ver comentário em
// EditorNota.tsx.

import { create } from "zustand";

interface PedidoRevelacao {
  path: string;
  texto: string;
  seq: number;
}

interface RevelacaoState {
  pendente: PedidoRevelacao | null;
  /** Registra um pedido de revelação para `path`. Sobrescreve um pedido anterior não
   * consumido — só a navegação mais recente importa. */
  pedir(path: string, texto: string): void;
  /** Consome o pedido pendente de `path`, se houver, e limpa o slot (nunca revela duas
   * vezes ao remontar). Retorna `null` se não há pedido pendente para este caminho — inclui
   * o caso de outra vista do mesmo arquivo já ter consumido primeiro (doc 13 §1.5: revela só
   * numa vista). */
  consumir(path: string): string | null;
}

let ultimoSeq = 0;

export const useRevelacaoStore = create<RevelacaoState>((set, get) => ({
  pendente: null,

  pedir(path, texto) {
    ultimoSeq += 1;
    set({ pendente: { path, texto, seq: ultimoSeq } });
  },

  consumir(path) {
    const { pendente } = get();
    if (!pendente || pendente.path !== path) return null;
    set({ pendente: null });
    return pendente.texto;
  },
}));
