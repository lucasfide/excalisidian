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
import { provedorDe } from "../../agente/provedores";
import { formatarCreditos, formatarRenovacao, nivelDeAviso, restantes, type SaldoCreditos } from "../../servico/creditos";
import { useTexto } from "../../i18n/useTexto";
import { type Idioma } from "../../i18n/idioma";
import { usePrefsStore } from "../../estado/prefsStore";
import type { TipoSugestao } from "../../agente/assistente";

const ICONES_TIPO: Record<TipoSugestao, typeof HelpCircle> = {
  pergunta: HelpCircle,
  conteudo: FileText,
  gap: CircleAlert,
  notaRelacionada: CornerDownLeft,
  achadoWeb: Globe,
};

export default function PainelAgente() {
  const t = useTexto();
  const idioma = usePrefsStore((s) => s.idioma);
  const habilitado = useAgenteStore((s) => s.config?.habilitado ?? false);
  const provedorId = useAgenteStore((s) => s.config?.provedor);
  const aberto = useAgenteStore((s) => s.painelAberto);
  const conversas = useAgenteStore((s) => s.conversas);
  const status = useAgenteStore((s) => s.status);
  const erroAtual = useAgenteStore((s) => s.erroAtual);
  const pausado = useAgenteStore((s) => s.pausado);
  const uso = useAgenteStore((s) => s.usoSessao);
  const convite = useAgenteStore((s) => s.convite);
  const analises = useAgenteStore((s) => s.analises);
  const sugestoesPorPath = useAgenteStore((s) => s.sugestoes);
  const fatos = useAgenteStore((s) => s.fatos);
  const caminhoAtivo = useWorkspaceStore((s) => s.caminhoAtivo);
  const conviteAqui = convite && convite.path === caminhoAtivo ? convite : null;
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
    // Mensagem longa demais não sai: o texto volta para o campo, com o aviso no rodapé.
    void useAgenteStore.getState().enviarMensagem(texto).then((r) => {
      if (r === "longa") setRascunho((atual) => atual || rascunho);
    });
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
      const alvo = e.target as Element;
      // O balão tem o próprio onClick que alterna o painel; tratar o pointerdown dele
      // aqui fecharia e o clique reabriria.
      if (alvo.closest?.("[data-balao-agente]")) return;
      if (!raizRef.current?.contains(alvo)) {
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

  // Provedor próprio: o medidor de tokens (doc 11 §5.6) cede lugar a créditos — quem paga é
  // o plano, não o usuário direto (src/servico/creditos.ts). O saldo vem do servidor (store) e
  // fica `null` quando a busca falha — o medidor some, nunca um número inventado no lugar.
  const usaCreditos = provedorId ? provedorDe(provedorId).exigeConta : false;
  const saldo = useAgenteStore((s) => s.saldoCreditos);

  // Atualiza o saldo ao abrir o painel e depois de cada resposta (o `uso` da sessão muda a cada
  // resposta bem-sucedida) ou erro (créditos esgotados mudam o medidor para "esgotado").
  useEffect(() => {
    if (aberto && usaCreditos) void useAgenteStore.getState().atualizarSaldo();
  }, [aberto, usaCreditos, uso, erroAtual]);

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
        {conviteAqui && (
          <div className="rounded-controle border border-regua bg-lavagem p-3">
            <p className="text-[13px] leading-relaxed text-tinta [text-wrap:pretty]">
              Esta nota parece tratar de{" "}
              <span className="font-medium">{conviteAqui.tema}</span>. Quer que eu acompanhe?
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
                        className="meta mt-0.5 text-cristal underline-offset-2 hover:underline"
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

        {conversa.length === 0 && sugestoes.length === 0 && !conviteAqui && status !== "pensando" && (
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
              "transition-colors duration-[140ms] ease-caderno focus:outline-none focus-visible:outline-2 focus-visible:outline-cristal",
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
        <div className="mt-1 flex items-baseline justify-between gap-2 px-1">
          {usaCreditos && saldo ? (
            <MedidorCreditos saldo={saldo} t={t} idioma={idioma} />
          ) : usaCreditos ? null : (
            <span className="meta text-tinta-suave">{textoMedidor}</span>
          )}
          {/* A decisão do gateiro nunca some sem dizer nada (doc 11 §5.1, revisado
              13/09): "não vale" e "falhou" aparecem aqui. */}
          {caminhoAtivo && analises[caminhoAtivo] === "nao-vale" && (
            <span className="meta text-tinta-suave">
              O agente leu esta nota e decidiu não participar por enquanto.
            </span>
          )}
          {caminhoAtivo && analises[caminhoAtivo] === "erro" && (
            <span className="meta text-tinta-suave">
              A análise desta nota falhou. O agente tenta de novo quando você escrever mais.
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}

/** Medidor de créditos do provedor próprio (doc 11 §5.6, revisado): substitui o medidor de
 * tokens quando a conta do usuário é quem paga, não uma chave própria. */
function MedidorCreditos({
  saldo,
  t,
  idioma,
}: {
  saldo: SaldoCreditos;
  t: ReturnType<typeof useTexto>;
  idioma: Idioma;
}) {
  const nivel = nivelDeAviso(saldo);
  const sobra = restantes(saldo);
  return (
    <span className="meta flex items-baseline gap-2">
      {nivel !== "esgotado" && (
        <span className={cn(nivel === "acabando" ? "text-ocre-tinta" : "text-tinta-suave")}>
          {Math.floor(sobra) === 1
            ? t("agente.creditos.restante")
            : t("agente.creditos.restantes", { restantes: formatarCreditos(sobra, idioma) })}
        </span>
      )}
      {nivel === "acabando" && (
        <span className="text-ocre-tinta">{t("agente.creditos.acabando")}</span>
      )}
      {nivel === "esgotado" && (
        <span className="text-bordo">
          {t("agente.creditos.esgotado", {
            data: formatarRenovacao(saldo.renovaEm, idioma),
          })}
        </span>
      )}
    </span>
  );
}
