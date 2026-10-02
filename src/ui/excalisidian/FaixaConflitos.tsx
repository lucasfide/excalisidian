// Faixa discreta de sincronização (RF de conflitos, task-5): avisa quando a mesma nota foi
// editada em dois lugares, sem interromper o trabalho — regra de não incomodar (doc 04): a
// faixa nunca renderiza nada quando a fila está vazia.
//
// Auto-posicionada com `fixed`, montada junto dos outros painéis e sobreposições em App.tsx —
// convenção dos overlays do app (`fixed` com posição própria): quem é overlay se posiciona
// sozinho, o `App.tsx` só monta. Aqui não há o risco do comentário de `Dialog.tsx` (ancestral
// com `transform` confinando um `fixed`): este componente entra direto num filho do container
// raiz, sem ancestral transformado entre os dois — conferido subindo a cadeia até a raiz —, e
// o `Dialog` do comparador abaixo renderiza por portal em `document.body` de qualquer forma.
//
// Posição (revisão 1 do planejador, 2026-09-23): embaixo, centralizada, acima da
// `BarraStatus` (`h-6` = 24px). Não em cima: o topo da janela é onde o dockview desenha as
// abas, e a faixa ficava por cima delas. Também não no canto inferior direito: é lá que moram
// os toasts — outro alvo ali criaria disputa de atenção com eles. `bottom-8` (32px) é a altura da barra de status (24px)
// mais um respiro de 8px acima dela, os dois na escala numérica padrão do Tailwind que o resto
// do app já usa para espaçamento (`gap-3`, `bottom-4`, etc. — os tokens do doc 06 cobrem cor,
// fonte, raio e sombra, não espaçamento).
//
// O comparador abre num `Dialog` (portal em document.body, pilha do Esc) — nunca como um
// `position: fixed` solto dentro de outro componente. O conflito some da fila sozinho quando
// `resolver` termina (conflitosStore.ts), e como `conflitoAberto` é lido direto do store por
// caminho, o diálogo fecha em silêncio quando isso acontece — sem precisar de um callback
// "ao resolver".
//
// Roteamento por tipo (task-6): nota abre `ComparadorNotas` (diff de texto), desenho abre
// `ComparadorDesenhos` (duas telas do Excalidraw — desenho não compara como texto). O diálogo
// do desenho é mais largo (`max-w-5xl` em vez do `max-w-3xl` da nota, mesma escala de
// `max-w-*` que o resto do app já usa nos outros `Dialog`) para caber duas telas lado a lado
// sem espremer.

import { useState } from "react";

import { useConflitosStore } from "../../estado/conflitosStore";
import { useTexto } from "../../i18n/useTexto";
import { dividirExtensao, nomeBase } from "../../vault/caminhos";
import Botao from "../Botao";
import Dialog from "../Dialog";
import ComparadorDesenhos from "./ComparadorDesenhos";
import ComparadorNotas from "./ComparadorNotas";

export default function FaixaConflitos() {
  const conflitos = useConflitosStore((s) => s.conflitos);
  const [caminhoAberto, setCaminhoAberto] = useState<string | null>(null);
  const conflitoAberto = useConflitosStore((s) =>
    caminhoAberto ? s.conflitoDe(caminhoAberto) : undefined,
  );
  const t = useTexto();

  if (conflitos.length === 0) return null;

  const texto =
    conflitos.length === 1
      ? t("conflito.faixa.um")
      : t("conflito.faixa.varias", { contagem: conflitos.length });

  return (
    <>
      <div
        role="status"
        className="fixed bottom-8 left-1/2 z-40 flex w-fit max-w-lg -translate-x-1/2 items-center justify-between gap-3 rounded-ficha border border-ocre bg-[color-mix(in_srgb,var(--color-ocre)_18%,var(--color-superficie))] px-4 py-2 shadow-sobreposicao"
      >
        <span className="text-pequeno text-tinta">{texto}</span>
        <Botao
          tamanho="compacto"
          onClick={() => setCaminhoAberto(conflitos[0].caminho)}
        >
          {t("conflito.faixa.resolver")}
        </Botao>
      </div>

      {conflitoAberto && conflitoAberto.tipo === "desenho" && (
        <Dialog
          titulo={t("conflito.desenho.titulo", {
            nome: dividirExtensao(nomeBase(conflitoAberto.caminho)).base,
          })}
          descricao={t("conflito.desenho.explicacao")}
          onFechar={() => setCaminhoAberto(null)}
          className="max-w-5xl"
        >
          <ComparadorDesenhos conflito={conflitoAberto} />
        </Dialog>
      )}

      {conflitoAberto && conflitoAberto.tipo === "nota" && (
        <Dialog
          titulo={t("conflito.titulo", {
            nome: dividirExtensao(nomeBase(conflitoAberto.caminho)).base,
          })}
          descricao={t("conflito.explicacao")}
          onFechar={() => setCaminhoAberto(null)}
          className="max-w-3xl"
        >
          <ComparadorNotas conflito={conflitoAberto} />
        </Dialog>
      )}
    </>
  );
}
