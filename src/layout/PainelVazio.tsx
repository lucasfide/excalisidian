// Aba nova em branco (RF3.1). Oferece criar uma nota ou um desenho; a busca unificada
// (Ctrl+O / Ctrl+Shift+F, doc 13) entra na Fatia 8.

import { useEffect } from "react";
import { FilePlus, SquarePen } from "lucide-react";

import { ehMac, rotuloDoAtalho } from "../app/glossario/teclas";
import { comandoNovaNota, comandoNovoDesenho } from "../app/comandos/criacao";
import { usePapelParedeHomeStore } from "../estado/papel-parede-home-store";
import { usePrefsStore } from "../estado/prefsStore";
import { Botao, EstadoVazio } from "../ui";
import AsciiPeaks from "../ui/excalisidian/AsciiPeaks";

import "../ui/excalisidian/tela-inicio.css";
import "./painel-vazio.css";

export default function PainelVazio() {
  const papelParedeUrl = usePapelParedeHomeStore((s) => s.papelParedeUrl);
  const carregarPapelParede = usePapelParedeHomeStore((s) => s.carregar);
  // Preferência global (doc 09 ADR-28) — o botão "Desabilitar shaders" mora só no rodapé da
  // Home (TelaInicio.tsx), mas desliga o efeito aqui também: é o mesmo shader nas duas telas.
  const asciiPeaksHabilitado = usePrefsStore((s) => s.asciiPeaksHabilitado);

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
      {asciiPeaksHabilitado && <AsciiPeaks />}

      <div className="tela-inicio__rolagem">
        <div className="tela-inicio__conteudo">
          <EstadoVazio
            className="painel-vazio__estado"
            titulo="Aba em branco"
            apoio="Crie uma nota ou um desenho, ou escolha um arquivo na barra lateral."
          >
            <div className="painel-vazio__acoes">
              <div className="flex flex-col items-center gap-1">
                <Botao
                  variante="primario"
                  Icone={FilePlus}
                  onClick={() => void comandoNovaNota()}
                  className="w-full"
                >
                  Nova nota
                </Botao>
                <span className="meta text-tinta-suave">{rotuloDoAtalho("Mod-t", ehMac())}</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Botao
                  Icone={SquarePen}
                  onClick={() => void comandoNovoDesenho()}
                  className="w-full"
                >
                  Novo desenho
                </Botao>
                <span className="meta text-tinta-suave">{rotuloDoAtalho("Mod-d", ehMac())}</span>
              </div>
            </div>
          </EstadoVazio>
        </div>
      </div>
    </div>
  );
}
