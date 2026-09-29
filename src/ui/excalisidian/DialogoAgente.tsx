// Assistente de configuração do agente (doc 11 §6.3): cinco etapas — provedor, chave,
// modelo da leitura inicial, modelo do acompanhamento, revisão. Nada é gravado até
// "Ativar agente"; fechar no meio não deixa configuração pela metade. A busca de modelos
// no passo 2 É o teste de conexão: chave errada aparece ali, no ato.

import { useMemo, useState } from "react";
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
import type { ConfigAgente, ProvedorId, Thinking } from "../../agente/tipos";
import { useTexto } from "../../i18n/useTexto";
import { useContaStore } from "../../estado/contaStore";
import { CONTA_DISPONIVEL } from "../../servico/base";
import { trocarProvedor } from "./rascunhoAgente";

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

interface Rascunho {
  provedor: ProvedorId;
  /** Vazio = mantém a chave existente (reconfiguração). */
  chave: string;
  baseUrl: string;
  modeloGateiro: string;
  modeloAssistente: string;
  thinking: Thinking;
  webSearch: boolean;
  teto: string;
}

function rascunhoDe(config: ConfigAgente | null): Rascunho {
  return {
    provedor: config?.provedor ?? "openai",
    chave: "",
    baseUrl: config?.baseUrls?.[config.provedor] ?? "",
    modeloGateiro: config?.modeloGateiro ?? "",
    modeloAssistente: config?.modeloAssistente ?? "",
    thinking: config?.thinking ?? "padrao",
    webSearch: config?.webSearch ?? false,
    teto: config?.tetoDiarioUsd != null ? String(config.tetoDiarioUsd) : "",
  };
}

function omitirChave<T extends Record<string, string>>(mapa: T, chave: string): T {
  if (!(chave in mapa)) return mapa;
  const { [chave]: _omitida, ...resto } = mapa;
  return resto as T;
}

interface Props {
  /** Abre as preferências na seção Conta, por cima do assistente, sem fechá-lo (T4: o passo
   * de conta era um beco sem saída — sem sessão, não havia caminho pra entrar dali). */
  aoAbrirConta?: () => void;
}

export default function DialogoAgente({ aoAbrirConta }: Props) {
  const t = useTexto();
  const config = useAgenteStore((s) => s.config);
  const [etapa, setEtapa] = useState(config ? 2 : 1);
  const [r, setR] = useState<Rascunho>(() => rascunhoDe(config));
  const [modelos, setModelos] = useState<string[] | null>(null);
  const [avisoLista, setAvisoLista] = useState<string | null>(null);
  const [erroChave, setErroChave] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [avancadoAberto, setAvancadoAberto] = useState(false);

  const fechar = () => useAgenteStore.getState().fecharAssistente();
  const provedor = provedorDe(r.provedor);
  const chaveEfetiva = r.chave.trim() || config?.chaves?.[r.provedor] || "";
  const erroBase = validarBaseUrl(r.baseUrl);
  // Provedor próprio: sem chave, autentica pela sessão da conta (doc 11, provedor
  // "excalisidian"). Sem sessão ativa, o passo de conta bloqueia o avanço. Lido do store
  // (reativo) em vez do porta-token de sessao.ts, que não notifica o React quando muda —
  // entrar na conta com o assistente aberto precisa refletir na hora, sem esperar outro
  // re-render.
  const sessao = useContaStore((s) => s.sessao);
  const carregado = useContaStore((s) => s.carregado);
  // Enquanto `carregar()` da abertura ainda está em voo (até 20s), `sessao` é `null` mas isso
  // ainda não é conclusão. Sem `carregado`, quem já tem conta e abre o assistente logo no
  // início via esse alerta com o botão desabilitado, mesmo tendo sessão.
  const aguardandoConta = provedor.exigeConta && !carregado;
  const semSessao = provedor.exigeConta && carregado && sessao === null;
  // Conta grátis não usa a IA paga: barra aqui em vez de descobrir no primeiro pedido.
  const planoInsuficiente =
    provedor.exigeConta && carregado && sessao !== null && sessao.plano !== "premium";
  const rotulosPasso = provedor.exigeConta
    ? [
        t("agente.passo.provedor"),
        t("agente.passo.conta"),
        t("agente.passo.leituraInicial"),
        t("agente.passo.acompanhamento"),
        t("agente.passo.revisao"),
      ]
    : [
        t("agente.passo.provedor"),
        t("agente.passo.chave"),
        t("agente.passo.leituraInicial"),
        t("agente.passo.acompanhamento"),
        t("agente.passo.revisao"),
      ];

  const irParaChave = () => {
    setErroChave(null);
    setModelos(null);
    setAvisoLista(null);
    setEtapa(2);
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
    setCarregando(true);
    try {
      const lista = await listarModelos({
        provedor,
        chave: chaveEfetiva,
        baseUrl: baseUrlEfetiva(provedor.id, { [provedor.id]: r.baseUrl }),
        modelo: "_",
        thinking: r.thinking,
      });
      setModelos(lista.length > 0 ? lista : null);
      setAvisoLista(
        lista.length > 0
          ? null
          : "Não foi possível listar os modelos do provedor. Você pode escolher um sugerido ou digitar o nome.",
      );
      setEtapa(3);
    } catch (e) {
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
      setCarregando(false);
    }
  };

  const concluir = async () => {
    const tetoNum = r.teto.trim() ? Number(r.teto.replace(",", ".")) : null;
    const nova: ConfigAgente = {
      habilitado: true,
      provedor: r.provedor,
      chaves: {
        ...(config?.chaves ?? {}),
        ...(provedor.precisaChave && r.chave.trim() ? { [r.provedor]: r.chave.trim() } : {}),
      },
      // Provedor por conta sempre usa BASE_URL_SERVICO (doc 11): nunca persiste base URL
      // customizada para ele, nem mantém uma entrada antiga (evita apontar o Authorization
      // da sessão do usuário para outro host).
      baseUrls: provedor.exigeConta
        ? omitirChave(config?.baseUrls ?? {}, r.provedor)
        : r.baseUrl.trim()
          ? { ...(config?.baseUrls ?? {}), [r.provedor]: r.baseUrl.trim() }
          : (config?.baseUrls ?? {}),
      modeloGateiro: r.modeloGateiro,
      modeloAssistente: r.modeloAssistente,
      thinking: r.thinking,
      webSearch: provedor.suportaWebSearch ? r.webSearch : false,
      tetoDiarioUsd: tetoNum != null && Number.isFinite(tetoNum) ? tetoNum : null,
    };
    await useAgenteStore.getState().aplicarConfig(nova);
    toast(config ? "Configuração do agente salva." : "Agente ativado.");
    fechar();
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
            disabled={etapa === 1}
            onClick={() => setEtapa((n) => Math.max(1, n - 1))}
          >
            Voltar
          </Botao>
          {(etapa === 1 || etapa === 2) && (
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
          {etapa === 5 && (
            <Botao variante="primario" onClick={() => void concluir()}>
              Ativar agente
            </Botao>
          )}
        </div>
      }
    >
      <style>{ESTILOS_TRANSICOES}</style>
      <div className="meta mb-3 flex items-center gap-1.5 text-tinta-suave">
        {rotulosPasso.map((rotulo, i) => {
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
        {etapa === 1 && (
          <PassoProvedor
            valor={r.provedor}
            onEscolher={(provedorId) => setR((x) => trocarProvedor(x, provedorId, config))}
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
                {planoInsuficiente ? (
                  <p className="text-pequeno text-bordo" role="alert">
                    {t("agente.erro.plano")}
                  </p>
                ) : (
                  <p className="text-pequeno text-tinta-media">
                    {t("agente.passo.contaExplicacao")}
                  </p>
                )}
                {semSessao && (
                  <>
                    <p className="text-pequeno text-bordo" role="alert">
                      {t("agente.erro.sessao")}
                    </p>
                    {aoAbrirConta && (
                      <Botao tamanho="compacto" className="self-start" onClick={aoAbrirConta}>
                        {t("agente.passo.abrirConta")}
                      </Botao>
                    )}
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
    </Dialog>
  );
}

function PassoProvedor({
  valor,
  onEscolher,
}: {
  valor: ProvedorId;
  onEscolher(id: ProvedorId): void;
}) {
  // CONTA_DISPONIVEL (servico/base.ts) é o interruptor geral: com a tela de conta pronta
  // ele é `true` e todo provedor aparece; um `false` de emergência voltaria a esconder
  // qualquer provedor que só autentica por sessão de conta, sem tirá-lo do catálogo.
  const provedoresVisiveis = PROVEDORES.filter((p) => CONTA_DISPONIVEL || !p.exigeConta);
  return (
    <div role="radiogroup" aria-label="Provedor" className="flex flex-col gap-1.5">
      {provedoresVisiveis.map((p) => {
        const ativo = p.id === valor;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onEscolher(p.id)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-controle border px-3 py-2 text-left",
              "transition-colors duration-[140ms] ease-caderno",
              ativo ? "border-cristal bg-lavagem" : "border-regua hover:bg-lavagem",
            )}
          >
            <span className="text-[13px] font-medium text-tinta">{p.nome}</span>
            <span className="meta text-tinta-suave">{p.descricao}</span>
          </button>
        );
      })}
    </div>
  );
}

function PassoModelo({
  rotulo,
  modelos,
  aviso,
  sugeridos,
  valor,
  permiteOutro = true,
  onEscolher,
}: {
  rotulo: string;
  modelos: string[] | null;
  aviso: string | null;
  sugeridos: string[];
  valor: string;
  /** false no catálogo fixo (provedor próprio): não dá para digitar um modelo que o
   * serviço não conhece. */
  permiteOutro?: boolean;
  onEscolher(modelo: string): void;
}) {
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

function PassoRevisao({
  r,
  provedor,
  chaveMascarada,
  onMudar,
}: {
  r: Rascunho;
  provedor: ReturnType<typeof provedorDe>;
  chaveMascarada: string;
  onMudar(mudanca: Partial<Rascunho>): void;
}) {
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

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="meta shrink-0 text-tinta-suave">{rotulo}</dt>
      <dd className="min-w-0 truncate text-tinta">{valor}</dd>
    </div>
  );
}
