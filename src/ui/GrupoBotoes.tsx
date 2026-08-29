// Grupo de botões segmentado: uma escolha entre N opções curtas. Usado no painel de
// propriedades do canvas (espessura, estilo de linha, imperfeição, opacidade, tamanho) e
// pensado para servir também às preferências (Fatia 8).

import { cn } from "./cn";

export interface OpcaoGrupo<T> {
  rotulo: string;
  valor: T;
}

interface Props<T extends string | number> {
  opcoes: ReadonlyArray<OpcaoGrupo<T>>;
  valor: T | undefined;
  onEscolher: (valor: T) => void;
  /** Rótulo acessível do grupo, já que os botões são só abreviações. */
  rotuloGrupo?: string;
  className?: string;
}

export default function GrupoBotoes<T extends string | number>({
  opcoes,
  valor,
  onEscolher,
  rotuloGrupo,
  className,
}: Props<T>) {
  return (
    <div
      role="group"
      aria-label={rotuloGrupo}
      className={cn("flex flex-wrap gap-1", className)}
    >
      {opcoes.map((opcao) => {
        const ativo = valor === opcao.valor;
        return (
          <button
            key={String(opcao.valor)}
            aria-pressed={ativo}
            onClick={() => onEscolher(opcao.valor)}
            className={cn(
              "rounded-controle border px-2 py-1 text-[11px]",
              "transition-colors duration-[140ms] ease-caderno",
              ativo
                ? "border-musgo bg-musgo text-superficie"
                : "border-regua-forte text-tinta hover:bg-lavagem",
            )}
          >
            {opcao.rotulo}
          </button>
        );
      })}
    </div>
  );
}
