// Árvore de arquivos da sidebar (Fatia 1): virtualizada, expandir/recolher, clique abre.
// Sem arrastar e sem menu de contexto ainda (Fatia 3+). Doc 06: recuo de 16px por nível,
// hairline vertical em musgo de 2px no item ativo, ícone por tipo.

import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  FileText,
  PenLine,
  Image as ImageIcon,
  Folder,
  FolderOpen,
} from "lucide-react";

import type { NoArvore } from "../../vault/arvore";

interface LinhaVisivel {
  no: NoArvore;
  nivel: number;
  aberta: boolean;
}

function achatar(
  raiz: NoArvore,
  pastasAbertas: Set<string>,
): LinhaVisivel[] {
  const linhas: LinhaVisivel[] = [];
  const visitar = (nos: NoArvore[], nivel: number) => {
    for (const no of nos) {
      const aberta = pastasAbertas.has(no.path);
      linhas.push({ no, nivel, aberta });
      if (no.tipo === "folder" && aberta) visitar(no.filhos, nivel + 1);
    }
  };
  visitar(raiz.filhos, 0);
  return linhas;
}

function Icone({ no, aberta }: { no: NoArvore; aberta: boolean }) {
  const props = { size: 16, strokeWidth: 1.5, className: "shrink-0" };
  if (no.tipo === "folder")
    return aberta ? <FolderOpen {...props} /> : <Folder {...props} />;
  if (no.tipo === "drawing") return <PenLine {...props} />;
  if (no.tipo === "attachment") return <ImageIcon {...props} />;
  return <FileText {...props} />;
}

interface Props {
  raiz: NoArvore;
  pastasAbertas: Set<string>;
  caminhoAberto: string | null;
  onAlternarPasta(path: string): void;
  onAbrirArquivo(path: string): void;
  /** Menu de contexto mínimo (RF4.4 completo pendente): por ora só renomear. */
  onRenomear(path: string): void;
}

export default function ArvoreArquivos({
  raiz,
  pastasAbertas,
  caminhoAberto,
  onAlternarPasta,
  onAbrirArquivo,
  onRenomear,
}: Props) {
  const linhas = useMemo(
    () => achatar(raiz, pastasAbertas),
    [raiz, pastasAbertas],
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virt = useVirtualizer({
    count: linhas.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 26,
    overscan: 12,
  });

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <div
        style={{ height: virt.getTotalSize(), position: "relative", width: "100%" }}
      >
        {virt.getVirtualItems().map((vi) => {
          const { no, nivel, aberta } = linhas[vi.index];
          const ativo = no.path === caminhoAberto;
          return (
            <button
              key={no.path}
              onClick={() =>
                no.tipo === "folder"
                  ? onAlternarPasta(no.path)
                  : onAbrirArquivo(no.path)
              }
              onContextMenu={(e) => {
                if (no.tipo === "folder") return;
                e.preventDefault();
                onRenomear(no.path);
              }}
              className={`absolute left-0 flex w-full items-center gap-2 py-1 pr-2 text-left text-[13px] ${
                ativo
                  ? "bg-lavagem text-tinta"
                  : "text-tinta-media hover:bg-lavagem"
              }`}
              style={{
                top: vi.start,
                height: vi.size,
                paddingLeft: 8 + nivel * 16,
                boxShadow: ativo
                  ? "inset 2px 0 0 0 var(--color-musgo)"
                  : undefined,
              }}
            >
              <Icone no={no} aberta={aberta} />
              <span className="truncate">{no.nome}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
