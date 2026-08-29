// Árvore de arquivos da sidebar. Virtualizada, expandir/recolher, clique abre, arrastar um
// arquivo para mover de pasta. Menu de contexto: criar aqui / renomear.
//
// Arrastar é por EVENTOS DE PONTEIRO, não `draggable` nativo do HTML5: o Drag-and-Drop HTML5
// nativo tem histórico de falhar dentro do WebView2 do Tauri (foi o que quebrou o arrastar de
// abas do dockview — ver Workspace.tsx). Reimplementar isso aqui com a mesma API arriscaria
// herdar o mesmo bug.

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FilePlus, SquarePen, FolderPlus, Pencil, Home, Move } from "lucide-react";

import type { NoArvore } from "../../vault/arvore";
import { pastaDe } from "../../vault/caminhos";
import { Menu, ItemMenu, SeparadorMenu, type PosicaoMenu, cn } from "../index";
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
  return no.tipo === "folder" ? no.path : pastaDe(no.path);
}

interface Props {
  raiz: NoArvore;
  pastasAbertas: Set<string>;
  caminhoAberto: string | null;
  onAlternarPasta(path: string): void;
  onAbrirArquivo(path: string): void;
  onRenomear(path: string): void;
  onCriarNota(dir: string): void;
  onCriarDesenho(dir: string): void;
  onCriarPasta(dir: string): void;
  onMoverArquivo(path: string, dirDestino: string): void;
  /** Equivalente por menu de arrastar (doc 06, piso de qualidade) — só faz sentido pra
   * arquivo, mover pasta inteira está fora do escopo (vault/mover.ts). */
  onMoverPara(path: string): void;
}

type EstadoMenu = (PosicaoMenu & { no: NoArvore }) | null;

/** `null` = nenhum alvo válido sob o cursor; `""` = raiz. */
type AlvoArrasto = string | null;

interface EstadoArrasto {
  path: string;
  nome: string;
  x: number;
  y: number;
  alvo: AlvoArrasto;
}

const ALTURA_LINHA = 26;
const ALTURA_RAIZ = 32;

export default function ArvoreArquivos({
  raiz,
  pastasAbertas,
  caminhoAberto,
  onAlternarPasta,
  onAbrirArquivo,
  onRenomear,
  onCriarNota,
  onCriarDesenho,
  onCriarPasta,
  onMoverArquivo,
  onMoverPara,
}: Props) {
  const linhas = useMemo(
    () => achatar(raiz, pastasAbertas),
    [raiz, pastasAbertas],
  );
  const [menu, setMenu] = useState<EstadoMenu>(null);
  const [arraste, setArraste] = useState<EstadoArrasto | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const arrastoRef = useRef<{
    path: string;
    nome: string;
    origem: string;
    startX: number;
    startY: number;
    engajado: boolean;
    alvo: AlvoArrasto;
  } | null>(null);

  const virt = useVirtualizer({
    count: linhas.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ALTURA_LINHA,
    overscan: 12,
  });

  // Rola até o arquivo da aba ativa quando ele aparece na lista — inclusive na primeira vez
  // que aparece, por causa das pastas ancestrais que acabaram de abrir (App.tsx chama
  // `garantirAncestraisAbertos`, o que muda `linhas` e dispara este efeito de novo).
  useEffect(() => {
    if (!caminhoAberto) return;
    const indice = linhas.findIndex((l) => l.no.path === caminhoAberto);
    if (indice !== -1) virt.scrollToIndex(indice, { align: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caminhoAberto, linhas]);

  const fecharMenu = () => setMenu(null);
  const comMenuFechado = (acao: () => void) => () => {
    fecharMenu();
    acao();
  };

  const acharAlvo = (clientY: number): AlvoArrasto => {
    const rect = scrollRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const y = clientY - rect.top + (scrollRef.current?.scrollTop ?? 0);
    const totalArvore = virt.getTotalSize();
    if (y >= totalArvore && y < totalArvore + ALTURA_RAIZ) return "";
    const item = virt
      .getVirtualItems()
      .find((vi) => y >= vi.start && y < vi.start + vi.size);
    if (!item) return null;
    const { no } = linhas[item.index];
    return no.tipo === "folder" ? no.path : null;
  };

  const iniciarArrasto = (e: React.PointerEvent, no: NoArvore) => {
    if (no.tipo === "folder" || e.button !== 0) return;
    const origem = pastaDe(no.path);

    arrastoRef.current = {
      path: no.path,
      nome: no.nome,
      origem,
      startX: e.clientX,
      startY: e.clientY,
      engajado: false,
      alvo: null,
    };

    const aoMover = (ev: PointerEvent) => {
      const info = arrastoRef.current;
      if (!info) return;
      if (!info.engajado) {
        const dist = Math.hypot(ev.clientX - info.startX, ev.clientY - info.startY);
        if (dist < 4) return;
        info.engajado = true;
      }
      let alvo = acharAlvo(ev.clientY);
      if (alvo === info.origem) alvo = null; // soltar na própria pasta não faz nada
      info.alvo = alvo;
      setArraste({ path: info.path, nome: info.nome, x: ev.clientX, y: ev.clientY, alvo });
    };

    const aoSoltar = () => {
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
      window.removeEventListener("keydown", aoTeclar, true);
      const info = arrastoRef.current;
      arrastoRef.current = null;
      setArraste(null);
      if (info?.engajado && info.alvo !== null) {
        onMoverArquivo(info.path, info.alvo);
      }
    };

    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") aoSoltar();
    };

    window.addEventListener("pointermove", aoMover);
    window.addEventListener("pointerup", aoSoltar);
    window.addEventListener("keydown", aoTeclar, true);
  };

  return (
    <div ref={scrollRef} className="relative h-full overflow-auto">
      <div
        style={{ height: virt.getTotalSize(), position: "relative", width: "100%" }}
      >
        {virt.getVirtualItems().map((vi) => {
          const { no, nivel, aberta } = linhas[vi.index];
          const destacado = no.path === caminhoAberto;
          return (
            <ItemArvore
              key={no.path}
              no={no}
              nivel={nivel}
              aberta={aberta}
              destacado={destacado}
              alvoDeArrasto={arraste?.alvo === no.path}
              style={{ top: vi.start, height: vi.size }}
              onPointerDown={(e) => iniciarArrasto(e, no)}
              onClick={() => {
                if (no.tipo === "folder") {
                  onAlternarPasta(no.path);
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

      {/* Alvo explícito para "voltar pra raiz" — sem depender de acertar um vazio ambíguo. */}
      <div
        style={{ height: ALTURA_RAIZ }}
        className={cn(
          "flex items-center gap-2 border-t border-regua px-3 text-[12px] text-tinta-suave",
          arraste?.alvo === "" && "bg-[color-mix(in_srgb,var(--color-musgo)_12%,transparent)]",
        )}
      >
        <Home size={14} strokeWidth={1.5} />
        raiz do vault
      </div>

      {arraste && (
        <div
          className="pointer-events-none fixed z-50 rounded-controle border border-regua-forte bg-superficie px-2 py-1 text-[12px] text-tinta shadow-[var(--shadow-sobreposicao)]"
          style={{ left: arraste.x + 12, top: arraste.y + 12 }}
        >
          {arraste.nome}
        </div>
      )}

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
          {menu.no.tipo !== "folder" && (
            <ItemMenu
              Icone={Move}
              rotulo="Mover para…"
              onClick={comMenuFechado(() => onMoverPara(menu.no.path))}
            />
          )}
        </Menu>
      )}
    </div>
  );
}
