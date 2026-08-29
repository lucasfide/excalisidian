// Fila de diálogos do app. Substitui `window.prompt`/`confirm`, que são diálogos do sistema
// operacional — quebram a direção visual e, no WebView do Tauri, nem sempre funcionam.
//
// A API devolve Promise em vez de bloquear a thread: quem chama faz `await pedirTexto(...)`,
// e o `<RaizDialogos />` montado no App resolve a Promise quando o usuário responde. Isso
// mantém a chamada testável (basta trocar o store) e não acopla a camada de domínio ao React.

import { create } from "zustand";

export interface PedidoTexto {
  tipo: "texto";
  titulo: string;
  descricao?: string;
  rotulo: string;
  valorInicial: string;
  textoConfirmar: string;
  /** Devolve a mensagem de erro, ou null se o valor for aceitável. */
  validar?: (valor: string) => string | null;
}

export interface PedidoConfirmacao {
  tipo: "confirmacao";
  titulo: string;
  descricao?: string;
  textoConfirmar: string;
  destrutivo?: boolean;
}

type Pedido = PedidoTexto | PedidoConfirmacao;

interface DialogoState {
  /** Diálogo aberto agora, ou null. Um de cada vez, de propósito. */
  atual: (Pedido & { id: number }) | null;
  /** Responde ao diálogo aberto. `null`/`false` = cancelado. */
  responder(resposta: string | boolean | null): void;
}

let proximoId = 1;
let resolverAtual: ((resposta: never) => void) | null = null;

export const useDialogoStore = create<DialogoState>((set) => ({
  atual: null,

  responder(resposta) {
    const resolver = resolverAtual;
    resolverAtual = null;
    set({ atual: null });
    resolver?.(resposta as never);
  },
}));

function abrir<T>(pedido: Pedido): Promise<T> {
  // Um diálogo por vez: se já houver um aberto, ele é cancelado antes.
  useDialogoStore.getState().responder(null);
  return new Promise<T>((resolve) => {
    resolverAtual = resolve as (resposta: never) => void;
    useDialogoStore.setState({ atual: { ...pedido, id: proximoId++ } });
  });
}

/** Pede um texto ao usuário. Resolve com o texto, ou `null` se cancelar. */
export function pedirTexto(
  pedido: Omit<PedidoTexto, "tipo">,
): Promise<string | null> {
  return abrir<string | null>({ ...pedido, tipo: "texto" });
}

/** Pede uma confirmação. Resolve com `true` só se o usuário confirmar. */
export function confirmar(
  pedido: Omit<PedidoConfirmacao, "tipo">,
): Promise<boolean> {
  return abrir<boolean>({ ...pedido, tipo: "confirmacao" });
}
