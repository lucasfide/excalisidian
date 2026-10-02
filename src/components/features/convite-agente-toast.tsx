import { useEffect } from "react";
import { toast } from "sonner";
import { chaveConversaAgente, useAgenteStore } from "../../estado/agenteStore";
import { useDocumentosStore } from "../../estado/documentosStore";
import { useWorkspaceStore } from "../../estado/workspaceStore";
import "./convite-agente-toast.css";

export default function ConviteAgenteToast() {
  const convite = useAgenteStore((s) => s.convite);
  const habilitado = useAgenteStore((s) => s.config?.habilitado ?? false);
  const caminhoAtivo = useWorkspaceStore((s) => s.caminhoAtivo);
  const caminhoConversa = useDocumentosStore((s) => chaveConversaAgente(caminhoAtivo, s.docs));

  useEffect(() => {
    if (!habilitado || !convite || convite.path !== caminhoConversa) return;
    let ativo = true;
    const responder = (resposta: "aceitar" | "adiar") => {
      if (!ativo || useAgenteStore.getState().convite !== convite) return;
      ativo = false;
      useAgenteStore.getState().responderConvite(resposta);
      if (resposta === "aceitar" && !useAgenteStore.getState().painelAberto) {
        useAgenteStore.getState().alternarPainel();
      }
    };

    const id = toast("Posso ajudar com esta nota?", {
      className: "convite-agente-toast",
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
  }, [convite, habilitado, caminhoConversa]);

  return null;
}
