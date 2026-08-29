// Árvore de arquivos da sidebar. Virtualizada, expandir/recolher, clique abre. Pasta
// clicada vira a "pasta selecionada" (onde as ações de criar agem). Menu de contexto:
// criar aqui / renomear. Doc 06: recuo de 16px por nível, hairline musgo de 2px no item
// ativo/selecionado, ícone por tipo.

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  FileText,
  PenLine,
  Image as ImageIcon,
  Folder,
  FolderOpen,
  FilePlus,
  SquarePen,
  FolderPlus,
  Pencil,
} from "lucide-react";

import type { NoArvore } from "../../vault/arvore";
import { criarNota, criarDesenho, criarPasta } from "../../vault/criar";

interface LinhaVisivel {
  no: NoArvore;
  nivel: number;
  aberta: boolean;
}

function achatar(raiz: NoArvore, pastasAbertas: Set<string>): LinhaVisivel[] {
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
  pastaSelecionada: string | null;
  caminhoAberto: string | null;
  onAlternarPasta(path: string): void;
  onSelecionarPasta(path: string | null): void;
  onAbrirArquivo(path: string): void;
  onRenomear(path: string): void;
}

type Menu = { x: number; y: number; no: NoArvore } | null;

export default function ArvoreArquivos({
  raiz,
  pastasAbertas,
  pastaSelecionada,
  caminhoAberto,
  onAlternarPasta,
  onSelecionarPasta,
  onAbrirArquivo,
  onRenomear,
}: Props) {
  const linhas = useMemo(
    () => achatar(raiz, pastasAbertas),
    [raiz, pastasAbertas],
  );
  const [menu, setMenu] = useState<Menu>(null);

  useEffect(() => {
    if (!menu) return;
    const fechar = () => setMenu(null);
    window.addEventListener("click", fechar);
    window.addEventListener("blur", fechar);
    return () => {
      window.removeEventListener("click", fechar);
      window.removeEventListener("blur", fechar);
    };
  }, [menu]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virt = useVirtualizer({
    count: linhas.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 26,
    overscan: 12,
  });

  const dirDoNo = (no: NoArvore) =>
    no.tipo === "folder"
      ? no.path
      : no.path.includes("/")
        ? no.path.slice(0, no.path.lastIndexOf("/"))
        : "";

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <div style={{ height: virt.getTotalSize(), position: "relative", width: "100%" }}>
        {virt.getVirtualItems().map((vi) => {
          const { no, nivel, aberta } = linhas[vi.index];
          const ativo = no.path === caminhoAberto;
          const selecionada = no.tipo === "folder" && no.path === pastaSelecionada;
          return (
            <button
              key={no.path}
              onClick={() => {
                if (no.tipo === "folder") {
                  onAlternarPasta(no.path);
                  onSelecionarPasta(no.path);
                } else {
                  onAbrirArquivo(no.path);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, no });
              }}
              className={`absolute left-0 flex w-full items-center gap-2 py-1 pr-2 text-left text-[13px] ${
                ativo || selecionada
                  ? "bg-lavagem text-tinta"
                  : "text-tinta-media hover:bg-lavagem"
              }`}
              style={{
                top: vi.start,
                height: vi.size,
                paddingLeft: 8 + nivel * 16,
                boxShadow:
                  ativo || selecionada
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

      {menu && (
        <div
          className="fixed z-50 min-w-[180px] rounded-ficha border border-regua bg-superficie py-1 shadow-[var(--shadow-sobreposicao)]"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.no.tipo === "folder" && (
            <>
              <ItemMenu
                Icone={FilePlus}
                rotulo="Nova nota aqui"
                onClick={() => {
                  setMenu(null);
                  void criarNota(dirDoNo(menu.no));
                }}
              />
              <ItemMenu
                Icone={SquarePen}
                rotulo="Novo desenho aqui"
                onClick={() => {
                  setMenu(null);
                  void criarDesenho(dirDoNo(menu.no));
                }}
              />
              <ItemMenu
                Icone={FolderPlus}
                rotulo="Nova pasta aqui"
                onClick={() => {
                  setMenu(null);
                  void criarPasta(dirDoNo(menu.no));
                }}
              />
              <div className="my-1 h-px bg-regua" />
            </>
          )}
          <ItemMenu
            Icone={Pencil}
            rotulo="Renomear"
            onClick={() => {
              setMenu(null);
              onRenomear(menu.no.path);
            }}
          />
        </div>
      )}
    </div>
  );
}

function ItemMenu({
  Icone,
  rotulo,
  onClick,
}: {
  Icone: typeof FilePlus;
  rotulo: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-tinta hover:bg-lavagem"
    >
      <Icone size={15} strokeWidth={1.5} className="text-tinta-media" />
      {rotulo}
    </button>
  );
}
