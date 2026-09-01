// Campo de link do elemento selecionado, com autocomplete de notas do vault (RF5.12) — a
// única peça de UI própria que sobra no canvas depois da migração pra UI nativa do Excalidraw
// (doc 09, ADR de migração). O popup nativo de link (Ctrl+K) é um `<input>` cru, sem gancho
// público pra injetar autocomplete (confirmado no pacote instalado) — por isso este painel,
// montado via `renderTopRightUI` (slot público, canto superior direito, não esconde nada
// nativo). Extraído quase igual do antigo `CampoLink` de `PropriedadesCanvas.tsx`.

import { useState, useRef, useMemo, useEffect } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { Campo, Superficie } from "../index";
import IconeArquivo from "../IconeArquivo";
import { buscarSugestoesLink, type SugestaoLink } from "../../indice/sugestoesLink";

interface Props {
  api: ExcalidrawImperativeAPI;
  elemento: ExcalidrawElement;
}

/** Chave por `elemento.id` (no chamador): reinicia o valor local ao trocar de seleção. */
export default function LinkDoElemento({ api, elemento }: Props) {
  const [valor, setValor] = useState((elemento as { link?: string | null }).link ?? "");
  const [aberto, setAberto] = useState(false);
  const [indiceFoco, setIndiceFoco] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const sugestoes = useMemo(() => {
    if (!aberto) return [];
    return buscarSugestoesLink(valor, 8);
  }, [valor, aberto]);

  const aplicar = (novoValor: string) => {
    const limpo = novoValor.trim();
    const elementos = api
      .getSceneElements()
      .map((el) => (el.id === elemento.id ? { ...el, link: limpo || null } : el));
    api.updateScene({ elements: elementos as never });
  };

  const selecionarSugestao = (sug: SugestaoLink) => {
    const formatado = `[[${sug.alvo}]]`;
    setValor(formatado);
    aplicar(formatado);
    setAberto(false);
  };

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    const aoClicarFora = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    };
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (aberto && sugestoes.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndiceFoco((i) => (i + 1) % sugestoes.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndiceFoco((i) => (i - 1 + sugestoes.length) % sugestoes.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selecionarSugestao(sugestoes[indiceFoco]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setAberto(false);
        return;
      }
    }

    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  return (
    <Superficie flutuante className="pointer-events-auto relative w-64 p-2">
      <div ref={containerRef}>
        <Campo
          rotulo="Link"
          placeholder="[[Nota]] ou URL"
          value={valor}
          onChange={(e) => {
            setValor(e.target.value);
            setAberto(true);
            setIndiceFoco(0);
          }}
          onFocus={() => {
            setAberto(true);
            setIndiceFoco(0);
          }}
          onBlur={() => {
            setTimeout(() => {
              aplicar(valor);
            }, 150);
          }}
          onKeyDown={onKeyDown}
        />

        {aberto && sugestoes.length > 0 && (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-56 overflow-y-auto rounded-ficha border border-regua bg-superficie p-1 shadow-sobreposicao">
            {sugestoes.map((s, idx) => {
              const tipoNo =
                s.tipo === "desenho"
                  ? "drawing"
                  : s.tipo === "anexo"
                  ? "attachment"
                  : "note";
              const ativo = idx === indiceFoco;
              return (
                <button
                  key={`${s.alvo}-${s.rotulo}`}
                  type="button"
                  className={`flex w-full items-center gap-2 rounded-[2px] px-2 py-1.5 text-left text-xs transition-colors ${
                    ativo
                      ? "bg-lavagem text-tinta"
                      : "text-tinta-media hover:bg-lavagem hover:text-tinta"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selecionarSugestao(s);
                  }}
                  onMouseEnter={() => setIndiceFoco(idx)}
                >
                  <IconeArquivo
                    tipo={tipoNo}
                    tamanho={14}
                    className="shrink-0 text-tinta-suave"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{s.rotulo}</div>
                    {s.detalhe && (
                      <div className="meta truncate text-[9px] text-tinta-suave">
                        {s.detalhe}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Superficie>
  );
}
