// Painel lateral dockado do agente: conversa e análises vivem no mesmo fluxo; a memória
// fica numa tela secundária acessível pelo menu. O agente nunca escreve na nota.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CircleAlert,
  Copy,
  CornerDownLeft,
  FileText,
  Globe,
  HelpCircle,
  Send,
  X,
  MoreHorizontal,
  LoaderCircle,
  ChevronDown,
  BookmarkPlus,
  BookmarkCheck,
} from "lucide-react";

import { Botao, cn } from "../../ui";
import BotaoIcone from "../../ui/BotaoIcone";
import CabecalhoPainelLateral from "./CabecalhoPainelLateral";
import { chaveConversaAgente, useAgenteStore } from "../../estado/agenteStore";
import { useContaStore } from "../../estado/contaStore";
import { useDocumentosStore } from "../../estado/documentosStore";
import { useWorkspaceStore } from "../../estado/workspaceStore";
import { formatarUso } from "../../agente/orcamento";
import { provedorDe } from "../../agente/provedores";
import { formatarCreditos, formatarRenovacao, nivelDeAviso, restantes, type SaldoCreditos } from "../../servico/creditos";
import { useTexto } from "../../i18n/useTexto";
import { type Idioma } from "../../i18n/idioma";
import { usePrefsStore } from "../../estado/prefsStore";
import type { TipoSugestao } from "../../agente/assistente";
import type { FaseAtividadeAgente, Fato } from "../../agente/tipos";
import { recuperarSessaoApos401 } from "../../servico/useSaldoCreditosConta";
import { normalizarFatoParaComparacao } from "../../agente/regrasMemoria";
import {
  acaoDepoisRecuperacaoSessao,
  deveMostrarBotaoContaPainel,
  tokenMudouDuranteRecuperacao,
} from "./acaoContaPainel";

export interface PainelAgenteProps {
  aoAbrirConta(): void;
  aoMostrarTarefas(): void;
  aoFecharPainel(): void;
}

const ICONES_TIPO: Record<TipoSugestao, typeof HelpCircle> = {
  pergunta: HelpCircle,
  conteudo: FileText,
  gap: CircleAlert,
  notaRelacionada: CornerDownLeft,
  achadoWeb: Globe,
};

const CLASSE_ITEM_MENU =
  "flex w-full items-center rounded-controle px-3 py-1.5 text-left text-pequeno text-tinta hover:bg-lavagem focus-visible:bg-lavagem";

const ROTULOS_TIPO: Record<TipoSugestao, string> = {
  pergunta: "Pergunta",
  conteudo: "Trecho para aproveitar",
  gap: "Lacuna",
  notaRelacionada: "Nota relacionada",
  achadoWeb: "Pesquisa na web",
};

const ROTULOS_ATIVIDADE: Record<FaseAtividadeAgente, string> = {
  "leitura-inicial": "Analisando a nota…",
  "buscando-notas-relacionadas": "Consultando notas relacionadas…",
  "preparando-contexto": "Preparando o contexto…",
  "gerando-sugestoes": "Preparando sugestões…",
  respondendo: "Respondendo…",
};

export default function PainelAgente({ aoAbrirConta, aoMostrarTarefas, aoFecharPainel }: PainelAgenteProps) {
  const t = useTexto();
  const idioma = usePrefsStore((s) => s.idioma);
  const habilitado = useAgenteStore((s) => s.config?.habilitado ?? false);
  const provedorId = useAgenteStore((s) => s.config?.provedor);
  const aberto = useAgenteStore((s) => s.painelAberto);
  const conversas = useAgenteStore((s) => s.conversas);
  const enviandoChat = useAgenteStore((s) => s.enviandoChat);
  const caminhoChatEmVoo = useAgenteStore((s) => s.caminhoChatEmVoo);
  const erroAtual = useAgenteStore((s) => s.erroAtual);
  const erroDeSessao = useAgenteStore((s) => s.erroDeSessao);
  const contaCarregada = useContaStore((s) => s.carregado);
  const sessao = useContaStore((s) => s.sessao);
  const pausado = useAgenteStore((s) => s.pausado);
  const uso = useAgenteStore((s) => s.usoSessao);
  const raizAgente = useAgenteStore((s) => s.raiz);
  const convite = useAgenteStore((s) => s.convite);
  const analises = useAgenteStore((s) => s.analises);
  const sugestoesPorPath = useAgenteStore((s) => s.sugestoes);
  const fatos = useAgenteStore((s) => s.fatos);
  const atividades = useAgenteStore((s) => s.atividades);
  const caminhoAtivo = useWorkspaceStore((s) => s.caminhoAtivo);
  const chaveConversa = useDocumentosStore((s) => chaveConversaAgente(caminhoAtivo, s.docs));
  const caminhoConversa = chaveConversa || null;
  const conviteAqui = convite && convite.path === caminhoConversa ? convite : null;
  const sugestoes = caminhoConversa ? (sugestoesPorPath[chaveConversa] ?? []) : [];
  const conversa = conversas[chaveConversa] ?? [];
  const enviandoChatNestaNota = enviandoChat && caminhoChatEmVoo === chaveConversa;
  const respondendoOutraNota = enviandoChat && !enviandoChatNestaNota;
  const rotulosAtivos = useMemo(() => {
    const atuais = Object.values(atividades)
      .filter((atividade) => atividade.path === chaveConversa && atividade.fase !== "respondendo")
      .sort((a, b) => b.iniciadoEm - a.iniciadoEm);
    return [...new Set(atuais.map((atividade) => ROTULOS_ATIVIDADE[atividade.fase]))];
  }, [atividades, chaveConversa]);
  const chaveNotaUI = `${raizAgente ?? ""}\u0000${chaveConversa}`;
  const [mostrarMemoria, setMostrarMemoria] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const [memoriasEmEdicao, setMemoriasEmEdicao] = useState<Record<string, string>>({});
  const [rascunhosPorNota, setRascunhosPorNota] = useState<Record<string, string>>({});
  const rascunho = rascunhosPorNota[chaveNotaUI] ?? "";
  const [acessoNaoConfirmado, setAcessoNaoConfirmado] = useState(false);
  const [verificandoConta, setVerificandoConta] = useState(false);
  const recuperandoContaRef = useRef(false);
  const [mostrarRespostaRecente, setMostrarRespostaRecente] = useState(false);
  const [mensagensLongas, setMensagensLongas] = useState<Record<string, string>>({});
  const mensagemLonga = mensagensLongas[chaveNotaUI] ?? null;
  const idsSugestoesEmConversa = new Set(conversa.flatMap((mensagem) => mensagem.sugestoes?.map((sugestao) => sugestao.id) ?? []));
  const sugestoesSemBloco = sugestoes.filter((sugestao) => !idsSugestoesEmConversa.has(sugestao.id));
  const memoriasPendentes = fatos.filter((fato) => fato.estado === "pendente");
  const memoriasLegadas = fatos.filter((fato) => fato.estado === undefined);
  const memoriasConfirmadas = fatos.filter((fato) => fato.estado === "confirmado");
  const memoriasArquivadas = fatos.filter((fato) => fato.estado === "substituido" || fato.estado === "rejeitado");
  const temAnaliseAtivaNaConversa = conversa.some((mensagem) => mensagem.tipo === "analise" && mensagem.estado === "em-andamento");
  const ultimaAnaliseConcluidaId = [...conversa].reverse().find((mensagem) => mensagem.tipo === "analise" && mensagem.estado !== "em-andamento")?.id;
  const rolagemRef = useRef<HTMLDivElement | null>(null);
  const raizRef = useRef<HTMLDivElement | null>(null);
  const rolarAoFimRef = useRef(false);
  const estavaNoFimRef = useRef(true);
  const conversaAnteriorRef = useRef(conversa);
  const formatadorDataMemoria = useMemo(
    () => new Intl.DateTimeFormat(idioma, { day: "numeric", month: "short", year: "numeric" }),
    [idioma],
  );

  const enviar = () => {
    const texto = rascunho.trim();
    if (!texto || enviandoChat) return;
    const caminhoEnvio = chaveNotaUI;
    setRascunhosPorNota((atual) => ({ ...atual, [caminhoEnvio]: "" }));
    setMensagensLongas((atual) => {
      const proximo = { ...atual };
      delete proximo[caminhoEnvio];
      return proximo;
    });
    setMostrarMemoria(false);
    rolarAoFimRef.current = true;
    setMostrarRespostaRecente(false);
    // Mensagem longa demais não sai: o texto volta para o campo, com o aviso no rodapé.
    void useAgenteStore.getState().enviarMensagem(texto).then((r) => {
      if (r === "longa") {
        setRascunhosPorNota((atual) => ({
          ...atual,
          [caminhoEnvio]: atual[caminhoEnvio] || texto,
        }));
        setMensagensLongas((atual) => ({
          ...atual,
          [caminhoEnvio]: "Mensagem longa demais para o agente (máximo de 100 mil caracteres).",
        }));
      }
    });
  };

  // Esc fecha a tela secundária/menu antes de fechar o painel. O painel é dockado,
  // portanto cliques na nota não devem fechá-lo.
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && raizRef.current?.contains(document.activeElement)) {
        e.preventDefault();
        e.stopPropagation();
        if (menuAberto) setMenuAberto(false);
        else if (mostrarMemoria) setMostrarMemoria(false);
        else useAgenteStore.getState().alternarPainel();
      }
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => {
      window.removeEventListener("keydown", aoTeclar, true);
    };
  }, [aberto, menuAberto, mostrarMemoria]);

  useEffect(() => {
    if (!aberto) return;
    setMostrarMemoria(false);
    setMostrarRespostaRecente(false);
    rolarAoFimRef.current = true;
    // A API de reconhecimento por nota é fornecida pelo store; manter o acknowledge
    // ligado ao ato explícito de abrir/trocar o painel.
    useAgenteStore.getState().reconhecerAtualizacoes(chaveConversa);
  }, [aberto, chaveConversa, raizAgente]);

  useEffect(() => {
    const conversaAnterior = conversaAnteriorRef.current;
    conversaAnteriorRef.current = conversa;
    if (!aberto || mostrarMemoria) return;
    if (rolarAoFimRef.current) {
      if (rolagemRef.current) rolagemRef.current.scrollTop = rolagemRef.current.scrollHeight;
      rolarAoFimRef.current = false;
      estavaNoFimRef.current = true;
      return;
    }
    if (conversa !== conversaAnterior || rotulosAtivos.length > 0) {
      if (estavaNoFimRef.current) {
        if (rolagemRef.current) rolagemRef.current.scrollTop = rolagemRef.current.scrollHeight;
      } else {
        setMostrarRespostaRecente(true);
      }
    }
  }, [aberto, mostrarMemoria, chaveConversa, conversa, conversa.length, rotulosAtivos, raizAgente]);

  const textoMedidor = useMemo(() => formatarUso(uso, null), [uso]);

  // Provedor próprio: o medidor de tokens (doc 11 §5.6) cede lugar a créditos — quem paga é
  // o plano, não o usuário direto (src/servico/creditos.ts). O saldo vem do servidor (store) e
  // fica `null` quando a busca falha — o medidor some, nunca um número inventado no lugar.
  const usaCreditos = provedorId ? provedorDe(provedorId).exigeConta : false;
  const saldo = useAgenteStore((s) => s.saldoCreditos);
  const mostrarBotaoConta = deveMostrarBotaoContaPainel({
    usaProvedorComConta: usaCreditos,
    contaCarregada,
    sessaoPresente: sessao !== null,
    erroDeSessao,
  });

  useEffect(() => {
    setAcessoNaoConfirmado(false);
  }, [sessao?.token]);

  useEffect(() => {
    if (!aberto) setAcessoNaoConfirmado(false);
  }, [aberto]);

  const abrirConta = () => {
    const store = useAgenteStore.getState();
    const configAtual = store.config;
    if (
      !store.painelAberto ||
      configAtual?.habilitado !== true ||
      !provedorDe(configAtual.provedor).exigeConta
    ) return;
    store.alternarPainel();
    aoAbrirConta();
  };

  const painelAindaPedeConta = () => {
    const store = useAgenteStore.getState();
    const configAtual = store.config;
    return store.painelAberto && configAtual?.habilitado === true &&
      provedorDe(configAtual.provedor).exigeConta;
  };

  const entrarNaConta = async () => {
    if (recuperandoContaRef.current) return;
    recuperandoContaRef.current = true;
    setVerificandoConta(true);
    const sessaoAntes = useContaStore.getState().sessao;
    if (!sessaoAntes) {
      abrirConta();
      recuperandoContaRef.current = false;
      setVerificandoConta(false);
      return;
    }
    if (!useAgenteStore.getState().erroDeSessao) {
      recuperandoContaRef.current = false;
      setVerificandoConta(false);
      return;
    }
    try {
      const resultado = await recuperarSessaoApos401(sessaoAntes.token);
      const sessaoDepois = useContaStore.getState().sessao;
      const podeAbrirConta = painelAindaPedeConta();
      if (tokenMudouDuranteRecuperacao(sessaoAntes.token, sessaoDepois)) {
        setAcessoNaoConfirmado(false);
        return;
      }
      const acao = acaoDepoisRecuperacaoSessao(resultado);
      if (acao === "abrir-conta" && !sessaoDepois && podeAbrirConta) {
        setAcessoNaoConfirmado(false);
        abrirConta();
      } else {
        setAcessoNaoConfirmado(acao === "tentar-novamente" && podeAbrirConta);
      }
    } catch {
      setAcessoNaoConfirmado(painelAindaPedeConta());
    } finally {
      recuperandoContaRef.current = false;
      setVerificandoConta(false);
    }
  };

  // Atualiza o saldo ao abrir o painel e depois de cada resposta (o `uso` da sessão muda a cada
  // resposta bem-sucedida) ou erro (créditos esgotados mudam o medidor para "esgotado").
  useEffect(() => {
    if (aberto && usaCreditos) void useAgenteStore.getState().atualizarSaldo();
  }, [aberto, usaCreditos, uso, erroAtual]);

  if (!habilitado || !aberto) return null;

  return (
    <div
      ref={raizRef}
      role="region"
      aria-label="Agente"
      className={cn(
        "flex h-full min-h-0 w-full flex-col bg-superficie",
      )}
    >
      <CabecalhoPainelLateral
        ativo="agente"
        aoMostrarAgente={() => setMostrarMemoria(false)}
        aoMostrarTarefas={aoMostrarTarefas}
        aoFechar={aoFecharPainel}
        acoes={
          <div className="relative">
            <BotaoIcone Icone={MoreHorizontal} titulo="Mais opções do agente" onClick={() => setMenuAberto((atual) => !atual)} />
            {menuAberto && <div role="menu" className="absolute right-0 top-full z-10 mt-1 min-w-52 rounded-controle border border-regua bg-superficie p-1 text-tinta shadow-ficha">
              <button role="menuitem" type="button" className={CLASSE_ITEM_MENU} onClick={() => { setMostrarMemoria(true); setMenuAberto(false); }}>O que o agente lembra</button>
              <button role="menuitem" type="button" className={CLASSE_ITEM_MENU} onClick={() => { pausado ? useAgenteStore.getState().retomar() : useAgenteStore.getState().pausar(); setMenuAberto(false); }}>{pausado ? "Retomar acompanhamento" : "Pausar acompanhamento"}</button>
            </div>}
          </div>
        }
      />

      {respondendoOutraNota && <p role="status" className="border-b border-regua px-3 py-1 text-pequeno text-tinta-suave">Respondendo em outra conversa…</p>}

      {conviteAqui && (
        <div className="mx-3 mt-2 rounded-controle border border-regua bg-lavagem p-3">
          <p className="text-[13px] leading-relaxed text-tinta [text-wrap:pretty] [overflow-wrap:anywhere]">
            Esta nota parece tratar de <span className="font-medium">{conviteAqui.tema}</span>. Quer que eu acompanhe?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Botao variante="primario" tamanho="compacto" onClick={() => useAgenteStore.getState().responderConvite("aceitar")}>Aceitar</Botao>
            <Botao variante="fantasma" tamanho="compacto" onClick={() => useAgenteStore.getState().responderConvite("adiar")}>Agora não</Botao>
            <Botao variante="fantasma" tamanho="compacto" className="text-tinta-suave" onClick={() => useAgenteStore.getState().responderConvite("recusar")}>Recusar</Botao>
          </div>
        </div>
      )}

        <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={rolagemRef}
          onScroll={(e) => {
            const elemento = e.currentTarget;
            estavaNoFimRef.current = elemento.scrollHeight - elemento.scrollTop - elemento.clientHeight <= 48;
            if (estavaNoFimRef.current) setMostrarRespostaRecente(false);
          }}
          id="painel-agente-conteudo"
          aria-label={mostrarMemoria ? "Memória do agente" : "Conversa com o agente"}
          tabIndex={0}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3"
        >
        {!mostrarMemoria && (
          <div className="flex min-h-full flex-col gap-3">
            {conversa.length === 0 && !enviandoChatNestaNota && (
              <p className="my-auto px-1 text-center text-pequeno text-tinta-suave">
            {caminhoConversa ? "Pergunte algo sobre esta nota." : "Pergunte qualquer coisa ao agente."}
              </p>
            )}
            {conversa.map((m, i) => m.tipo === "analise" ? (
              <details
                key={m.id ?? `${chaveConversa}-${i}`}
                open={m.estado === "em-andamento" || m.id === ultimaAnaliseConcluidaId}
                aria-live={m.estado === "em-andamento" ? "polite" : undefined}
                className="rounded-controle border border-regua bg-lavagem p-3"
              >
                <summary className="flex cursor-pointer list-none items-start gap-2 text-pequeno text-tinta-suave">
                  {m.estado === "em-andamento" && <LoaderCircle size={16} className="mt-0.5 shrink-0 motion-safe:animate-spin" aria-hidden />}
                  {m.estado === "erro" && <CircleAlert size={16} className="mt-0.5 shrink-0 text-bordo" aria-hidden />}
                  <span className="min-w-0"><span className="meta block text-tinta">Agente</span>{m.estado === "em-andamento" ? (m.fase ? ROTULOS_ATIVIDADE[m.fase] : "Analisando a nota…") : m.texto}</span>
                  {m.estado !== "em-andamento" && <ChevronDown size={14} className="ml-auto mt-1 shrink-0" aria-hidden />}
                </summary>
                {m.sugestoes && m.sugestoes.length > 0 && <div className="mt-2 flex flex-col gap-2">{m.sugestoes.map((s) => <SugestaoInline key={s.id} sugestao={s} />)}</div>}
                {m.idsMemoria?.some((id) => fatos.some((fato) => fato.id === id && (fato.estado === "pendente" || fato.estado === undefined))) && <button type="button" className="meta mt-2 text-cristal underline-offset-2 hover:underline" onClick={() => setMostrarMemoria(true)}>Revisar lembrança sugerida</button>}
              </details>
            ) : (
              <div key={m.id ?? `${chaveConversa}-${i}`} className={cn("flex flex-col gap-1", m.papel === "usuario" ? "items-end" : "items-start")}>
                <div className="flex items-center gap-1">
                  <span className="meta px-1 text-tinta-suave">{m.papel === "usuario" ? "Você" : "Agente"}</span>
                  {m.papel === "usuario" && (
                    <BotaoIcone
                      Icone={preferenciaJaSalva(fatos, m.texto) ? BookmarkCheck : BookmarkPlus}
                      titulo={preferenciaJaSalva(fatos, m.texto) ? "Já está na memória" : "Lembrar esta preferência"}
                      disabled={preferenciaJaSalva(fatos, m.texto)}
                      onClick={() => lembrarPreferenciaDaMensagem(m.texto)}
                    />
                  )}
                </div>
                <p className={cn("max-w-[92%] whitespace-pre-wrap [overflow-wrap:anywhere] rounded-controle px-2.5 py-2 text-[13px] leading-relaxed [text-wrap:pretty]", m.papel === "usuario" ? "bg-lavagem text-tinta" : "border-l-2 border-cristal bg-superficie text-tinta")}>{m.texto}</p>
              </div>
            ))}
            {enviandoChatNestaNota && <div role="status" className="flex items-start gap-2 rounded-controle border border-regua bg-lavagem p-3 text-pequeno text-tinta-suave"><LoaderCircle size={16} className="mt-0.5 shrink-0 motion-safe:animate-spin" aria-hidden /><div><span className="meta block text-tinta">Agente</span>Respondendo…</div></div>}
            {!temAnaliseAtivaNaConversa && rotulosAtivos.length > 0 && <div role="status" aria-live="polite" className="flex items-start gap-2 rounded-controle border border-regua bg-lavagem p-3 text-pequeno text-tinta-suave"><LoaderCircle size={16} className="mt-0.5 shrink-0 motion-safe:animate-spin" aria-hidden /><div><span className="meta block text-tinta">Agente</span>{rotulosAtivos[0]}</div></div>}
            {sugestoesSemBloco.length > 0 && <details><summary className="meta cursor-pointer text-tinta-suave">Sugestões anteriores ({sugestoesSemBloco.length})</summary><div className="mt-2 flex flex-col gap-2">{sugestoesSemBloco.map((s) => <SugestaoInline key={s.id} sugestao={s} />)}</div></details>}
            <div />
          </div>
        )}
        {mostrarMemoria && <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2"><Botao variante="fantasma" tamanho="compacto" onClick={() => { rolarAoFimRef.current = true; setMostrarMemoria(false); }}>← Voltar à conversa</Botao><h2 className="meta text-tinta">O que o agente lembra</h2></div>
          <p className="text-pequeno text-tinta-suave">Sugestões de memória só entram no contexto depois da sua confirmação. Ao confirmar uma atualização, a versão anterior fica arquivada.</p>
          {fatos.length === 0 && <p className="px-1 text-pequeno text-tinta-suave">Nenhuma memória neste espaço de trabalho.</p>}
          {memoriasPendentes.length > 0 && <GrupoMemorias titulo="Para revisar" fatos={memoriasPendentes} formatarData={formatadorDataMemoria} aoConfirmar={(id) => useAgenteStore.getState().confirmarMemoria(id)} aoRejeitar={(id) => useAgenteStore.getState().rejeitarMemoria(id)} aoApagar={(id) => useAgenteStore.getState().apagarFato(id)} aoEditar={(id, texto) => useAgenteStore.getState().editarMemoria(id, texto)} />}
          {memoriasLegadas.length > 0 && <GrupoMemorias titulo="Registros antigos — revisar" fatos={memoriasLegadas} formatarData={formatadorDataMemoria} aoConfirmar={(id) => useAgenteStore.getState().confirmarMemoria(id)} aoRejeitar={(id) => useAgenteStore.getState().rejeitarMemoria(id)} aoApagar={(id) => useAgenteStore.getState().apagarFato(id)} aoEditar={(id, texto) => useAgenteStore.getState().editarMemoria(id, texto)} />}
          {memoriasConfirmadas.length > 0 && <section><h3 className="meta mb-2 text-tinta-suave">Memórias confirmadas</h3><ul className="flex flex-col gap-2">{memoriasConfirmadas.map((f) => <li key={f.id} className="rounded-controle border border-regua p-3">
            {memoriasEmEdicao[f.id] !== undefined ? <div className="flex flex-col gap-2"><textarea aria-label="Editar memória" value={memoriasEmEdicao[f.id]} onChange={(e) => setMemoriasEmEdicao((atual) => ({ ...atual, [f.id]: e.target.value }))} rows={3} className="w-full resize-y rounded-controle border border-regua-forte bg-superficie p-2 text-corpo text-tinta" />{Array.from(memoriasEmEdicao[f.id]).length > 500 && <p role="alert" className="text-pequeno text-bordo">A memória não pode passar de 500 caracteres.</p>}<div className="flex gap-2"><Botao variante="primario" tamanho="compacto" onClick={() => { if (!useAgenteStore.getState().editarMemoria(f.id, memoriasEmEdicao[f.id])) { toast("A memória não foi atualizada. Verifique o limite de tamanho."); return; } setMemoriasEmEdicao((atual) => { const proximo = { ...atual }; delete proximo[f.id]; return proximo; }); }}>Salvar</Botao><Botao variante="fantasma" tamanho="compacto" onClick={() => setMemoriasEmEdicao((atual) => { const proximo = { ...atual }; delete proximo[f.id]; return proximo; })}>Cancelar</Botao></div></div> : <p className="text-pequeno text-tinta [overflow-wrap:anywhere]">{f.texto}</p>}
            <MetaMemoria fato={f} formatarData={formatadorDataMemoria} />
            <div className="mt-2 flex flex-wrap gap-2"><Botao variante="fantasma" tamanho="compacto" onClick={() => setMemoriasEmEdicao((atual) => ({ ...atual, [f.id]: f.texto }))}>Editar</Botao><Botao variante="fantasma" tamanho="compacto" onClick={() => useAgenteStore.getState().apagarFato(f.id)}>Apagar</Botao></div>
          </li>)}</ul></section>}
          {memoriasArquivadas.length > 0 && <details><summary className="meta cursor-pointer text-tinta-suave">Arquivadas ({memoriasArquivadas.length})</summary><ul className="mt-2 flex flex-col gap-2">{memoriasArquivadas.map((fato) => <li key={fato.id} className="rounded-controle border border-regua p-3"><p className="text-pequeno text-tinta">{fato.texto}</p><MetaMemoria fato={fato} formatarData={formatadorDataMemoria} /><Botao variante="fantasma" tamanho="compacto" className="mt-2" onClick={() => useAgenteStore.getState().apagarFato(fato.id)}>Apagar</Botao></li>)}</ul></details>}
        </section>}
        </div>
        {!mostrarMemoria && mostrarRespostaRecente && (
          <button
            type="button"
            className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-pilula border border-regua bg-superficie px-3 py-1.5 text-pequeno text-tinta shadow-ficha focus-visible:outline-2 focus-visible:outline-cristal"
            onClick={() => {
              if (rolagemRef.current) rolagemRef.current.scrollTop = rolagemRef.current.scrollHeight;
              estavaNoFimRef.current = true;
              setMostrarRespostaRecente(false);
            }}
          >
            Nova atividade ↓
          </button>
        )}
      </div>

      {mensagemLonga && <p role="status" className="border-t border-regua px-3 py-1.5 text-pequeno text-bordo [overflow-wrap:anywhere]">{mensagemLonga}</p>}

      {(erroAtual || mostrarBotaoConta || acessoNaoConfirmado) && (
        <div className="flex flex-col gap-2 border-t border-regua px-3 py-2">
          {erroAtual && !erroDeSessao && <p className="text-bordo [overflow-wrap:anywhere]">{erroAtual}</p>}
          {mostrarBotaoConta && <p className="text-tinta-media [overflow-wrap:anywhere]">{t("agente.erro.sessao")}</p>}
          {acessoNaoConfirmado && (
            <p className="text-tinta-media [overflow-wrap:anywhere]" role="status">
              {t("agente.passo.acessoNaoConfirmado")}
            </p>
          )}
          {mostrarBotaoConta && (
            <Botao variante="primario" tamanho="compacto" className="self-start" disabled={verificandoConta} aria-busy={verificandoConta} onClick={() => void entrarNaConta()}>
              {t(verificandoConta ? "agente.passo.contaCarregando" : acessoNaoConfirmado ? "agente.passo.entrarNovamente" : "agente.passo.abrirConta")}
            </Botao>
          )}
        </div>
      )}

      {!mostrarMemoria && <footer className="border-t border-regua p-2">
        {caminhoConversa && <p className="mb-1 px-1 meta text-tinta-suave">Nota atual</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={rascunho}
            onChange={(e) => setRascunhosPorNota((atual) => ({ ...atual, [chaveNotaUI]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
            rows={1}
            placeholder={caminhoConversa ? "Perguntar sobre esta nota" : "Perguntar ao agente"}
            aria-label={caminhoConversa ? "Perguntar sobre esta nota" : "Perguntar ao agente"}
            className={cn(
              "max-h-24 min-h-9 w-full flex-1 resize-none rounded-controle border border-regua-forte",
              "bg-superficie px-2 py-1.5 text-corpo text-tinta placeholder:text-tinta-suave",
              "transition-colors duration-[140ms] ease-caderno focus:outline-none focus-visible:outline-2 focus-visible:outline-cristal",
            )}
          />
          <BotaoIcone
            Icone={Send}
            titulo="Enviar"
            disabled={!rascunho.trim() || enviandoChat}
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
      {caminhoConversa && analises[caminhoConversa] === "nao-vale" && (
            <span className="meta text-tinta-suave">
              O agente leu esta nota e decidiu não participar por enquanto.
            </span>
          )}
        </div>
      </footer>}
    </div>
  );
}

/** Medidor de créditos do provedor próprio (doc 11 §5.6, revisado): substitui o medidor de
 * tokens quando a conta do usuário é quem paga, não uma chave própria. */
interface MedidorCreditosProps {
  saldo: SaldoCreditos;
  t: ReturnType<typeof useTexto>;
  idioma: Idioma;
}

function MedidorCreditos({ saldo, t, idioma }: MedidorCreditosProps) {
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

interface SugestaoInlineProps {
  sugestao: import("../../agente/assistente").SugestaoAgente;
}

function SugestaoInline({ sugestao }: SugestaoInlineProps) {
  const Icone = ICONES_TIPO[sugestao.tipo];
  return <article className="flex items-start gap-2 rounded-controle border border-regua bg-lavagem px-3 py-2"><Icone size={14} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-tinta-suave" /><div className="min-w-0 flex-1"><div className="meta mb-1 text-tinta-suave">{ROTULOS_TIPO[sugestao.tipo]}</div><p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-pequeno leading-relaxed text-tinta">{sugestao.texto}</p>{sugestao.caminhoNota && <button type="button" className="meta mt-1 text-cristal underline-offset-2 hover:underline" onClick={() => useWorkspaceStore.getState().abrirDocumento(sugestao.caminhoNota!)}>Abrir {sugestao.caminhoNota}</button>}<div className="mt-2 flex gap-2"><BotaoIcone Icone={Copy} titulo="Copiar sugestão" onClick={() => { void navigator.clipboard.writeText(sugestao.texto).then(() => toast("Sugestão copiada.")).catch(() => toast("Não foi possível copiar.")); }} /><BotaoIcone Icone={X} titulo="Dispensar sugestão" onClick={() => useAgenteStore.getState().dispensarSugestao(sugestao.id)} /></div></div></article>;
}

function preferenciaJaSalva(fatos: Fato[], texto: string): boolean {
  const chave = normalizarFatoParaComparacao(texto);
  return fatos.some((fato) => fato.estado === "confirmado" && normalizarFatoParaComparacao(fato.texto) === chave);
}

function lembrarPreferenciaDaMensagem(texto: string): void {
  const storeAntes = useAgenteStore.getState();
  const raizOrigem = storeAntes.raiz;
  const id = storeAntes.lembrarPreferencia(texto);
  if (id) {
    toast("Preferência salva na memória do agente.", {
      action: {
        label: "Desfazer",
        onClick: () => {
          const storeAtual = useAgenteStore.getState();
          if (storeAtual.raiz === raizOrigem) storeAtual.apagarFato(id);
        },
      },
    });
    return;
  }
  if (preferenciaJaSalva(useAgenteStore.getState().fatos, texto)) {
    toast("Essa preferência já está salva na memória.");
  } else {
    toast("Não foi possível salvar. A preferência pode exceder o limite de tamanho.");
  }
}

interface MetaMemoriaProps {
  fato: Fato;
  formatarData: Intl.DateTimeFormat;
}

function MetaMemoria({ fato, formatarData }: MetaMemoriaProps) {
  const origem = fato.fonte === "usuario" ? "Salva por você" : fato.fonte === "conversa" ? "Da conversa" : fato.fonte === "nota" ? "Da nota" : "Registro antigo";
  const categoria = fato.categoria === "preferencia" ? "Preferência" : fato.categoria === "glossario" ? "Glossário" : fato.categoria === "convencao" ? "Convenção" : undefined;
  return <div className="mt-1 flex flex-col gap-1 text-pequeno text-tinta-suave">
    <span>{[categoria, fato.escopo === "projeto" ? `Projeto: ${fato.caminhoProjeto ?? ""}` : fato.escopo === "vault" ? "Espaço de trabalho" : undefined, origem].filter(Boolean).join(" · ")}</span>
    {fato.notaOrigem && <span className="[overflow-wrap:anywhere]">Origem: {fato.notaOrigem}</span>}
    {fato.trechoEvidencia && <span className="border-l border-regua pl-2 [overflow-wrap:anywhere]">“{fato.trechoEvidencia}”</span>}
    {Number.isFinite(Date.parse(fato.atualizadoEm ?? fato.criadoEm)) && <time dateTime={fato.atualizadoEm ?? fato.criadoEm}>{formatarData.format(new Date(fato.atualizadoEm ?? fato.criadoEm))}{fato.atualizadoEm ? " · atualizado" : ""}</time>}
  </div>;
}

interface GrupoMemoriasProps {
  titulo: string;
  fatos: Fato[];
  formatarData: Intl.DateTimeFormat;
  aoConfirmar(id: string): void;
  aoRejeitar(id: string): void;
  aoApagar(id: string): void;
  aoEditar(id: string, texto: string): boolean;
}

function GrupoMemorias({ titulo, fatos, formatarData, aoConfirmar, aoRejeitar, aoApagar, aoEditar }: GrupoMemoriasProps) {
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [errosRascunho, setErrosRascunho] = useState<Record<string, string>>({});
  return (
    <section>
      {titulo && <h3 className="meta mb-2 text-tinta-suave">{titulo}</h3>}
      <ul className="flex flex-col gap-2">
        {[...fatos].reverse().map((fato) => {
          const legadoGrande = fato.estado === undefined && Array.from(fato.texto).length > 500;
          const textoAcimaDoLimite = Array.from(rascunhos[fato.id] ?? "").length > 500;
          return (
            <li key={fato.id} className="rounded-controle border border-regua p-3">
              {rascunhos[fato.id] !== undefined ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    aria-label="Editar memória"
                    value={rascunhos[fato.id]}
                    onChange={(e) => setRascunhos((atual) => ({ ...atual, [fato.id]: e.target.value }))}
                    rows={3}
                    className="w-full resize-y rounded-controle border border-regua-forte bg-superficie p-2 text-corpo text-tinta"
                  />
                  {textoAcimaDoLimite && <p role="alert" className="text-pequeno text-bordo">A memória não pode passar de 500 caracteres.</p>}
                  {errosRascunho[fato.id] && <p role="alert" className="text-pequeno text-bordo">{errosRascunho[fato.id]}</p>}
                  <div className="flex gap-2">
                    <Botao variante="primario" tamanho="compacto" onClick={() => {
                      if (textoAcimaDoLimite || !aoEditar(fato.id, rascunhos[fato.id])) {
                        setErrosRascunho((atual) => ({ ...atual, [fato.id]: "A memória não foi atualizada. Verifique o limite de tamanho." }));
                        return;
                      }
                      setRascunhos((atual) => { const proximo = { ...atual }; delete proximo[fato.id]; return proximo; });
                    }}>Salvar</Botao>
                    <Botao variante="fantasma" tamanho="compacto" onClick={() => setRascunhos((atual) => { const proximo = { ...atual }; delete proximo[fato.id]; return proximo; })}>Cancelar</Botao>
                  </div>
                </div>
              ) : <p className="text-pequeno text-tinta [overflow-wrap:anywhere]">{fato.texto}</p>}
              <MetaMemoria fato={fato} formatarData={formatarData} />
              {legadoGrande && <p className="mt-2 text-pequeno text-tinta-suave">Edite para até 500 caracteres antes de confirmar.</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {fato.estado !== "confirmado" && <>
                  <Botao variante="primario" tamanho="compacto" disabled={legadoGrande} onClick={() => aoConfirmar(fato.id)}>Confirmar</Botao>
                  <Botao variante="fantasma" tamanho="compacto" onClick={() => aoRejeitar(fato.id)}>Rejeitar</Botao>
                </>}
                <Botao variante="fantasma" tamanho="compacto" onClick={() => setRascunhos((atual) => ({ ...atual, [fato.id]: fato.texto }))}>Editar</Botao>
                <Botao variante="fantasma" tamanho="compacto" onClick={() => aoApagar(fato.id)}>Apagar</Botao>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
