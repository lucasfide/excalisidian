// Faixa no topo do editor quando o arquivo aberto mudou ou sumiu por fora (doc 02 §11,
// textos do doc 04 §10). Não decide sozinho: oferece as duas ações e deixa o usuário
// escolher.

import { useDocumentosStore } from "../../estado/documentosStore";

export default function FaixaConflito({ path }: { path: string }) {
  const doc = useDocumentosStore((s) => s.docs.get(path));
  const recarregar = useDocumentosStore((s) => s.recarregarDoDisco);
  const manter = useDocumentosStore((s) => s.manterMinhaVersao);
  const recriar = useDocumentosStore((s) => s.recriar);

  if (!doc || (doc.estado !== "conflito" && doc.estado !== "orfao")) return null;

  const orfao = doc.estado === "orfao";

  return (
    <div className="flex items-center gap-3 border-b border-ocre bg-[color-mix(in_srgb,var(--color-ocre)_18%,var(--color-superficie))] px-4 py-2">
      <span className="flex-1 text-pequeno text-tinta">
        {orfao
          ? "Este arquivo não existe mais no disco."
          : "Este arquivo mudou fora do Excalisidian."}
      </span>
      {orfao ? (
        <button
          onClick={() => void recriar(path)}
          className="rounded-controle border border-regua-forte px-3 py-1 text-pequeno text-tinta"
        >
          Recriar
        </button>
      ) : (
        <>
          <button
            onClick={() => void recarregar(path)}
            className="rounded-controle border border-regua-forte px-3 py-1 text-pequeno text-tinta"
          >
            Recarregar do disco
          </button>
          <button
            onClick={() => void manter(path)}
            className="rounded-controle bg-musgo px-3 py-1 text-pequeno text-superficie"
          >
            Manter minha versão
          </button>
        </>
      )}
    </div>
  );
}
