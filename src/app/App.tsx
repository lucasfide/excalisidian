// Fatia 1: abrir e escrever uma nota. Sidebar com a árvore, uma aba só (sem dockview),
// editor CodeMirror, autosave com debounce e barra de status. O design system entra de
// verdade aqui, mas ainda sem marginália (Fatia 2), abas (Fatia 4) nem watcher (Fatia 5).

import { useCallback, useEffect, useState } from "react";
import { Toaster, toast } from "sonner";

import { TauriVaultAdapter } from "../vault/TauriVaultAdapter";
import { useVaultStore } from "../estado/vaultStore";
import { renomearArquivo } from "../vault/renomear";
import { useAutosave } from "../editor/useAutosave";
import EditorNota from "../editor/EditorNota";
import ArvoreArquivos from "../ui/excalisidian/ArvoreArquivos";
import BarraStatus from "../ui/excalisidian/BarraStatus";
import PainelBacklinks from "../ui/excalisidian/PainelBacklinks";

type Tema = "sistema" | "claro" | "escuro";

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

  const store = useVaultStore();
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

  const renomear = useCallback(async (path: string) => {
    const atual = path.slice(path.lastIndexOf("/") + 1).replace(/\.(draw\.)?md$/i, "");
    const novo = window.prompt("Novo nome:", atual);
    if (!novo || novo === atual) return;
    const r = await renomearArquivo(path, novo);
    if (!r.ok) toast.error(r.motivo ?? "Não foi possível renomear.");
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
        <div className="w-full max-w-md border-y border-regua py-8">
          <h1 className="font-display text-[24px] font-medium text-tinta">
            {erro ? "Não foi possível abrir o vault" : "Nenhum vault aberto"}
          </h1>
          <p className="mt-2 text-pequeno text-tinta-media">
            {erro
              ? erro
              : "Escolha a pasta com suas notas. O Excalisidian pede isso uma vez e lembra nas próximas aberturas."}
          </p>
          <button
            onClick={escolher}
            className="mt-4 rounded-controle bg-musgo px-4 py-2 text-corpo text-superficie"
          >
            Escolher pasta do vault
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-papel text-tinta">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[264px] shrink-0 flex-col border-r border-regua bg-superficie">
          <div className="flex items-center justify-between border-b border-regua px-3 py-2">
            <div>
              <div className="font-display text-[16px] font-semibold leading-none text-tinta">
                Excalisidian
              </div>
              <div className="mt-1 h-[2px] w-[42%] bg-musgo" />
            </div>
            <select
              value={tema}
              onChange={(e) => setTema(e.target.value as Tema)}
              className="rounded-controle border border-regua-forte bg-superficie px-1 py-[2px] text-[11px] text-tinta-media"
              title="Tema"
            >
              <option value="sistema">sistema</option>
              <option value="claro">claro</option>
              <option value="escuro">escuro</option>
            </select>
          </div>
          <div className="min-h-0 flex-1">
            {store.arvore && (
              <ArvoreArquivos
                raiz={store.arvore}
                pastasAbertas={store.pastasAbertas}
                caminhoAberto={store.caminhoAberto}
                onAlternarPasta={store.alternarPasta}
                onAbrirArquivo={store.abrirArquivo}
                onRenomear={renomear}
              />
            )}
          </div>
          <PainelBacklinks />
          {store.statusIndice === "indexando" && (
            <div className="border-t border-regua px-3 py-1">
              <span className="meta text-tinta-suave">reindexando…</span>
            </div>
          )}
        </aside>

        <main className="min-h-0 flex-1">
          {store.caminhoAberto ? (
            <div className="mx-auto h-full max-w-[720px] px-8 py-6">
              <EditorNota
                caminho={store.caminhoAberto}
                conteudoInicial={store.conteudoDisco}
                onEditar={store.editar}
                onBlur={() => void store.salvar()}
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="meta text-tinta-suave">
                selecione uma nota na barra lateral
              </span>
            </div>
          )}
        </main>
      </div>

      <BarraStatus
        caminho={store.caminhoAberto}
        conteudo={store.conteudoEditor}
        estado={store.estadoSalvamento}
      />
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
