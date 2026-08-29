// Aba nova em branco (RF3.1). Oferece criar uma nota ou um desenho; o quick switcher e a
// busca entram na Fatia 8.

import { FilePlus, SquarePen } from "lucide-react";

import { comandoNovaNota, comandoNovoDesenho } from "../app/comandos/criacao";
import { Botao, EstadoVazio } from "../ui";

export default function PainelVazio() {
  return (
    <div className="flex h-full items-center justify-center bg-papel px-8">
      <EstadoVazio
        className="w-full max-w-sm text-center"
        titulo="Aba em branco"
        apoio="Crie uma nota ou um desenho, ou escolha um arquivo na barra lateral."
      >
        <div className="flex w-full justify-center gap-2">
          <Botao
            variante="primario"
            Icone={FilePlus}
            onClick={() => void comandoNovaNota()}
          >
            Nova nota
          </Botao>
          <Botao Icone={SquarePen} onClick={() => void comandoNovoDesenho()}>
            Novo desenho
          </Botao>
        </div>
      </EstadoVazio>
    </div>
  );
}
