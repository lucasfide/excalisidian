// Aba de desenho (.draw.md). Espelha PainelDocumento: lê só o caminho dos params, carrega o
// texto pelo documentosStore (agnóstico de tipo) e monta o EditorDesenho. Autosave e conflito
// seguem o mesmo contrato das notas.
//
// Cena ilegível (JSON quebrado no arquivo): o canvas NÃO monta — sem isto, o Excalidraw
// receberia a cena vazia reidratada e qualquer interação gravaria por cima do que talvez
// fosse recuperável (auditoria 12/09, achado 08). No lugar, um modo de recuperação que só
// oferece abrir o arquivo como texto. A re-detecção acontece quando `versao` muda
// (recarregar do disco); editar o JSON na aba de texto e voltar não re-deteta sozinho —
// fechar e reabrir a aba do desenho resolve, e o caminho é raro de propósito.

import { useCallback, useEffect, useMemo } from "react";
import type { IDockviewPanelProps } from "dockview";

import { useDocumentosStore } from "../estado/documentosStore";
import { useWorkspaceStore } from "../estado/workspaceStore";
import EditorDesenho from "../canvas/EditorDesenho";
import { parseDesenho } from "../canvas/formatoDesenho";
import { Botao } from "../ui";
import FaixaConflito from "../ui/excalisidian/FaixaConflito";
import LimiteDeErro from "../ui/excalisidian/LimiteDeErro";

type Params = { path: string; somenteLeitura?: boolean };

export default function PainelDesenho(props: IDockviewPanelProps<Params>) {
  const path = props.params.path;
  const somenteLeitura = props.params.somenteLeitura ?? false;
  const abrir = useDocumentosStore((s) => s.abrir);
  const editar = useDocumentosStore((s) => s.editar);
  const doc = useDocumentosStore((s) => s.docs.get(path));
  const versao = doc?.versao ?? 0;

  // Identidade estável: EditorDesenho passa isto pro Excalidraw (via onChange), e uma nova
  // função a cada render dispara o loop de "Maximum update depth exceeded" documentado em
  // src/canvas/EditorDesenho.tsx.
  const aoEditar = useCallback(
    (md: string) => editar(path, md),
    [path, editar],
  );

  useEffect(() => {
    void abrir(path);
  }, [path, abrir]);

  useEffect(() => {
    return () => {
      void useDocumentosStore.getState().salvar(path);
    };
  }, [path]);

  // Parseado só na montagem e em recarga externa (versao): reparsear a cada tecla do
  // editor de texto do mesmo arquivo não valeria o custo num .draw.md grande.
  const cenaQuebrada = useMemo(() => {
    if (!doc) return false;
    try {
      return parseDesenho(doc.conteudoEditor).cenaInvalida === true;
    } catch {
      return true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, versao]);

  if (!doc) {
    return (
      <div className="flex h-full items-center justify-center bg-papel">
        <span className="meta text-tinta-suave">carregando…</span>
      </div>
    );
  }

  if (cenaQuebrada) {
    return (
      <div className="flex h-full flex-col bg-papel">
        <FaixaConflito path={path} />
        <div className="flex min-h-0 flex-1 items-center justify-center px-8">
          <div className="w-full max-w-sm rounded-ficha border border-regua bg-superficie p-5 shadow-ficha">
            <p className="text-corpo text-tinta">
              Não foi possível ler o desenho deste arquivo.
            </p>
            <p className="mt-1 text-pequeno text-tinta-media [text-wrap:pretty]">
              Nada será salvo aqui enquanto a cena estiver ilegível. Abra como texto para
              consertar o JSON da seção Scene, depois feche e reabra esta aba.
            </p>
            <div className="mt-4 flex gap-2">
              <Botao
                variante="primario"
                tamanho="compacto"
                onClick={() =>
                  useWorkspaceStore.getState().abrirComoTexto(path)
                }
              >
                Abrir como texto
              </Botao>
              <Botao
                variante="fantasma"
                tamanho="compacto"
                onClick={() => props.api.close()}
              >
                Fechar aba
              </Botao>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-papel">
      <FaixaConflito path={path} />
      <div className="min-h-0 flex-1">
        <LimiteDeErro
          key={`${path}#${doc.versao}`}
          onFechar={() => props.api.close()}
        >
          <EditorDesenho
            caminho={path}
            conteudoInicial={doc.conteudoEditor}
            versao={doc.versao}
            onEditar={aoEditar}
            somenteLeitura={somenteLeitura}
          />
        </LimiteDeErro>
      </div>
    </div>
  );
}
