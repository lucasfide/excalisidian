// Estado vazio (doc 06): "nunca é só texto centralizado — é um bloco com hairline superior e
// inferior, título em `titulo-2`, uma linha de apoio em `pequeno` e um botão primário".
// A voz é convite, não constatação (doc 06, "Voz da interface").

import type { ReactNode } from "react";

import { cn } from "./cn";

interface Props {
  titulo: string;
  apoio?: string;
  /** Botões de ação. Convenção: o primeiro é o primário. */
  children?: ReactNode;
  /** Erro usa a hairline em `bordo` em vez de `regua`. */
  tom?: "neutro" | "erro";
  className?: string;
}

export default function EstadoVazio({
  titulo,
  apoio,
  children,
  tom = "neutro",
  className,
}: Props) {
  return (
    <div
      className={cn(
        "border-y py-8",
        tom === "erro" ? "border-bordo" : "border-regua",
        className,
      )}
    >
      <h2
        className={cn(
          "font-display text-[19px] font-medium leading-[1.3]",
          tom === "erro" ? "text-bordo" : "text-tinta",
        )}
      >
        {titulo}
      </h2>
      {apoio && (
        <p className="mt-1 text-pequeno text-tinta-media [text-wrap:pretty]">
          {apoio}
        </p>
      )}
      {children && <div className="mt-4 flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
