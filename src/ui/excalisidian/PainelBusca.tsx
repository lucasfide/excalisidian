// Busca unificada (Ctrl+O, Ctrl+Shift+F, campo "Buscar" da sidebar, "Buscar" na paleta de
// comandos — doc 13): título e conteúdo na mesma janela, absorvendo o QuickSwitcher (a
// busca por nome/alias virou a seção "Títulos"). Mesmo chrome de sobreposição do
// SobreposicaoBusca (backdrop, `surgir` 160ms, Escape fecha), mas com seções e trechos —
// a base compartilhada não comporta isso. A ordem das seções, o dedupe título×conteúdo e o
// mapeamento índice→ação moram em `busca/montarListaBusca.ts` (puro, com teste); este
// componente só junta os dados (títulos síncronos, conteúdo com debounce) e cuida de
// teclado, scroll e abertura.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FilePlus } from "lucide-react";

import {
  buscarConteudo,
  parsearConsulta,
  partesComDestaque,
  type ResultadoConteudo,
} from "../../busca/minisearchIndex";
import {
  buscarTitulos,
  modificadosRecentemente,
  temTituloExato,
  type ResultadoTitulo,
} from "../../busca/buscaTitulos";
import { montarListaBusca, type ItemNavegavel } from "../../busca/montarListaBusca";
import { comandoCriarNotaComNome } from "../../app/comandos/criacao";
import { useVaultStore } from "../../estado/vaultStore";
import { useWorkspaceStore } from "../../estado/workspaceStore";
import { useSobreposicaoStore } from "../../estado/sobreposicaoStore";
import { cn } from "../cn";
import Superficie from "../Superficie";
import Campo from "../Campo";
import IconeArquivo from "../IconeArquivo";

const DEBOUNCE_CONTEUDO_MS = 200;

export default function PainelBusca() {
  const [valor, setValor] = useState(() => useSobreposicaoStore.getState().ultimaConsulta);
  const [conteudo, setConteudo] = useState<ResultadoConteudo[]>([]);
  const [buscandoConteudo, setBuscandoConteudo] = useState(false);
  const [indiceFoco, setIndiceFoco] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const anteriorRef = useRef<HTMLElement | null>(null);
  const listaRef = useRef<HTMLDivElement | null>(null);
  // Cada consulta nova ganha uma sequência; só a resposta com a sequência mais recente é
  // aplicada — descarta resposta atrasada de uma consulta já trocada (doc 13 §1.3).
  const seqRef = useRef(0);

  const statusIndice = useVaultStore((s) => s.statusIndice);
  const consulta = valor.trim();
  const temConsulta = consulta.length > 0;
  // Só para o destaque dos trechos (doc 13 §1.3: mesma sintaxe do doc 04 §8 — termo, "frase
  // exata", -exclusão); a busca em si usa `consulta` (string) direto nas funções de busca.
  const { termos: termosDestaque, frases: frasesDestaque } = useMemo(
    () => parsearConsulta(consulta),
    [consulta],
  );

  useEffect(() => {
    anteriorRef.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    // Reabrir com a última consulta (doc 13 §1.1): toda selecionada, digitar substitui.
    inputRef.current?.select();
    return () => {
      anteriorRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const definirValor = (v: string) => {
    setValor(v);
    useSobreposicaoStore.getState().definirUltimaConsulta(v);
  };

  // "Modificados recentemente": só depende do índice, não da consulta — calculado uma vez
  // por abertura (o painel remonta a cada `abrir("busca")`, ver RaizSobreposicoes).
  const recentes = useMemo(() => modificadosRecentemente(), []);

  // Títulos: síncrono, sem debounce (doc 13 §1.3 item 1).
  const titulos = useMemo<ResultadoTitulo[]>(
    () => (temConsulta ? buscarTitulos(consulta) : []),
    [consulta, temConsulta],
  );
  const tituloExato = useMemo(
    () => (temConsulta ? temTituloExato(consulta) : false),
    [consulta, temConsulta],
  );

  // Conteúdo: debounce de 200ms, cada candidato relê o arquivo do disco pra montar trechos —
  // não vale disparar a cada tecla (doc 13 §1.3 item 2).
  useEffect(() => {
    if (!temConsulta) {
      setConteudo([]);
      setBuscandoConteudo(false);
      return;
    }
    seqRef.current += 1;
    const minhaSeq = seqRef.current;
    setBuscandoConteudo(true);
    const timer = window.setTimeout(() => {
      const adapter = useVaultStore.getState().adapter;
      if (!adapter) {
        if (seqRef.current === minhaSeq) setBuscandoConteudo(false);
        return;
      }
      void buscarConteudo(consulta, (p) => adapter.lerTexto(p), { combinar: "AND" }).then((r) => {
        if (seqRef.current !== minhaSeq) return; // consulta já trocou, resposta velha
        setConteudo(r);
        setBuscandoConteudo(false);
      });
    }, DEBOUNCE_CONTEUDO_MS);
    return () => window.clearTimeout(timer);
  }, [consulta, temConsulta]);

  const { linhas, itens } = useMemo(
    () =>
      montarListaBusca({
        consulta,
        recentes,
        titulos,
        conteudo,
        buscandoConteudo,
        temTituloExato: tituloExato,
      }),
    [consulta, recentes, titulos, conteudo, buscandoConteudo, tituloExato],
  );

  // Consulta nova: volta o foco pro primeiro item. Não reage à chegada assíncrona do
  // conteúdo, pra não roubar o foco de quem já navegou pelos títulos enquanto ele carrega.
  useEffect(() => {
    setIndiceFoco(0);
  }, [consulta]);

  useEffect(() => {
    listaRef.current
      ?.querySelector<HTMLElement>(`[data-indice="${indiceFoco}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [indiceFoco]);

  const fechar = () => useSobreposicaoStore.getState().fechar();

  const abrirItem = (item: ItemNavegavel, aoLado: boolean) => {
    if (item.tipo === "recente" || item.tipo === "titulo") {
      useWorkspaceStore.getState().abrirDocumento(item.item.path, { aoLado });
      fechar();
      return;
    }
    if (item.tipo === "trecho") {
      // Trecho de desenho só abre o desenho — canvas não tem linha pra revelar (doc 13 §1.5).
      const revelar = item.resultado.kind === "note" ? item.trecho.linhaCompleta : undefined;
      useWorkspaceStore.getState().abrirDocumento(item.resultado.path, { aoLado, revelar });
      fechar();
      return;
    }
    // "criar": fecha só depois — comandoCriarNotaComNome é assíncrono e o toast de erro
    // (nome inválido/duplicado é impossível aqui, mas vault fechado é) precisa da sobreposição
    // ainda viva ou não, tanto faz: o toast é global (sonner), sobrevive ao fechar.
    fechar();
    void comandoCriarNotaComNome(item.consulta, { aoLado });
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
      setIndiceFoco((i) => (itens.length === 0 ? 0 : (i - 1 + itens.length) % itens.length));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = itens[indiceFoco];
      if (item) abrirItem(item, e.ctrlKey || e.metaKey);
    }
  };

  const semNada = itens.length === 0 && !buscandoConteudo;

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
        aria-label="Buscar"
        className="motion-safe:animate-[surgir_160ms_var(--ease-caderno)] flex w-full max-w-xl flex-col gap-3 p-3"
      >
        <Campo
          ref={inputRef}
          rotulo="Buscar"
          grande
          autoComplete="off"
          spellCheck={false}
          placeholder="Buscar por título ou conteúdo…"
          value={valor}
          onChange={(e) => definirValor(e.target.value)}
          onKeyDown={onKeyDown}
        />

        {statusIndice === "indexando" && (
          <EntradaSuave className="meta px-1 text-tinta-suave">Reindexando o vault…</EntradaSuave>
        )}

        {semNada && temConsulta && (
          <EntradaSuave className="px-1 py-4 text-center text-pequeno text-tinta-suave">
            {`Nada encontrado para «${consulta}».`}
          </EntradaSuave>
        )}

        {itens.length > 0 && (
          <div ref={listaRef} role="listbox" aria-label="Buscar" className="flex max-h-96 flex-col overflow-y-auto">
            {linhas.map((linha, i) => {
              if (linha.tipo === "secao") {
                return (
                  <p key={`secao-${i}`} className="meta px-2 pt-2.5 pb-1 text-tinta-suave">
                    {linha.texto}
                  </p>
                );
              }
              if (linha.tipo === "carregando") {
                return (
                  <p key={`carregando-${i}`} className="meta px-2 py-1.5 text-tinta-suave">
                    {linha.texto}
                  </p>
                );
              }
              if (linha.tipo === "arquivo") {
                const r = linha.resultado;
                return (
                  <EntradaSuave
                    key={`arquivo-${r.path}`}
                    className="flex items-center gap-2 px-2 pt-2 pb-1"
                  >
                    <IconeArquivo tipo={r.kind} className="shrink-0 text-tinta-suave" />
                    <span className="truncate text-[13px] font-medium text-tinta">{r.titulo}</span>
                    {r.kind === "drawing" && (
                      <span className="meta shrink-0 text-tinta-suave">desenho</span>
                    )}
                    <span className="meta ml-auto shrink-0 truncate text-tinta-suave">{r.path}</span>
                  </EntradaSuave>
                );
              }
              // linha.tipo === "item"
              const item = itens[linha.indice];
              const ativo = linha.indice === indiceFoco;
              return (
                <ItemBusca
                  key={chaveItem(item)}
                  item={item}
                  indice={linha.indice}
                  ativo={ativo}
                  termos={termosDestaque}
                  frases={frasesDestaque}
                  onClick={(e) => abrirItem(item, e.ctrlKey || e.metaKey)}
                  onMouseEnter={() => setIndiceFoco(linha.indice)}
                />
              );
            })}
          </div>
        )}

        <p className="meta px-1 text-tinta-suave">↵ abrir · Ctrl ↵ abrir ao lado · Esc fechar</p>
      </Superficie>
    </div>
  );
}

function chaveItem(item: ItemNavegavel): string {
  if (item.tipo === "trecho") return `trecho:${item.resultado.path}:${item.trecho.linha}`;
  if (item.tipo === "criar") return "criar";
  return `${item.tipo}:${item.item.path}`;
}

function ItemBusca({
  item,
  indice,
  ativo,
  termos,
  frases,
  onClick,
  onMouseEnter,
}: {
  item: ItemNavegavel;
  indice: number;
  ativo: boolean;
  /** Termos/frases da consulta, pra destacar dentro de um trecho (doc 06: realce `ocre` a
   * 30%, mesma cor do search do editor). Ignorados pelos outros tipos de item. */
  termos: string[];
  frases: string[];
  onClick: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
}) {
  const entrou = useEntradaSuave();

  if (item.tipo === "recente" || item.tipo === "titulo") {
    return (
      <button
        type="button"
        role="option"
        aria-selected={ativo}
        data-indice={indice}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        className={cn(
          "flex w-full items-center gap-2 rounded-controle px-2 py-1.5 text-left motion-safe:transition-[opacity,transform,background-color,color] motion-safe:duration-[140ms] motion-safe:ease-caderno motion-reduce:transition-none",
          entrou ? "motion-safe:translate-y-0 motion-safe:opacity-100" : "motion-safe:translate-y-1 motion-safe:opacity-0",
          ativo ? "bg-lavagem" : "",
        )}
      >
        <IconeArquivo tipo={item.item.kind} className="shrink-0 text-tinta-suave" />
        <span className={cn("min-w-0 flex-1 truncate text-pequeno", ativo ? "text-tinta" : "text-tinta-media")}>
          {item.item.titulo}
        </span>
        {item.item.pasta && (
          <span className="meta ml-auto shrink-0 truncate text-tinta-suave">{item.item.pasta}</span>
        )}
      </button>
    );
  }

  if (item.tipo === "trecho") {
    const partes = partesComDestaque(item.trecho.trecho, termos, frases);
    return (
      <button
        type="button"
        role="option"
        aria-selected={ativo}
        data-indice={indice}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        className={cn(
          "flex w-full items-baseline gap-2 rounded-controle px-2 py-1.5 text-left motion-safe:transition-[opacity,transform,background-color,color] motion-safe:duration-[140ms] motion-safe:ease-caderno motion-reduce:transition-none",
          entrou ? "motion-safe:translate-y-0 motion-safe:opacity-100" : "motion-safe:translate-y-1 motion-safe:opacity-0",
          ativo ? "bg-lavagem" : "",
        )}
      >
        <span className="meta w-8 shrink-0 text-right text-tinta-suave">{item.trecho.linha}</span>
        <span className={cn("min-w-0 flex-1 truncate text-pequeno", ativo ? "text-tinta" : "text-tinta-media")}>
          {partes.map((parte, i) =>
            parte.destaque ? (
              <mark key={i} className="rounded-[2px] bg-[color-mix(in_srgb,var(--color-ocre)_30%,transparent)] text-tinta">
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

  // item.tipo === "criar"
  return (
    <button
      type="button"
      role="option"
      aria-selected={ativo}
      data-indice={indice}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "flex w-full items-center gap-2 rounded-controle px-2 py-1.5 text-left text-pequeno motion-safe:transition-[opacity,transform,background-color,color] motion-safe:duration-[140ms] motion-safe:ease-caderno motion-reduce:transition-none",
        entrou ? "motion-safe:translate-y-0 motion-safe:opacity-100" : "motion-safe:translate-y-1 motion-safe:opacity-0",
        ativo ? "bg-lavagem text-tinta" : "text-tinta-media",
      )}
    >
      <FilePlus size={16} strokeWidth={1.5} className="shrink-0 text-tinta-suave" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{`Criar nota «${item.consulta}»`}</span>
    </button>
  );
}

function EntradaSuave({ children, className }: { children: ReactNode; className: string }) {
  const entrou = useEntradaSuave();

  return (
    <div
      className={cn(
        "motion-safe:transition-[opacity,transform] motion-safe:duration-[140ms] motion-safe:ease-caderno motion-reduce:transition-none",
        entrou ? "motion-safe:translate-y-0 motion-safe:opacity-100" : "motion-safe:translate-y-1 motion-safe:opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

function useEntradaSuave(): boolean {
  const [entrou, setEntrou] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntrou(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return entrou;
}
