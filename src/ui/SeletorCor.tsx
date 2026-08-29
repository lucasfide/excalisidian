// Seletor de cor (doc 06, inventário de produto): "grade de 5 cores, quadrados de 24px,
// `raio-controle`, selecionada com régua `musgo` de 2px embaixo". A régua embaixo — e não uma
// borda ao redor — é o que mantém a cor legível: uma borda comeria 1px do próprio swatch.
//
// `transparent` (o `fundo-nenhum` do canvas) é desenhado com uma hachura diagonal em `regua`,
// para não virar um quadrado invisível.

import { cn } from "./cn";

export interface CorSelecionavel {
  nome: string;
  hex: string;
}

interface Props {
  cores: ReadonlyArray<CorSelecionavel>;
  valor: string | undefined;
  onEscolher: (hex: string) => void;
  rotuloGrupo?: string;
  className?: string;
}

export default function SeletorCor({
  cores,
  valor,
  onEscolher,
  rotuloGrupo,
  className,
}: Props) {
  return (
    <div
      role="group"
      aria-label={rotuloGrupo}
      className={cn("flex gap-1", className)}
    >
      {cores.map((cor) => {
        // Comparação sem diferenciar maiúsculas: um elemento com hex em outra capitalização
        // (colado de fora, ou de uma versão antiga do app) precisa continuar acendendo o
        // quadradinho certo — bug real encontrado na revisão de contraste de 29/08/2026.
        const ativo = valor?.toLowerCase() === cor.hex.toLowerCase();
        const vazio = cor.hex === "transparent";
        return (
          <button
            key={cor.nome}
            title={cor.nome}
            aria-label={cor.nome}
            aria-pressed={ativo}
            onClick={() => onEscolher(cor.hex)}
            className="flex flex-col items-center gap-[2px]"
          >
            <span
              className="block h-6 w-6 rounded-controle border border-regua"
              style={{
                backgroundColor: vazio ? "var(--color-papel)" : cor.hex,
                backgroundImage: vazio
                  ? "repeating-linear-gradient(45deg, var(--color-regua) 0 2px, transparent 2px 5px)"
                  : undefined,
              }}
            />
            <span
              aria-hidden
              className={cn(
                "block h-[2px] w-6 rounded-pilula",
                ativo ? "bg-musgo" : "bg-transparent",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
