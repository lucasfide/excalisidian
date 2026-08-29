// Busca e ranqueamento de sugestões de wikilinks a partir do índice do vault.
// Usado pelo campo de link no painel de propriedades do canvas e pela ferramenta de texto do
// desenho (src/canvas/EditorDesenho.tsx). O editor de notas tem seu PRÓPRIO autocomplete,
// mais antigo (Fatia 3: src/editor/extensoes/wikilinksExcalisidian.ts), com sua cópia
// independente de busca/ranking — unificar os dois fica para uma tarefa própria.

import { useVaultStore } from "../estado/vaultStore";
import type { FileMeta } from "./parser";

export interface SugestaoLink {
  /** Alvo canônico para preenchimento: "Nota" ou "Desenho.draw" ou "pasta/Nota" (se homônimo). */
  alvo: string;
  /** Rótulo legível exibido na lista (título, nome do arquivo ou alias). */
  rotulo: string;
  /** Pasta/caminho onde o arquivo se encontra, para desambiguação visual. */
  detalhe?: string;
  /** Tipo do item: nota markdown, desenho .draw.md ou anexo. */
  tipo: "nota" | "desenho" | "anexo";
  /** Caminho relativo completo no vault. */
  caminhoCompleto: string;
}

const EXT_IMAGEM = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

/**
 * Retorna sugestões de links para uma dada consulta de texto.
 * Aceita tanto consultas cruas ("minha nota") quanto com colchetes ("[[minha nota").
 */
export function buscarSugestoesLink(
  consulta: string,
  limite = 10,
  indiceParam?: Map<string, FileMeta>,
): SugestaoLink[] {
  const indice = indiceParam ?? useVaultStore.getState().indice;
  const q = consulta
    .replace(/^!*\[\[/, "")
    .replace(/\]\]$/, "")
    .trim()
    .toLowerCase();

  const pedeImagem = EXT_IMAGEM.test(q);

  const todos = [...indice.values()];

  const itens = todos
    .filter((m) => (pedeImagem ? true : m.kind !== "attachment"))
    .flatMap((m) => {
      const nomeBase = m.path.slice(m.path.lastIndexOf("/") + 1);
      const semExt = nomeBase.replace(/\.draw\.md$/i, "").replace(/\.md$/i, "");
      const rotulos = Array.from(new Set([m.title, semExt, nomeBase, ...m.aliases]));
      return rotulos.map((r) => ({ meta: m, rotulo: r }));
    })
    .map(({ meta, rotulo }) => {
      const isDesenho = /\.draw\.md$/i.test(meta.path);
      const alvoCanon = meta.path
        .replace(/\.draw\.md$/i, ".draw")
        .replace(/\.md$/i, "");

      const rlow = rotulo.toLowerCase();
      const plow = meta.path.toLowerCase();

      let boost = -1;
      if (q === "") {
        boost = meta.kind === "note" ? 2 : meta.kind === "drawing" || isDesenho ? 1 : 0;
      } else if (rlow === q) {
        boost = 4;
      } else if (rlow.startsWith(q)) {
        boost = 3;
      } else if (rlow.includes(q)) {
        boost = 2;
      } else if (plow.includes(q)) {
        boost = 1;
      }

      const tipo: "nota" | "desenho" | "anexo" =
        meta.kind === "drawing" || isDesenho
          ? "desenho"
          : meta.kind === "attachment"
          ? "anexo"
          : "nota";

      return {
        alvo: alvoCanon,
        rotulo,
        detalhe: meta.path.includes("/")
          ? meta.path.slice(0, meta.path.lastIndexOf("/"))
          : undefined,
        tipo,
        caminhoCompleto: meta.path,
        boost,
      };
    })
    .filter((s) => s.boost >= 0)
    .sort((a, b) => (b.boost ?? 0) - (a.boost ?? 0));

  // Deduplica por alvo e rótulo
  const vistos = new Set<string>();
  const unicos: SugestaoLink[] = [];
  for (const it of itens) {
    const chave = `${it.alvo}:${it.rotulo}`;
    if (!vistos.has(chave)) {
      vistos.add(chave);
      unicos.push(it);
      if (unicos.length >= limite) break;
    }
  }

  // Resolve homônimos: usa o nome curto se único no vault; senão, o caminho relativo completo
  return unicos.map((s) => {
    const curto = s.alvo.slice(s.alvo.lastIndexOf("/") + 1);
    const baseComparar = curto.replace(/\.draw$/i, "").toLowerCase();
    const homonimos = todos.filter((m) => {
      const n = m.path
        .slice(m.path.lastIndexOf("/") + 1)
        .replace(/\.draw\.md$/i, "")
        .replace(/\.md$/i, "")
        .toLowerCase();
      return n === baseComparar;
    });
    const alvoFinal = homonimos.length <= 1 ? curto : s.alvo;
    return { ...s, alvo: alvoFinal };
  });
}
