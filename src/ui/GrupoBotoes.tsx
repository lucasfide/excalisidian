// Grupo de botões segmentado: uma escolha entre N opções curtas. Usado no painel de
// propriedades do canvas (espessura, estilo de linha, imperfeição, opacidade, tamanho) e
// pensado para servir também às preferências (Fatia 8).

import { cn } from "./cn";

export interface OpcaoGrupo<T> {
  rotulo: string;
  valor: T;
}

export type VarianteGrupoBotoes = "solto" | "segmentado";

interface Props<T extends string | number> {
  opcoes: ReadonlyArray<OpcaoGrupo<T>>;
  valor: T | undefined;
  onEscolher: (valor: T) => void;
  /** Rótulo acessível do grupo, já que os botões são só abreviações. */
  rotuloGrupo?: string;
  className?: string;
  /** `solto` (padrão) é o visual original: botões soltos com borda própria, usado no painel de
   * propriedades do canvas. `segmentado` é um único controle com trilho — usado nas
   * Configurações (tema, largura da nota, idioma). */
  variante?: VarianteGrupoBotoes;
}

export default function GrupoBotoes<T extends string | number>({
  opcoes,
  valor,
  onEscolher,
  rotuloGrupo,
  className,
  variante = "solto",
}: Props<T>) {
  const segmentado = variante === "segmentado";
  return (
    <div
      role="group"
      aria-label={rotuloGrupo}
      className={cn(
        segmentado
          ? "inline-flex gap-1 rounded-controle border border-regua-forte p-1"
          : "flex flex-wrap gap-1",
        className,
      )}
    >
      {opcoes.map((opcao) => {
        const ativo = valor === opcao.valor;
        return (
          <button
            key={String(opcao.valor)}
            aria-pressed={ativo}
            onClick={() => onEscolher(opcao.valor)}
            className={cn(
              "transition-colors duration-[140ms] ease-caderno",
              segmentado
                ? cn(
                    "h-[26px] rounded-controle px-3 text-pequeno",
                    ativo
                      ? "bg-cristal text-superficie"
                      : "text-tinta-media hover:bg-lavagem hover:text-tinta",
                  )
                : cn(
                    "rounded-controle border px-2 py-1 text-[11px]",
                    ativo
                      ? "border-cristal bg-cristal text-superficie"
                      : "border-regua-forte text-tinta hover:bg-lavagem",
                  ),
            )}
          >
            {opcao.rotulo}
          </button>
        );
      })}
    </div>
  );
}
