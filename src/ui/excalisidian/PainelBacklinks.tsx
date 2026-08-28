// Painel de backlinks do arquivo ativo (RF4.9): quem aponta para a nota aberta, com o
// trecho de contexto de cada menção. Doc 04 §10: vazio -> "Nenhuma nota aponta para esta
// ainda."

import { useMemo } from "react";

import { useVaultStore } from "../../estado/vaultStore";
import type { Backlink } from "../../indice/backlinks";

function nomeCurto(path: string): string {
  const n = path.slice(path.lastIndexOf("/") + 1);
  return n.replace(/\.draw\.md$/i, "").replace(/\.md$/i, "");
}

export default function PainelBacklinks() {
  const caminhoAberto = useVaultStore((s) => s.caminhoAberto);
  const links = useVaultStore((s) => s.links);
  const abrirArquivo = useVaultStore((s) => s.abrirArquivo);

  const grupos = useMemo(() => {
    if (!caminhoAberto) return [];
    const refs = links.backlinks.get(caminhoAberto) ?? [];
    const porOrigem = new Map<string, Backlink[]>();
    for (const r of refs) {
      const l = porOrigem.get(r.origem) ?? [];
      l.push(r);
      porOrigem.set(r.origem, l);
    }
    return [...porOrigem.entries()];
  }, [caminhoAberto, links]);

  const total = grupos.reduce((n, [, refs]) => n + refs.length, 0);

  return (
    <div className="flex flex-col border-t border-regua">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="meta text-tinta-suave">backlinks</span>
        {total > 0 && <span className="meta text-tinta-suave">{total}</span>}
      </div>

      {!caminhoAberto ? null : total === 0 ? (
        <p className="px-3 pb-3 text-[13px] text-tinta-media">
          Nenhuma nota aponta para esta ainda.
        </p>
      ) : (
        <ul className="max-h-56 overflow-auto pb-2">
          {grupos.map(([origem, refs]) => (
            <li key={origem} className="px-3 py-1">
              <button
                onClick={() => abrirArquivo(origem)}
                className="text-[13px] text-musgo hover:underline"
              >
                {nomeCurto(origem)}
              </button>
              {refs.map((r, i) => (
                <p
                  key={i}
                  className="mt-0.5 truncate text-[12px] leading-snug text-tinta-media"
                  title={r.contexto}
                >
                  {r.embed && (
                    <span className="meta mr-1 text-tinta-suave">embute</span>
                  )}
                  {r.contexto || "—"}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
