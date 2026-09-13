// Busca por conteúdo (Ctrl+Shift+F, RF4.8, doc 04 §8): resultado agrupado por arquivo com
// no máximo 3 trechos por arquivo, número da linha e o termo destacado. Mesmo chrome de
// sobreposição do QuickSwitcher/PaletaComandos (SobreposicaoBusca), mas com lista agrupada —
// a base compartilhada não comporta trechos. O realce do termo usa a mesma cor do search do
// editor (ocre a 30%, tokens-excalisidian.css).

import { useEffect, useMemo, useRef, useState } from "react";

import {
  buscarConteudo,
  partesComDestaque,
  parsearConsulta,
  type ResultadoConteudo,
  type TrechoBusca,
} from "../../busca/minisearchIndex";
import { useVaultStore } from "../../estado/vaultStore";
import { useWorkspaceStore } from "../../estado/workspaceStore";
import { useSobreposicaoStore } from "../../estado/sobreposicaoStore";
import { cn } from "../cn";
import Superficie from "../Superficie";
import Campo from "../Campo";
import IconeArquivo from "../IconeArquivo";

/** Item navegável: um trecho (ou o arquivo inteiro, quando não há trecho). */
interface ItemResultado {
  resultado: ResultadoConteudo;
  trecho: TrechoBusca | null;
}

export default function PainelBusca() {
  const [valor, setValor] = useState("");
  const [resultados, setResultados] = useState<ResultadoConteudo[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [indiceFoco, setIndiceFoco] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const anteriorRef = useRef<HTMLElement | null>(null);
  const listaRef = useRef<HTMLDivElement | null>(null);

  const statusIndice = useVaultStore((s) => s.statusIndice);
  const consulta = useMemo(() => parsearConsulta(valor), [valor]);
  const temConsulta = consulta.termos.length > 0;

  useEffect(() => {
    anteriorRef.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => {
      anteriorRef.current?.focus?.();
    };
  }, []);

  // Busca com debounce: o índice é em memória, mas cada candidato relê o arquivo do disco
  // para montar os trechos — não vale disparar a cada tecla.
  useEffect(() => {
    if (!temConsulta) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    let cancelado = false;
    setBuscando(true);
    const timer = window.setTimeout(() => {
      const adapter = useVaultStore.getState().adapter;
      if (!adapter) {
        setBuscando(false);
        return;
      }
      void buscarConteudo(valor, (p) => adapter.lerTexto(p)).then((r) => {
        if (cancelado) return;
        setResultados(r);
        setBuscando(false);
      });
    }, 250);
    return () => {
      cancelado = true;
      window.clearTimeout(timer);
    };
  }, [valor, temConsulta]);

  const itens: ItemResultado[] = useMemo(
    () =>
      resultados.flatMap((resultado): ItemResultado[] =>
        resultado.trechos.length > 0
          ? resultado.trechos.map((trecho) => ({ resultado, trecho }))
          : [{ resultado, trecho: null }],
      ),
    [resultados],
  );

  useEffect(() => {
    setIndiceFoco(0);
  }, [itens]);

  useEffect(() => {
    listaRef.current
      ?.querySelector<HTMLElement>(`[data-indice="${indiceFoco}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [indiceFoco]);

  const fechar = () => useSobreposicaoStore.getState().fechar();

  const abrir = (item: ItemResultado) => {
    useWorkspaceStore.getState().abrirDocumento(item.resultado.path);
    fechar();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      fechar();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndiceFoco((i) => (itens.length === 0 ? 0 : (i + 1) % itens.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndiceFoco((i) => (i - 1 + itens.length) % itens.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = itens[indiceFoco];
      if (item) abrir(item);
    }
  };

  const mensagemVazio = !temConsulta
    ? "Busque por conteúdo em notas e desenhos."
    : buscando
      ? "Buscando…"
      : `Nada encontrado para «${valor.trim()}».`;

  // Contador discreto no rodapé do campo, como o cabeçalho de seção do painel de tarefas.
  let indiceVisual = -1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-[color-mix(in_srgb,var(--color-tinta)_28%,transparent)] p-8 pt-[15vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <Superficie
        flutuante
        role="dialog"
        aria-modal
        aria-label="Buscar no vault"
        className="motion-safe:animate-[surgir_160ms_var(--ease-caderno)] flex w-full max-w-xl flex-col gap-3 p-3"
      >
        <Campo
          ref={inputRef}
          rotulo="Buscar no vault"
          grande
          autoComplete="off"
          spellCheck={false}
          placeholder="Buscar no vault… (aspas para frase exata, - para excluir)"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={onKeyDown}
        />

        {statusIndice === "indexando" && (
          <p className="meta px-1 text-tinta-suave">Reindexando o vault…</p>
        )}

        {itens.length === 0 ? (
          <p className="px-1 py-4 text-center text-pequeno text-tinta-suave">
            {mensagemVazio}
          </p>
        ) : (
          <div
            ref={listaRef}
            role="listbox"
            className="flex max-h-96 flex-col overflow-y-auto"
          >
            {resultados.map((resultado) => {
              const cabecalho = (
                <div className="flex items-center gap-2 px-2 pt-2.5 pb-1">
                  <IconeArquivo
                    tipo={resultado.kind}
                    className="shrink-0 text-tinta-suave"
                  />
                  <span className="truncate text-[13px] font-medium text-tinta">
                    {resultado.titulo}
                  </span>
                  {resultado.kind === "drawing" && (
                    <span className="meta shrink-0 text-tinta-suave">desenho</span>
                  )}
                  <span className="meta ml-auto shrink-0 truncate text-tinta-suave">
                    {resultado.path}
                  </span>
                </div>
              );
              const linhas =
                resultado.trechos.length > 0
                  ? resultado.trechos.map((trecho) => {
                      indiceVisual += 1;
                      const i = indiceVisual;
                      const ativo = i === indiceFoco;
                      return (
                        <TrechoLinha
                          key={`${resultado.path}:${trecho.linha}`}
                          item={{ resultado, trecho }}
                          indice={i}
                          ativo={ativo}
                          termos={consulta.termos}
                          frases={consulta.frases}
                          onClick={() => abrir({ resultado, trecho })}
                          onMouseEnter={() => setIndiceFoco(i)}
                        />
                      );
                    })
                  : (() => {
                      indiceVisual += 1;
                      const i = indiceVisual;
                      const item = { resultado, trecho: null };
                      return (
                        <button
                          key={resultado.path}
                          type="button"
                          role="option"
                          aria-selected={i === indiceFoco}
                          data-indice={i}
                          onClick={() => abrir(item)}
                          onMouseEnter={() => setIndiceFoco(i)}
                          className={cn(
                            "w-full rounded-controle px-2 py-1.5 text-left text-pequeno transition-colors duration-[140ms] ease-caderno",
                            i === indiceFoco ? "bg-lavagem text-tinta" : "text-tinta-suave",
                          )}
                        >
                          Abrir arquivo
                        </button>
                      );
                    })();
              return (
                <div key={resultado.path} className="flex flex-col gap-[1px]">
                  {cabecalho}
                  {linhas}
                </div>
              );
            })}
          </div>
        )}
      </Superficie>
    </div>
  );
}

function TrechoLinha({
  item,
  indice,
  ativo,
  termos,
  frases,
  onClick,
  onMouseEnter,
}: {
  item: ItemResultado;
  indice: number;
  ativo: boolean;
  termos: string[];
  frases: string[];
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const trecho = item.trecho!;
  return (
    <button
      type="button"
      role="option"
      aria-selected={ativo}
      data-indice={indice}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "flex w-full items-baseline gap-2 rounded-controle px-2 py-1.5 text-left transition-colors duration-[140ms] ease-caderno",
        ativo ? "bg-lavagem" : "",
      )}
    >
      <span className="meta w-8 shrink-0 text-right text-tinta-suave">
        {trecho.linha}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-pequeno",
          ativo ? "text-tinta" : "text-tinta-media",
        )}
      >
        {partesComDestaque(trecho.trecho, termos, frases).map((parte, i) =>
          parte.destaque ? (
            <mark
              key={i}
              className="rounded-[2px] bg-[color-mix(in_srgb,var(--color-ocre)_30%,transparent)] text-tinta"
            >
              {parte.texto}
            </mark>
          ) : (
            <span key={i}>{parte.texto}</span>
          ),
        )}
      </span>
    </button>
  );
}
