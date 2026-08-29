// Campo de texto (doc 06, inventário base: `Input` + `Label`). Rótulo sempre presente — o
// `id` liga os dois, e a mensagem de erro é anunciada por `aria-describedby`.

import { forwardRef, useId, type InputHTMLAttributes } from "react";

import { cn } from "./cn";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  rotulo: string;
  /** Mensagem de erro; quando presente, o campo fica em `bordo`. */
  erro?: string | null;
  /** Campo grande do quick switcher e da paleta de comandos (doc 06: `campo-grande`). */
  grande?: boolean;
}

// Ref encaminhada pro <input>: o QuickSwitcher/PaletaComandos precisam focar o campo na
// hora de abrir sem depender de autoFocus (que não refoca se o componente já está montado).
const Campo = forwardRef<HTMLInputElement, Props>(function Campo(
  { rotulo, erro, grande = false, className, ...resto },
  ref,
) {
  const id = useId();
  const idErro = `${id}-erro`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="meta text-tinta-suave">
        {rotulo}
      </label>
      <input
        {...resto}
        ref={ref}
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
});

export default Campo;
