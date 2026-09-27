// Glossário de atalhos e símbolos (RF8.3; doc 04 §15; doc 06, inventário: `DialogoGlossario`).
// Abre pelas Configurações, como um segundo `Dialog` por cima delas: a pilha de `Dialog.tsx`
// faz o Esc fechar só este e devolve o foco ao botão "Abrir glossário".
//
// Só desenha: o que aparece aqui vem dos catálogos de `src/app/glossario/`, que têm testes
// conferindo os atalhos contra os keymaps do editor e os símbolos contra o parser markdown.

import { useMemo, useState } from "react";

import { Campo, Dialog, GrupoBotoes, cn, type OpcaoGrupo } from "../index";
import AmostraSimbolo from "./AmostraSimbolo";
import TeclasAtalho from "./TeclasAtalho";
import { CATALOGO_ATALHOS, atalhoPorId } from "../../app/glossario/catalogoAtalhos";
import { CATALOGO_SIMBOLOS } from "../../app/glossario/catalogoSimbolos";
import { filtrarGlossario } from "../../app/glossario/filtrarGlossario";
import { ehMac, rotulosDoCombo } from "../../app/glossario/teclas";
import type { Atalho, ComboTeclas, Simbolo } from "../../app/glossario/tipos";

interface Props {
  onFechar(): void;
}

type Aba = "atalhos" | "simbolos";

// A aba não é persistida: o glossário abre sempre em "Atalhos" (plano, "Experiência").
const OPCOES_ABA: OpcaoGrupo<Aba>[] = [
  { rotulo: "Atalhos", valor: "atalhos" },
  { rotulo: "Símbolos", valor: "simbolos" },
];

export default function DialogoGlossario({ onFechar }: Props) {
  const [consulta, setConsulta] = useState("");
  const [aba, setAba] = useState<Aba>("atalhos");

  const atalhos = useMemo(
    () => filtrarGlossario(CATALOGO_ATALHOS, consulta, textoBuscaAtalho),
    [consulta],
  );
  const simbolos = useMemo(
    () => filtrarGlossario(CATALOGO_SIMBOLOS, consulta, textoBuscaSimbolo),
    [consulta],
  );
  const vazio = aba === "atalhos" ? atalhos.length === 0 : simbolos.length === 0;

  return (
    <Dialog titulo="Atalhos e símbolos" onFechar={onFechar} className="max-w-2xl">
      <div className="flex flex-col gap-3">
        {/* Primeiro focável do diálogo: o `Dialog` foca ele ao abrir. */}
        <Campo
          rotulo="Filtrar"
          placeholder="Filtrar por ação, tecla ou símbolo…"
          autoComplete="off"
          spellCheck={false}
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
        />
        <GrupoBotoes rotuloGrupo="Mostrar" opcoes={OPCOES_ABA} valor={aba} onEscolher={setAba} />

        {/* Só a lista rola; filtro e abas ficam parados em cima. A `key` volta a rolagem pro
         * topo ao trocar de aba — senão a outra lista abria no meio. */}
        <div key={aba} className="-mr-2 max-h-[60vh] overflow-y-auto pr-2">
          {vazio ? (
            <p className="px-1 py-4 text-center text-pequeno text-tinta-suave">
              {`Nada encontrado para «${consulta}».`}
            </p>
          ) : aba === "atalhos" ? (
            <ListaAtalhos atalhos={atalhos} />
          ) : (
            <ListaSimbolos simbolos={simbolos} />
          )}
        </div>
      </div>
    </Dialog>
  );
}

// ---- Atalhos -------------------------------------------------------------------------------

function ListaAtalhos({ atalhos }: { atalhos: Atalho[] }) {
  return (
    <div className="flex flex-col gap-5">
      {agrupar(atalhos).map(([grupo, itens]) => (
        <section key={grupo}>
          <TituloGrupo>{grupo}</TituloGrupo>
          {/* <dl>: descrição é o termo, as teclas são a definição. */}
          <dl className="flex flex-col">
            {itens.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-4 border-b border-regua py-2 last:border-b-0"
              >
                <dt className="min-w-0">
                  <div className="text-[13px] text-tinta">{a.descricao}</div>
                  {a.condicao && <div className="meta mt-1 text-tinta-suave">{a.condicao}</div>}
                </dt>
                <dd className="shrink-0">
                  <TeclasAtalho teclas={a.teclas} gesto={a.gesto} className="justify-end" />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

// ---- Símbolos ------------------------------------------------------------------------------

function ListaSimbolos({ simbolos }: { simbolos: Simbolo[] }) {
  return (
    <div className="flex flex-col gap-5">
      {agrupar(simbolos).map(([grupo, itens]) => (
        <section key={grupo}>
          <TituloGrupo>{grupo}</TituloGrupo>
          {/* Três colunas: o que se digita, como fica, o que é. Larguras fixas nas duas
           * primeiras pra que as linhas de grupos diferentes fiquem alinhadas entre si. */}
          <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,10rem)_1fr] gap-x-4">
            {itens.map((s) => (
              <LinhaSimbolo key={s.id} simbolo={s} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function LinhaSimbolo({ simbolo }: { simbolo: Simbolo }) {
  const atalho = simbolo.atalhoEquivalente ? atalhoPorId(simbolo.atalhoEquivalente) : undefined;
  // Mesma hairline entre linhas da lista de atalhos, aplicada célula a célula (grid não tem
  // borda de linha). `contents` deixa as três células participarem do grid do grupo; elas
  // esticam até a altura da linha (senão a hairline sai em alturas diferentes) e centralizam o
  // conteúdo por dentro.
  const celula = "flex min-w-0 items-center border-b border-regua py-2 group-last/linha:border-b-0";

  return (
    <div className="group/linha contents">
      <div className={celula}>
        <SintaxeVisivel sintaxe={simbolo.sintaxe} />
      </div>
      <div className={celula}>
        <AmostraSimbolo simbolo={simbolo} />
      </div>
      <div className={cn(celula, "flex-wrap justify-between gap-x-4 gap-y-1")}>
        <span className="text-[13px] text-tinta">{simbolo.descricao}</span>
        {atalho && <TeclasAtalho teclas={atalho.teclas} gesto={atalho.gesto} />}
      </div>
    </div>
  );
}

/** A sintaxe exatamente como fica no arquivo, em mono. Espaço no fim da linha é invisível e
 * às vezes é justamente o que importa (`linha␠␠` quebra no mesmo bloco, `*␠` vira lista):
 * esses espaços aparecem como `·` em `tinta-suave`, a convenção de "mostrar espaços" dos
 * editores de código. */
function SintaxeVisivel({ sintaxe }: { sintaxe: string }) {
  return (
    <pre className="min-w-0 whitespace-pre-wrap break-all font-mono text-[13px] leading-[1.45] text-tinta-media">
      {sintaxe.split("\n").map((linha, i) => {
        const semEspacoFinal = linha.trimEnd();
        const espacos = linha.length - semEspacoFinal.length;
        return (
          <span key={i} className="block">
            {semEspacoFinal}
            {espacos > 0 && <span className="text-tinta-suave">{"·".repeat(espacos)}</span>}
          </span>
        );
      })}
    </pre>
  );
}

// ---- Comum ---------------------------------------------------------------------------------

function TituloGrupo({ children }: { children: string }) {
  return <h3 className="meta mb-1 text-tinta-suave">{children}</h3>;
}

/** Agrupa mantendo a ordem do catálogo: grupos na ordem em que aparecem pela primeira vez. */
function agrupar<T extends { grupo: string }>(itens: readonly T[]): [string, T[]][] {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    const lista = grupos.get(item.grupo);
    if (lista) lista.push(item);
    else grupos.set(item.grupo, [item]);
  }
  return [...grupos];
}

/** Rótulos das teclas como a pessoa lê na tela ("Ctrl Shift X"), pra "ctrl b" e "ctrl+b"
 * acharem a linha. */
function rotulosBusca(teclas: readonly ComboTeclas[]): string {
  const mac = ehMac();
  return teclas.map((combo) => rotulosDoCombo(combo, mac).join(" ")).join(" ");
}

function textoBuscaAtalho(a: Atalho): string {
  return [rotulosBusca(a.teclas), a.gesto ?? "", a.condicao ?? ""].join(" ");
}

function textoBuscaSimbolo(s: Simbolo): string {
  const atalho = s.atalhoEquivalente ? atalhoPorId(s.atalhoEquivalente) : undefined;
  return [s.sintaxe, atalho ? rotulosBusca(atalho.teclas) : ""].join(" ");
}
