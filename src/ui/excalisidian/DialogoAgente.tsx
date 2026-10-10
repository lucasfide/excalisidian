// Assistente de configuração do agente (doc 11 §6.3): IA própria em dois passos; provedores
// externos mantêm cinco. Nada é gravado até
// "Ativar agente"; fechar no meio não deixa configuração pela metade. A busca de modelos
// no passo 2 É o teste de conexão: chave errada aparece ali, no ato.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";

import { Botao, Campo, Dialog, GrupoBotoes, cn, type OpcaoGrupo } from "../../ui";
import { useAgenteStore } from "../../estado/agenteStore";
import { listarModelos, textoDoErro } from "../../agente/cliente";
import { FalhaAgente } from "../../agente/tipos";
import {
  PROVEDORES,
 baseUrlEfetiva,
  mascararChave,
  modeloComThinking,
  provedorDe,
  validarBaseUrl,
} from "../../agente/provedores";
import type { ProvedorId, Thinking } from "../../agente/tipos";
import { useTexto } from "../../i18n/useTexto";
import { useContaStore } from "../../estado/contaStore";
import { SERVICOS_ONLINE_LIBERADOS } from "../../servico/base";
import { provedorDisponivel } from "../../agente/disponibilidade";
import SeloBeta from "./SeloBeta";
import { podeConcluirAgentePorCreditos, useSaldoCreditosConta } from "../../servico/useSaldoCreditosConta";
import { CreditosAgente } from "./CreditosAgente";
import {
  montarConfigAgente,
  quantidadeEtapas,
  rascunhoInicial,
  trocarProvedor,
  type CamposRascunhoAgente,
} from "./rascunhoAgente";

// "Mínimo" fora da lista: a família gpt-5.6 recusa reasoning_effort "minimal" (verificado
// na API em 13/09 — aceita none/low/medium/high/xhigh). O valor continua no tipo e no
// mapeamento por compatibilidade com modelos que o aceitam; não é mais oferecido na UI.
const OPCOES_THINKING: OpcaoGrupo<Thinking>[] = [
  { rotulo: "Padrão", valor: "padrao" },
  { rotulo: "Baixo", valor: "baixo" },
  { rotulo: "Médio", valor: "medio" },
  { rotulo: "Alto", valor: "alto" },
];

const ESTILOS_TRANSICOES = `
@keyframes dialogo-agente-etapa {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes dialogo-agente-fade {
  from {
    opacity: 0;
    transform: translateY(2px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
`;

const CLASSE_ENTRADA_ETAPA =
  "motion-safe:animate-[dialogo-agente-etapa_160ms_var(--ease-caderno)_both] motion-reduce:animate-none";
const CLASSE_FADE_INTERNO =
  "motion-safe:animate-[dialogo-agente-fade_140ms_var(--ease-caderno)_both] motion-reduce:animate-none";

interface Props {
  /** Abre as preferências na seção Conta, por cima do assistente, sem fechá-lo (T4: o passo
   * de conta era um beco sem saída — sem sessão, não havia caminho pra entrar dali). */
  aoAbrirConta?: () => void;
}

export default function DialogoAgente({ aoAbrirConta }: Props) {
  const t = useTexto();
  const config = useAgenteStore((s) => s.config);
  const reconfigurando = useRef(config !== null);
  const [etapa, setEtapa] = useState(config ? 2 : 1);
  const [r, setR] = useState<CamposRascunhoAgente>(() =>
    rascunhoInicial(config, SERVICOS_ONLINE_LIBERADOS),
  );
  const [modelos, setModelos] = useState<string[] | null>(null);
  const [avisoLista, setAvisoLista] = useState<string | null>(null);
  const [erroChave, setErroChave] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState(false);
  const salvamentoEmCurso = useRef(false);
  const sequenciaLista = useRef(0);
  const [avancadoAberto, setAvancadoAberto] = useState(false);

  const fechar = (forcado = false) => {
    if (salvando && !forcado) return;
    sequenciaLista.current++;
    useAgenteStore.getState().fecharAssistente();
  };
  const provedor = provedorDe(r.provedor);
  const etapas = quantidadeEtapas(provedor.exigeConta);
  const chaveEfetiva = r.chave.trim() || config?.chaves?.[r.provedor] || "";
  const erroBase = validarBaseUrl(r.baseUrl);
  const sessaoAtual = useContaStore((s) => s.sessao);
  // Provedor próprio: sem chave, autentica pela sessão da conta (doc 11, provedor
  // "excalisidian"). Sem sessão ativa, o passo de conta bloqueia o avanço. Lido do store
  // (reativo) em vez do porta-token de sessao.ts, que não notifica o React quando muda —
  // entrar na conta com o assistente aberto precisa refletir na hora, sem esperar outro
  // re-render.
  const estadoCreditos = useSaldoCreditosConta(provedor.exigeConta && etapa === 2);
  const aguardandoConta = provedor.exigeConta && estadoCreditos.estado === "verificando";
  const semSessao = provedor.exigeConta && estadoCreditos.estado === "sem-sessao";
  const planoInsuficiente =
    provedor.exigeConta && estadoCreditos.estado === "plano-insuficiente";
  const acessoNaoConfirmado =
    provedor.exigeConta && estadoCreditos.estado === "acesso-nao-confirmado";
  useEffect(() => {
    if (etapa === 2 && planoInsuficiente) void useContaStore.getState().atualizarPlano();
  }, [etapa, planoInsuficiente]);
  const rotulosBase = [
    t("agente.passo.provedor"),
    t(provedor.exigeConta ? "agente.passo.conta" : "agente.passo.chave"),
    t("agente.passo.leituraInicial"),
    t("agente.passo.acompanhamento"),
    t("agente.passo.revisao"),
  ];
  const rotulosVisiveis = rotulosBase.slice(0, etapas);

  const irParaChave = () => {
    sequenciaLista.current++;
    setErroChave(null);
    setModelos(null);
    setAvisoLista(null);
    setCarregando(false);
    setEtapa(2);
  };

  const voltar = () => {
    sequenciaLista.current++;
    setCarregando(false);
    setEtapa((n) => Math.max(1, n - 1));
  };

  const validarChaveEBuscarModelos = async () => {
    setErroChave(null);
    if (provedor.exigeConta) {
      // Defensivo: o botão "Continuar" já fica desabilitado com `semSessao`/`aguardandoConta`,
      // então isto não deveria disparar. `erroChave` não é exibido neste ramo (o alerta do
      // passo de conta é quem mostra o estado) — nada a escrever na tela aqui.
      if (semSessao || planoInsuficiente || aguardandoConta) return;
    } else {
      if (erroBase) {
        setErroChave(erroBase);
        return;
      }
      if (provedor.precisaChave && !chaveEfetiva) {
        setErroChave("Cole a chave da API para continuar.");
        return;
      }
    }
    // Catálogo fixo (provedor próprio): a lista já é conhecida, nada para buscar por HTTP.
    if (provedor.modelosFixos.length > 0) {
      setModelos(provedor.modelosFixos);
      setAvisoLista(null);
      setEtapa(3);
      return;
    }
    const minhaLista = ++sequenciaLista.current;
    setCarregando(true);
    try {
      const lista = await listarModelos({
        provedor,
        chave: chaveEfetiva,
        baseUrl: baseUrlEfetiva(provedor.id, { [provedor.id]: r.baseUrl }),
        modelo: "_",
        thinking: r.thinking,
      });
      if (minhaLista !== sequenciaLista.current) return;
      setModelos(lista.length > 0 ? lista : null);
      setAvisoLista(
        lista.length > 0
          ? null
          : "Não foi possível listar os modelos do provedor. Você pode escolher um sugerido ou digitar o nome.",
      );
      setEtapa(3);
    } catch (e) {
      if (minhaLista !== sequenciaLista.current) return;
      // Chave recusada: fica no passo, com a mensagem própria do erro. Sessão ausente não
      // chega aqui na prática — o provedor próprio sempre tem `modelosFixos` e retorna antes
      // desta chamada (ver acima); se chegasse, cairia no fallback abaixo, já que este passo
      // não renderiza `erroChave` no ramo `exigeConta`. Rede/listagem: segue com a lista
      // estática do catálogo (doc 11 §6.3).
      if (e instanceof FalhaAgente && e.codigo === "chave") {
        setErroChave(textoDoErro(e));
      } else {
        setModelos(null);
        setAvisoLista(
          "Não foi possível listar os modelos do provedor. Você pode escolher um sugerido ou digitar o nome.",
        );
        setEtapa(3);
      }
    } finally {
      if (minhaLista === sequenciaLista.current) setCarregando(false);
    }
  };

  const concluir = async () => {
    if (salvamentoEmCurso.current) return;
    salvamentoEmCurso.current = true;
    setSalvando(true);
    setErroSalvar(false);
    try {
      if (provedor.exigeConta) {
        const contaAtual = useContaStore.getState();
        if (
          r.provedor !== "excalisidian" ||
          !podeConcluirAgentePorCreditos(estadoCreditos, {
            carregado: contaAtual.carregado,
            sessao: contaAtual.sessao,
          })
        ) {
          return;
        }
      }
      const nova = montarConfigAgente(r, useAgenteStore.getState().config, r.baseUrl.trim());
      await useAgenteStore.getState().aplicarConfig(nova);
      toast(reconfigurando.current ? "Configuração do agente salva." : "Agente ativado.");
      fechar(true);
    } catch {
      setErroSalvar(true);
    } finally {
      salvamentoEmCurso.current = false;
      setSalvando(false);
    }
  };

  return (
    <Dialog
      titulo="Configurar agente"
      descricao="Opcional. Nada é enviado sem a sua configuração, e o agente só acompanha uma nota depois que você aceita o convite."
      onFechar={fechar}
      className="max-w-md"
      acoes={
        <div className="flex w-full items-center justify-between">
          <Botao
            variante="fantasma"
            disabled={etapa === 1 || salvando}
            onClick={voltar}
          >
            Voltar
          </Botao>
          {(etapa === 1 || (etapa === 2 && !provedor.exigeConta)) && (
            <Botao
              variante="primario"
              disabled={etapa === 2 && (carregando || semSessao || planoInsuficiente || aguardandoConta)}
              carregando={etapa === 2 && carregando}
              onClick={() => {
                if (etapa === 1) irParaChave();
                else void validarChaveEBuscarModelos();
              }}
            >
              Continuar
            </Botao>
          )}
          {((provedor.exigeConta && etapa === 2 &&
            (estadoCreditos.estado === "disponivel" || estadoCreditos.estado === "indisponivel-rede")) ||
            (!provedor.exigeConta && etapa === 5)) && (
            <Botao
              variante="primario"
              disabled={salvando}
              carregando={salvando}
              onClick={() => void concluir()}
            >
              {reconfigurando.current ? t("agente.passo.salvar") : t("agente.passo.ativar")}
            </Botao>
          )}
        </div>
      }
    >
      <style>{ESTILOS_TRANSICOES}</style>
      <fieldset disabled={salvando} className="m-0 min-w-0 border-0 p-0" aria-busy={salvando}>
      <div className="meta mb-3 flex items-center gap-1.5 text-tinta-suave">
        {rotulosVisiveis.map((rotulo, i) => {
          const n = i + 1;
          return (
            <span key={rotulo} aria-hidden className="flex items-center gap-1.5">
              {i > 0 && <ArrowRight size={10} strokeWidth={1.5} className="text-regua-forte" />}
              <span className={cn(n === etapa && "text-tinta", n < etapa && "text-tinta-media")}>
                {rotulo}
              </span>
            </span>
          );
        })}
      </div>

      <div key={etapa} className={CLASSE_ENTRADA_ETAPA}>
        {erroSalvar && (
          <p className="mb-3 text-pequeno text-bordo" role="alert">
            {t("agente.passo.erroSalvar")}
          </p>
        )}
        {etapa === 1 && (
          <PassoProvedor
            valor={r.provedor}
            onEscolher={(provedorId) => {
              sequenciaLista.current++;
              setCarregando(false);
              setR((x) => trocarProvedor(x, provedorId, config));
            }}
          />
        )}

      {etapa === 2 && (
        <div className="flex flex-col gap-3">
          {provedor.exigeConta ? (
            aguardandoConta ? (
              <p className="text-pequeno text-tinta-media">
                {t("agente.passo.contaCarregando")}
              </p>
            ) : (
              <>
                {semSessao && (
                  <>
                    <p className="text-pequeno text-tinta-media">
                      {t("agente.passo.contaSemSessao")}
                    </p>
                    {aoAbrirConta && (
                      <Botao
                        variante="primario"
                        tamanho="compacto"
                        className="self-start"
                        onClick={aoAbrirConta}
                      >
                        {t("agente.passo.abrirConta")}
                      </Botao>
                    )}
                  </>
                )}
                {planoInsuficiente && (
                  <>
                    <p className="text-pequeno text-tinta-media">
                      {t("agente.passo.contaPlanoGratis")}
                    </p>
                    <button
                      type="button"
                      className="self-start text-pequeno text-cristal underline-offset-2 hover:underline"
                      onClick={() => setEtapa(1)}
                    >
                      {t("agente.passo.usarOutroProvedor")}
                    </button>
                  </>
                )}
                {acessoNaoConfirmado && (
                  <>
                    <p className="text-pequeno text-tinta-media" role="alert">
                      {t("agente.passo.acessoNaoConfirmado")}
                    </p>
                    <Botao
                      tamanho="compacto"
                      className="self-start"
                      onClick={estadoCreditos.tentarNovamente}
                    >
                      {t("agente.passo.entrarNovamente")}
                    </Botao>
                  </>
                )}
                {(estadoCreditos.estado === "disponivel" ||
                  estadoCreditos.estado === "consultando" ||
                  estadoCreditos.estado === "indisponivel-rede") && (
                  <>
                    <CreditosAgente
                      estado={estadoCreditos.estado}
                      saldo={estadoCreditos.saldo}
                      email={sessaoAtual?.email}
                      exibirEmail
                    />
                    <p className="text-pequeno text-tinta-media">
                      {t("agente.passo.explicacaoCreditos")}
                    </p>
                  </>
                )}
              </>
            )
          ) : provedor.precisaChave ? (
            <>
              <Campo
                rotulo="Chave da API"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={
                  config?.chaves?.[r.provedor]
                    ? `mantém ${mascararChave(config.chaves[r.provedor] as string)}`
                    : "Começa com sk-…"
                }
                value={r.chave}
                erro={erroChave}
                onChange={(e) => setR((x) => ({ ...x, chave: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !carregando) void validarChaveEBuscarModelos();
                }}
              />
              {provedor.paginaDeChave && (
                <button
                  type="button"
                  className="self-start text-pequeno text-cristal underline-offset-2 hover:underline"
                  onClick={() => window.open(provedor.paginaDeChave, "_blank", "noopener,noreferrer")}
                >
                  Onde consigo uma chave?
                </button>
              )}
            </>
          ) : (
            <p className="text-pequeno text-tinta-media">
              {provedor.nome} roda na sua máquina — não precisa de chave.
            </p>
          )}
          {!provedor.exigeConta && (
            <div>
              <button
                type="button"
                className="meta text-tinta-suave transition-colors duration-[140ms] ease-caderno hover:text-tinta motion-reduce:transition-none"
                aria-expanded={avancadoAberto}
                onClick={() => setAvancadoAberto((v) => !v)}
              >
                Avançado · Base URL
              </button>
              {avancadoAberto && (
                <div className={`mt-2 ${CLASSE_FADE_INTERNO}`}>
                  <Campo
                    rotulo="Base URL customizada"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={provedor.baseUrlPadrao}
                    value={r.baseUrl}
                    erro={erroBase}
                    onChange={(e) => setR((x) => ({ ...x, baseUrl: e.target.value }))}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {etapa === 3 && (
        <PassoModelo
          rotulo="Modelo da leitura inicial — barato e rápido, só decide se vale convidar"
          modelos={modelos}
          aviso={avisoLista}
          sugeridos={provedor.sugeridosGateiro}
          valor={r.modeloGateiro}
          permiteOutro={provedor.modelosFixos.length === 0}
          onEscolher={(m) => {
            setR((x) => ({ ...x, modeloGateiro: m }));
            setEtapa(4);
          }}
        />
      )}

      {etapa === 4 && (
        <PassoModelo
          rotulo="Modelo do acompanhamento — o que lê a nota e traz as sugestões"
          modelos={modelos}
          aviso={avisoLista}
          sugeridos={provedor.sugeridosAssistente}
          valor={r.modeloAssistente}
          permiteOutro={provedor.modelosFixos.length === 0}
          onEscolher={(m) => {
            setR((x) => ({ ...x, modeloAssistente: m }));
            setEtapa(5);
          }}
        />
      )}

        {etapa === 5 && (
          <PassoRevisao
            r={r}
            provedor={provedor}
            chaveMascarada={chaveEfetiva ? mascararChave(chaveEfetiva) : "sem chave"}
            onMudar={(mudanca) => setR((x) => ({ ...x, ...mudanca }))}
          />
        )}
      </div>
      </fieldset>
    </Dialog>
  );
}

interface PassoProvedorProps {
  valor: ProvedorId;
  onEscolher(id: ProvedorId): void;
}

function PassoProvedor({ valor, onEscolher }: PassoProvedorProps) {
  // SERVICOS_ONLINE_LIBERADOS (servico/base.ts) é o interruptor geral: com `false` (beta), o
  // provedor que só autentica por sessão de conta aparece desabilitado, com o selo Beta.
  const t = useTexto();
  return (
    <div role="radiogroup" aria-label="Provedor" className="flex flex-col gap-1.5">
      {PROVEDORES.map((p) => {
        const disponivel = provedorDisponivel(p);
        const ativo = disponivel && p.id === valor;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={ativo}
            disabled={!disponivel}
            onClick={() => onEscolher(p.id)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-controle border px-3 py-2 text-left",
              "disabled:pointer-events-none disabled:opacity-50",
              "transition-colors duration-[140ms] ease-caderno",
              ativo ? "border-cristal bg-lavagem" : "border-regua hover:bg-lavagem",
            )}
          >
            <span className="flex items-center gap-2 text-[13px] font-medium text-tinta">
              {p.nome}
              {!disponivel && <SeloBeta />}
            </span>
            <span className="meta text-tinta-suave">
              {disponivel ? p.descricao : t("beta.curto")}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface PassoModeloProps {
  rotulo: string;
  modelos: string[] | null;
  aviso: string | null;
  sugeridos: string[];
  valor: string;
  /** false no catálogo fixo (provedor próprio): não dá para digitar um modelo que o
   * serviço não conhece. */
  permiteOutro?: boolean;
  onEscolher(modelo: string): void;
}

function PassoModelo({
  rotulo,
  modelos,
  aviso,
  sugeridos,
  valor,
  permiteOutro = true,
  onEscolher,
}: PassoModeloProps) {
  const [filtro, setFiltro] = useState("");
  const [outroAberto, setOutroAberto] = useState(false);
  const [outroTexto, setOutroTexto] = useState(
    valor && !(modelos ?? sugeridos).includes(valor) ? valor : "",
  );

  const lista = useMemo(() => {
    const base =
      modelos ?? Array.from(new Set([...sugeridos, ...(valor ? [valor] : [])]));
    const f = filtro.trim().toLowerCase();
    const sugere = (m: string) => sugeridos.includes(m);
    return [...base]
      .filter((m) => !f || m.toLowerCase().includes(f))
      .sort((a, b) => Number(sugere(b)) - Number(sugere(a)));
  }, [modelos, sugeridos, valor, filtro]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-pequeno text-tinta-media">{rotulo}</p>
      {aviso && (
        <p className={`text-pequeno text-ocre-tinta ${CLASSE_FADE_INTERNO}`} aria-live="polite">
          {aviso}
        </p>
      )}
      <Campo
        rotulo="Filtrar modelos"
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder={modelos ? "Buscar…" : "Nenhum modelo — digite o nome abaixo"}
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const exato = lista.find((m) => m === filtro.trim());
            if (exato) onEscolher(exato);
          }
        }}
      />
      <div
        role="listbox"
        className={`flex max-h-56 flex-col gap-[1px] overflow-y-auto ${CLASSE_FADE_INTERNO}`}
      >
        {lista.map((m) => {
          const ativo = m === valor;
          return (
            <button
              key={m}
              type="button"
              role="option"
              aria-selected={ativo}
              onClick={() => onEscolher(m)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-controle px-2 py-1.5 text-left",
                "transition-colors duration-[140ms] ease-caderno",
                ativo ? "bg-lavagem text-tinta" : "text-tinta-media hover:bg-lavagem hover:text-tinta",
              )}
            >
              <span className="truncate text-[13px]">{m}</span>
              {sugeridos.includes(m) && (
                <span className="meta shrink-0 text-cristal">Sugerido</span>
              )}
            </button>
          );
        })}
      </div>
      {permiteOutro &&
        (outroAberto ? (
          <div className={`flex items-end gap-2 ${CLASSE_FADE_INTERNO}`}>
            <div className="flex-1">
              <Campo
                rotulo="Nome do modelo"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="ex.: gpt-5.6-luna"
                value={outroTexto}
                onChange={(e) => setOutroTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && outroTexto.trim()) onEscolher(outroTexto.trim());
                }}
              />
            </div>
            <Botao
              variante="primario"
              disabled={!outroTexto.trim()}
              onClick={() => outroTexto.trim() && onEscolher(outroTexto.trim())}
            >
              OK
            </Botao>
          </div>
        ) : (
          <button
            type="button"
            className="self-start text-pequeno text-cristal underline-offset-2 hover:underline"
            onClick={() => setOutroAberto(true)}
          >
            Outro modelo…
          </button>
        ))}
    </div>
  );
}

interface PassoRevisaoProps {
  r: CamposRascunhoAgente;
  provedor: ReturnType<typeof provedorDe>;
  chaveMascarada: string;
  onMudar(mudanca: Partial<CamposRascunhoAgente>): void;
}

function PassoRevisao({ r, provedor, chaveMascarada, onMudar }: PassoRevisaoProps) {
  const thinkingVisivel =
    modeloComThinking(provedor.dialecto, r.modeloGateiro) ||
    modeloComThinking(provedor.dialecto, r.modeloAssistente);
  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-col gap-1 rounded-controle border border-regua px-3 py-2 text-[13px]">
        <Linha rotulo="Provedor" valor={provedor.nome} />
        {!provedor.exigeConta && <Linha rotulo="Chave" valor={chaveMascarada} />}
        <Linha rotulo="Leitura inicial" valor={r.modeloGateiro} />
        <Linha rotulo="Acompanhamento" valor={r.modeloAssistente} />
      </dl>

      {thinkingVisivel && (
        <div>
          <div className="meta mb-1.5 text-tinta-suave">Pensamento (reasoning)</div>
          <GrupoBotoes
            rotuloGrupo="Pensamento"
            opcoes={OPCOES_THINKING}
            valor={r.thinking}
            onEscolher={(v) => onMudar({ thinking: v })}
          />
        </div>
      )}

      {provedor.suportaWebSearch && (
        <label className="flex items-center gap-2 text-pequeno text-tinta-media">
          <input
            type="checkbox"
            checked={r.webSearch}
            onChange={(e) => onMudar({ webSearch: e.target.checked })}
            className="accent-cristal"
          />
          Permitir que o agente pesquise na web
        </label>
      )}

      {!provedor.exigeConta && (
        <Campo
          rotulo="Limite diário de gasto em US$ (opcional)"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="vazio = sem limite"
          value={r.teto}
          onChange={(e) => onMudar({ teto: e.target.value })}
        />
      )}
    </div>
  );
}

interface LinhaProps {
  rotulo: string;
  valor: string;
}

function Linha({ rotulo, valor }: LinhaProps) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="meta shrink-0 text-tinta-suave">{rotulo}</dt>
      <dd className="min-w-0 truncate text-tinta">{valor}</dd>
    </div>
  );
}
