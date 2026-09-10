// Data local (YYYY-MM-DD) que se revalida quando a janela volta ao foco/visibilidade e na
// virada da meia-noite — pro painel de tarefas se reagrupar sozinho sem reabrir o app
// (doc 10 §3.6).

import { useEffect, useState } from "react";
import { dataLocalDe } from "../tarefas/agrupamento";

export function useHojeLocal(): string {
  const [hoje, setHoje] = useState(() => dataLocalDe(new Date()));

  useEffect(() => {
    const revalidar = () => setHoje(dataLocalDe(new Date()));
    const aoVisivel = () => {
      if (!document.hidden) revalidar();
    };
    document.addEventListener("visibilitychange", aoVisivel);
    window.addEventListener("focus", revalidar);

    const agora = new Date();
    const meiaNoite = new Date(
      agora.getFullYear(),
      agora.getMonth(),
      agora.getDate() + 1,
      0,
      0,
      1,
    );
    const t = window.setTimeout(revalidar, meiaNoite.getTime() - agora.getTime());

    return () => {
      document.removeEventListener("visibilitychange", aoVisivel);
      window.removeEventListener("focus", revalidar);
      window.clearTimeout(t);
    };
  }, [hoje]);

  return hoje;
}
