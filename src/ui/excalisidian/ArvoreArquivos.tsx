// Árvore de arquivos da sidebar. Virtualizada, expandir/recolher, clique abre. Pasta clicada
// vira a "pasta selecionada" (onde as ações de criar agem). Menu de contexto: criar aqui /
// renomear.

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FilePlus, SquarePen, FolderPlus, Pencil } from "lucide-react";

import type { NoArvore } from "../../vault/arvore";
import { Menu, ItemMenu, SeparadorMenu, type PosicaoMenu } from "../index";
import ItemArvore from "./ItemArvore";

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

/** Pasta de um nó: a própria, se for pasta; senão a pasta que o contém. */
function pastaDoNo(no: NoArvore): string {
  if (no.tipo === "folder") return no.path;
  const i = no.path.lastIndexOf("/");
  return i === -1 ? "" : no.path.slice(0, i);
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
  onCriarNota(dir: string): void;
  onCriarDesenho(dir: string): void;
  onCriarPasta(dir: string): void;
}

type EstadoMenu = (PosicaoMenu & { no: NoArvore }) | null;

export default function ArvoreArquivos({
  raiz,
  pastasAbertas,
  pastaSelecionada,
  caminhoAberto,
  onAlternarPasta,
  onSelecionarPasta,
  onAbrirArquivo,
  onRenomear,
  onCriarNota,
  onCriarDesenho,
  onCriarPasta,
}: Props) {
  const linhas = useMemo(
    () => achatar(raiz, pastasAbertas),
    [raiz, pastasAbertas],
  );
  const [menu, setMenu] = useState<EstadoMenu>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virt = useVirtualizer({
    count: linhas.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 26,
    overscan: 12,
  });

  const fecharMenu = () => setMenu(null);
  const comMenuFechado = (acao: () => void) => () => {
    fecharMenu();
    acao();
  };

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <div style={{ height: virt.getTotalSize(), position: "relative", width: "100%" }}>
        {virt.getVirtualItems().map((vi) => {
          const { no, nivel, aberta } = linhas[vi.index];
          const destacado =
            no.path === caminhoAberto ||
            (no.tipo === "folder" && no.path === pastaSelecionada);
          return (
            <ItemArvore
              key={no.path}
              no={no}
              nivel={nivel}
              aberta={aberta}
              destacado={destacado}
              style={{ top: vi.start, height: vi.size }}
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
            />
          );
        })}
      </div>

      {menu && (
        <Menu posicao={menu} onFechar={fecharMenu}>
          <ItemMenu
            Icone={FilePlus}
            rotulo="Nova nota aqui"
            onClick={comMenuFechado(() => onCriarNota(pastaDoNo(menu.no)))}
          />
          <ItemMenu
            Icone={SquarePen}
            rotulo="Novo desenho aqui"
            onClick={comMenuFechado(() => onCriarDesenho(pastaDoNo(menu.no)))}
          />
          <ItemMenu
            Icone={FolderPlus}
            rotulo="Nova pasta aqui"
            onClick={comMenuFechado(() => onCriarPasta(pastaDoNo(menu.no)))}
          />
          <SeparadorMenu />
          <ItemMenu
            Icone={Pencil}
            rotulo="Renomear"
            onClick={comMenuFechado(() => onRenomear(menu.no.path))}
          />
        </Menu>
      )}
    </div>
  );
}
