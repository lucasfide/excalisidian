// Aba nova em branco (RF3.1). Oferece criar uma nota ou um desenho; a busca unificada
// (Ctrl+O / Ctrl+Shift+F, doc 13) entra na Fatia 8.

import { useEffect } from "react";
import { FilePlus, SquarePen } from "lucide-react";

import { comandoNovaNota, comandoNovoDesenho } from "../app/comandos/criacao";
import { usePapelParedeHomeStore } from "../estado/papel-parede-home-store";
import { Botao, EstadoVazio } from "../ui";

import "../ui/excalisidian/tela-inicio.css";
import "./painel-vazio.css";

export default function PainelVazio() {
  const papelParedeUrl = usePapelParedeHomeStore((s) => s.papelParedeUrl);
  const carregarPapelParede = usePapelParedeHomeStore((s) => s.carregar);

  useEffect(() => {
    void carregarPapelParede();
  }, [carregarPapelParede]);

  return (
    <div className="tela-inicio tela-inicio--vazio">
      {papelParedeUrl && (
        <img
          className="tela-inicio__imagem"
          src={papelParedeUrl}
          alt=""
          aria-hidden="true"
        />
      )}
      <div className="tela-inicio__vinheta" aria-hidden="true" />

      <div className="tela-inicio__rolagem">
        <div className="tela-inicio__conteudo">
          <EstadoVazio
            className="painel-vazio__estado"
            titulo="Aba em branco"
            apoio="Crie uma nota ou um desenho, ou escolha um arquivo na barra lateral."
          >
            <div className="painel-vazio__acoes">
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
      </div>
    </div>
  );
}
