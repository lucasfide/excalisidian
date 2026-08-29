// Barra de status (doc 06 Layout): 24px, fundo superficie, tudo em `meta` tinta-suave.
// Caminho da aba ativa à esquerda; contagem de palavras e estado de salvamento à direita.

import { useWorkspaceStore } from "../../estado/workspaceStore";
import { useDocumentosStore, type EstadoDoc } from "../../estado/documentosStore";

const TEXTO: Record<EstadoDoc, string> = {
  limpo: "salvo",
  editando: "editando",
  salvando: "salvando…",
  salvo: "salvo",
  erro: "erro ao salvar",
  conflito: "mudou fora do app",
  orfao: "arquivo sumiu",
};

function contarPalavras(texto: string): number {
  const m = texto.trim().match(/\S+/g);
  return m ? m.length : 0;
}

export default function BarraStatus() {
  const caminho = useWorkspaceStore((s) => s.caminhoAtivo);
  const doc = useDocumentosStore((s) =>
    caminho ? s.docs.get(caminho) : undefined,
  );

  return (
    <footer className="flex h-6 items-center justify-between border-t border-regua bg-superficie px-3">
      <span className="meta truncate text-tinta-suave">
        {caminho ?? "nenhum arquivo aberto"}
      </span>
      <span className="meta flex shrink-0 items-center gap-3 text-tinta-suave">
        {doc && <span>{contarPalavras(doc.conteudoEditor)} palavras</span>}
        <span className={doc?.estado === "erro" ? "text-bordo" : undefined}>
          {doc ? TEXTO[doc.estado] : ""}
        </span>
      </span>
    </footer>
  );
}
