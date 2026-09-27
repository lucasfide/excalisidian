// Coluna "como fica" do glossário (doc 06, inventário: `AmostraSimbolo`). Desenha o exemplo de
// cada símbolo com os mesmos tokens que o editor usa pra aquela marca — `tokens-excalisidian.css`
// (ponte de tema) e `styles/inline-preview.css` (estilos do live preview) —, não com um estilo
// "de documentação" próprio: a amostra tem que ser reconhecível quando a pessoa voltar pra nota.
//
// Onde o editor e o doc 06 divergem, vale o doc 06 (é o normativo), e a divergência fica
// anotada no caso. `comportamento` não desenha nada: a descrição já diz o que acontece.

import type { ReactNode } from "react";
import { Check } from "lucide-react";

import { cn } from "../cn";
import IconeArquivo from "../IconeArquivo";
import type { Simbolo } from "../../app/glossario/tipos";

interface Props {
  simbolo: Simbolo;
}

export default function AmostraSimbolo({ simbolo }: Props) {
  const texto = simbolo.textoAmostra ?? "";

  switch (simbolo.amostra) {
    // ---- Texto: marcas inline (`.cm-atomic-strong`/`-em`/`-strike`/`-inline-code`) --------
    case "negrito":
      return <span className="font-bold text-tinta">{texto}</span>;
    case "italico":
      return <span className="italic text-tinta">{texto}</span>;
    case "riscado":
      // `.cm-atomic-strike`: riscado em `tinta-media` (--atomic-editor-fg-muted).
      return <span className="text-tinta-media line-through">{texto}</span>;
    case "destaque":
      // Doc 06: "fundo `ocre` a 22%, sem borda".
      return <span className="bg-ocre/22 text-tinta">{texto}</span>;
    case "codigo":
      // Doc 06: IBM Plex Mono 13px, fundo `lavagem`, padding 2px 4px, raio 2px.
      return (
        <code className="rounded-controle bg-lavagem px-1 py-0.5 font-mono text-[13px] text-tinta">
          {texto}
        </code>
      );

    // ---- Blocos ---------------------------------------------------------------------------
    // Títulos: Fraunces 500 nos tamanhos `titulo-1/2/3` do doc 06 (`tokens-excalisidian.css`).
    case "titulo-1":
      return <span className="font-display text-[24px] font-medium leading-[1.2] text-tinta">{texto}</span>;
    case "titulo-2":
      return <span className="font-display text-[19px] font-medium leading-[1.3] text-tinta">{texto}</span>;
    case "titulo-3":
      return <span className="font-display text-[16px] font-medium leading-[1.4] text-tinta">{texto}</span>;
    case "citacao":
      // Doc 06: borda esquerda 2px `regua`, texto `tinta-media`, sem itálico. O recuo de 16px é
      // o `padding-left: 1rem` do `.cm-atomic-blockquote`.
      return <span className="block border-l-2 border-regua pl-4 text-tinta-media">{texto}</span>;
    case "lista":
      // Marcador `•` em `tinta-media` negrito (`.cm-atomic-bullet`), que substitui o `-`.
      return (
        <ItemLista marcador={<span className="font-bold text-tinta-media">•</span>}>{texto}</ItemLista>
      );
    case "lista-numerada":
      // O número continua sendo o texto do arquivo, pintado como sintaxe (`tinta-suave`).
      return <ItemLista marcador={<span className="text-tinta-suave">1.</span>}>{texto}</ItemLista>;
    case "tarefa":
      return <ItemLista marcador={<CaixaTarefa marcada={false} />}>{texto}</ItemLista>;
    case "tarefa-feita":
      // Doc 06: "traço de 1px em `tinta-suave` sobre o texto" (`.cm-atomic-task-done`).
      return (
        <ItemLista marcador={<CaixaTarefa marcada />}>
          <span className="text-tinta-suave line-through">{texto}</span>
        </ItemLista>
      );
    case "linha-horizontal":
      // `.cm-atomic-hr::after`: hairline de 1px em `--atomic-editor-border`, que a ponte de
      // tema liga a `regua-forte` — não `regua`, senão a linha some sobre `superficie`.
      return <span aria-hidden className="block w-full border-t border-regua-forte" />;
    case "bloco-codigo":
      // Doc 06: IBM Plex Mono 13px, fundo `lavagem`, raio 3px. O trilho de 2px à esquerda é o
      // `box-shadow: inset 2px 0 0 regua` de `.cm-atomic-fenced-code`, feito aqui com borda.
      return (
        <code className="block rounded-ficha border-l-2 border-regua bg-lavagem px-3 py-0.5 font-mono text-[13px] text-tinta">
          {texto}
        </code>
      );
    case "tabela":
      return <TabelaAmostra sintaxe={simbolo.sintaxe} />;
    case "quebra-mesmo-bloco":
      // Duas linhas coladas, sem o respiro que separa blocos.
      return (
        <span className="text-tinta">
          {simbolo.sintaxe.split("  \n").map((linha, i) => (
            <span key={i} className="block">
              {linha}
            </span>
          ))}
        </span>
      );

    // ---- Links e embeds -------------------------------------------------------------------
    case "link-interno":
      // Doc 06: link resolvido em `cristal`, sem sublinhado (`tokens-excalisidian.css`).
      return <span className="text-cristal">{rotuloDoLink(simbolo.sintaxe)}</span>;
    case "link-externo":
      // `.cm-atomic-link`: `cristal` com sublinhado de 1px — o link externo mantém o
      // sublinhado do pacote; só o wikilink perdeu (doc 06).
      return (
        <span className="text-cristal underline decoration-1 underline-offset-[0.15em]">{texto}</span>
      );
    case "embed":
      return <EmbedAmostra sintaxe={simbolo.sintaxe} />;
    case "comentario":
    case "id-bloco":
      // O editor não esconde nem estiliza `%%…%%` nem `^id` hoje: aparecem como sintaxe
      // markdown visível (`tinta-suave`). A amostra mostra isso, não uma promessa.
      return (
        <span className="font-mono text-[13px] text-tinta-suave">{simbolo.sintaxe}</span>
      );

    case "comportamento":
      return null;
  }
}

function ItemLista({ marcador, children }: { marcador: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-tinta">
      {marcador}
      {children}
    </span>
  );
}

/** Mesmo desenho do `Checkbox` de `src/ui` (doc 06: borda `regua-forte`, marcada em
 * `cristal`), mas inerte: o `Checkbox` é um <button> focável, e uma amostra não pode entrar
 * na ordem de Tab nem na armadilha de foco do diálogo. */
function CaixaTarefa({ marcada }: { marcada: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-controle border",
        marcada ? "border-cristal bg-cristal text-superficie" : "border-regua-forte text-transparent",
      )}
    >
      <Check size={12} strokeWidth={3} />
    </span>
  );
}

/** Tabela desenhada como o widget do editor (`.cm-atomic-table`): células com hairline
 * `regua-forte` (--atomic-editor-border), cabeçalho em negrito sobre `lavagem`. */
function TabelaAmostra({ sintaxe }: { sintaxe: string }) {
  const linhas = sintaxe
    .split("\n")
    .filter((linha) => !/^\|?[\s:|-]+\|?$/.test(linha)) // descarta a linha `|---|---|`
    .map((linha) =>
      linha
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim()),
    );
  const [cabecalho = [], ...corpo] = linhas;
  const celula = "border border-regua-forte px-2 py-0.5 text-left";

  return (
    <table className="border-collapse text-pequeno text-tinta">
      <thead>
        <tr>
          {cabecalho.map((c, i) => (
            <th key={i} className={cn(celula, "bg-lavagem font-bold")}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {corpo.map((linha, i) => (
          <tr key={i}>
            {linha.map((c, j) => (
              <td key={j} className={celula}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Embed como cartão ancorado no texto — hairline `regua`, `raio-ficha`, sem sombra, o mesmo
 * de `.cm-embed-desenho` —, com o ícone do tipo de arquivo (doc 06, Ícones). */
function EmbedAmostra({ sintaxe }: { sintaxe: string }) {
  const alvo = miolo(sintaxe).split("|")[0];
  const tipo = alvo.endsWith(".draw.md")
    ? "drawing"
    : /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(alvo)
      ? "attachment"
      : "note";

  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-ficha border border-regua px-2 py-1 text-pequeno text-tinta-media">
      <IconeArquivo tipo={tipo} className="shrink-0 text-tinta-suave" />
      <span className="truncate">{alvo}</span>
    </span>
  );
}

/** O que fica entre `[[`/`![[` e `]]`. */
function miolo(sintaxe: string): string {
  return sintaxe.replace(/^!?\[\[/, "").replace(/\]\]$/, "");
}

/** Texto que o editor mostra no lugar do wikilink: o apelido depois do `|`, se houver; senão
 * o alvo inteiro (`Nota#Título`). */
function rotuloDoLink(sintaxe: string): string {
  const [alvo, apelido] = miolo(sintaxe).split("|");
  return apelido?.trim() || alvo;
}
