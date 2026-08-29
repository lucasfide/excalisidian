// Aba nova em branco (RF3.1). Oferece criar uma nota ou um desenho; o quick switcher e a
// busca entram na Fatia 8.

import { FilePlus, SquarePen } from "lucide-react";

import { criarNota, criarDesenho } from "../vault/criar";

export default function PainelVazio() {
  return (
    <div className="flex h-full items-center justify-center bg-papel px-8">
      <div className="w-full max-w-sm border-y border-regua py-8 text-center">
        <h2 className="font-display text-[19px] font-medium text-tinta">
          Aba em branco
        </h2>
        <p className="mt-1 text-pequeno text-tinta-media">
          Crie uma nota ou um desenho, ou escolha um arquivo na barra lateral.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => void criarNota()}
            className="flex items-center gap-2 rounded-controle bg-musgo px-4 py-2 text-corpo text-superficie"
          >
            <FilePlus size={16} strokeWidth={1.5} />
            Nova nota
          </button>
          <button
            onClick={() => void criarDesenho()}
            className="flex items-center gap-2 rounded-controle border border-regua-forte px-4 py-2 text-corpo text-tinta"
          >
            <SquarePen size={16} strokeWidth={1.5} />
            Novo desenho
          </button>
        </div>
      </div>
    </div>
  );
}
