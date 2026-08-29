// Campo de texto (doc 06, inventário base: `Input` + `Label`). Rótulo sempre presente — o
// `id` liga os dois, e a mensagem de erro é anunciada por `aria-describedby`.

import { useId, type InputHTMLAttributes } from "react";

import { cn } from "./cn";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  rotulo: string;
  /** Mensagem de erro; quando presente, o campo fica em `bordo`. */
  erro?: string | null;
  /** Campo grande do quick switcher e da paleta de comandos (doc 06: `campo-grande`). */
  grande?: boolean;
}

export default function Campo({
  rotulo,
  erro,
  grande = false,
  className,
  ...resto
}: Props) {
  const id = useId();
  const idErro = `${id}-erro`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="meta text-tinta-suave">
        {rotulo}
      </label>
      <input
        {...resto}
        id={id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? idErro : undefined}
        className={cn(
          "w-full rounded-controle border bg-superficie text-tinta",
          "placeholder:text-tinta-suave",
          "transition-colors duration-[140ms] ease-caderno",
          "disabled:pointer-events-none disabled:opacity-50",
          erro ? "border-bordo" : "border-regua-forte",
          grande ? "h-11 px-3 text-[17px]" : "h-9 px-2 text-corpo",
          className,
        )}
      />
      {erro && (
        <p id={idErro} className="text-pequeno text-bordo">
          {erro}
        </p>
      )}
    </div>
  );
}
