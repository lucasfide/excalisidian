// Painel de backlinks do arquivo ativo (RF4.9): quem aponta para a nota aberta, com o
// trecho de contexto de cada menção. Sem nenhum backlink, o painel inteiro não é
// renderizado (nada de cabeçalho ou estado vazio ocupando espaço na sidebar).

import { useEffect, useMemo, useState } from "react";

import { useVaultStore } from "../../estado/vaultStore";
import { useWorkspaceStore } from "../../estado/workspaceStore";
import type { Backlink } from "../../indice/backlinks";

function nomeCurto(path: string): string {
  const n = path.slice(path.lastIndexOf("/") + 1);
  return n.replace(/\.draw\.md$/i, "").replace(/\.md$/i, "");
}

export default function PainelBacklinks() {
  const caminhoAberto = useWorkspaceStore((s) => s.caminhoAtivo);
  const links = useVaultStore((s) => s.links);
  const abrirArquivo = useWorkspaceStore((s) => s.abrirDocumento);

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

  const [entrou, setEntrou] = useState(false);

  useEffect(() => {
    setEntrou(false);
    const frame = requestAnimationFrame(() => setEntrou(true));
    return () => cancelAnimationFrame(frame);
  }, [caminhoAberto]);

  if (!caminhoAberto || total === 0) return null;

  return (
    <div
      className={`motion-safe:transition-[opacity,transform] motion-safe:duration-[160ms] motion-safe:ease-caderno motion-reduce:transform-none motion-reduce:opacity-100 ${entrou ? "motion-safe:translate-y-0 motion-safe:opacity-100" : "motion-safe:translate-y-1 motion-safe:opacity-0"} flex flex-col border-t border-regua`}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className="meta text-tinta-suave">backlinks</span>
        <span className="meta text-tinta-suave">{total}</span>
      </div>

      <ul className="max-h-56 overflow-auto pb-2">
        {grupos.map(([origem, refs]) => (
          <li key={origem} className="px-3 py-1">
            <button
              onClick={() => abrirArquivo(origem)}
              className="text-[13px] text-cristal hover:underline"
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
    </div>
  );
}
