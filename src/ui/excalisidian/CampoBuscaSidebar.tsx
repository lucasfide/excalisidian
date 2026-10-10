// Entrada visível da busca unificada (doc 13 §1.1, §2.4): fica logo abaixo do cabeçalho da
// sidebar, ao lado do botão de ordenar. Não é um input de verdade — é um botão com aparência
// de campo que abre a sobreposição de busca (`PainelBusca`, via `sobreposicaoStore`). A
// hairline e o padding do container (border-b border-regua px-3 py-2) vivem em
// `ConteudoSidebar.tsx`, que também abriga o `BotaoOrdenacao` na mesma linha.

import { Search } from "lucide-react";

import { ehMac, rotuloDoAtalho } from "../../app/glossario/teclas";
import { useSobreposicaoStore } from "../../estado/sobreposicaoStore";

export default function CampoBuscaSidebar() {
  return (
    <button
      type="button"
      title="Buscar"
      aria-label="Buscar"
      onClick={() => useSobreposicaoStore.getState().abrir("busca")}
      // Raio, borda, fundo e hover copiados de `Campo` (rounded-controle,
      // border-regua-forte, bg-superficie, hover:bg-lavagem do padrão de item de
      // sidebar usado pelo botão do `SeletorVault`).
      className="flex h-9 w-full items-center gap-2 rounded-controle border border-regua-forte bg-superficie px-2 text-left transition-colors duration-[140ms] ease-caderno hover:bg-lavagem"
    >
      <Search size={16} strokeWidth={1.5} className="shrink-0 text-tinta-suave" aria-hidden />
      <span className="flex-1 text-corpo text-tinta-suave">Buscar</span>
      <span className="meta text-tinta-suave">{rotuloDoAtalho("Mod-o", ehMac())}</span>
    </button>
  );
}
