// As duas versões de um desenho em conflito, lado a lado (task-6). Desenho não compara como
// texto (RF da faixa de conflitos, doc 09): aqui não há diff — duas instâncias do Excalidraw,
// uma por versão, no mesmo tema e enquadramento, só para o usuário OLHAR e escolher.
//
// A leitura da cena que pode falhar (JSON corrompido pela sincronização) mora em
// `src/sync/cenaDeConflito.ts`, módulo puro e testado — este componente só desenha o que
// aquele módulo devolve. A resolução (ficar com esta / manter as duas, tratamento de erro) e
// o cabeçalho de cada coluna são os mesmos de `ComparadorNotas`, via `useResolucaoDeConflito`
// e `cabecalhoVersaoConflito`.
//
// Só leitura de verdade: `viewModeEnabled` nas duas instâncias, sem `onChange` ligado a
// gravação, sem debounce, sem `registrarFlushCanvas` — nada do contrato de autosave que
// `EditorDesenho.tsx` usa. Cada Excalidraw é montado direto aqui (decisão do planejador:
// `EditorDesenho` tem gravação acoplada à montagem, então não dá para reusá-lo inteiro).
//
// Duas instâncias do Excalidraw pesam: só existem enquanto este componente está montado — o
// `Dialog` que o abre (`FaixaConflitos.tsx`) as desmonta ao fechar, sem pré-montagem.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

import { parseDesenho } from "../../canvas/formatoDesenho";
import { lerPaletaCanvas, useTemaEscuro } from "../../canvas/paletaCanvas";
import { reidratarFiles } from "../../canvas/reidratarFiles";
import { usePrefsStore } from "../../estado/prefsStore";
import { tagDeLocale } from "../../i18n/idioma";
import { useTexto } from "../../i18n/useTexto";
import { lerCenaDeConflito } from "../../sync/cenaDeConflito";
import type { Conflito, VersaoEmConflito } from "../../sync/tipos";
import Botao from "../Botao";
import { CabecalhoColuna, formatarData } from "./cabecalhoVersaoConflito";
import { useResolucaoDeConflito } from "./useResolucaoDeConflito";

interface Props {
  conflito: Conflito;
}

// Referência fixa pelo mesmo motivo de `EditorDesenho.tsx`: um objeto literal recriado a cada
// render muda a identidade da prop e o Excalidraw ressincroniza sem necessidade.
const UI_OPTIONS = {
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: false,
    export: false,
    loadScene: false,
    saveToActiveFile: false,
    saveAsImage: false,
    toggleTheme: false,
  },
} as const;

export default function ComparadorDesenhos({ conflito }: Props) {
  const t = useTexto();
  const idioma = usePrefsStore((s) => s.idioma);
  const { emAndamento, resolver } = useResolucaoDeConflito(conflito.caminho);
  const tagLocale = tagDeLocale(idioma);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <CabecalhoColuna
          rotulo={t("conflito.estaMaquina")}
          data={t("conflito.editadoEm", { data: formatarData(conflito.local, tagLocale) })}
        />
        <CabecalhoColuna
          rotulo={t("conflito.outraMaquina", { dispositivo: conflito.remoto.dispositivo })}
          data={t("conflito.editadoEm", { data: formatarData(conflito.remoto, tagLocale) })}
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <TelaVersao versao={conflito.local} />
        <TelaVersao versao={conflito.remoto} />
      </div>

      <div className="grid grid-cols-1 items-start gap-3 pt-1 sm:grid-cols-3">
        <Botao
          className="sm:justify-self-start"
          disabled={emAndamento}
          onClick={() => void resolver({ acao: "ficarCom", origem: "local" })}
        >
          {t("conflito.ficarComEsta")}
        </Botao>
        <div className="flex flex-col items-center gap-1 text-center">
          <Botao
            variante="primario"
            disabled={emAndamento}
            onClick={() => void resolver({ acao: "manterAmbas" })}
          >
            {t("conflito.manterAmbas")}
          </Botao>
          <p className="text-pequeno text-tinta-suave">{t("conflito.manterAmbasExplicacao")}</p>
          <p className="text-pequeno text-ocre">{t("conflito.desenho.sugestao")}</p>
        </div>
        <Botao
          className="sm:justify-self-end"
          disabled={emAndamento}
          onClick={() => void resolver({ acao: "ficarCom", origem: "remoto" })}
        >
          {t("conflito.ficarComEsta")}
        </Botao>
      </div>
    </div>
  );
}

/** Uma tela do Excalidraw, somente leitura, para uma versão do desenho. Se a cena não abrir
 * (JSON corrompido pela sincronização), mostra a mensagem no lugar do canvas — o botão
 * "Manter as duas" continua disponível de qualquer forma, lá em cima: o arquivo continua no
 * disco mesmo sem a gente conseguir desenhar ele agora. */
function TelaVersao({ versao }: { versao: VersaoEmConflito }) {
  const t = useTexto();
  const escuro = useTemaEscuro();
  const paleta = useMemo(() => lerPaletaCanvas(), [escuro]);
  const leitura = useMemo(() => lerCenaDeConflito(versao.conteudo), [versao.conteudo]);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);

  const aoObterApi = useCallback((instancia: ExcalidrawImperativeAPI) => {
    setApi(instancia);
  }, []);

  // Reidrata imagens embedadas (mesma peça que `EditorDesenho.tsx` usa) para as duas telas
  // não mostrarem placeholder de imagem faltando por causa só da comparação.
  useEffect(() => {
    if (!api || !leitura.ok) return;
    let vivo = true;
    void reidratarFiles(parseDesenho(versao.conteudo)).then((files) => {
      if (!vivo) return;
      api.addFiles(Object.values(files));
    });
    return () => {
      vivo = false;
    };
  }, [api, leitura.ok, versao.conteudo]);

  if (!leitura.ok) {
    return (
      <div className="flex aspect-[4/3] w-full max-w-full items-center justify-center rounded-ficha border border-regua bg-lavagem px-3 text-center text-pequeno text-tinta-media">
        {t("conflito.desenho.naoAbriu")}
      </div>
    );
  }

  // Igual a `EditorDesenho.tsx`: `initialData` só é usado na montagem, `scrollToContent: true`
  // enquadra a cena inteira já no primeiro paint, nas duas telas.
  const initialData = {
    elements: leitura.cena.elements as never,
    appState: {
      ...leitura.cena.appState,
      viewBackgroundColor: "transparent",
    },
    scrollToContent: true,
  };

  return (
    <div className="relative aspect-[4/3] w-full max-w-full overflow-hidden rounded-ficha border border-regua">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: "var(--color-papel)",
          backgroundImage: `radial-gradient(circle, ${paleta.grade} 1px, transparent 1px)`,
          backgroundSize: "20px 20px",
          opacity: escuro ? 0.8 : 0.6,
        }}
      />
      <div className="absolute inset-0">
        <Excalidraw
          theme={escuro ? "dark" : "light"}
          UIOptions={UI_OPTIONS}
          initialData={initialData}
          excalidrawAPI={aoObterApi}
          viewModeEnabled
          aiEnabled={false}
        />
      </div>
    </div>
  );
}
