import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

interface Props {
  tituloAtivo: string;
  pausado: boolean;
  onAnterior(): void;
  onProximo(): void;
  onAlternarPausa(): void;
}

export default function ControlesPapelParede({
  tituloAtivo,
  pausado,
  onAnterior,
  onProximo,
  onAlternarPausa,
}: Props) {
  const rotuloPausa = pausado ? "Retomar troca automática" : "Pausar neste papel de parede";
  const IconePausa = pausado ? Play : Pause;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="truncate text-corpo text-tinta" title={tituloAtivo}>
          {tituloAtivo}
        </span>
        <span className="meta shrink-0 text-tinta-suave" aria-live="polite">
          {pausado ? "Pausado" : "A cada 10 min"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-controle border border-regua text-tinta-media transition-colors hover:bg-lavagem hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-musgo focus-visible:ring-offset-2 focus-visible:ring-offset-superficie"
          aria-label="Papel de parede anterior"
          title="Papel de parede anterior"
          onClick={onAnterior}
        >
          <ChevronLeft size={18} strokeWidth={1.5} aria-hidden />
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-controle border border-regua bg-transparent px-3 text-pequeno text-tinta transition-colors hover:bg-lavagem focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-musgo focus-visible:ring-offset-2 focus-visible:ring-offset-superficie"
          aria-label={rotuloPausa}
          title={rotuloPausa}
          aria-pressed={pausado}
          onClick={onAlternarPausa}
        >
          <IconePausa size={16} strokeWidth={1.5} aria-hidden />
          {pausado ? "Retomar" : "Pausar"}
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-controle border border-regua text-tinta-media transition-colors hover:bg-lavagem hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-musgo focus-visible:ring-offset-2 focus-visible:ring-offset-superficie"
          aria-label="Próximo papel de parede"
          title="Próximo papel de parede"
          onClick={onProximo}
        >
          <ChevronRight size={18} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
    </div>
  );
}
