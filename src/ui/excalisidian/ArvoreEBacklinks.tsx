// Árvore de arquivos mais os backlinks da nota ativa. É componente próprio porque o painel
// flutuante da sidebar colapsada mostra só esta parte: repetir ali o cabeçalho e o rodapé
// fazia os ícones da faixa saltarem de posição sob o cursor e o clique cair no botão errado.

import { useVaultStore } from "../../estado/vaultStore";
import { useWorkspaceStore } from "../../estado/workspaceStore";
import {
  comandoNovaNota,
  comandoNovoDesenho,
  comandoNovaPasta,
  comandoRenomear,
} from "../../app/comandos/criacao";
import { comandoMoverArquivo, comandoMoverPara } from "../../app/comandos/mover";
import { comandoExcluir } from "../../app/comandos/exclusao";
import ArvoreArquivos from "./ArvoreArquivos";
import PainelBacklinks from "./PainelBacklinks";

interface Props {
  /** O painel flutuante fecha assim que um arquivo é aberto pela árvore. */
  onArquivoAberto?(): void;
}

export default function ArvoreEBacklinks({ onArquivoAberto }: Props) {
  const arvore = useVaultStore((s) => s.arvore);
  const pastasAbertas = useVaultStore((s) => s.pastasAbertas);
  const alternarPasta = useVaultStore((s) => s.alternarPasta);
  const caminhoAtivo = useWorkspaceStore((s) => s.caminhoAtivo);
  const abrirDocumento = useWorkspaceStore((s) => s.abrirDocumento);

  return (
    <>
      <div className="min-h-0 flex-1">
        {arvore && (
          <ArvoreArquivos
            raiz={arvore}
            pastasAbertas={pastasAbertas}
            caminhoAberto={caminhoAtivo}
            onAlternarPasta={alternarPasta}
            onAbrirArquivo={(path) => {
              abrirDocumento(path);
              onArquivoAberto?.();
            }}
            onRenomear={(path) => void comandoRenomear(path)}
            onCriarNota={(dir) => void comandoNovaNota(dir)}
            onCriarDesenho={(dir) => void comandoNovoDesenho(dir)}
            onCriarPasta={(dir) => void comandoNovaPasta(dir)}
            onMoverArquivo={(path, dir) => void comandoMoverArquivo(path, dir)}
            onMoverPara={(path) => void comandoMoverPara(path)}
            onExcluir={(path, tipo) => void comandoExcluir(path, tipo)}
          />
        )}
      </div>

      {caminhoAtivo && <PainelBacklinks />}
    </>
  );
}
