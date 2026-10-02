import { useEffect } from "react";
import { toast } from "sonner";
import { chaveConversaAgente, useAgenteStore } from "../../estado/agenteStore";
import { useDocumentosStore } from "../../estado/documentosStore";
import { useWorkspaceStore } from "../../estado/workspaceStore";
import { deveMostrarConviteEmAviso } from "./localConvite";

// Abrir o painel com o aviso na tela tira o aviso (limpeza do efeito, sem contar como
// "Agora não"); o convite continua pendente e aparece dentro do painel.
export default function ConviteAgente() {
  const convite = useAgenteStore((s) => s.convite);
  const habilitado = useAgenteStore((s) => s.config?.habilitado ?? false);
  const painelAberto = useAgenteStore((s) => s.painelAberto);
  const caminhoAtivo = useWorkspaceStore((s) => s.caminhoAtivo);
  const caminhoConversa = useDocumentosStore((s) => chaveConversaAgente(caminhoAtivo, s.docs));

  useEffect(() => {
    if (
      !convite ||
      !deveMostrarConviteEmAviso({
        habilitado,
        painelAberto,
        caminhoConvite: convite.path,
        caminhoConversa,
      })
    ) {
      return;
    }
    let ativo = true;
    const responder = (resposta: "aceitar" | "adiar") => {
      if (!ativo || useAgenteStore.getState().convite !== convite) return;
      ativo = false;
      useAgenteStore.getState().responderConvite(resposta);
      if (resposta === "aceitar" && !useAgenteStore.getState().painelAberto) {
        useAgenteStore.getState().alternarPainel();
      }
    };

    // Botões com o estilo padrão dos toasts do app (mesmo de "Desfazer" em LinhaTarefa).
    const id = toast("Posso ajudar com esta nota?", {
      description: `O agente pode acompanhar sua escrita sobre ${convite.tema}.`,
      duration: 10000,
      action: { label: "Permitir", onClick: () => responder("aceitar") },
      cancel: { label: "Agora não", onClick: () => responder("adiar") },
      onDismiss: () => responder("adiar"),
      onAutoClose: () => responder("adiar"),
    });

    return () => {
      ativo = false;
      toast.dismiss(id);
    };
  }, [convite, habilitado, painelAberto, caminhoConversa]);

  return null;
}
