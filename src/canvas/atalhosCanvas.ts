// Reencaminhamento de atalhos no canvas (doc 04 §6.1). Handler em fase de captura na raiz
// do painel de desenho, com lista explícita — nunca heurística.
//
// Os atalhos de aplicação (Ctrl+S/O/P/T/W/Tab/\) já são interceptados pelo listener global
// do Workspace, que roda em captura no `window` — ou seja, ANTES deste. Aqui só garantimos
// que o Excalidraw não os processe também (stopPropagation), e bloqueamos o Ctrl+Delete,
// que no Excalidraw limpa a cena inteira e o `UIOptions` não desliga.

import { useEffect, type RefObject } from "react";

const APLICACAO = new Set(["s", "o", "p", "t", "w", "\\"]);

export function useAtalhosCanvas(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      if (e.key === "Delete") {
        // Nunca deixa chegar no Excalidraw.
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const k = e.key.toLowerCase();
      if (APLICACAO.has(k) || e.key === "Tab") {
        // O Workspace já tratou; impede o Excalidraw de reagir por cima.
        e.stopPropagation();
      }
      // Ctrl+Z/Shift+Z/A/D/G/Shift+G/0/+/-/K e teclas de ferramenta: ficam com o canvas.
    };

    el.addEventListener("keydown", onKey, true);
    return () => el.removeEventListener("keydown", onKey, true);
  }, [ref]);
}
