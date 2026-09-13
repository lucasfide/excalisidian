// Casca do app: barra lateral (árvore + backlinks) e o workspace de abas (dockview).
// O conteúdo dos arquivos vive por aba no documentosStore; a aba ativa, no workspaceStore.

import { useCallback, useEffect, useRef, useState } from "react";
import { FilePlus, ListChecks, PanelLeft, Settings, SquarePen, Trash2 } from "lucide-react";
import { Toaster } from "sonner";

import { TauriVaultAdapter } from "../vault/TauriVaultAdapter";
import { useVaultStore } from "../estado/vaultStore";
import { useWorkspaceStore } from "../estado/workspaceStore";
import { usePrefsStore, type Tema } from "../estado/prefsStore";
import { useTarefasStore } from "../estado/tarefasStore";
import { comandoNovaNota, comandoNovoDesenho } from "./comandos/criacao";
import { useAutosave } from "../editor/useAutosave";
import { useRessincronizarAoVoltar } from "./useRessincronizarAoVoltar";
import Workspace from "../layout/Workspace";
import { Botao, BotaoIcone, EstadoVazio } from "../ui";
import BarraStatus from "../ui/excalisidian/BarraStatus";
import ConteudoSidebar from "../ui/excalisidian/ConteudoSidebar";
import ArvoreEBacklinks from "../ui/excalisidian/ArvoreEBacklinks";
import DialogoPreferencias from "../ui/excalisidian/DialogoPreferencias";
import DialogoAtualizacao from "../ui/excalisidian/DialogoAtualizacao";
import { verificarAtualizacao } from "./atualizacao";
import PainelLixeira from "../ui/excalisidian/PainelLixeira";
import PainelTarefas from "../ui/excalisidian/PainelTarefas";
import RaizDialogos from "../ui/excalisidian/RaizDialogos";
import RaizSobreposicoes from "../ui/excalisidian/RaizSobreposicoes";
import LimiteDeErro from "../ui/excalisidian/LimiteDeErro";

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
  const [preferenciasAbertas, setPreferenciasAbertas] = useState(false);
  const [lixeiraAberta, setLixeiraAberta] = useState(false);
  const [sidebarComMouse, setSidebarComMouse] = useState(false);
  const [painelFlutuanteAberto, setPainelFlutuanteAberto] = useState(false);
  const abrirPainelTimerRef = useRef<number | null>(null);
  const fecharPainelTimerRef = useRef<number | null>(null);
  const tema = usePrefsStore((s) => s.tema);
  const sidebarColapsada = usePrefsStore((s) => s.sidebarColapsada);
  const alternarSidebar = usePrefsStore((s) => s.alternarSidebar);

  const cancelarAberturaPainel = useCallback(() => {
    if (abrirPainelTimerRef.current !== null) {
      window.clearTimeout(abrirPainelTimerRef.current);
      abrirPainelTimerRef.current = null;
    }
  }, []);
  const cancelarFechamentoPainel = useCallback(() => {
    if (fecharPainelTimerRef.current !== null) {
      window.clearTimeout(fecharPainelTimerRef.current);
      fecharPainelTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelarAberturaPainel();
      cancelarFechamentoPainel();
    };
  }, [cancelarAberturaPainel, cancelarFechamentoPainel]);

  // Volta a sidebar ancorada zera o painel: sem isso, colapsar de novo com o mouse ainda
  // parado sobre a faixa não dispara mouseenter, e o painel reapareceria sozinho.
  useEffect(() => {
    if (sidebarColapsada) return;
    cancelarAberturaPainel();
    cancelarFechamentoPainel();
    setPainelFlutuanteAberto(false);
  }, [sidebarColapsada, cancelarAberturaPainel, cancelarFechamentoPainel]);

  const caminhoAtivo = useWorkspaceStore((s) => s.caminhoAtivo);
  const painelTarefasAberto = useTarefasStore((s) => s.painelAberto);

  useAutosave();
  useRessincronizarAoVoltar();

  useEffect(() => {
    void usePrefsStore.getState().carregar();
  }, []);

  // Prefs do painel de tarefas (aberto/largura). O flush no fechamento da janela vive no
  // useAutosave (handler de close do Tauri), junto com o flush de notas e desenhos.
  useEffect(() => {
    void useTarefasStore.getState().carregarPrefs();
  }, []);

  // Ctrl+\ alterna o painel de tarefas. Casa a tecla física (`e.code`), não `e.key`, porque
  // com layout comum `KeyboardEvent.key` da barra invertida vira "\\" sem Shift e "|" com.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === "Backslash") {
        e.preventDefault();
        useTarefasStore.getState().alternarPainel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Ctrl+, é a convenção de "abrir configurações" em várias ferramentas (VS Code, Slack) —
  // o ícone na sidebar já cobre a descoberta; isto é só um atalho a mais pra quem já sabe.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setPreferenciasAbertas(true);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // A aba ativa fica destacada na árvore (`ItemArvore.destacado`), mas isso só tem efeito se
  // a linha existir — abre as pastas ancestrais pra ela aparecer mesmo se estava fechada.
  useEffect(() => {
    if (caminhoAtivo) useVaultStore.getState().garantirAncestraisAbertos(caminhoAtivo);
  }, [caminhoAtivo]);

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

  // Checagem silenciosa de atualização: só depois que o vault carregou, fora do caminho
  // crítico do boot (spec 2026-09-04, "Ao abrir + item de menu manual").
  useEffect(() => {
    if (boot !== "pronto") return;
    const id = window.setTimeout(() => {
      void verificarAtualizacao({ silencioso: true });
    }, 3000);
    return () => window.clearTimeout(id);
  }, [boot]);

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
        <div className="relative flex min-h-0 flex-1">
          <aside
            className={`relative flex shrink-0 flex-col border-r border-regua bg-superficie transition-[width] duration-[220ms] ease-caderno ${
              sidebarColapsada ? "w-12" : "w-[264px]"
            }`}
            onMouseEnter={() => {
              setSidebarComMouse(true);
              // Cancela antes do guard: com o painel já aberto, o mouse que sai e volta
              // dentro dos 150ms precisa matar o fechamento agendado, senão fecha na cara.
              cancelarFechamentoPainel();
              if (!sidebarColapsada || painelFlutuanteAberto) return;
              abrirPainelTimerRef.current = window.setTimeout(() => {
                abrirPainelTimerRef.current = null;
                setPainelFlutuanteAberto(true);
              }, 200);
            }}
            onMouseLeave={() => {
              setSidebarComMouse(false);
              cancelarAberturaPainel();
              if (!sidebarColapsada) return;
              fecharPainelTimerRef.current = window.setTimeout(() => {
                fecharPainelTimerRef.current = null;
                setPainelFlutuanteAberto(false);
              }, 150);
            }}
          >
            {sidebarColapsada ? (
              <div className="flex flex-col items-center gap-1 border-b border-regua px-2 py-2">
                <BotaoIcone
                  Icone={PanelLeft}
                  titulo="Expandir sidebar"
                  onClick={alternarSidebar}
                />
                <BotaoIcone
                  Icone={FilePlus}
                  titulo="Nova nota"
                  onClick={() => void comandoNovaNota("")}
                />
                <BotaoIcone
                  Icone={SquarePen}
                  titulo="Novo desenho"
                  onClick={() => void comandoNovoDesenho("")}
                />
              </div>
            ) : (
              <ConteudoSidebar
                comMouse={sidebarComMouse}
                onAbrirLixeira={() => setLixeiraAberta(true)}
                onAbrirPreferencias={() => setPreferenciasAbertas(true)}
              />
            )}

            {sidebarColapsada && (
              <div className="mt-auto flex flex-col items-center gap-1 border-t border-regua px-2 py-1.5">
                <BotaoIcone
                  Icone={Trash2}
                  titulo="Lixeira"
                  onClick={() => setLixeiraAberta(true)}
                />
                <BotaoIcone
                  Icone={Settings}
                  titulo="Configurações"
                  onClick={() => setPreferenciasAbertas(true)}
                />
              </div>
            )}

            {/* Filho do <aside>, não irmão: o painel fica ao lado da faixa colapsada, e
                sendo descendente DOM o mouseleave do <aside> só dispara quando o ponteiro sai
                de tudo — atravessar do <aside> pro painel (ou pro menu de contexto da árvore,
                que também é inline) não corre entre fechar e reabrir. */}
            {sidebarColapsada && painelFlutuanteAberto && (
              <div className="absolute left-12 top-0 z-30 flex h-full w-[216px] flex-col border-r border-regua bg-superficie shadow-sobreposicao motion-safe:animate-[surgirLateral_220ms_var(--ease-caderno)]">
                <ArvoreEBacklinks
                  onArquivoAberto={() => {
                    cancelarAberturaPainel();
                    cancelarFechamentoPainel();
                    setPainelFlutuanteAberto(false);
                  }}
                />
              </div>
            )}
          </aside>

          <main className="min-h-0 flex-1">
            <Workspace />
          </main>
          <PainelTarefas />

          {/* Canto superior direito da janela: antes era o dropdown nativo "abas escondidas"
              do dockview ("⌄ N"), que o usuário achava inútil e confundia com contagem de
              notas abertas (desligado em Workspace.tsx). Some quando o painel já está aberto —
              o X dele já fecha. */}
          {!painelTarefasAberto && (
            <div
              className="absolute right-0 top-0 z-20 flex items-center border-b border-l border-regua bg-superficie px-1"
              style={{ height: 34 /* --dv-tabs-and-actions-container-height */ }}
            >
              <BotaoIcone
                Icone={ListChecks}
                titulo="Tarefas"
                onClick={() => useTarefasStore.getState().alternarPainel()}
              />
            </div>
          )}
        </div>
      </LimiteDeErro>

      <BarraStatus />
      <RaizDialogos />
      <RaizSobreposicoes />
      <DialogoAtualizacao />
      {preferenciasAbertas && (
        <DialogoPreferencias onFechar={() => setPreferenciasAbertas(false)} />
      )}
      {lixeiraAberta && <PainelLixeira onFechar={() => setLixeiraAberta(false)} />}
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
