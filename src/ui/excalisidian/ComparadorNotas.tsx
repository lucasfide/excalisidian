// As duas versões de uma nota em conflito, lado a lado (task-5). Toda a lógica de alinhar as
// colunas mora em `colunasDeComparacao` (`src/sync/colunasComparacao.ts`, com teste próprio) —
// este componente só desenha. A resolução (ficar com esta / manter as duas, tratamento de
// erro) mora em `useResolucaoDeConflito`, compartilhada com `ComparadorDesenhos` (task-6).
//
// Cores das diferenças: fundo translúcido derivado dos tokens semânticos com `color-mix`, o
// mesmo recurso que o escurecido do `Dialog.tsx` já usa (`color-mix(in srgb, var(--color-tinta)
// 28%, transparent)`). Texto sobre um fundo `bordo` ou `cristal` CHEIOS perde contraste —
// sobretudo no tema escuro, onde essas duas cores já são claras por si (`--color-bordo:
// #c97b69`, `--color-cristal: #aa85cb`) e ficariam perto demais do `tinta` claro do texto.
// Misturando com `transparent` a 16%, o fundo da linha continua muito próximo de `superficie`
// (o fundo do diálogo por trás): o realce marca a diferença sem brigar com a legibilidade do
// texto que já está em cima, nos dois temas. "Igual" fica sem fundo nenhum — com só dois
// estados marcados (removido, adicionado), a diferença salta aos olhos sem ruído visual na
// maior parte do texto, que normalmente é igual nas duas versões.

import { useMemo } from "react";

import { usePrefsStore } from "../../estado/prefsStore";
import { diffLinhas, temDiferenca } from "../../sync/diffLinhas";
import { colunasDeComparacao, type CelulaComparacao, type LinhaComparacao } from "../../sync/colunasComparacao";
import type { Conflito } from "../../sync/tipos";
import { tagDeLocale } from "../../i18n/idioma";
import { useTexto } from "../../i18n/useTexto";
import Botao from "../Botao";
import { cn } from "../cn";
import { useResolucaoDeConflito } from "./useResolucaoDeConflito";
import { CabecalhoColuna, formatarData } from "./cabecalhoVersaoConflito";

interface Props {
  conflito: Conflito;
}

export default function ComparadorNotas({ conflito }: Props) {
  const t = useTexto();
  const idioma = usePrefsStore((s) => s.idioma);
  const { emAndamento, resolver } = useResolucaoDeConflito(conflito.caminho);

  const trechos = useMemo(
    () => diffLinhas(conflito.local.conteudo, conflito.remoto.conteudo),
    [conflito.local.conteudo, conflito.remoto.conteudo],
  );
  const diferente = temDiferenca(trechos);
  const linhas = useMemo(() => colunasDeComparacao(trechos), [trechos]);

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

      {diferente ? (
        <div className="max-h-[50vh] overflow-y-auto rounded-ficha border border-regua">
          <div className="grid grid-cols-1 font-mono text-pequeno sm:grid-cols-2">
            {linhas.map((linha, i) => (
              <FragmentoLinha key={i} linha={linha} />
            ))}
          </div>
        </div>
      ) : (
        <p className="rounded-ficha border border-regua bg-lavagem px-3 py-2 text-pequeno text-tinta-media">
          {t("conflito.semDiferenca")}
        </p>
      )}

      {diferente ? (
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
          </div>
          <Botao
            className="sm:justify-self-end"
            disabled={emAndamento}
            onClick={() => void resolver({ acao: "ficarCom", origem: "remoto" })}
          >
            {t("conflito.ficarComEsta")}
          </Botao>
        </div>
      ) : (
        <div className="pt-1">
          <Botao
            disabled={emAndamento}
            onClick={() => void resolver({ acao: "ficarCom", origem: "local" })}
          >
            {t("conflito.ficarComEsta")}
          </Botao>
        </div>
      )}
    </div>
  );
}

// A tabela de duas colunas é montada como UMA grade só (não dois `<div>` independentes): o
// grid do CSS sincroniza a altura de cada linha entre as duas colunas automaticamente, mesmo
// quando o texto de um lado quebra em mais linhas que o outro. Duas grades separadas
// perderiam esse alinhamento. Em telas estreitas (`grid-cols-1`), as células caem em sequência
// — esquerda da linha 1, direita da linha 1, esquerda da linha 2... — que é a forma mais simples
// de empilhar sem reescrever a lógica de alinhamento.
//
// Desde a revisão 1: uma linha da grade pode ter as duas células marcadas ao mesmo tempo — é o
// caso da troca pareada que `colunasDeComparacao` monta (a versão antiga ao lado da nova). A
// cor de cada célula sempre segue o LADO em que ela está (esquerda = removida = bordo, direita
// = adicionada = cristal), nunca um "tipo" da linha inteira.
function FragmentoLinha({ linha }: { linha: LinhaComparacao }) {
  return (
    <>
      <CelulaLinha celula={linha.esquerda} cor="bordo" />
      <CelulaLinha celula={linha.direita} cor="cristal" />
    </>
  );
}

// Célula de PREENCHIMENTO de alinhamento (o lado mais curto de um par removido/adicionado,
// completado só pra as duas colunas terem o mesmo número de linhas — `colunasComparacao.ts`)
// leva o fundo `lavagem`, o mesmo token que este arquivo já usa pra "sem diferença" mais
// abaixo, MAIS o texto "Não existe nesta versão" no estilo `meta` (o mesmo rótulo discreto de
// "EDITADO EM ..." no cabeçalho da coluna, `cabecalhoVersaoConflito.tsx`). Fundo sozinho não
// bastava: no tema escuro o cinza quase não aparece e o dono do produto continuava lendo o
// espaço como uma linha em branco que "sumiu" ao escolher a versão (achado 23/09, re-teste
// 24/09). Sem `aria-hidden`: agora a célula tem um texto que informa algo real a quem usa
// leitor de tela — esconder seria tirar informação, não ruído.
function CelulaLinha({ celula, cor }: { celula: CelulaComparacao; cor: "bordo" | "cristal" }) {
  const t = useTexto();
  return (
    <div
      className={cn(
        "whitespace-pre-wrap px-2 py-0.5 text-tinta",
        celula.preenchimento && "bg-lavagem",
        celula.marcada &&
          cor === "bordo" &&
          "bg-[color-mix(in_srgb,var(--color-bordo)_16%,transparent)]",
        celula.marcada &&
          cor === "cristal" &&
          "bg-[color-mix(in_srgb,var(--color-cristal)_16%,transparent)]",
      )}
    >
      {celula.preenchimento ? (
        <span className="meta text-tinta-suave">{t("conflito.linhaAusente")}</span>
      ) : (
        (celula.texto ?? " ")
      )}
    </div>
  );
}
