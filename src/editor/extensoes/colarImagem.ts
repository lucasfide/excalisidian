// Colar imagem na nota (RF2.12, doc 02 §3 "Imagens", doc 04 §3.6): `Ctrl+V` com imagem na área
// de transferência grava o arquivo em `anexos/` e insere `![[caminho]]` onde estava a seleção.
// Quem desenha a imagem na nota é `embedImagem.ts`.

import { EditorView } from "@codemirror/view";
import { toast } from "sonner";

import { extDe } from "../../canvas/adotarImagens";
import { PASTA_ANEXOS, salvarImagemColada } from "../../vault/anexos";

/**
 * Só cola como imagem quando a área de transferência não traz texto. Word, Excel e navegador
 * copiam texto junto com uma imagem renderizada da seleção — tratar isso como imagem trocaria
 * o parágrafo copiado por um print dele. Print de tela, imagem copiada do navegador ou do
 * Explorer não trazem texto puro.
 */
export function deveColarComoImagem(textoPlano: string, quantidadeImagens: number): boolean {
  return quantidadeImagens > 0 && textoPlano.trim() === "";
}

/** Texto inserido: um embed por linha, com o caminho completo (único no vault, sem ambiguidade). */
export function textoDosEmbeds(caminhos: string[]): string {
  return caminhos.map((c) => `![[${c}]]`).join("\n");
}

function imagensDe(dados: DataTransfer): File[] {
  const arquivos: File[] = [];
  for (const item of Array.from(dados.items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const arquivo = item.getAsFile();
    if (arquivo) arquivos.push(arquivo);
  }
  return arquivos;
}

export const colarImagem = EditorView.domEventHandlers({
  paste(evento, view) {
    const dados = evento.clipboardData;
    if (!dados || view.state.readOnly) return false;
    const imagens = imagensDe(dados);
    if (!deveColarComoImagem(dados.getData("text/plain"), imagens.length)) return false;
    evento.preventDefault();

    void (async () => {
      const caminhos: string[] = [];
      try {
        for (const imagem of imagens) {
          const bytes = new Uint8Array(await imagem.arrayBuffer());
          caminhos.push(await salvarImagemColada(bytes, extDe(imagem.type)));
        }
      } catch {
        // Doc 04: se a gravação falha, nada é inserido.
        toast.error(
          `Não foi possível salvar a imagem em «${PASTA_ANEXOS}». Verifique a pasta nas preferências.`,
        );
        return;
      }
      // Seleção lida só agora, depois de gravar: gravar leva milissegundos e, se o usuário
      // mexeu no cursor nesse meio-tempo, é ali que ele espera a imagem.
      const texto = textoDosEmbeds(caminhos);
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: texto },
        selection: { anchor: from + texto.length },
        userEvent: "input.paste",
        scrollIntoView: true,
      });
    })();
    return true;
  },
});
