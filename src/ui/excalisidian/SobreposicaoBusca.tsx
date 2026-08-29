// Base compartilhada do QuickSwitcher e da PaletaComandos (doc 06, inventário): campo grande
// (`campo-grande`, doc 06) + lista filtrada, navegável por teclado. Mesmo chrome de
// sobreposição do Dialog (backdrop, `surgir` 160ms, Escape fecha), mas sem título/rodapé —
// o campo É o conteúdo, e ↑/↓/Enter navegam a lista sem tirar o foco dele.

import { useEffect, useRef, useState, type ComponentType } from "react";

import { cn } from "../cn";
import Superficie from "../Superficie";
import Campo from "../Campo";

/** Compatível tanto com ícone do lucide-react quanto com IconeArquivo (que não é um
 * LucideIcon — tem `tipo` em vez de props de SVG). Só os três props que ItemLista passa. */
type ComponenteIcone = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
}>;

export interface ItemBusca {
  id: string;
  rotulo: string;
  detalhe?: string;
  Icone?: ComponenteIcone;
  /** Atalho de teclado do comando, mostrado em `meta` à direita (só PaletaComandos usa). */
  atalho?: string;
}

interface Props {
  tituloAcessivel: string;
  rotuloCampo: string;
  placeholder: string;
  valor: string;
  onValorMudar(v: string): void;
  itens: ItemBusca[];
  onEscolher(item: ItemBusca): void;
  onFechar(): void;
  mensagemVazio: string;
}

export default function SobreposicaoBusca({
  tituloAcessivel,
  rotuloCampo,
  placeholder,
  valor,
  onValorMudar,
  itens,
  onEscolher,
  onFechar,
  mensagemVazio,
}: Props) {
  const [indiceFoco, setIndiceFoco] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const anteriorRef = useRef<HTMLElement | null>(null);
  const listaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    anteriorRef.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => {
      anteriorRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A lista muda a cada tecla (novo filtro) — o item em foco sempre volta pro primeiro,
  // senão o índice antigo aponta pra um item que já não existe mais na lista filtrada.
  useEffect(() => {
    setIndiceFoco(0);
  }, [itens]);

  useEffect(() => {
    listaRef.current
      ?.querySelector<HTMLElement>(`[data-indice="${indiceFoco}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [indiceFoco]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onFechar();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndiceFoco((i) => (itens.length === 0 ? 0 : (i + 1) % itens.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndiceFoco((i) => (itens.length === 0 ? 0 : (i - 1 + itens.length) % itens.length));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = itens[indiceFoco];
      if (item) onEscolher(item);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-[color-mix(in_srgb,var(--color-tinta)_28%,transparent)] p-8 pt-[15vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <Superficie
        flutuante
        role="dialog"
        aria-modal
        aria-label={tituloAcessivel}
        className="motion-safe:animate-[surgir_160ms_var(--ease-caderno)] flex w-full max-w-lg flex-col gap-3 p-3"
      >
        <Campo
          ref={inputRef}
          rotulo={rotuloCampo}
          grande
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={valor}
          onChange={(e) => onValorMudar(e.target.value)}
          onKeyDown={onKeyDown}
        />

        {itens.length === 0 ? (
          <p className="px-1 py-4 text-center text-pequeno text-tinta-suave">
            {mensagemVazio}
          </p>
        ) : (
          <div ref={listaRef} role="listbox" className="flex max-h-80 flex-col gap-[1px] overflow-y-auto">
            {itens.map((item, i) => {
              const ativo = i === indiceFoco;
              return (
                <ItemLista
                  key={item.id}
                  item={item}
                  indice={i}
                  ativo={ativo}
                  onClick={() => onEscolher(item)}
                  onMouseEnter={() => setIndiceFoco(i)}
                />
              );
            })}
          </div>
        )}
      </Superficie>
    </div>
  );
}

function ItemLista({
  item,
  indice,
  ativo,
  onClick,
  onMouseEnter,
}: {
  item: ItemBusca;
  indice: number;
  ativo: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const Icone = item.Icone;
  return (
    <button
      type="button"
      role="option"
      aria-selected={ativo}
      data-indice={indice}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "flex w-full items-center gap-2 rounded-controle px-2 py-2 text-left text-[13px]",
        "transition-colors duration-[140ms] ease-caderno",
        ativo ? "bg-lavagem text-tinta" : "text-tinta-media",
      )}
    >
      {Icone && <Icone size={16} strokeWidth={1.5} className="shrink-0 text-tinta-suave" aria-hidden />}
      <div className="min-w-0 flex-1">
        <div className="truncate">{item.rotulo}</div>
        {item.detalhe && (
          <div className="meta truncate text-[9px] text-tinta-suave">{item.detalhe}</div>
        )}
      </div>
      {item.atalho && <span className="meta shrink-0 text-tinta-suave">{item.atalho}</span>}
    </button>
  );
}
