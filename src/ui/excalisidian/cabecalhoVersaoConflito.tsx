// Cabeçalho de uma coluna de versão em conflito ("Nesta máquina" / "Em {dispositivo}" +
// data), compartilhado entre ComparadorNotas e ComparadorDesenhos (task-6) — os dois mostram
// exatamente a mesma informação sobre cada versão, só o corpo abaixo muda (diff de texto vs.
// duas telas do Excalidraw).

import type { VersaoEmConflito } from "../../sync/tipos";

export function formatarData(versao: VersaoEmConflito, tagLocale: string): string {
  return new Intl.DateTimeFormat(tagLocale, { dateStyle: "short", timeStyle: "short" }).format(
    new Date(versao.mtimeMs),
  );
}

export function CabecalhoColuna({ rotulo, data }: { rotulo: string; data: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-pequeno font-medium text-tinta">{rotulo}</div>
      <div className="meta text-tinta-suave">{data}</div>
    </div>
  );
}
