// Liga o wiki-links do editor vendorizado ao índice do vault: autocomplete ao digitar `[[`,
// estado resolvido/não resolvido, e navegação ao clicar. A origem da resolução é sempre o
// arquivo da aba ativa (`workspaceStore.caminhoAtivo`).

import { wikiLinks } from "../atomico";
import { useVaultStore } from "../../estado/vaultStore";
import { useWorkspaceStore } from "../../estado/workspaceStore";
import { abrirOuCriarPorLink } from "../../vault/navegacao";

const EXT_IMAGEM = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

/** Só a parte antes do "#": o alvo. */
function alvoDe(bruto: string): string {
  const h = bruto.indexOf("#");
  return (h === -1 ? bruto : bruto.slice(0, h)).trim();
}

export const wikilinksExcalisidian = wikiLinks({
  debounceMs: 80,
  maxSuggestions: 12,

  async suggest(consulta) {
    const st = useVaultStore.getState();
    const q = consulta.trim().toLowerCase();
    const pedeImagem = EXT_IMAGEM.test(q);

    const itens = [...st.indice.values()]
      .filter((m) => (pedeImagem ? true : m.kind !== "attachment"))
      .flatMap((m) => {
        const nomeBase = m.path.slice(m.path.lastIndexOf("/") + 1);
        const rotulos = [m.title, nomeBase, ...m.aliases];
        return rotulos.map((r) => ({ meta: m, rotulo: r }));
      })
      .map(({ meta, rotulo }) => {
        const alvoCanon = meta.path
          .replace(/\.draw\.md$/i, ".draw")
          .replace(/\.md$/i, "");
        const rlow = rotulo.toLowerCase();
        let boost = -1;
        if (rlow === q) boost = 3;
        else if (rlow.startsWith(q)) boost = 2;
        else if (rlow.includes(q)) boost = 1;
        return {
          target: alvoCanon,
          label: rotulo,
          detail: meta.path.includes("/")
            ? meta.path.slice(0, meta.path.lastIndexOf("/"))
            : undefined,
          boost,
        };
      })
      .filter((s) => q === "" || s.boost >= 0)
      .sort((a, b) => (b.boost ?? 0) - (a.boost ?? 0))
      .slice(0, 12);

    return itens;
  },

  async resolve(bruto) {
    const st = useVaultStore.getState();
    const origem = useWorkspaceStore.getState().caminhoAtivo ?? "";
    const alvo = alvoDe(bruto);
    const caminho = st.resolver(alvo, origem);
    if (!caminho) return { target: alvo, label: alvo, status: "missing" };
    const nome = caminho.slice(caminho.lastIndexOf("/") + 1);
    return {
      target: alvo,
      label: nome.replace(/\.draw\.md$/i, "").replace(/\.md$/i, ""),
      status: "resolved",
    };
  },

  shouldResolve(bruto) {
    return alvoDe(bruto).length > 0;
  },

  openOnClick: true,
  onOpen(bruto) {
    const origem = useWorkspaceStore.getState().caminhoAtivo ?? "";
    void abrirOuCriarPorLink(alvoDe(bruto), origem);
  },

  serializeSuggestion(s) {
    // Contrato do pacote: devolve TODO o restante do link, incluindo o `]]`. Usa o nome
    // curto quando ele é único no vault; senão, o caminho a partir da raiz (`s.target`).
    const st = useVaultStore.getState();
    const curto = s.target.slice(s.target.lastIndexOf("/") + 1); // "Arquitetura" ou "Arquitetura.draw"
    const baseComparar = curto.replace(/\.draw$/i, "").toLowerCase();
    const homonimos = [...st.indice.values()].filter((m) => {
      const n = m.path
        .slice(m.path.lastIndexOf("/") + 1)
        .replace(/\.draw\.md$/i, "")
        .replace(/\.md$/i, "")
        .toLowerCase();
      return n === baseComparar;
    });
    const alvo = homonimos.length <= 1 ? curto : s.target;
    return `${alvo}]]`;
  },
});
