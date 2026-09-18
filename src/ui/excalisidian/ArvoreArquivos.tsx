// Árvore de arquivos da sidebar. Virtualizada, expandir/recolher, clique abre, arrastar um
// arquivo para mover de pasta (ou, em modo customizado, para reordenar entre irmãos). Menu de
// contexto: criar aqui / renomear / separador.
//
// Arrastar é por EVENTOS DE PONTEIRO, não `draggable` nativo do HTML5: o Drag-and-Drop HTML5
// nativo tem histórico de falhar dentro do WebView2 do Tauri (foi o que quebrou o arrastar de
// abas do dockview — ver Workspace.tsx). Reimplementar isso aqui com a mesma API arriscaria
// herdar o mesmo bug.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  FilePlus,
  SquarePen,
  FolderPlus,
  Pencil,
  Home,
  Move,
  Trash2,
  Rows3,
} from "lucide-react";

import {
  nomeExibicao,
  encontrarNo as encontrarNoLocal,
  type NoArvore,
  type TipoNo,
} from "../../vault/arvore";
import { pastaDe } from "../../vault/caminhos";
import { ordenarArvore } from "../../vault/ordenacao";
import { Menu, ItemMenu, SeparadorMenu, IconeArquivo, type PosicaoMenu, cn } from "../index";
import ItemArvore from "./ItemArvore";
import {
  calcularAlvo,
  calcularNovaOrdem,
  type AlvoSoltura,
  type ItemArrastado,
  type LinhaGeometria,
} from "./alvoSoltura";

type LinhaVisivel =
  | { kind: "no"; no: NoArvore; nivel: number; aberta: boolean }
  | { kind: "separador"; id: string };

/** `sep-xxxxxx`: entrada sintética de separador dentro de `customOrder[""]` — nunca
 * corresponde ao nome de um arquivo ou pasta (mesmo critério de `vault/ordenacao.ts`). */
function ehSeparador(entrada: string): boolean {
  return entrada.startsWith("sep-");
}

/**
 * Ordem completa de um nível, nomes e ids `sep-` misturados, pronta tanto pra desenhar quanto
 * pra gravar: o que `customOrder[pasta]` guardava, jogando fora as entradas de arquivos que
 * não existem mais, seguido dos nós que ainda não tinham posição salva — na mesma ordem em que
 * `ordenarNivel` (vault/ordenacao.ts) os coloca, que é o fim do nível.
 *
 * Filtrar as entradas mortas é o que mantém separador no lugar: uma entrada de arquivo que
 * sumiu (exclusão fora do modo customizado, `git pull`, edição por fora) empurraria todo
 * separador abaixo dela uma posição pra cima na hora de intercalar.
 */
function ordemBaseDoNivel(salva: string[] | undefined, nivelNo: NoArvore): string[] {
  const nomesAtuais = nivelNo.filhos.map((n) => n.nome);
  const existentes = new Set(nomesAtuais);
  const validas = (salva ?? []).filter((e) => ehSeparador(e) || existentes.has(e));
  const jaNaBase = new Set(validas);
  const faltantes = nomesAtuais.filter((nome) => !jaNaBase.has(nome));
  if (faltantes.length === 0) return validas;
  // Os faltantes entram depois do último NOME, não depois do último separador: separador de
  // rodapé (o caso do recém-adicionado, que `adicionarSeparador` põe no fim da lista) tem que
  // continuar sendo rodapé.
  let corte = validas.length;
  while (corte > 0 && ehSeparador(validas[corte - 1])) corte--;
  return [...validas.slice(0, corte), ...faltantes, ...validas.slice(corte)];
}

/**
 * Achata a árvore nas linhas visíveis. `entradasRaiz` é a ordem-base da raiz (nomes e ids
 * `sep-` misturados) e só serve pra saber ONDE cada separador entra entre os itens de nível
 * 0 — a ordem dos nós em si já veio resolvida por `ordenarArvore`.
 */
function achatar(
  raiz: NoArvore,
  pastasAbertas: Set<string>,
  entradasRaiz: string[],
): LinhaVisivel[] {
  const linhas: LinhaVisivel[] = [];
  const visitar = (nos: NoArvore[], nivel: number) => {
    for (const no of nos) {
      if (no.path === "anexos") continue;
      const aberta = pastasAbertas.has(no.path);
      linhas.push({ kind: "no", no, nivel, aberta });
      if (no.tipo === "folder" && aberta) visitar(no.filhos, nivel + 1);
    }
  };
  if (entradasRaiz.length === 0) {
    visitar(raiz.filhos, 0);
    return linhas;
  }
  // Intercala os itens de nível 0 com os separadores, na posição que a ordem-base registrou.
  // Cada entrada de nome consome o próximo nó: como `entradasRaiz` já veio de
  // `ordemBaseDoNivel` (só nomes que existem, na mesma sequência que `ordenarArvore` aplicou
  // em `raiz.filhos`), entrada e nó casam um a um. O `while` final é a rede de segurança —
  // com ou sem casamento, nenhum nó fica de fora e a ordem deles continua a de `raiz.filhos`.
  const filhosRaiz = raiz.filhos;
  let cursor = 0;
  const empurrarNivel0 = (no: NoArvore) => {
    if (no.path === "anexos") return;
    const aberta = pastasAbertas.has(no.path);
    linhas.push({ kind: "no", no, nivel: 0, aberta });
    if (no.tipo === "folder" && aberta) visitar(no.filhos, 1);
  };
  for (const entrada of entradasRaiz) {
    if (ehSeparador(entrada)) {
      linhas.push({ kind: "separador", id: entrada });
    } else if (cursor < filhosRaiz.length) {
      empurrarNivel0(filhosRaiz[cursor++]);
    }
  }
  while (cursor < filhosRaiz.length) {
    empurrarNivel0(filhosRaiz[cursor++]);
  }
  return linhas;
}

/** Pasta de um nó: a própria, se for pasta; senão a pasta que o contém. */
function pastaDoNo(no: NoArvore): string {
  return no.tipo === "folder" ? no.path : pastaDe(no.path);
}

interface Props {
  raiz: NoArvore;
  pastasAbertas: Set<string>;
  caminhoAberto: string | null;
  /** Modo de ordenação em vigor. A árvore chega aqui NÃO ordenada: quem combina a ordem com
   * os separadores na hora de achatar é este componente. */
  modo: "custom" | "alphabetical";
  customOrder: Record<string, string[]>;
  onAlternarPasta(path: string): void;
  onAbrirArquivo(path: string): void;
  onRenomear(path: string): void;
  onCriarNota(dir: string): void;
  onCriarDesenho(dir: string): void;
  onCriarPasta(dir: string): void;
  onMoverArquivo(path: string, dirDestino: string): void;
  /** Equivalente por menu de arrastar (doc 06, piso de qualidade) — só faz sentido pra
   * arquivo, mover pasta inteira está fora do escopo (vault/mover.ts). */
  onMoverPara(path: string): void;
  /** Mover para a lixeira (RF7.1) — arquivo e pasta, diferente de "Mover para…". `tipo` vem
   * do próprio nó (`menu.no.tipo`) — derivar de novo a partir só do path não distinguiria
   * pasta de arquivo. */
  onExcluir(path: string, tipo: NoArvore["tipo"]): void;
  /** Grava a ordem completa de um nível (nomes e ids `sep-`), em modo customizado. */
  onReordenarNivel(pasta: string, novaOrdem: string[]): Promise<void>;
  onAdicionarSeparador(): void;
  onRemoverSeparador(id: string): void;
}

/** `no` nulo = menu do espaço vazio da árvore ou de um separador (`separador` diz qual). */
type EstadoMenu = (PosicaoMenu & { no: NoArvore | null; separador?: string }) | null;

/** O que a árvore desenha durante um gesto engajado. */
interface EstadoArrasto {
  item: ItemArrastado;
  rotulo: string;
  /** Ícone da etiqueta; null = separador. */
  tipoNo: TipoNo | null;
  /** Posição do ponteiro na tela, pra etiqueta. */
  x: number;
  y: number;
  alvo: AlvoSoltura;
}

const ALTURA_LINHA = 26;
const ALTURA_SEPARADOR = 16;
const ALTURA_RAIZ = 32;
/** Distância da borda da área rolável em que o arrasto começa a rolar a árvore. */
const ZONA_ROLAGEM = 24;
const ROLAGEM_MAXIMA_POR_QUADRO = 8;
const DISTANCIA_PARA_ENGAJAR = 4;

/** A faixa "raiz do vault" só existe pra arrasto de arquivo: pasta não muda de lugar no disco
 * e separador não sai da raiz, então pra eles ela seria um alvo que não faz nada. */
function mostraFaixaRaiz(item: ItemArrastado): boolean {
  return item.tipo === "no" && !item.ehPasta;
}

/** Com a captura de ponteiro, o `click` que vem logo depois do pointerup vai pra linha que foi
 * arrastada: sem engolir esse clique, soltar um arquivo o abriria e soltar uma pasta a
 * abriria/fecharia. Se o clique não vier (soltou fora da janela), o listener sai no próximo
 * tick e não come um clique de verdade. */
function engolirCliqueDoSoltar() {
  const engolir = (ev: MouseEvent) => {
    ev.stopPropagation();
    ev.preventDefault();
  };
  window.addEventListener("click", engolir, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", engolir, true), 0);
}

export default function ArvoreArquivos({
  raiz,
  pastasAbertas,
  caminhoAberto,
  modo,
  customOrder,
  onAlternarPasta,
  onAbrirArquivo,
  onRenomear,
  onCriarNota,
  onCriarDesenho,
  onCriarPasta,
  onMoverArquivo,
  onMoverPara,
  onExcluir,
  onReordenarNivel,
  onAdicionarSeparador,
  onRemoverSeparador,
}: Props) {
  const raizOrdenada = useMemo(
    () => ordenarArvore(raiz, modo, customOrder),
    [raiz, modo, customOrder],
  );
  // Só a raiz tem separadores. A ordem-base (e não o `customOrder[""]` cru) é o que desenha e
  // o que grava: as duas pontas precisam concordar sobre onde cada separador cai.
  const entradasRaiz = useMemo(
    () => (modo === "custom" ? ordemBaseDoNivel(customOrder[""], raizOrdenada) : []),
    [modo, customOrder, raizOrdenada],
  );
  const linhas = useMemo(
    () => achatar(raizOrdenada, pastasAbertas, entradasRaiz),
    [raizOrdenada, pastasAbertas, entradasRaiz],
  );
  const [menu, setMenu] = useState<EstadoMenu>(null);
  const [arraste, setArraste] = useState<EstadoArrasto | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Os handlers do gesto são fechos criados no pointerdown, mas o watcher do vault pode remontar
  // a árvore no meio do arrasto: eles leem sempre o render mais recente por aqui.
  const atualRef = useRef({ linhas, entradasRaiz, customOrder, raizOrdenada, modo });
  atualRef.current = { linhas, entradasRaiz, customOrder, raizOrdenada, modo };

  const virt = useVirtualizer({
    count: linhas.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => linhas[i]?.kind === "separador" ? ALTURA_SEPARADOR : ALTURA_LINHA,
    getItemKey: (i) => { const l = linhas[i]; return l ? (l.kind === "separador" ? l.id : l.no.path) : i; },
    overscan: 12,
  });

  // Rola até o arquivo da aba ativa quando ele aparece na lista — inclusive na primeira vez
  // que aparece, por causa das pastas ancestrais que acabaram de abrir (App.tsx chama
  // `garantirAncestraisAbertos`, o que muda `linhas` e dispara este efeito de novo).
  useEffect(() => {
    if (!caminhoAberto) return;
    const indice = linhas.findIndex((l) => l.kind === "no" && l.no.path === caminhoAberto);
    if (indice !== -1) virt.scrollToIndex(indice, { align: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caminhoAberto, linhas]);

  const fecharMenu = () => setMenu(null);
  const comMenuFechado = (acao: () => void) => () => {
    fecharMenu();
    acao();
  };

  /** Geometria de TODAS as linhas (não só as desenhadas pela virtualização), na ordem da árvore.
   * Soma as mesmas alturas fixas que o `estimateSize` do virtualizador usa (as linhas não são
   * medidas no DOM), sem depender das medidas internas dele. */
  const montarGeometria = (
    linhasAtuais: LinhaVisivel[],
  ): { geometria: LinhaGeometria[]; alturaArvore: number } => {
    const geometria: LinhaGeometria[] = [];
    let start = 0;
    for (const linha of linhasAtuais) {
      const size = linha.kind === "separador" ? ALTURA_SEPARADOR : ALTURA_LINHA;
      if (linha.kind === "separador") {
        geometria.push({
          tipo: "separador",
          chave: linha.id,
          path: linha.id,
          pasta: "",
          ehPasta: false,
          nivel: 0,
          inicio: start,
          altura: size,
        });
      } else {
        geometria.push({
          tipo: "no",
          chave: linha.no.nome,
          path: linha.no.path,
          pasta: pastaDe(linha.no.path),
          ehPasta: linha.no.tipo === "folder",
          nivel: linha.nivel,
          inicio: start,
          altura: size,
        });
      }
      start += size;
    }
    return { geometria, alturaArvore: start };
  };

  /** Grava o que o indicador mostrava. A ordem-base é a mesma que desenhou a árvore, então o
   * que é gravado é exatamente o que estava na tela (separadores inclusive). */
  const confirmarSoltura = (item: ItemArrastado, alvo: NonNullable<AlvoSoltura>) => {
    const { entradasRaiz, customOrder, raizOrdenada, modo } = atualRef.current;
    if (alvo.tipo === "reordenar") {
      if (modo !== "custom") return;
      if (item.tipo === "no" && item.pasta !== alvo.pasta) return;
      let base: string[];
      if (alvo.pasta === "") {
        base = entradasRaiz;
      } else {
        const nivelNo = encontrarNoLocal(raizOrdenada, alvo.pasta);
        if (!nivelNo) return;
        base = ordemBaseDoNivel(customOrder[alvo.pasta], nivelNo);
      }
      const novaOrdem = calcularNovaOrdem(base, item.chave, alvo.antesDe);
      if (novaOrdem !== null) void onReordenarNivel(alvo.pasta, novaOrdem);
      return;
    }
    // `calcularAlvo` já nunca devolve "mover" pra pasta ou separador. Checar de novo é de
    // propósito: mover pasta no disco está fora do escopo (vault/mover.ts) e não pode depender
    // de um só ponto de controle.
    if (item.tipo === "no" && !item.ehPasta) onMoverArquivo(item.path, alvo.pasta);
  };

  /** Um só gesto pra arquivo, pasta e separador. `rotulo`/`tipoNo` são só a etiqueta que segue o
   * cursor (`tipoNo` null = separador). */
  const iniciarArrasto = (
    e: React.PointerEvent,
    item: ItemArrastado,
    rotulo: string,
    tipoNo: TipoNo | null,
  ) => {
    if (e.button !== 0) return;
    // Pasta arrasta só em modo customizado, e só pra reordenar entre irmãs: mudar uma pasta
    // inteira de lugar no disco está fora do escopo (ver o cabeçalho de vault/mover.ts). Sem o
    // preventDefault, o clique continua abrindo/fechando a pasta.
    if (item.tipo === "no" && item.ehPasta && modo !== "custom") return;
    e.preventDefault();
    const elemento = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    // Sem captura explícita, a entrega de pointermove/pointerup pra este gesto não é
    // garantida assim que o cursor sai dos limites do elemento original (é pra isso que
    // a API de Pointer Events tem esse método — o dockview em Workspace.tsx faz o mesmo).
    elemento.setPointerCapture(pointerId);

    const inicioX = e.clientX;
    const inicioY = e.clientY;
    // Última posição do ponteiro: a rolagem automática recalcula o alvo sem evento nenhum.
    let ultimoX = inicioX;
    let ultimoY = inicioY;
    let engajado = false;
    let encerrado = false;
    let alvo: AlvoSoltura = null;
    let quadro: number | null = null;
    let cursorAnterior = "";
    // Guardado no início: o teardown precisa tirar o listener do mesmo elemento em que pôs.
    const areaRolavel = scrollRef.current;

    const recalcular = () => {
      const el = scrollRef.current;
      const r = el?.getBoundingClientRect();
      // Fora da área rolável não há alvo: acima ou abaixo dela o `y` cairia em linhas que
      // estão fora da vista, e ao lado (sobre o editor) soltar não pode mover o arquivo pra
      // pasta que por acaso estiver na mesma altura.
      const dentro =
        !!r && ultimoX >= r.left && ultimoX < r.right && ultimoY >= r.top && ultimoY < r.bottom;
      if (el && r && dentro) {
        const { geometria, alturaArvore } = montarGeometria(atualRef.current.linhas);
        alvo = calcularAlvo({
          linhas: geometria,
          y: ultimoY - r.top + el.scrollTop,
          item,
          modo: atualRef.current.modo,
          alturaArvore,
          alturaFaixaRaiz: mostraFaixaRaiz(item) ? ALTURA_RAIZ : 0,
        });
      } else {
        alvo = null;
      }
      setArraste({ item, rotulo, tipoNo, x: ultimoX, y: ultimoY, alvo });
    };

    /** Negativa rola pra cima. Proporcional à proximidade da borda; ponteiro já fora da área
     * (acima ou abaixo) rola na velocidade máxima. */
    const velocidadeRolagem = (): number => {
      const r = scrollRef.current?.getBoundingClientRect();
      if (!r || ultimoX < r.left || ultimoX >= r.right) return 0;
      const proximidade = (distancia: number) =>
        Math.min(1, (ZONA_ROLAGEM - distancia) / ZONA_ROLAGEM);
      const deCima = ultimoY - r.top;
      const deBaixo = r.bottom - ultimoY;
      if (deCima < ZONA_ROLAGEM) {
        return -Math.ceil(ROLAGEM_MAXIMA_POR_QUADRO * proximidade(deCima));
      }
      if (deBaixo < ZONA_ROLAGEM) {
        return Math.ceil(ROLAGEM_MAXIMA_POR_QUADRO * proximidade(deBaixo));
      }
      return 0;
    };

    const rolarQuadro = () => {
      quadro = null;
      const el = scrollRef.current;
      const velocidade = velocidadeRolagem();
      if (encerrado || !el || velocidade === 0) return;
      const antes = el.scrollTop;
      el.scrollTop = antes + velocidade;
      // Topo ou fim: para aqui; o próximo pointermove religa se ainda houver pra onde rolar.
      if (el.scrollTop === antes) return;
      recalcular();
      quadro = requestAnimationFrame(rolarQuadro);
    };

    const aoMover = (ev: PointerEvent) => {
      // Botão já solto sem o pointerup ter chegado (soltou fora da janela depois que a
      // rolagem automática desmontou a linha e a captura se perdeu): o gesto acabou. Sem isto
      // os listeners ficariam vivos e o pointerup do próximo clique qualquer gravaria o alvo.
      if (ev.buttons === 0) {
        encerrar(false);
        return;
      }
      ultimoX = ev.clientX;
      ultimoY = ev.clientY;
      if (!engajado) {
        const dist = Math.hypot(ultimoX - inicioX, ultimoY - inicioY);
        if (dist < DISTANCIA_PARA_ENGAJAR) return;
        engajado = true;
        cursorAnterior = document.body.style.cursor;
        document.body.style.cursor = "grabbing";
      }
      recalcular();
      if (quadro === null && velocidadeRolagem() !== 0) {
        quadro = requestAnimationFrame(rolarQuadro);
      }
    };

    // O único fim do gesto, chamado de toda saída (soltar, Esc, pointercancel). Os dois gestos
    // que existiam antes divergiram duas vezes justamente aqui.
    const encerrar = (confirmar: boolean) => {
      // pointerup e pointercancel podem disparar os dois pro mesmo gesto.
      if (encerrado) return;
      encerrado = true;
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
      window.removeEventListener("pointercancel", aoCancelar);
      window.removeEventListener("keydown", aoTeclar, true);
      areaRolavel?.removeEventListener("scroll", aoRolar);
      if (quadro !== null) {
        cancelAnimationFrame(quadro);
        quadro = null;
      }
      // O elemento pode ter saído da virtualização no meio do gesto (a rolagem automática faz
      // isso) — liberar a captura de um nó desmontado lança, e isso é esperado.
      try {
        elemento.releasePointerCapture(pointerId);
      } catch {
        /* elemento já desmontado ou captura já perdida — esperado */
      }
      setArraste(null);
      if (!engajado) return;
      document.body.style.cursor = cursorAnterior;
      // Esc e pointercancel não produzem o clique do soltar; armar aqui comeria um clique
      // de verdade.
      if (!confirmar) return;
      engolirCliqueDoSoltar();
      if (alvo !== null) confirmarSoltura(item, alvo);
    };

    const aoSoltar = () => encerrar(true);

    // Rolar com a roda no meio do arrasto muda a linha sob o ponteiro parado.
    const aoRolar = () => {
      if (engajado) recalcular();
    };

    // Captura de ponteiro pode ser perdida por motivos fora do controle do app: um diálogo do
    // sistema no meio do gesto, ou o compositor decidindo que aquele movimento era rolagem de
    // toque/trackpad. Nos dois casos o gesto foi abortado, não confirmado.
    const aoCancelar = () => encerrar(false);

    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") encerrar(false);
    };

    window.addEventListener("pointermove", aoMover);
    window.addEventListener("pointerup", aoSoltar);
    window.addEventListener("pointercancel", aoCancelar);
    window.addEventListener("keydown", aoTeclar, true);
    areaRolavel?.addEventListener("scroll", aoRolar, { passive: true });
  };

  const alvo = arraste?.alvo ?? null;

  return (
    <div
      ref={scrollRef}
      className="relative h-full overflow-auto"
      onContextMenu={(e) => {
        if (modo !== "custom") return;
        // Clique em cima de um item ou de um separador já tem seu próprio menu.
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, no: null });
      }}
    >
      <div
        style={{ height: virt.getTotalSize(), position: "relative", width: "100%" }}
      >
        {virt.getVirtualItems().map((vi) => {
          const linha = linhas[vi.index];
          if (linha.kind === "separador") {
            const arrastado =
              arraste?.item.tipo === "separador" && arraste.item.chave === linha.id;
            return (
              <div
                key={linha.id}
                style={{ position: "absolute", top: vi.start, height: vi.size, width: "100%" }}
                className={cn("flex items-center px-2 group cursor-grab", arrastado && "opacity-40")}
                role="separator"
                onPointerDown={(e) =>
                  iniciarArrasto(e, { tipo: "separador", chave: linha.id }, "Separador", null)
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenu({ x: e.clientX, y: e.clientY, no: null, separador: linha.id });
                }}
              >
                <div className="h-px w-full bg-regua transition-colors duration-[140ms] ease-caderno group-hover:bg-regua-forte" />
              </div>
            );
          }
          const { no, nivel, aberta } = linha;
          const destacado = no.path === caminhoAberto;
          return (
            <ItemArvore
              key={no.path}
              no={no}
              nivel={nivel}
              aberta={aberta}
              destacado={destacado}
              alvoDeArrasto={alvo?.tipo === "mover" && alvo.pasta === no.path}
              arrastado={arraste?.item.tipo === "no" && arraste.item.path === no.path}
              style={{ top: vi.start, height: vi.size }}
              onPointerDown={(e) =>
                iniciarArrasto(
                  e,
                  {
                    tipo: "no",
                    chave: no.nome,
                    path: no.path,
                    pasta: pastaDe(no.path),
                    ehPasta: no.tipo === "folder",
                  },
                  nomeExibicao(no),
                  no.tipo,
                )
              }
              onClick={() => {
                if (no.tipo === "folder") {
                  onAlternarPasta(no.path);
                } else {
                  onAbrirArquivo(no.path);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, no });
              }}
            />
          );
        })}
        {/* Depois das linhas no DOM, pra ficar por cima delas. */}
        {alvo?.tipo === "reordenar" && (
          <div
            aria-hidden
            className="pointer-events-none absolute h-0.5 bg-cristal"
            style={{ top: alvo.y - 1, left: 8 + alvo.nivel * 16, right: 8 }}
          />
        )}
      </div>

      {/* Alvo explícito para "voltar pra raiz" — sem depender de acertar um vazio ambíguo.
          Só existe durante um arrasto de arquivo (ver `mostraFaixaRaiz`). */}
      {arraste && mostraFaixaRaiz(arraste.item) && (
        <div
          style={{ height: ALTURA_RAIZ }}
          className={cn(
            "flex items-center gap-2 border-t border-regua px-3 text-[12px] text-tinta-suave",
            alvo?.tipo === "mover" &&
              alvo.pasta === "" &&
              "bg-[color-mix(in_srgb,var(--color-cristal)_12%,transparent)]",
          )}
        >
          <Home size={14} strokeWidth={1.5} />
          raiz do vault
        </div>
      )}

      {/* Portal: a animação de entrada da sidebar deixa um `transform` aplicado, e aí `fixed`
          passa a ser relativo a ela — a coordenada de tela sai deslocada. (O Menu já faz
          portal sozinho.) */}
      {arraste &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-controle border border-regua bg-superficie px-2 py-1 text-[12px] text-tinta shadow-ficha"
            style={{ left: arraste.x + 12, top: arraste.y + 12 }}
          >
            {arraste.tipoNo === null ? (
              <Rows3 size={16} strokeWidth={1.5} aria-hidden className="shrink-0" />
            ) : (
              <IconeArquivo tipo={arraste.tipoNo} className="shrink-0" />
            )}
            {arraste.rotulo}
          </div>,
          document.body,
        )}

      {menu && (
        <Menu posicao={menu} onFechar={fecharMenu}>
          {menu.no && (
            <>
              <ItemMenu
                Icone={FilePlus}
                rotulo="Nova nota aqui"
                onClick={comMenuFechado(() => onCriarNota(pastaDoNo(menu.no!)))}
              />
              <ItemMenu
                Icone={SquarePen}
                rotulo="Novo desenho aqui"
                onClick={comMenuFechado(() => onCriarDesenho(pastaDoNo(menu.no!)))}
              />
              <ItemMenu
                Icone={FolderPlus}
                rotulo="Nova pasta aqui"
                onClick={comMenuFechado(() => onCriarPasta(pastaDoNo(menu.no!)))}
              />
              {/* Separador só existe no nível 0 (é a raiz que tem seções), e o clique no
                  espaço vazio abaixo da árvore não existe quando ela enche a sidebar — por
                  isso a ação também mora aqui, junto das outras de "criar". */}
              {modo === "custom" && !menu.no.path.includes("/") && (
                <ItemMenu
                  Icone={Rows3}
                  rotulo="Adicionar separador"
                  onClick={comMenuFechado(onAdicionarSeparador)}
                />
              )}
              <SeparadorMenu />
              <ItemMenu
                Icone={Pencil}
                rotulo="Renomear"
                onClick={comMenuFechado(() => onRenomear(menu.no!.path))}
              />
              {menu.no.tipo !== "folder" && (
                <ItemMenu
                  Icone={Move}
                  rotulo="Mover para…"
                  onClick={comMenuFechado(() => onMoverPara(menu.no!.path))}
                />
              )}
              <SeparadorMenu />
              <ItemMenu
                Icone={Trash2}
                rotulo="Mover para a lixeira"
                destrutivo
                onClick={comMenuFechado(() => onExcluir(menu.no!.path, menu.no!.tipo))}
              />
            </>
          )}
          {!menu.no && menu.separador && (
            <ItemMenu
              Icone={Trash2}
              rotulo="Remover separador"
              onClick={comMenuFechado(() => onRemoverSeparador(menu.separador!))}
            />
          )}
          {!menu.no && !menu.separador && modo === "custom" && (
            <ItemMenu
              Icone={Rows3}
              rotulo="Adicionar separador"
              onClick={comMenuFechado(onAdicionarSeparador)}
            />
          )}
        </Menu>
      )}
    </div>
  );
}
