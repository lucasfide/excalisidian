// Faixa no topo do editor quando o arquivo aberto mudou ou sumiu por fora (doc 02 §11,
// textos do doc 04 §10). Não decide sozinho: oferece as duas ações e deixa o usuário escolher.

import { AlertTriangle } from "lucide-react";

import { useDocumentosStore } from "../../estado/documentosStore";
import { Botao } from "../index";

export default function FaixaConflito({ path }: { path: string }) {
  const doc = useDocumentosStore((s) => s.docs.get(path));
  const recarregar = useDocumentosStore((s) => s.recarregarDoDisco);
  const manter = useDocumentosStore((s) => s.manterMinhaVersao);
  const recriar = useDocumentosStore((s) => s.recriar);

  if (!doc || (doc.estado !== "conflito" && doc.estado !== "orfao")) return null;

  const orfao = doc.estado === "orfao";

  return (
    <div
      role="alert"
      className="flex items-center gap-3 border-b border-ocre bg-[color-mix(in_srgb,var(--color-ocre)_18%,var(--color-superficie))] px-4 py-2"
    >
      <AlertTriangle
        size={16}
        strokeWidth={1.5}
        aria-hidden
        className="shrink-0 text-ocre-tinta"
      />
      <span className="flex-1 text-pequeno text-tinta">
        {orfao
          ? "Este arquivo não existe mais no disco."
          : "Este arquivo mudou fora do Excalisidian."}
      </span>
      {orfao ? (
        <Botao tamanho="compacto" onClick={() => void recriar(path)}>
          Recriar
        </Botao>
      ) : (
        <>
          <Botao tamanho="compacto" onClick={() => void recarregar(path)}>
            Recarregar do disco
          </Botao>
          <Botao
            variante="primario"
            tamanho="compacto"
            onClick={() => void manter(path)}
          >
            Manter minha versão
          </Botao>
        </>
      )}
    </div>
  );
}
