// Painel do agente (doc 11 §6.2): cartão flutuante ancorado acima do balão, fora do
// dockview. Convite para acompanhar a nota, sugestões do ciclo contínuo (copiar /
// dispensar / abrir nota relacionada) e conversa manual. O agente não toca na nota —
// sugestão é texto aqui, e copiar é a única saída dela (doc 11 §10.6). Fecha por Esc,
// clique fora ou pelo balão.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Copy,
  CornerDownLeft,
  FileText,
  Globe,
  HelpCircle,
  Pause,
  Play,
  Send,
  X,
} from "lucide-react";

import { Botao, cn } from "../../ui";
import BotaoIcone from "../../ui/BotaoIcone";
import { useAgenteStore } from "../../estado/agenteStore";
import { useWorkspaceStore } from "../../estado/workspaceStore";
import { formatarUso } from "../../agente/orcamento";
import type { TipoSugestao } from "../../agente/assistente";

const ICONES_TIPO: Record<TipoSugestao, typeof HelpCircle> = {
  pergunta: HelpCircle,
  conteudo: FileText,
  gap: CircleAlert,
  notaRelacionada: CornerDownLeft,
  achadoWeb: Globe,
};

export default function PainelAgente() {
  const habilitado = useAgenteStore((s) => s.config?.habilitado ?? false);
  const aberto = useAgenteStore((s) => s.painelAberto);
  const conversas = useAgenteStore((s) => s.conversas);
  const status = useAgenteStore((s) => s.status);
  const erroAtual = useAgenteStore((s) => s.erroAtual);
  const pausado = useAgenteStore((s) => s.pausado);
  const uso = useAgenteStore((s) => s.usoSessao);
  const convite = useAgenteStore((s) => s.convite);
  const sugestoesPorPath = useAgenteStore((s) => s.sugestoes);
  const fatos = useAgenteStore((s) => s.fatos);
  const caminhoAtivo = useWorkspaceStore((s) => s.caminhoAtivo);
  const sugestoes = caminhoAtivo ? (sugestoesPorPath[caminhoAtivo] ?? []) : [];
  const conversa = conversas[caminhoAtivo ?? ""] ?? [];
  const [fatosAbertos, setFatosAbertos] = useState(false);
  const [rascunho, setRascunho] = useState("");
  const fimRef = useRef<HTMLDivElement | null>(null);
  const raizRef = useRef<HTMLDivElement | null>(null);

  const enviar = () => {
    const texto = rascunho.trim();
    if (!texto || status === "pensando") return;
    setRascunho("");
    void useAgenteStore.getState().enviarMensagem(texto);
  };

  // Esc fecha; clique fora fecha. O Dialog tem a mesma mecânica — replicada aqui porque
  // o painel não é modal (a escrita embaixo continua acontecendo).
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        useAgenteStore.getState().alternarPainel();
      }
    };
    const aoPonteiro = (e: PointerEvent) => {
      if (!raizRef.current?.contains(e.target as Node)) {
        useAgenteStore.getState().alternarPainel();
      }
    };
    window.addEventListener("keydown", aoTeclar, true);
    // pointerdown em capturar: o clique fora é detectado antes de qualquer stopPropagation.
    window.addEventListener("pointerdown", aoPonteiro, true);
    return () => {
      window.removeEventListener("keydown", aoTeclar, true);
      window.removeEventListener("pointerdown", aoPonteiro, true);
    };
  }, [aberto]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [conversa.length, status]);

  const textoMedidor = useMemo(() => formatarUso(uso, null), [uso]);

  if (!habilitado || !aberto) return null;

  return (
    <div
      ref={raizRef}
      role="dialog"
      aria-label="Agente"
      className={cn(
        "fixed bottom-16 right-4 z-[90] flex max-h-[60vh] w-[360px] flex-col",
        "rounded-ficha border border-regua bg-superficie shadow-sobreposicao",
        "motion-safe:animate-[surgir_160ms_var(--ease-caderno)]",
      )}
    >
      <header className="flex items-center gap-1 border-b border-regua px-3 py-1.5">
        <span className="meta text-tinta-suave">Agente</span>
        <div className="ml-auto flex items-center gap-1">
          <BotaoIcone
            Icone={pausado ? Play : Pause}
            titulo={pausado ? "Retomar agente" : "Pausar agente"}
            onClick={() =>
              pausado
                ? useAgenteStore.getState().retomar()
                : useAgenteStore.getState().pausar()
            }
          />
          <BotaoIcone
            Icone={X}
            titulo="Fechar"
            onClick={() => useAgenteStore.getState().alternarPainel()}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {convite && (
          <div className="rounded-controle border border-regua bg-lavagem p-3">
            <p className="text-[13px] leading-relaxed text-tinta [text-wrap:pretty]">
              Esta nota parece tratar de{" "}
              <span className="font-medium">{convite.tema}</span>. Quer que eu acompanhe?
            </p>
            <div className="mt-2 flex gap-2">
              <Botao
                variante="primario"
                tamanho="compacto"
                onClick={() => useAgenteStore.getState().responderConvite("aceitar")}
              >
                Aceitar
              </Botao>
              <Botao
                variante="fantasma"
                tamanho="compacto"
                onClick={() => useAgenteStore.getState().responderConvite("adiar")}
              >
                Agora não
              </Botao>
              <Botao
                variante="fantasma"
                tamanho="compacto"
                className="text-tinta-suave"
                onClick={() => useAgenteStore.getState().responderConvite("recusar")}
              >
                Recusar
              </Botao>
            </div>
          </div>
        )}

        {sugestoes.length > 0 && (
          <section className="flex flex-col gap-1">
            <div className="meta text-tinta-suave">Sugestões</div>
            {sugestoes.map((s) => {
              const Icone = ICONES_TIPO[s.tipo];
              return (
                <div
                  key={s.id}
                  className="group flex items-start gap-2 rounded-controle px-2 py-1.5 hover:bg-lavagem"
                >
                  <Icone
                    size={14}
                    strokeWidth={1.5}
                    aria-hidden
                    className="mt-0.5 shrink-0 text-tinta-suave"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-relaxed text-tinta [text-wrap:pretty] whitespace-pre-wrap">
                      {s.texto}
                    </p>
                    {s.caminhoNota && (
                      <button
                        type="button"
                        className="meta mt-0.5 text-musgo underline-offset-2 hover:underline"
                        onClick={() =>
                          useWorkspaceStore.getState().abrirDocumento(s.caminhoNota!)
                        }
                      >
                        {s.caminhoNota}
                      </button>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity duration-[140ms] group-hover:opacity-100 focus-within:opacity-100">
                    <BotaoIcone
                      Icone={Copy}
                      titulo="Copiar"
                      tamanho={16}
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(s.texto)
                          .then(() => toast("Sugestão copiada."))
                          .catch(() => toast("Não foi possível copiar."));
                      }}
                    />
                    <BotaoIcone
                      Icone={X}
                      titulo="Dispensar"
                      tamanho={16}
                      onClick={() => useAgenteStore.getState().dispensarSugestao(s.id)}
                    />
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {fatos.length > 0 && (
          <section className="flex flex-col gap-1">
            <button
              type="button"
              aria-expanded={fatosAbertos}
              className="meta flex items-center gap-1 text-tinta-suave hover:text-tinta"
              onClick={() => setFatosAbertos((v) => !v)}
            >
              {fatosAbertos ? (
                <ChevronDown size={12} strokeWidth={1.5} aria-hidden />
              ) : (
                <ChevronRight size={12} strokeWidth={1.5} aria-hidden />
              )}
              O que o agente aprendeu ({fatos.length})
            </button>
            {fatosAbertos && (
              <ul className="flex flex-col gap-0.5">
                {[...fatos].reverse().map((f) => (
                  <li key={f.id} className="group flex items-start gap-2 px-2 py-1">
                    <span className="min-w-0 flex-1 text-pequeno text-tinta-media [text-wrap:pretty]">
                      {f.texto}
                    </span>
                    <BotaoIcone
                      Icone={X}
                      titulo="Apagar fato"
                      tamanho={16}
                      className="shrink-0 opacity-0 transition-opacity duration-[140ms] group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => useAgenteStore.getState().apagarFato(f.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {conversa.length === 0 && sugestoes.length === 0 && !convite && status !== "pensando" && (
          <p className="mt-auto mb-auto px-1 text-center text-pequeno text-tinta-suave">
            Pergunte algo sobre a nota aberta.
          </p>
        )}
        {conversa.map((m, i) => (
          <div
            key={i}
            className={cn(
              "text-[13px] leading-relaxed [text-wrap:pretty] whitespace-pre-wrap",
              m.papel === "usuario" ? "text-tinta-media" : "text-tinta",
            )}
          >
            {m.papel === "assistente" && (
              <div className="meta mb-0.5 text-tinta-suave">agente</div>
            )}
            {m.texto}
          </div>
        ))}
        {status === "pensando" && (
          <div className="meta animate-pulse text-tinta-suave">pensando…</div>
        )}
        <div ref={fimRef} />
      </div>

      {erroAtual && <p className="border-t border-regua px-3 py-1.5 text-pequeno text-bordo">{erroAtual}</p>}

      <footer className="border-t border-regua p-2">
        <div className="flex items-end gap-2">
          <textarea
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
            rows={1}
            placeholder="Perguntar sobre esta nota"
            aria-label="Perguntar sobre esta nota"
            className={cn(
              "max-h-24 min-h-9 w-full flex-1 resize-none rounded-controle border border-regua-forte",
              "bg-superficie px-2 py-1.5 text-corpo text-tinta placeholder:text-tinta-suave",
              "transition-colors duration-[140ms] ease-caderno focus:outline-none focus-visible:outline-2 focus-visible:outline-musgo",
            )}
          />
          <BotaoIcone
            Icone={Send}
            titulo="Enviar"
            disabled={!rascunho.trim() || status === "pensando" || pausado}
            onClick={enviar}
            className="h-9 w-9"
          />
        </div>
        <div className="mt-1 px-1">
          <span className="meta text-tinta-suave">{textoMedidor}</span>
        </div>
      </footer>
    </div>
  );
}
