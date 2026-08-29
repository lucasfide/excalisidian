// Casca do app: barra lateral (árvore + backlinks) e o workspace de abas (dockview).
// O conteúdo dos arquivos vive por aba no documentosStore; a aba ativa, no workspaceStore.

import { useCallback, useEffect, useState } from "react";
import { Toaster } from "sonner";

import { TauriVaultAdapter } from "../vault/TauriVaultAdapter";
import { useVaultStore } from "../estado/vaultStore";
import { useWorkspaceStore } from "../estado/workspaceStore";
import {
  comandoNovaNota,
  comandoNovoDesenho,
  comandoNovaPasta,
  comandoRenomear,
} from "./comandos/criacao";
import { comandoMoverArquivo } from "./comandos/mover";
import { useAutosave } from "../editor/useAutosave";
import Workspace from "../layout/Workspace";
import { Botao, EstadoVazio, Select, type OpcaoSelect } from "../ui";
import ArvoreArquivos from "../ui/excalisidian/ArvoreArquivos";
import BarraFerramentasSidebar from "../ui/excalisidian/BarraFerramentasSidebar";
import BarraStatus from "../ui/excalisidian/BarraStatus";
import Logotipo from "../ui/excalisidian/Logotipo";
import PainelBacklinks from "../ui/excalisidian/PainelBacklinks";
import RaizDialogos from "../ui/excalisidian/RaizDialogos";
import LimiteDeErro from "../ui/excalisidian/LimiteDeErro";

type Tema = "sistema" | "claro" | "escuro";

const TEMAS: OpcaoSelect[] = [
  { valor: "sistema", rotulo: "sistema" },
  { valor: "claro", rotulo: "claro" },
  { valor: "escuro", rotulo: "escuro" },
];

function aplicarTema(tema: Tema) {
  const escuro =
    tema === "escuro" ||
    (tema === "sistema" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", escuro);
}

type Boot = "carregando" | "sem-vault" | "pronto" | { erro: string };

export default function App() {
  const [boot, setBoot] = useState<Boot>("carregando");
  const [tema, setTema] = useState<Tema>("sistema");

  const arvore = useVaultStore((s) => s.arvore);
  const pastasAbertas = useVaultStore((s) => s.pastasAbertas);
  const alternarPasta = useVaultStore((s) => s.alternarPasta);
  const statusIndice = useVaultStore((s) => s.statusIndice);
  const caminhoAtivo = useWorkspaceStore((s) => s.caminhoAtivo);
  const abrirDocumento = useWorkspaceStore((s) => s.abrirDocumento);

  useAutosave();

  useEffect(() => {
    aplicarTema(tema);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const aoMudar = () => aplicarTema(tema);
    mq.addEventListener("change", aoMudar);
    return () => mq.removeEventListener("change", aoMudar);
  }, [tema]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const adapter = await TauriVaultAdapter.doBoot();
        if (!ativo) return;
        if (adapter) {
          await useVaultStore.getState().definirAdapter(adapter);
          if (ativo) setBoot("pronto");
        } else {
          setBoot("sem-vault");
        }
      } catch (e) {
        if (ativo) setBoot({ erro: String(e) });
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  const escolher = useCallback(async () => {
    try {
      setBoot("carregando");
      const adapter = await TauriVaultAdapter.escolher();
      if (!adapter) {
        setBoot((b) => (b === "carregando" ? "sem-vault" : b));
        return;
      }
      await useVaultStore.getState().definirAdapter(adapter);
      setBoot("pronto");
    } catch (e) {
      setBoot({ erro: String(e) });
    }
  }, []);

  if (boot === "carregando") {
    return (
      <div className="flex h-screen items-center justify-center bg-papel">
        <span className="meta text-tinta-suave">carregando…</span>
      </div>
    );
  }

  if (boot === "sem-vault" || typeof boot === "object") {
    const erro = typeof boot === "object" ? boot.erro : null;
    return (
      <div className="flex h-screen items-center justify-center bg-papel px-8">
        <EstadoVazio
          className="w-full max-w-md"
          tom={erro ? "erro" : "neutro"}
          titulo={erro ? "Não foi possível abrir o vault" : "Nenhum vault aberto"}
          apoio={
            erro ??
            "Escolha a pasta com suas notas. O Excalisidian pede isso uma vez e lembra nas próximas aberturas."
          }
        >
          <Botao variante="primario" onClick={escolher}>
            Escolher pasta do vault
          </Botao>
        </EstadoVazio>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-papel text-tinta">
      <LimiteDeErro
        onFechar={() => window.location.reload()}
        rotuloFechar="Recarregar"
      >
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[264px] shrink-0 flex-col border-r border-regua bg-superficie">
            <div className="flex items-center justify-between border-b border-regua px-3 py-2">
              <Logotipo />
              {/* Sempre cria na raiz do vault; organizar é por clique direito numa pasta
                  ("Nova nota aqui" etc., em ArvoreArquivos) ou arrastando depois. */}
              <BarraFerramentasSidebar
                onCriarNota={() => void comandoNovaNota("")}
                onCriarDesenho={() => void comandoNovoDesenho("")}
                onCriarPasta={() => void comandoNovaPasta("")}
              />
            </div>

            <div className="min-h-0 flex-1">
              {arvore && (
                <ArvoreArquivos
                  raiz={arvore}
                  pastasAbertas={pastasAbertas}
                  caminhoAberto={caminhoAtivo}
                  onAlternarPasta={alternarPasta}
                  onAbrirArquivo={abrirDocumento}
                  onRenomear={(path) => void comandoRenomear(path)}
                  onCriarNota={(dir) => void comandoNovaNota(dir)}
                  onCriarDesenho={(dir) => void comandoNovoDesenho(dir)}
                  onCriarPasta={(dir) => void comandoNovaPasta(dir)}
                  onMoverArquivo={(path, dir) => void comandoMoverArquivo(path, dir)}
                />
              )}
            </div>

            {caminhoAtivo && <PainelBacklinks />}

            <div className="flex items-center justify-between border-t border-regua px-3 py-1.5">
              <span className="meta text-tinta-suave">
                {statusIndice === "indexando" ? "reindexando…" : ""}
              </span>
              <Select
                rotulo="Tema"
                compacto
                opcoes={TEMAS}
                value={tema}
                onChange={(e) => setTema(e.target.value as Tema)}
                className="shrink-0 text-tinta-media"
              />
            </div>
          </aside>

          <main className="min-h-0 flex-1">
            <Workspace />
          </main>
        </div>
      </LimiteDeErro>

      <BarraStatus />
      <RaizDialogos />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--color-superficie)",
            color: "var(--color-tinta)",
            border: "1px solid var(--color-regua)",
            borderRadius: "var(--radius-ficha)",
            fontFamily: "var(--fonte-sans)",
            fontSize: "13px",
          },
        }}
      />
    </div>
  );
}
