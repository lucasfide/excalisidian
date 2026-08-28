// Barra de status (doc 06 Layout): 24px, fundo superficie, tudo em `meta` tinta-suave.
// Caminho à esquerda; contagem de palavras e estado de salvamento à direita.

import type { EstadoSalvamento } from "../../estado/vaultStore";

const TEXTO: Record<EstadoSalvamento, string> = {
  limpo: "salvo",
  editando: "editando",
  salvando: "salvando…",
  salvo: "salvo",
  erro: "erro ao salvar",
};

function contarPalavras(texto: string): number {
  const m = texto.trim().match(/\S+/g);
  return m ? m.length : 0;
}

interface Props {
  caminho: string | null;
  conteudo: string;
  estado: EstadoSalvamento;
}

export default function BarraStatus({ caminho, conteudo, estado }: Props) {
  return (
    <footer className="flex h-6 items-center justify-between border-t border-regua bg-superficie px-3">
      <span className="meta truncate text-tinta-suave">
        {caminho ?? "nenhum arquivo aberto"}
      </span>
      <span className="meta flex shrink-0 items-center gap-3 text-tinta-suave">
        {caminho && <span>{contarPalavras(conteudo)} palavras</span>}
        <span className={estado === "erro" ? "text-bordo" : undefined}>
          {caminho ? TEXTO[estado] : ""}
        </span>
      </span>
    </footer>
  );
}
