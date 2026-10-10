// Configurações do app (doc 06, inventário: "Preferências"). Duas colunas com abas — navegação
// à esquerda (padrão Obsidian/Linear), conteúdo com rolagem própria à direita — um lugar só,
// achável por um ícone fixo — antes só dava pra trocar tema/largura pela paleta de comandos
// (Ctrl+P), que o usuário relatou como difícil de achar (29/08/2026).

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Bot,
  CornerDownLeft,
  Palette,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { toast } from "sonner";

import { Botao, BotaoIcone, Campo, Dialog, GrupoBotoes, cn, type OpcaoGrupo } from "../index";
import { usePrefsStore, type Tema, type LarguraNota } from "../../estado/prefsStore";
import { useAgenteStore } from "../../estado/agenteStore";
import { useContaStore } from "../../estado/contaStore";
import { useSaldoCreditosConta } from "../../servico/useSaldoCreditosConta";
import { confirmar } from "../../estado/dialogoStore";
import { provedorDe } from "../../agente/provedores";
import { verificarAtualizacao } from "../../app/atualizacao";
import { IDIOMAS, type Idioma } from "../../i18n/idioma";
import type { ChaveTexto, TradutorDoApp } from "../../i18n/catalogo";
import { useTexto } from "../../i18n/useTexto";
import DialogoGlossario from "./DialogoGlossario";
import SecaoSincronizacao from "./SecaoSincronizacao";
import SeloBeta from "./SeloBeta";
import { SERVICOS_ONLINE_LIBERADOS } from "../../servico/base";
import { AvisoTermosConta, LinksLegaisLicencas } from "./LinksLegais";
import { CreditosAgente } from "./CreditosAgente";
import {
  ABAS_PREFERENCIAS,
  abaInicial,
  abaPorTecla,
  agruparResultadosBusca,
  entradasBusca,
  type AbaPreferencias,
  type IdLinhaBusca,
} from "./abasPreferencias";

interface Props {
  onFechar(): void;
  /** Abre direto na aba pedida. "conta": usada pelo botão do passo de conta do assistente do
   * agente (T4), pra quem não tem sessão não precisar procurar a aba. "sincronizacao": usada
   * pelo ícone de estado da sincronização no rodapé da sidebar (plano 10 Task 5). */
  secaoInicial?: "conta" | "sincronizacao";
}

// Record em vez de ternário: um terceiro idioma em `Idioma` (idioma.ts) quebra a compilação
// aqui até alguém escolher a chave certa, em vez de cair num rótulo errado em silêncio.
const ROTULO_POR_IDIOMA: Record<Idioma, ChaveTexto> = {
  "pt-BR": "prefs.idioma.ptBR",
  en: "prefs.idioma.en",
};

const ICONE_POR_ABA: Record<AbaPreferencias, LucideIcon> = {
  geral: SlidersHorizontal,
  aparencia: Palette,
  conta: UserRound,
  sincronizacao: RefreshCw,
  agente: Bot,
};

function rotuloAba(aba: AbaPreferencias, t: TradutorDoApp): string {
  switch (aba) {
    case "geral":
      return t("prefs.aba.geral");
    case "aparencia":
      return t("prefs.aba.aparencia");
    case "conta":
      return t("conta.titulo");
    case "sincronizacao":
      return t("sync.titulo");
    case "agente":
      return t("prefs.aba.agente");
  }
}

// Não persistida — "nesta sessão do app" (variável de módulo). Reabre onde a última visita
// parou; a primeira vez de todas cai no padrão de `abaInicial` ("geral").
let ultimaAbaUsada: AbaPreferencias = "geral";

export default function DialogoPreferencias({ onFechar, secaoInicial }: Props) {
  const t = useTexto();
  // Lido aqui (não só dentro de `AbaAgente`) porque o registro de busca precisa saber se o
  // agente está configurado/ligado para não indexar uma linha que não vai aparecer na tela.
  const config = useAgenteStore((s) => s.config);
  const [aba, setAba] = useState<AbaPreferencias>(() => abaInicial(secaoInicial, ultimaAbaUsada));
  const [consulta, setConsulta] = useState("");
  // Estado do glossário mora aqui, não em `AbaGeral`: `DialogoGlossario` precisa continuar
  // IRMÃO do `Dialog`, não filho — dentro da caixa dele, o `fixed` do glossário ficaria preso
  // ao `transform` da caixa enquanto a animação `surgir` roda. Montado depois, fica por cima e
  // no topo da pilha de `Dialog.tsx` — Esc fecha só ele e o foco volta ao botão "Abrir
  // glossário".
  const [glossarioAberto, setGlossarioAberto] = useState(false);
  const navRefs = useRef<Partial<Record<AbaPreferencias, HTMLButtonElement | null>>>({});

  // Consulta vazia (não só "sem espaço") é o estado "não filtrando" — uma consulta só com
  // espaço já entra no modo de busca e casa tudo (`correspondeBusca`).
  const buscaAtiva = consulta !== "";
  const entradas = useMemo(
    () =>
      entradasBusca(t, {
        agenteConfigurado: !!config,
        agenteHabilitado: !!config?.habilitado,
        agenteUsaCreditos: Boolean(config && provedorDe(config.provedor).exigeConta),
      }),
    [t, config],
  );
  const grupos = useMemo(
    () => (buscaAtiva ? agruparResultadosBusca(consulta, entradas) : []),
    [buscaAtiva, consulta, entradas],
  );
  // Set único, reaproveitado por todas as abas: os ids são globalmente exclusivos
  // (`geral.nome`, `agente.pasta`...), então não precisa recortar por aba.
  const idsVisiveis = useMemo(
    () => (buscaAtiva ? new Set(grupos.flatMap((grupo) => grupo.ids)) : undefined),
    [buscaAtiva, grupos],
  );

  function selecionarAba(proxima: AbaPreferencias) {
    setAba(proxima);
    ultimaAbaUsada = proxima;
    // Escolher uma aba (clique ou seta) sai do modo de busca.
    setConsulta("");
  }

  function aoTeclarNav(e: KeyboardEvent<HTMLButtonElement>) {
    const destino = abaPorTecla(aba, e.key);
    if (!destino) return;
    e.preventDefault();
    selecionarAba(destino);
    navRefs.current[destino]?.focus();
  }

  return (
    <>
      <Dialog
        titulo={t("prefs.titulo")}
        onFechar={onFechar}
        cru
        className="flex h-[min(600px,calc(100vh-64px))] w-full max-w-3xl flex-col overflow-hidden sm:flex-row"
      >
        <nav
          aria-label={t("prefs.titulo")}
          className="flex shrink-0 flex-col overflow-x-auto border-b border-regua sm:w-52 sm:overflow-visible sm:border-b-0 sm:border-r"
        >
          <div className="shrink-0 px-4 pt-5 pb-3 font-display text-[19px] font-medium leading-[1.3] text-tinta">
            {t("prefs.titulo")}
          </div>
          {/* Busca e abas dividem este `flex sm:flex-col`: abaixo de `sm` ficam lado a lado na
           * mesma faixa horizontal rolável do `nav`; a partir de `sm`, empilhadas — busca
           * primeiro, abas embaixo. */}
          <div className="flex sm:flex-col">
            <div className="w-40 shrink-0 px-3 pb-3 sm:w-auto">
              <Campo
                rotulo={t("prefs.busca.rotulo")}
                rotuloOculto
                placeholder={t("prefs.busca.placeholder")}
                type="text"
                autoComplete="off"
                spellCheck={false}
                data-esc-limpa
                data-foco-inicial
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                onKeyDown={(e) => {
                  // O Dialog (captura na window) já deixa este Esc passar quando o campo tem
                  // texto — ver `Dialog.tsx`. Aqui é só limpar.
                  if (e.key === "Escape" && consulta !== "") {
                    e.stopPropagation();
                    setConsulta("");
                  }
                }}
                prefixo={<Search size={14} strokeWidth={1.5} aria-hidden />}
              />
            </div>
            <div role="tablist" aria-orientation="vertical" className="flex sm:flex-col">
              {ABAS_PREFERENCIAS.map((item) => {
                // Com busca ativa nenhuma aba fica destacada — os resultados não pertencem a
                // uma aba só —, mas a última selecionada continua sendo a parada do Tab
                // (`tabIndex`), pra voltar pra ela ao limpar a busca com o foco já na navegação.
                const selecionada = item === aba;
                const destacada = !buscaAtiva && selecionada;
                const Icone = ICONE_POR_ABA[item];
                return (
                  <button
                    key={item}
                    ref={(el) => {
                      navRefs.current[item] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`prefs-aba-${item}`}
                    aria-selected={destacada}
                    aria-controls={`prefs-painel-${item}`}
                    tabIndex={selecionada ? 0 : -1}
                    onClick={() => selecionarAba(item)}
                    onKeyDown={aoTeclarNav}
                    className={cn(
                      "flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2 text-left text-[13px]",
                      "transition-colors duration-[140ms] ease-caderno",
                      destacada
                        ? "bg-lavagem text-tinta"
                        : "text-tinta-media hover:bg-lavagem hover:text-tinta",
                    )}
                    style={{
                      boxShadow: destacada ? "inset 2px 0 0 0 var(--color-cristal)" : undefined,
                    }}
                  >
                    <Icone size={16} strokeWidth={1.5} aria-hidden />
                    {rotuloAba(item, t)}
                    {!SERVICOS_ONLINE_LIBERADOS && (item === "conta" || item === "sincronizacao") && (
                      <SeloBeta />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between px-8 pt-6 pb-2">
            <h2 className="font-display text-[19px] font-medium leading-[1.3] text-tinta">
              {buscaAtiva ? t("prefs.busca.resultados") : rotuloAba(aba, t)}
            </h2>
            <BotaoIcone Icone={X} titulo={t("prefs.fechar")} onClick={onFechar} />
          </div>
          {buscaAtiva ? (
            <div
              key="busca"
              role="region"
              aria-label={t("prefs.busca.resultados")}
              className="flex-1 overflow-y-auto px-8 pb-8"
            >
              {grupos.length === 0 ? (
                <p className="py-8 text-center text-pequeno text-tinta-suave">
                  {t("prefs.busca.vazio", { consulta })}
                </p>
              ) : (
                grupos.map((grupo, i) => (
                  <div key={grupo.aba} className={i === 0 ? undefined : "mt-6"}>
                    <div className="meta text-tinta-suave">{rotuloAba(grupo.aba, t)}</div>
                    {grupo.aba === "geral" && (
                      <AbaGeral
                        idsVisiveis={idsVisiveis}
                        onAbrirGlossario={() => setGlossarioAberto(true)}
                      />
                    )}
                    {grupo.aba === "aparencia" && <AbaAparencia idsVisiveis={idsVisiveis} />}
                    {grupo.aba === "conta" && <SecaoConta idsVisiveis={idsVisiveis} />}
                    {grupo.aba === "sincronizacao" && (
                      <AbaSincronizacao idsVisiveis={idsVisiveis} />
                    )}
                    {grupo.aba === "agente" && <AbaAgente idsVisiveis={idsVisiveis} />}
                  </div>
                ))
              )}
            </div>
          ) : (
            <div
              key={aba}
              role="tabpanel"
              id={`prefs-painel-${aba}`}
              aria-labelledby={`prefs-aba-${aba}`}
              className="flex-1 overflow-y-auto px-8 pb-8"
            >
              {aba === "geral" && (
                <AbaGeral onAbrirGlossario={() => setGlossarioAberto(true)} />
              )}
              {aba === "aparencia" && <AbaAparencia />}
              {aba === "conta" && <SecaoConta />}
              {aba === "sincronizacao" && <AbaSincronizacao />}
              {aba === "agente" && <AbaAgente />}
            </div>
          )}
        </div>
      </Dialog>
      {/* Irmão do Dialog das Configurações, não filho: dentro da caixa dele, o `fixed` do
       * glossário ficaria preso ao `transform` da caixa enquanto a animação `surgir` roda.
       * Montado depois, fica por cima e no topo da pilha de `Dialog.tsx` — Esc fecha só ele e o
       * foco volta ao botão "Abrir glossário". */}
      {glossarioAberto && <DialogoGlossario onFechar={() => setGlossarioAberto(false)} />}
    </>
  );
}

// Aviso de beta no lugar de Conta e Sincronização enquanto os serviços online estão desligados
// (`SERVICOS_ONLINE_LIBERADOS`). Reaproveita `LinhaConfig`: mesma tipografia das descrições.
function AvisoBeta({ id, idsVisiveis }: { id: "conta" | "sincronizacao"; idsVisiveis?: Set<string> }) {
  const t = useTexto();
  if (idsVisiveis && !idsVisiveis.has(id)) return null;
  return <LinhaConfig id={id} titulo={t("beta.titulo")} descricao={t("beta.texto")} />;
}

// Linha de configuração (doc 06): título + descrição à esquerda, controle à direita, réguas
// entre linhas — nunca sombra. `descricao` aceita um nó pronto (ex.: o texto do plano da conta,
// em `meta`) além de string: string ganha o estilo padrão de ajuda; um nó já vem com o dele.
// `id` é a unidade que a busca das Configurações indexa (`abasPreferencias.ts`, `IdLinhaBusca`)
// — estável, não é só uma chave de React. `children` é opcional: a linha de Licenças e créditos
// (ADR-42) não tem controle nenhum à direita, só título e texto legal em `descricao`.
function LinhaConfig({
  id,
  titulo,
  descricao,
  children,
}: {
  id?: string;
  titulo: string;
  descricao?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      id={id}
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-regua py-4 last:border-b-0"
    >
      <div className="min-w-0 flex-1">
        <div className="text-corpo font-medium text-tinta">{titulo}</div>
        {descricao &&
          (typeof descricao === "string" ? (
            <p className="mt-1 text-pequeno text-tinta-media [text-wrap:pretty]">{descricao}</p>
          ) : (
            <div className="mt-1">{descricao}</div>
          ))}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

// Aba "Geral": nome, idioma, atalhos/símbolos, atualizações, licenças e créditos. `idsVisiveis`
// vem do modo de busca (`DialogoPreferencias`): `undefined` mostra tudo (uso normal, uma aba de
// cada vez); definido, só as linhas cujo id está no conjunto — as demais somem por completo,
// não só visualmente, senão a busca "achava" uma linha que a tela não mostra.
function AbaGeral({
  onAbrirGlossario,
  idsVisiveis,
}: {
  onAbrirGlossario(): void;
  idsVisiveis?: Set<string>;
}) {
  const t = useTexto();
  const idioma = usePrefsStore((s) => s.idioma);
  const definirIdioma = usePrefsStore((s) => s.definirIdioma);
  const nomeUsuario = usePrefsStore((s) => s.nomeUsuario);
  const definirNomeUsuario = usePrefsStore((s) => s.definirNomeUsuario);
  const mostrar = (id: IdLinhaBusca) => !idsVisiveis || idsVisiveis.has(id);

  const opcoesIdioma: OpcaoGrupo<Idioma>[] = IDIOMAS.map((id) => ({
    rotulo: t(ROTULO_POR_IDIOMA[id]),
    valor: id,
  }));

  // Estado local do campo (não grava a cada tecla — só no blur/Enter, doc 15 §1.2). Sincroniza
  // quando `nomeUsuario` muda por fora (outra janela emitiu `app://prefs-mudou`, este store
  // recarregou): só enquanto o campo não está focado, pra não atropelar o que o usuário está
  // digitando aqui.
  const [nome, setNome] = useState(nomeUsuario ?? "");
  const [nomeFocado, setNomeFocado] = useState(false);
  useEffect(() => {
    if (!nomeFocado) setNome(nomeUsuario ?? "");
  }, [nomeUsuario, nomeFocado]);

  function gravarNomeSeMudou() {
    if (nome.trim() !== (nomeUsuario ?? "")) definirNomeUsuario(nome);
  }

  const [versao, setVersao] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true;
    void getVersion()
      .then((v) => {
        if (ativo) setVersao(v);
      })
      .catch(() => {
        // Sem versão disponível ainda; a linha de Atualizações mostra descrição vazia.
      });
    return () => {
      ativo = false;
    };
  }, []);

  const [verificando, setVerificando] = useState(false);
  async function aoVerificarAtualizacoes() {
    setVerificando(true);
    try {
      await verificarAtualizacao({ silencioso: false });
    } finally {
      setVerificando(false);
    }
  }

  return (
    <div>
      {mostrar("geral.nome") && (
        <LinhaConfig
          id="geral.nome"
          titulo={t("prefs.geral.nome.titulo")}
          descricao={t("prefs.geral.nome.descricao")}
        >
          <Campo
            rotulo={t("prefs.geral.nome.titulo")}
            rotuloOculto
            className="w-56"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onFocus={() => setNomeFocado(true)}
            onBlur={() => {
              setNomeFocado(false);
              gravarNomeSeMudou();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") gravarNomeSeMudou();
            }}
            // Sem isto nada dizia como salvar depois de mudar o nome (usuário, 16/09/2026).
            // Sair do campo também salva; a dica mostra o gesto explícito.
            sufixo={
              <>
                <CornerDownLeft size={12} strokeWidth={1.5} />
                <span className="meta">Enter</span>
              </>
            }
          />
        </LinhaConfig>
      )}
      {mostrar("geral.idioma") && (
        <LinhaConfig
          id="geral.idioma"
          titulo={t("prefs.idioma.rotulo")}
          descricao={t("prefs.idioma.descricao")}
        >
          <GrupoBotoes
            variante="segmentado"
            rotuloGrupo={t("prefs.idioma.rotulo")}
            opcoes={opcoesIdioma}
            valor={idioma}
            onEscolher={definirIdioma}
          />
        </LinhaConfig>
      )}
      {mostrar("geral.atalhos") && (
        <LinhaConfig
          id="geral.atalhos"
          titulo={t("prefs.geral.atalhos.titulo")}
          descricao={t("prefs.geral.atalhos.descricao")}
        >
          <Botao tamanho="compacto" onClick={onAbrirGlossario}>
            {t("prefs.geral.atalhos.botao")}
          </Botao>
        </LinhaConfig>
      )}
      {mostrar("geral.atualizacoes") && (
        <LinhaConfig
          id="geral.atualizacoes"
          titulo={t("prefs.geral.atualizacoes.titulo")}
          descricao={versao ? t("prefs.geral.atualizacoes.descricao", { versao }) : ""}
        >
          <Botao
            tamanho="compacto"
            carregando={verificando}
            onClick={() => void aoVerificarAtualizacoes()}
          >
            {t("prefs.geral.atualizacoes.botao")}
          </Botao>
        </LinhaConfig>
      )}
      {/* Atribuição de terceiros (ADR-42). O MIT exige o aviso de copyright e o texto da
          licença junto das cópias distribuídas — o instalador já leva LICENSE e
          THIRD_PARTY_LICENSES.md (bundle.resources); isto aqui é a versão curta, visível. Sem
          controle à direita — só texto —, por isso `LinhaConfig` sem `children`. */}
      {mostrar("geral.licencas") && (
        <LinhaConfig
          id="geral.licencas"
          titulo={t("prefs.geral.licencas.titulo")}
          descricao={
            <div className="flex flex-col gap-1.5 text-pequeno text-tinta-media [text-wrap:pretty]">
              <p>{t("prefs.geral.licencas.linha1")}</p>
              <p>{t("prefs.geral.licencas.linha2")}</p>
              <p>{t("prefs.geral.licencas.linha3")}</p>
              <p>{t("prefs.geral.licencas.linha4")}</p>
              <p className="text-tinta-suave">{t("prefs.geral.licencas.aviso")}</p>
              <LinksLegaisLicencas />
            </div>
          }
        />
      )}
    </div>
  );
}

// Aba "Aparência": tema e largura da nota. Ver `AbaGeral` sobre `idsVisiveis`.
function AbaAparencia({ idsVisiveis }: { idsVisiveis?: Set<string> }) {
  const t = useTexto();
  const tema = usePrefsStore((s) => s.tema);
  const definirTema = usePrefsStore((s) => s.definirTema);
  const larguraNota = usePrefsStore((s) => s.larguraNota);
  const definirLarguraNota = usePrefsStore((s) => s.definirLarguraNota);
  const mostrar = (id: IdLinhaBusca) => !idsVisiveis || idsVisiveis.has(id);

  const opcoesTema: OpcaoGrupo<Tema>[] = [
    { rotulo: t("prefs.aparencia.tema.sistema"), valor: "sistema" },
    { rotulo: t("prefs.aparencia.tema.claro"), valor: "claro" },
    { rotulo: t("prefs.aparencia.tema.escuro"), valor: "escuro" },
  ];
  const opcoesLargura: OpcaoGrupo<LarguraNota>[] = [
    { rotulo: t("prefs.aparencia.largura.estreita"), valor: "pequena" },
    { rotulo: t("prefs.aparencia.largura.media"), valor: "media" },
    { rotulo: t("prefs.aparencia.largura.inteira"), valor: "full" },
  ];

  return (
    <div>
      {mostrar("aparencia.tema") && (
        <LinhaConfig
          id="aparencia.tema"
          titulo={t("prefs.aparencia.tema.titulo")}
          descricao={t("prefs.aparencia.tema.descricao")}
        >
          <GrupoBotoes
            variante="segmentado"
            rotuloGrupo={t("prefs.aparencia.tema.titulo")}
            opcoes={opcoesTema}
            valor={tema}
            onEscolher={definirTema}
          />
        </LinhaConfig>
      )}
      {mostrar("aparencia.largura") && (
        <LinhaConfig
          id="aparencia.largura"
          titulo={t("prefs.aparencia.largura.titulo")}
          descricao={t("prefs.aparencia.largura.descricao")}
        >
          <GrupoBotoes
            variante="segmentado"
            rotuloGrupo={t("prefs.aparencia.largura.titulo")}
            opcoes={opcoesLargura}
            valor={larguraNota}
            onEscolher={definirLarguraNota}
          />
        </LinhaConfig>
      )}
    </div>
  );
}

// Conta é opcional (docs 04/09): sem sessão, a aba é só descrição + formulário de
// entrar/criar. Com sessão, vira status + sair. Nada disto aparece fora das preferências.
// `idsVisiveis`: Conta é UMA entrada só ("conta") — a busca das Configurações não entra dentro
// da seção, mostra ela inteira quando casa.
function SecaoConta({ idsVisiveis }: { idsVisiveis?: Set<string> }) {
  // Hooks ficam em `SecaoContaReal`; aqui só a escolha, sem hook condicional.
  if (!SERVICOS_ONLINE_LIBERADOS) return <AvisoBeta id="conta" idsVisiveis={idsVisiveis} />;
  return <SecaoContaReal idsVisiveis={idsVisiveis} />;
}

function SecaoContaReal({ idsVisiveis }: { idsVisiveis?: Set<string> }) {
  const sessao = useContaStore((s) => s.sessao);
  const carregado = useContaStore((s) => s.carregado);
  const ocupado = useContaStore((s) => s.ocupado);
  const erro = useContaStore((s) => s.erro);
  const t = useTexto();
  const [email, setEmail] = useState("");
  // Nunca preenchida de volta: o store não guarda senha, e um erro limpa o campo em vez de
  // repopular com o que falhou.
  const [senha, setSenha] = useState("");
  // Modo do formulário — não mais "último botão tocado": agora é um modo mesmo, com botão
  // primário, `autoComplete` e Enter próprios. Criar conta tem duas etapas de propósito: no
  // modo "entrar", "Criar conta" só troca de modo, sem enviar nada, para o aviso do ADR-33
  // ("não pode ser recuperada") ficar visível ANTES de a conta existir — enviar direto no
  // primeiro clique (como era antes) deixava a maioria decidir sem ler o aviso.
  const [acaoAtual, setAcaoAtual] = useState<"entrar" | "criar">("entrar");

  // Troca de modo: sempre limpa erro e senha, nunca dispara `tentar`. Usada pelo botão
  // secundário dos dois modos ("Criar conta" no modo entrar, "Já tenho conta" no modo criar).
  function trocarModo(modo: "entrar" | "criar") {
    setAcaoAtual(modo);
    useContaStore.setState({ erro: null });
    setSenha("");
  }

  // Limpa os dois campos sempre que uma sessão passa a existir — não só no clique que a
  // criou, mas qualquer caminho futuro que resulte em sessão. Sem isto, "Sair" reexibe o
  // formulário com a senha ainda no estado local (o componente não desmonta ao trocar de
  // ramo, e o `useState` sobrevive à troca): máquina compartilhada, credencial exposta.
  useEffect(() => {
    if (sessao) {
      setEmail("");
      setSenha("");
    }
  }, [sessao]);

  // O plano muda no servidor (assinatura pelo site): reconsulta ao abrir a seção.
  useEffect(() => {
    void useContaStore.getState().atualizarPlano();
  }, []);

  // Erro de uma tentativa anterior não pode sobreviver a fechar e reabrir as preferências:
  // sem isto, errar a senha, fechar e reabrir mostrava "E-mail ou senha não conferem." sob um
  // campo vazio, como se a tentativa nova já tivesse falhado.
  useEffect(() => {
    useContaStore.setState({ erro: null });
  }, []);

  // Depois dos hooks (nunca antes — hook não pode ser condicional): com busca ativa e "conta"
  // fora do conjunto casado, a seção inteira some.
  if (idsVisiveis && !idsVisiveis.has("conta")) return null;

  // Enquanto `carregar()` da abertura ainda está em voo (até 20s), `sessao` é `null` mas isso
  // ainda não é conclusão — quem já tem conta não pode ver "deslogado" piscando antes do
  // "Conectado como…". Estado neutro, sem alerta e sem formulário.
  if (!carregado) {
    return <p className="text-pequeno text-tinta-media">{t("conta.carregando")}</p>;
  }

  if (sessao) {
    return (
      <LinhaConfig
        id="conta"
        titulo={t("conta.conectadoComo", { email: sessao.email })}
        descricao={
          <span className="meta text-tinta-suave">
            {t(sessao.plano === "premium" ? "conta.plano.premium" : "conta.plano.gratis")}
          </span>
        }
      >
        <Botao
          tamanho="compacto"
          disabled={ocupado}
          onClick={() => void useContaStore.getState().sair()}
        >
          {t("conta.sair")}
        </Botao>
      </LinhaConfig>
    );
  }

  async function tentar(acao: "entrar" | "criar") {
    const ok = await useContaStore.getState()[acao](email, senha);
    if (!ok) setSenha("");
  }

  // "credenciais" e "senhaCurta" pertencem ao campo senha, "emailEmUso" ao campo e-mail —
  // usam o prop `erro` do Campo, que liga mensagem e borda ao input por `aria-describedby`.
  // Os demais (rede, servidor, expirada) não pertencem a um campo específico: ficam no
  // parágrafo.
  const erroEmail = erro === "emailEmUso" ? t(`conta.erro.${erro}`) : undefined;
  const erroSenha =
    erro === "credenciais" || erro === "senhaCurta" ? t(`conta.erro.${erro}`) : undefined;
  const erroGeral =
    erro && erro !== "emailEmUso" && erro !== "credenciais" && erro !== "senhaCurta"
      ? erro
      : null;

  return (
    <div id="conta" className="flex max-w-sm flex-col gap-3">
      <p className="text-pequeno text-tinta-media [text-wrap:pretty]">
        {t("conta.descricaoDeslogado")}
      </p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void tentar(acaoAtual);
        }}
      >
        <Campo
          rotulo={t("conta.email")}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          erro={erroEmail}
        />
        <Campo
          rotulo={t("conta.senha")}
          type="password"
          autoComplete={acaoAtual === "criar" ? "new-password" : "current-password"}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          erro={erroSenha}
        />
        {erroGeral && <p className="text-pequeno text-bordo">{t(`conta.erro.${erroGeral}`)}</p>}
        {acaoAtual === "criar" && (
          <p className="text-pequeno text-tinta-media [text-wrap:pretty]">
            {t("conta.avisoCriar")}
          </p>
        )}
        {acaoAtual === "criar" && <AvisoTermosConta />}
        <div className="flex flex-wrap gap-2">
          <Botao type="submit" variante="primario" tamanho="compacto" disabled={ocupado}>
            {t(acaoAtual === "criar" ? "conta.criar" : "conta.entrar")}
          </Botao>
          <Botao
            type="button"
            tamanho="compacto"
            disabled={ocupado}
            onClick={() => trocarModo(acaoAtual === "criar" ? "entrar" : "criar")}
          >
            {t(acaoAtual === "criar" ? "conta.jaTenhoConta" : "conta.criar")}
          </Botao>
        </div>
      </form>
    </div>
  );
}

// Aba "Sincronização": o desenho inteiro (estados, senha, lista de vaults pra baixar, erros)
// mora em `SecaoSincronizacao` (doc 17 §7-8, doc 04 §17) — esta aba só decide se a seção
// aparece, com o mesmo padrão de `idsVisiveis` de Conta: é UMA entrada só na busca, porque o
// conteúdo varia demais por estado de conta/plano/vault para indexar linha a linha.
function AbaSincronizacao({ idsVisiveis }: { idsVisiveis?: Set<string> }) {
  if (idsVisiveis && !idsVisiveis.has("sincronizacao")) return null;
  if (!SERVICOS_ONLINE_LIBERADOS) return <AvisoBeta id="sincronizacao" />;
  return (
    <div id="sincronizacao">
      <SecaoSincronizacao />
    </div>
  );
}

// Doc 11 §6.3. Sem configuração, a aba inteira é o aviso + um botão ("agente.configurar", uma
// entrada só na busca); com configuração, uma `LinhaConfig` por ação. Ver `AbaGeral` sobre
// `idsVisiveis`. O provedor "IA do Excalisidian" (ADR-35) é só mais um item de
// `provedorDe(config.provedor)` — nada aqui precisa saber seu nome.
interface AbaAgenteProps {
  idsVisiveis?: Set<string>;
}

function AbaAgente({ idsVisiveis }: AbaAgenteProps) {
  const t = useTexto();
  const config = useAgenteStore((s) => s.config);
  const usaCreditos = config ? provedorDe(config.provedor).exigeConta : false;
  const creditos = useSaldoCreditosConta(Boolean(config && usaCreditos));
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<{ ok: boolean; texto: string } | null>(
    null,
  );
  const mostrar = (id: IdLinhaBusca) => !idsVisiveis || idsVisiveis.has(id);

  if (!config) {
    if (!mostrar("agente.configurar")) return null;
    return (
      <div id="agente.configurar" className="flex flex-col gap-3">
        <p className="text-pequeno text-tinta-media [text-wrap:pretty]">{t("prefs.agente.aviso")}</p>
        <Botao
          variante="primario"
          tamanho="compacto"
          className="self-start"
          onClick={() => useAgenteStore.getState().abrirAssistente()}
        >
          {t("prefs.agente.configurar")}
        </Botao>
      </div>
    );
  }

  const provedor = provedorDe(config.provedor);

  async function aoTestar() {
    setTestando(true);
    setResultadoTeste(null);
    // `testarConexao` devolve `string | null`: null é sucesso, string já é o texto de erro
    // traduzido (`textoDoErro`). Guardamos `{ ok, texto }` em vez de comparar contra o texto
    // traduzido de sucesso — comparar string traduzida quebraria ao trocar de idioma.
    const erro = await useAgenteStore.getState().testarConexao();
    setResultadoTeste(
      erro ? { ok: false, texto: erro } : { ok: true, texto: t("prefs.agente.linha.conexao.sucesso") },
    );
    setTestando(false);
  }

  return (
    <div>
      {mostrar("agente.agente") && (
        <LinhaConfig
          id="agente.agente"
          titulo={t("prefs.agente.linha.agente.titulo")}
          descricao={t(
            config.habilitado
              ? "prefs.agente.linha.agente.descricaoAtivo"
              : "prefs.agente.linha.agente.descricaoDesligado",
            { provedor: provedor.nome },
          )}
        >
          <Botao
            tamanho="compacto"
            onClick={() => void useAgenteStore.getState().definirHabilitado(!config.habilitado)}
          >
            {t(
              config.habilitado
                ? "prefs.agente.linha.agente.desligar"
                : "prefs.agente.linha.agente.ligar",
            )}
          </Botao>
        </LinhaConfig>
      )}
      {mostrar("agente.modelos") && (
        <LinhaConfig
          id="agente.modelos"
          titulo={t(usaCreditos ? "prefs.agente.linha.creditos.titulo" : "prefs.agente.linha.modelos.titulo")}
          descricao={
            usaCreditos ? (
              <div className="flex flex-col gap-1.5">
                <CreditosAgente estado={creditos.estado} saldo={creditos.saldo} />
                <p className="text-tinta-media text-pequeno">
                  {t("agente.passo.explicacaoCreditos")}
                </p>
              </div>
            ) : (
              <span className="meta truncate text-tinta-suave">
                {config.modeloGateiro} · {config.modeloAssistente}
              </span>
            )
          }
        >
          <Botao tamanho="compacto" onClick={() => useAgenteStore.getState().abrirAssistente()}>
            {t("prefs.agente.linha.modelos.botao")}
          </Botao>
        </LinhaConfig>
      )}
      {config.habilitado && mostrar("agente.conexao") && (
        <LinhaConfig
          id="agente.conexao"
          titulo={t("prefs.agente.linha.conexao.titulo")}
          descricao={
            <>
              <p className="text-pequeno text-tinta-media [text-wrap:pretty]">
                {t("prefs.agente.linha.conexao.descricao")}
              </p>
              {resultadoTeste && (
                <p
                  className={cn(
                    "mt-1 text-pequeno",
                    resultadoTeste.ok ? "text-cristal" : "text-bordo",
                  )}
                >
                  {resultadoTeste.texto}
                </p>
              )}
            </>
          }
        >
          <Botao tamanho="compacto" carregando={testando} onClick={() => void aoTestar()}>
            {t("prefs.agente.linha.conexao.botao")}
          </Botao>
        </LinhaConfig>
      )}
      {mostrar("agente.pasta") && (
        <LinhaConfig
          id="agente.pasta"
          titulo={t("prefs.agente.linha.pasta.titulo")}
          descricao={t("prefs.agente.linha.pasta.descricao")}
        >
          <Botao
            tamanho="compacto"
            onClick={() => {
              void useAgenteStore
                .getState()
                .abrirPasta()
                .then((erro) => {
                  if (erro) toast(erro);
                });
            }}
          >
            {t("prefs.agente.linha.pasta.botao")}
          </Botao>
        </LinhaConfig>
      )}
      {mostrar("agente.memoria") && (
        <LinhaConfig
          id="agente.memoria"
          titulo={t("prefs.agente.linha.memoria.titulo")}
          descricao={t("prefs.agente.linha.memoria.descricao")}
        >
          <Botao
            tamanho="compacto"
            variante="destrutivo"
            onClick={() => {
              void (async () => {
                // Doc 11 §7: texto exato da confirmação de limpeza.
                const apagar = await confirmar({
                  titulo: t("prefs.agente.memoria.confirmarTitulo"),
                  descricao: t("prefs.agente.memoria.confirmarDescricao"),
                  textoConfirmar: t("prefs.agente.memoria.confirmarBotao"),
                  destrutivo: true,
                });
                if (apagar) {
                  await useAgenteStore.getState().limparMemoria();
                  toast(t("prefs.agente.memoria.toast"));
                }
              })();
            }}
          >
            {t("prefs.agente.linha.memoria.botao")}
          </Botao>
        </LinhaConfig>
      )}
    </div>
  );
}
