// Workspace: o dockview com as abas e a divisão de tela (Fatia 4). Restaura o layout do
// vault no boot, persiste com debounce de 1s (com flush no fechamento), trata os atalhos
// de aba, e divide pelo menu de contexto da aba e por atalho (RF3.4).

import { useCallback, useEffect, useRef } from "react";
import { DockviewReact } from "dockview-react";
import type {
  DockviewApi,
  DockviewReadyEvent,
  DockviewTheme,
  GetTabContextMenuItemsParams,
} from "dockview";

type Disposable = { dispose(): void };
import "dockview-react/dist/styles/dockview.css";
import "./dockview-excalisidian.css";
import { toast } from "sonner";

import { useVaultStore } from "../estado/vaultStore";
import { useWorkspaceStore } from "../estado/workspaceStore";
import { useDocumentosStore } from "../estado/documentosStore";
import { carregarLayout, salvarLayout, limparLayout } from "./persistencia";
import PainelDocumento from "./PainelDocumento";
import PainelDesenho from "./PainelDesenho";
import PainelVazio from "./PainelVazio";
import AbaDocumento from "./AbaDocumento";

const COMPONENTES = {
  documento: PainelDocumento,
  desenho: PainelDesenho,
  vazio: PainelVazio,
};

// Tema do dockview: a estrutura vem de dockview.css; as cores, de dockview-excalisidian.css
// (variáveis --dv-* sobre os tokens). O objeto configura os comportamentos de arraste.
const TEMA: DockviewTheme = {
  name: "excalisidian",
  className: "dockview-theme-excalisidian",
  gap: 0,
  dndOverlayMounting: "absolute",
  dndPanelOverlay: "content",
  dndTabIndicator: "fill",
  tabGroupIndicator: "none",
};

export default function Workspace() {
  const raiz = useVaultStore((s) => s.raiz);
  const setApi = useWorkspaceStore((s) => s.setApi);
  const setFlushLayout = useWorkspaceStore((s) => s.setFlushLayout);
  const definirAtivo = useWorkspaceStore((s) => s.definirAtivo);
  const aoRemoverPainel = useWorkspaceStore((s) => s.aoRemoverPainel);

  const timerSalvar = useRef<number | undefined>(undefined);
  const disposables = useRef<Disposable[]>([]);

  const onReady = useCallback(
    async (evento: DockviewReadyEvent) => {
      const api: DockviewApi = evento.api;
      setApi(api);

      const salvarAgora = () => {
        if (useVaultStore.getState().raiz !== raiz) return; // trocou de vault: não grava por cima
        void salvarLayout(raiz, api.toJSON());
      };
      const agendarSalvar = () => {
        window.clearTimeout(timerSalvar.current);
        timerSalvar.current = window.setTimeout(salvarAgora, 1000);
      };
      setFlushLayout(() => {
        window.clearTimeout(timerSalvar.current);
        salvarAgora();
      });

      // Listeners ANTES do fromJSON: a restauração dispara onDidActivePanelChange,
      // e sem isso a barra de status e os backlinks nascem vazios no boot (P2).
      const d1 = api.onDidLayoutChange(agendarSalvar);
      const d2 = api.onDidActivePanelChange((e) => {
        const p = (e.panel?.params as { path?: string } | undefined)?.path ?? null;
        definirAtivo(p);
      });
      const d3 = api.onDidRemovePanel((p) => {
        const id = p.id;
        const path = (p.params as { path?: string } | undefined)?.path ?? null;
        window.setTimeout(() => {
          if (!api.getPanel(id)) aoRemoverPainel(id, path);
        }, 0);
      });
      disposables.current = [d1, d2, d3];

      const layout = await carregarLayout(raiz);
      if (layout) {
        try {
          api.fromJSON(layout as never);
        } catch {
          api.clear();
          await limparLayout(raiz);
          toast("O layout de abas estava corrompido. Abrindo em branco.");
        }
      }

      // Semeia a aba ativa a partir do que a restauração deixou selecionado (P2).
      const ativo =
        (api.activePanel?.params as { path?: string } | undefined)?.path ?? null;
      definirAtivo(ativo);
    },
    [raiz, setApi, setFlushLayout, definirAtivo, aoRemoverPainel],
  );

  useEffect(
    () => () => {
      disposables.current.forEach((d) => d.dispose());
      window.clearTimeout(timerSalvar.current);
    },
    [],
  );

  // Dividir pelo menu de contexto da aba (RF3.4).
  const menuDaAba = useCallback((params: GetTabContextMenuItemsParams) => {
    const ws = useWorkspaceStore.getState();
    const alvo = params.panel;
    if (!ws.api || !alvo) return [];
    const dividir = (direcao: "right" | "below") => {
      alvo.api.setActive();
      ws.dividirAtivo(direcao);
    };
    return [
      { label: "Dividir à direita", action: () => dividir("right") },
      { label: "Dividir abaixo", action: () => dividir("below") },
      "separator" as const,
      "close" as const,
      "closeOthers" as const,
    ];
  }, []);

  // Atalhos de aba (RF3.1–3.4).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const ws = useWorkspaceStore.getState();
      const k = e.key.toLowerCase();

      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        ws.dividirAtivo("right");
      } else if (e.altKey && e.key === "ArrowDown") {
        e.preventDefault();
        ws.dividirAtivo("below");
      } else if (e.altKey) {
        return;
      } else if (k === "t" && !e.shiftKey) {
        e.preventDefault();
        ws.novaAbaVazia();
      } else if (k === "w") {
        e.preventDefault();
        ws.fecharAtivo();
      } else if (k === "t" && e.shiftKey) {
        e.preventDefault();
        ws.reabrirUltimo();
      } else if (e.key === "Tab") {
        e.preventDefault();
        ws.cicloAba(e.shiftKey ? -1 : 1);
      } else if (/^[1-9]$/.test(e.key) && !e.shiftKey) {
        e.preventDefault();
        ws.ativarPorIndice(Number(e.key));
      } else if (k === "s") {
        e.preventDefault();
        const p = ws.caminhoAtivo;
        if (p) void useDocumentosStore.getState().salvar(p);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <DockviewReact
      className="h-full"
      theme={TEMA}
      components={COMPONENTES}
      defaultTabComponent={AbaDocumento}
      getTabContextMenuItems={menuDaAba}
      onReady={onReady}
    />
  );
}
