// Captura global de erro. Até isto existir, o app não registrava NADA de erro assíncrono:
// uma Promise rejeitada (um `invoke` do Rust que falha, o watcher despejando um lote grande
// depois de o PC hibernar, uma gravação que estourou) sumia sem log, sem toast, sem rastro —
// o que tornava impossível descobrir a causa de uma tela branca depois do fato.
//
// Não tenta consertar nada: só torna visível. O ErrorBoundary raiz (main.tsx) cuida do caso
// de erro em renderização; aqui é o resto — event handler, timer, Promise solta.

import { toast } from "sonner";

function descrever(valor: unknown): string {
  if (valor instanceof Error) return `${valor.name}: ${valor.message}`;
  return String(valor);
}

/** Best-effort: se o `<Toaster>` ainda não montou (ou a árvore React caiu), o sonner ignora
 * em silêncio — por isso o console vem sempre, primeiro e incondicional. */
function avisar(rotulo: string, detalhe: string) {
  // eslint-disable-next-line no-console -- é o único registro que sobra sem telemetria
  console.error(`[${rotulo}]`, detalhe);
  try {
    toast.error(`${rotulo}: ${detalhe}`);
  } catch {
    // sem Toaster montado: o console acima já registrou
  }
}

let registrado = false;

export function registrarCapturaDeErros(): void {
  if (registrado) return; // o StrictMode monta duas vezes em dev
  registrado = true;

  window.addEventListener("error", (evento) => {
    avisar("Erro não tratado", descrever(evento.error ?? evento.message));
  });

  window.addEventListener("unhandledrejection", (evento) => {
    avisar("Promise rejeitada", descrever(evento.reason));
  });
}
