// Lista achatada de notas e desenhos por data de modificação (doc: ordenacao-arvore design,
// seção 6). Sem hierarquia de pasta, sem drag, sem criação por menu de contexto — não faz
// sentido numa lista sem posição estrutural pra soltar ou criar dentro.

import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { IconeArquivo } from "../index";
import { nomeExibicao } from "../../vault/arvore";
import { listaPorData, type ModoOrdenacao } from "../../vault/ordenacao";
import { useVaultStore } from "../../estado/vaultStore";

const ALTURA_LINHA = 44;

const formatadorData = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

interface Props {
  modo: Extract<ModoOrdenacao, "dateDesc" | "dateAsc">;
  onAbrirArquivo(path: string): void;
}

export default function ListaPorData({ modo, onAbrirArquivo }: Props) {
  const arvore = useVaultStore((s) => s.arvore);
  const indice = useVaultStore((s) => s.indice);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const itens = useMemo(
    () => (arvore ? listaPorData(arvore, modo, indice) : []),
    [arvore, modo, indice],
  );

  const virt = useVirtualizer({
    count: itens.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ALTURA_LINHA,
    overscan: 12,
  });

  return (
    <div ref={scrollRef} className="relative h-full overflow-auto">
      <div style={{ height: virt.getTotalSize(), position: "relative", width: "100%" }}>
        {virt.getVirtualItems().map((vi) => {
          const item = itens[vi.index];
          return (
            <button
              key={item.no.path}
              onClick={() => onAbrirArquivo(item.no.path)}
              className="absolute left-0 flex w-full flex-col gap-0.5 px-3 py-1 text-left transition-colors duration-[140ms] ease-caderno hover:bg-lavagem"
              style={{ top: vi.start, height: vi.size }}
            >
              <span className="flex items-center justify-between meta text-tinta-suave">
                <span className="truncate">{item.pastaExibicao || "raiz do vault"}</span>
                <span className="shrink-0">{formatadorData.format(new Date(item.mtimeMs))}</span>
              </span>
              <span className="flex items-center gap-2 text-[13px] text-tinta-media">
                <IconeArquivo tipo={item.no.tipo} className="shrink-0" />
                <span className="truncate">{nomeExibicao(item.no)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
