import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { BotaoIcone } from "../index";
import type { ImagemAnexo } from "../../vault/galeria-anexos";

interface Props {
  imagem: ImagemAnexo;
  url: string;
  indice: number;
  total: number;
  onFechar(): void;
  onAnterior(): void;
  onProxima(): void;
}

export default function VisualizadorImagem({
  imagem,
  url,
  indice,
  total,
  onFechar,
  onAnterior,
  onProxima,
}: Props) {
  const imagemRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    imagemRef.current?.focus();
  }, [imagem.path]);

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.preventDefault();
        onFechar();
      } else if (evento.key === "ArrowLeft") {
        evento.preventDefault();
        onAnterior();
      } else if (evento.key === "ArrowRight") {
        evento.preventDefault();
        onProxima();
      } else if (evento.key === "Home") {
        evento.preventDefault();
        if (indice !== 0) onAnterior();
      } else if (evento.key === "End") {
        evento.preventDefault();
        if (indice !== total - 1) onProxima();
      }
    };

    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [indice, onAnterior, onFechar, onProxima, total]);

  return (
    <div
      className="galeria-anexos__viewer motion-safe:animate-[galeria-anexos-aparecer_180ms_var(--ease-caderno)_both] motion-reduce:animate-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Visualizando ${imagem.nome}`}
      onMouseDown={(evento) => {
        const alvo = evento.target as HTMLElement;
        if (!alvo.closest("img, button")) onFechar();
      }}
    >
      <div className="galeria-anexos__viewer-barra">
        <div className="min-w-0">
          <p className="truncate text-corpo text-tinta">{imagem.nome}</p>
          <p className="meta truncate text-tinta-suave">
            {indice + 1} de {total}
          </p>
        </div>
        <BotaoIcone Icone={X} titulo="Fechar visualização" onClick={onFechar} />
      </div>

      <div className="galeria-anexos__viewer-conteudo">
        {total > 1 && (
          <BotaoIcone
            Icone={ChevronLeft}
            titulo="Imagem anterior"
            className="galeria-anexos__navegacao"
            onClick={onAnterior}
          />
        )}

        <img
          ref={imagemRef}
          src={url}
          alt={imagem.nome}
          tabIndex={-1}
          className="galeria-anexos__imagem-completa"
        />

        {total > 1 && (
          <BotaoIcone
            Icone={ChevronRight}
            titulo="Próxima imagem"
            className="galeria-anexos__navegacao"
            onClick={onProxima}
          />
        )}
      </div>
    </div>
  );
}
