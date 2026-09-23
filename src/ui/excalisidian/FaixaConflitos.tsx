// Faixa discreta de sincronização (RF de conflitos, task-5): avisa quando a mesma nota foi
// editada em dois lugares, sem interromper o trabalho — regra de não incomodar (doc 04): a
// faixa nunca renderiza nada quando a fila está vazia.
//
// Auto-posicionada com `fixed`, montada junto dos outros painéis e sobreposições em App.tsx —
// mesma convenção de `BalaoAgente.tsx` (`fixed bottom-4 right-4`): quem é overlay se posiciona
// sozinho, o `App.tsx` só monta. Aqui não há o risco do comentário de `Dialog.tsx` (ancestral
// com `transform` confinando um `fixed`): este componente entra direto num filho do container
// raiz, sem ancestral transformado entre os dois, e o `Dialog` do comparador abaixo renderiza
// por portal em `document.body` de qualquer forma.
//
// O comparador abre num `Dialog` (portal em document.body, pilha do Esc) — nunca como um
// `position: fixed` solto dentro de outro componente. O conflito some da fila sozinho quando
// `resolver` termina (conflitosStore.ts), e como `conflitoAberto` é lido direto do store por
// caminho, o diálogo fecha em silêncio quando isso acontece — sem precisar de um callback
// "ao resolver".

import { useState } from "react";

import { useConflitosStore } from "../../estado/conflitosStore";
import { useTexto } from "../../i18n/useTexto";
import { dividirExtensao, nomeBase } from "../../vault/caminhos";
import Botao from "../Botao";
import Dialog from "../Dialog";
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
        className="fixed left-1/2 top-4 z-40 flex w-fit max-w-lg -translate-x-1/2 items-center justify-between gap-3 rounded-ficha border border-ocre bg-[color-mix(in_srgb,var(--color-ocre)_18%,var(--color-superficie))] px-4 py-2 shadow-sobreposicao"
      >
        <span className="text-pequeno text-tinta">{texto}</span>
        <Botao
          tamanho="compacto"
          onClick={() => setCaminhoAberto(conflitos[0].caminho)}
        >
          {t("conflito.faixa.resolver")}
        </Botao>
      </div>

      {conflitoAberto && (
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
