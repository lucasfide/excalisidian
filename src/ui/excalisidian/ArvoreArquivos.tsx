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

import { nomeExibicao, encontrarNo as encontrarNoLocal, type NoArvore } from "../../vault/arvore";
import { pastaDe } from "../../vault/caminhos";
import { ordenarArvore } from "../../vault/ordenacao";
import { Menu, ItemMenu, SeparadorMenu, type PosicaoMenu, cn } from "../index";
import ItemArvore from "./ItemArvore";

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

/** `null` = nenhum alvo válido sob o cursor; `""` = raiz. */
type AlvoArrasto = string | null;

interface EstadoArrasto {
  path: string;
  nome: string;
  x: number;
  y: number;
  alvo: AlvoArrasto;
  /** Pasta arrastada: não mostra a faixa "raiz do vault", que pra ela é alvo inválido. */
  ehPasta: boolean;
}

const ALTURA_LINHA = 26;
const ALTURA_RAIZ = 32;

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
  const arrastoRef = useRef<{
    path: string;
    nome: string;
    origem: string;
    /** Pasta arrastada: só reordena entre irmãs, nunca vira `onMoverArquivo`. */
    ehPasta: boolean;
    startX: number;
    startY: number;
    engajado: boolean;
    alvo: AlvoArrasto;
    /** Último Y do ponteiro: `aoSoltar` também é chamado sem evento (Esc), então a posição
     * do drop precisa estar guardada aqui. */
    ultimoY: number;
    elemento: HTMLElement;
    pointerId: number;
  } | null>(null);

  const virt = useVirtualizer({
    count: linhas.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ALTURA_LINHA,
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

  const acharAlvo = (clientY: number): AlvoArrasto => {
    const rect = scrollRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const y = clientY - rect.top + (scrollRef.current?.scrollTop ?? 0);
    const totalArvore = virt.getTotalSize();
    if (y >= totalArvore && y < totalArvore + ALTURA_RAIZ) return "";
    const item = virt
      .getVirtualItems()
      .find((vi) => y >= vi.start && y < vi.start + vi.size);
    if (!item) return null;
    // `linhas` pode ter encolhido desde o pointerdown (o watcher do vault remonta a árvore),
    // e aí o índice do virtualizador não existe mais aqui.
    const linha: LinhaVisivel | undefined = linhas[item.index];
    if (!linha || linha.kind !== "no") return null;
    const { no } = linha;
    return no.tipo === "folder" ? no.path : null;
  };

  /** Em modo customizado, soltar um item sobre outro do MESMO nível reordena os dois — sem
   * mexer em qual pasta cada um está. Devolve o índice de linha (dentro de `linhas`) sob o
   * cursor, ou -1 se não houver nenhum. */
  const acharIndiceLinha = (clientY: number): number => {
    const rect = scrollRef.current?.getBoundingClientRect();
    if (!rect) return -1;
    const y = clientY - rect.top + (scrollRef.current?.scrollTop ?? 0);
    const item = virt.getVirtualItems().find((vi) => y >= vi.start && y < vi.start + vi.size);
    return item ? item.index : -1;
  };

  /** Calcula a nova ordem de uma pasta movendo `pathArrastado` pra logo antes de `pathAlvo`,
   * e persiste via `onReordenarNivel`. A ordem-base é a mesma que desenhou a árvore, então o
   * que é gravado é exatamente o que estava na tela (separadores inclusive). */
  const reordenarAposArrasto = async (
    pasta: string,
    pathArrastado: string,
    pathAlvo: string,
  ): Promise<void> => {
    const nivelNo = pasta === "" ? raizOrdenada : encontrarNoLocal(raizOrdenada, pasta);
    if (!nivelNo) return;
    const nomeArrastado = pathArrastado.slice(pathArrastado.lastIndexOf("/") + 1);
    const nomeAlvo = pathAlvo.slice(pathAlvo.lastIndexOf("/") + 1);
    if (nomeArrastado === nomeAlvo) return;
    const base = pasta === "" ? entradasRaiz : ordemBaseDoNivel(customOrder[pasta], nivelNo);
    const semArrastado = base.filter((e) => e !== nomeArrastado);
    const indiceAlvo = semArrastado.indexOf(nomeAlvo);
    if (indiceAlvo === -1) return;
    const novaOrdem = [
      ...semArrastado.slice(0, indiceAlvo),
      nomeArrastado,
      ...semArrastado.slice(indiceAlvo),
    ];
    await onReordenarNivel(pasta, novaOrdem);
  };

  const iniciarArrasto = (e: React.PointerEvent, no: NoArvore) => {
    if (e.button !== 0) return;
    // Pasta arrasta só em modo customizado, e só pra reordenar entre irmãs: mudar uma pasta
    // inteira de lugar no disco está fora do escopo (ver o cabeçalho de vault/mover.ts), e é
    // `ehPasta` que mantém o branch de `onMoverArquivo` inalcançável pra ela lá no drop.
    const ehPasta = no.tipo === "folder";
    if (ehPasta && modo !== "custom") return;
    e.preventDefault();
    const origem = pastaDe(no.path);
    const elemento = e.currentTarget as HTMLElement;
    // Sem captura explícita, a entrega de pointermove/pointerup pra este gesto não é
    // garantida assim que o cursor sai dos limites do elemento original (é pra isso que
    // a API de Pointer Events tem esse método — o dockview em Workspace.tsx faz o mesmo).
    elemento.setPointerCapture(e.pointerId);

    arrastoRef.current = {
      path: no.path,
      nome: nomeExibicao(no),
      origem,
      ehPasta,
      startX: e.clientX,
      startY: e.clientY,
      engajado: false,
      alvo: null,
      ultimoY: e.clientY,
      elemento,
      pointerId: e.pointerId,
    };

    // Esc desiste do gesto: solta a captura e limpa o estado sem mover nem reordenar nada.
    let cancelado = false;

    const aoMover = (ev: PointerEvent) => {
      const info = arrastoRef.current;
      if (!info) return;
      if (!info.engajado) {
        const dist = Math.hypot(ev.clientX - info.startX, ev.clientY - info.startY);
        if (dist < 4) return;
        info.engajado = true;
      }
      // Pasta arrastada nunca tem pasta-destino: o único drop que vale pra ela é o reorder
      // entre irmãs, que roda justamente quando `alvo` é null. Sem isso, soltar uma pasta
      // sobre outra não faria nada (e nenhuma pasta se destaca como alvo durante o gesto).
      let alvo = info.ehPasta ? null : acharAlvo(ev.clientY);
      if (alvo === info.origem) alvo = null; // soltar na própria pasta não faz nada
      info.alvo = alvo;
      info.ultimoY = ev.clientY;
      setArraste({
        path: info.path,
        nome: info.nome,
        x: ev.clientX,
        y: ev.clientY,
        alvo,
        ehPasta: info.ehPasta,
      });
    };

    const aoSoltar = () => {
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
      window.removeEventListener("pointercancel", aoCancelar);
      window.removeEventListener("keydown", aoTeclar, true);
      const info = arrastoRef.current;
      arrastoRef.current = null;
      setArraste(null);
      // `info` pode já ser null aqui se pointerup e pointercancel dispararem os dois pro
      // mesmo gesto (a 2ª chamada não tem o que liberar). Quando não é null, o elemento
      // pode ter saído da virtualização entre o início do arrasto e agora — liberar a
      // captura de um nó desmontado lança, e isso é esperado, não um erro real.
      try {
        info?.elemento.releasePointerCapture(info.pointerId);
      } catch {
        /* elemento já desmontado ou captura já perdida — esperado */
      }
      if (cancelado) return;
      if (info?.engajado && modo === "custom" && info.alvo === null) {
        // Alvo null pode ser "sem pasta válida sob o cursor" OU "é a própria pasta de
        // origem" (`aoMover` zera esse caso) — nos dois, ainda vale checar se caiu sobre um
        // irmão pra reordenar. Comparar por `pastaDe` e não por `pastaDoNo`: a linha da
        // própria pasta de origem cai aqui também, e ela não é irmã de ninguém no nível.
        const indice = acharIndiceLinha(info.ultimoY);
        const linhaAlvo = indice !== -1 ? linhas[indice] : undefined;
        if (linhaAlvo?.kind === "no" && pastaDe(linhaAlvo.no.path) === info.origem) {
          void reordenarAposArrasto(info.origem, info.path, linhaAlvo.no.path);
        }
      } else if (info?.engajado && !info.ehPasta && info.alvo !== null) {
        // `!info.ehPasta` é redundante com o `alvo` forçado a null em `aoMover` — é de
        // propósito: mover pasta no disco está fora do escopo e não pode depender de um só
        // ponto de controle.
        onMoverArquivo(info.path, info.alvo);
      }
    };

    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      // Mesma semântica do arrasto do separador: Esc cancela, não confirma o drop.
      cancelado = true;
      aoSoltar();
    };

    // Captura de ponteiro pode ser perdida por motivos fora do controle do app: um diálogo do
    // sistema no meio do gesto, ou o compositor decidindo que aquele movimento era rolagem de
    // toque/trackpad. Nos dois casos o gesto foi abortado, não confirmado — comitar aqui
    // gravaria uma reordenação que o usuário nunca pediu (o reorder dispara justamente com
    // `alvo` null, que é o estado normal de uma rolagem).
    const aoCancelar = () => {
      cancelado = true;
      aoSoltar();
    };

    window.addEventListener("pointermove", aoMover);
    window.addEventListener("pointerup", aoSoltar);
    window.addEventListener("pointercancel", aoCancelar);
    window.addEventListener("keydown", aoTeclar, true);
  };

  /** Arrastar o separador pra outra posição entre os itens de nível 0. Não reaproveita
   * `arrastoRef`: um separador não tem nó nem pasta de origem, e o único estado que este
   * gesto precisa (o id) já está no fecho. */
  const iniciarArrastoSeparador = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const elemento = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    elemento.setPointerCapture(pointerId);

    const encerrar = () => {
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
      window.removeEventListener("pointercancel", encerrar);
      window.removeEventListener("keydown", aoTeclar, true);
      try {
        elemento.releasePointerCapture(pointerId);
      } catch {
        /* elemento já desmontado ou captura já perdida — esperado */
      }
    };

    // Feedback visual simples: nenhum ghost/tooltip pro separador (ele já é uma linha fina,
    // arrastar sem preview extra é suficiente) — só recalcula o índice ao soltar.
    const aoMover = (ev: PointerEvent) => {
      ev.preventDefault();
    };

    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") encerrar();
    };

    const aoSoltar = (ev: PointerEvent) => {
      encerrar();
      const indice = acharIndiceLinha(ev.clientY);
      if (indice === -1) return;
      // `linhas` pode ter encolhido entre o pointerdown e o pointerup (o watcher do vault
      // remonta a árvore), então o índice do virtualizador pode não existir mais aqui.
      const linhaAlvo: LinhaVisivel | undefined = linhas[indice];
      // Soltar sobre ele mesmo (clique sem arrastar) não mexe em nada.
      if (linhaAlvo?.kind === "separador" && linhaAlvo.id === id) return;
      const semSeparador = entradasRaiz.filter((e2) => e2 !== id);
      // Item de nível 0 que contém a linha sob o cursor: solto dentro de uma pasta aberta,
      // o separador vai pra antes da pasta inteira. Sem linha sob o cursor, vai pro fim.
      const alvo =
        linhaAlvo === undefined
          ? undefined
          : linhaAlvo.kind === "no"
            ? linhaAlvo.no.path.split("/")[0]
            : linhaAlvo.id;
      let posicaoNova = alvo === undefined ? -1 : semSeparador.indexOf(alvo);
      if (posicaoNova === -1) posicaoNova = semSeparador.length;
      const novaOrdem = [
        ...semSeparador.slice(0, posicaoNova),
        id,
        ...semSeparador.slice(posicaoNova),
      ];
      void onReordenarNivel("", novaOrdem);
    };

    window.addEventListener("pointermove", aoMover);
    window.addEventListener("pointerup", aoSoltar);
    window.addEventListener("pointercancel", encerrar);
    window.addEventListener("keydown", aoTeclar, true);
  };

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
            return (
              <div
                key={linha.id}
                style={{ position: "absolute", top: vi.start, height: vi.size, width: "100%" }}
                className="flex items-center px-3"
                onPointerDown={(e) => iniciarArrastoSeparador(e, linha.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenu({ x: e.clientX, y: e.clientY, no: null, separador: linha.id });
                }}
              >
                <div className="h-px w-full bg-regua-forte" />
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
              alvoDeArrasto={arraste?.alvo === no.path}
              style={{ top: vi.start, height: vi.size }}
              onPointerDown={(e) => iniciarArrasto(e, no)}
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
      </div>

      {/* Alvo explícito para "voltar pra raiz" — sem depender de acertar um vazio ambíguo.
          Só existe durante um arrasto de arquivo: fora disso é só espaço ocupado à toa, e
          pasta não muda de lugar no disco, então pra ela a faixa seria um alvo que não faz
          nada. */}
      {arraste && !arraste.ehPasta && (
        <div
          style={{ height: ALTURA_RAIZ }}
          className={cn(
            "flex items-center gap-2 border-t border-regua px-3 text-[12px] text-tinta-suave",
            arraste.alvo === "" && "bg-[color-mix(in_srgb,var(--color-cristal)_12%,transparent)]",
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
            className="pointer-events-none fixed z-50 rounded-controle border border-regua-forte bg-superficie px-2 py-1 text-[12px] text-tinta shadow-[var(--shadow-sobreposicao)]"
            style={{ left: arraste.x + 12, top: arraste.y + 12 }}
          >
            {arraste.nome}
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
