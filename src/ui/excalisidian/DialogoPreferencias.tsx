// Configurações do app (doc 06, inventário: "Preferências"). Duas colunas com abas — navegação
// à esquerda (padrão Obsidian/Linear), conteúdo com rolagem própria à direita — um lugar só,
// achável por um ícone fixo — antes só dava pra trocar tema/largura pela paleta de comandos
// (Ctrl+P), que o usuário relatou como difícil de achar (29/08/2026).

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Bot, CornerDownLeft, Palette, SlidersHorizontal, UserRound, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { toast } from "sonner";

import { Botao, BotaoIcone, Campo, Dialog, GrupoBotoes, cn, type OpcaoGrupo } from "../index";
import { usePrefsStore, type Tema, type LarguraNota } from "../../estado/prefsStore";
import { useAgenteStore } from "../../estado/agenteStore";
import { useContaStore } from "../../estado/contaStore";
import { confirmar } from "../../estado/dialogoStore";
import { provedorDe } from "../../agente/provedores";
import { verificarAtualizacao } from "../../app/atualizacao";
import { IDIOMAS, type Idioma } from "../../i18n/idioma";
import type { ChaveTexto, TradutorDoApp } from "../../i18n/catalogo";
import { useTexto } from "../../i18n/useTexto";
import DialogoGlossario from "./DialogoGlossario";
import {
  ABAS_PREFERENCIAS,
  abaInicial,
  abaPorTecla,
  type AbaPreferencias,
} from "./abasPreferencias";

interface Props {
  onFechar(): void;
  /** Abre direto na aba Conta — usado pelo botão do passo de conta do assistente do agente
   * (T4), pra quem não tem sessão não precisar procurar a aba. */
  secaoInicial?: "conta";
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
    case "agente":
      return t("prefs.aba.agente");
  }
}

// Não persistida — "nesta sessão do app" (variável de módulo). Reabre onde a última visita
// parou; a primeira vez de todas cai no padrão de `abaInicial` ("geral").
let ultimaAbaUsada: AbaPreferencias = "geral";

export default function DialogoPreferencias({ onFechar, secaoInicial }: Props) {
  const t = useTexto();
  const [aba, setAba] = useState<AbaPreferencias>(() => abaInicial(secaoInicial, ultimaAbaUsada));
  // Estado do glossário mora aqui, não em `AbaGeral`: `DialogoGlossario` precisa continuar
  // IRMÃO do `Dialog`, não filho — dentro da caixa dele, o `fixed` do glossário ficaria preso
  // ao `transform` da caixa enquanto a animação `surgir` roda. Montado depois, fica por cima e
  // no topo da pilha de `Dialog.tsx` — Esc fecha só ele e o foco volta ao botão "Abrir
  // glossário".
  const [glossarioAberto, setGlossarioAberto] = useState(false);
  const navRefs = useRef<Partial<Record<AbaPreferencias, HTMLButtonElement | null>>>({});

  function selecionarAba(proxima: AbaPreferencias) {
    setAba(proxima);
    ultimaAbaUsada = proxima;
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
          <div role="tablist" aria-orientation="vertical" className="flex sm:flex-col">
            {ABAS_PREFERENCIAS.map((item) => {
              const ativa = item === aba;
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
                  aria-selected={ativa}
                  aria-controls={`prefs-painel-${item}`}
                  tabIndex={ativa ? 0 : -1}
                  data-foco-inicial={ativa ? true : undefined}
                  onClick={() => selecionarAba(item)}
                  onKeyDown={aoTeclarNav}
                  className={cn(
                    "flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2 text-left text-[13px]",
                    "transition-colors duration-[140ms] ease-caderno",
                    ativa
                      ? "bg-lavagem text-tinta"
                      : "text-tinta-media hover:bg-lavagem hover:text-tinta",
                  )}
                  style={{
                    boxShadow: ativa ? "inset 2px 0 0 0 var(--color-cristal)" : undefined,
                  }}
                >
                  <Icone size={16} strokeWidth={1.5} aria-hidden />
                  {rotuloAba(item, t)}
                </button>
              );
            })}
          </div>
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between px-8 pt-6 pb-2">
            <h2 className="font-display text-[19px] font-medium leading-[1.3] text-tinta">
              {rotuloAba(aba, t)}
            </h2>
            <BotaoIcone Icone={X} titulo={t("prefs.fechar")} onClick={onFechar} />
          </div>
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
            {aba === "agente" && <AbaAgente />}
          </div>
        </div>
      </Dialog>
      {glossarioAberto && <DialogoGlossario onFechar={() => setGlossarioAberto(false)} />}
    </>
  );
}

// Linha de configuração (doc 06): título + descrição à esquerda, controle à direita, réguas
// entre linhas — nunca sombra. `descricao` aceita um nó pronto (ex.: o texto do plano da conta,
// em `meta`) além de string: string ganha o estilo padrão de ajuda; um nó já vem com o dele.
function LinhaConfig({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-regua py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-corpo font-medium text-tinta">{titulo}</div>
        {descricao &&
          (typeof descricao === "string" ? (
            <p className="mt-1 text-pequeno text-tinta-media [text-wrap:pretty]">{descricao}</p>
          ) : (
            <div className="mt-1">{descricao}</div>
          ))}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// Aba "Geral": nome, idioma, atalhos/símbolos, atualizações.
function AbaGeral({ onAbrirGlossario }: { onAbrirGlossario(): void }) {
  const t = useTexto();
  const idioma = usePrefsStore((s) => s.idioma);
  const definirIdioma = usePrefsStore((s) => s.definirIdioma);
  const nomeUsuario = usePrefsStore((s) => s.nomeUsuario);
  const definirNomeUsuario = usePrefsStore((s) => s.definirNomeUsuario);

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
      <LinhaConfig titulo={t("prefs.geral.nome.titulo")} descricao={t("prefs.geral.nome.descricao")}>
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
      <LinhaConfig titulo={t("prefs.idioma.rotulo")} descricao={t("prefs.idioma.descricao")}>
        <GrupoBotoes
          variante="segmentado"
          rotuloGrupo={t("prefs.idioma.rotulo")}
          opcoes={opcoesIdioma}
          valor={idioma}
          onEscolher={definirIdioma}
        />
      </LinhaConfig>
      <LinhaConfig
        titulo={t("prefs.geral.atalhos.titulo")}
        descricao={t("prefs.geral.atalhos.descricao")}
      >
        <Botao tamanho="compacto" onClick={onAbrirGlossario}>
          {t("prefs.geral.atalhos.botao")}
        </Botao>
      </LinhaConfig>
      <LinhaConfig
        titulo={t("prefs.geral.atualizacoes.titulo")}
        descricao={versao ? t("prefs.geral.atualizacoes.descricao", { versao }) : ""}
      >
        <Botao tamanho="compacto" carregando={verificando} onClick={() => void aoVerificarAtualizacoes()}>
          {t("prefs.geral.atualizacoes.botao")}
        </Botao>
      </LinhaConfig>
    </div>
  );
}

// Aba "Aparência": tema e largura da nota.
function AbaAparencia() {
  const t = useTexto();
  const tema = usePrefsStore((s) => s.tema);
  const definirTema = usePrefsStore((s) => s.definirTema);
  const larguraNota = usePrefsStore((s) => s.larguraNota);
  const definirLarguraNota = usePrefsStore((s) => s.definirLarguraNota);

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
      <LinhaConfig
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
      <LinhaConfig
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
    </div>
  );
}

// Conta é opcional (docs 04/09): sem sessão, a aba é só descrição + formulário de
// entrar/criar. Com sessão, vira status + sair. Nada disto aparece fora das preferências.
function SecaoConta() {
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

  // Erro de uma tentativa anterior não pode sobreviver a fechar e reabrir as preferências:
  // sem isto, errar a senha, fechar e reabrir mostrava "E-mail ou senha não conferem." sob um
  // campo vazio, como se a tentativa nova já tivesse falhado.
  useEffect(() => {
    useContaStore.setState({ erro: null });
  }, []);

  // Enquanto `carregar()` da abertura ainda está em voo (até 20s), `sessao` é `null` mas isso
  // ainda não é conclusão — quem já tem conta não pode ver "deslogado" piscando antes do
  // "Conectado como…". Estado neutro, sem alerta e sem formulário.
  if (!carregado) {
    return <p className="text-pequeno text-tinta-media">{t("conta.carregando")}</p>;
  }

  if (sessao) {
    return (
      <LinhaConfig
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
    <div className="flex max-w-sm flex-col gap-3">
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

// Doc 11 §6.3. Sem configuração, a aba inteira é o aviso + um botão; nada de importunar.
function AbaAgente() {
  const t = useTexto();
  const config = useAgenteStore((s) => s.config);
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<{ ok: boolean; texto: string } | null>(
    null,
  );

  if (!config) {
    return (
      <div className="flex flex-col gap-3">
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
      <LinhaConfig
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
      <LinhaConfig
        titulo={t("prefs.agente.linha.modelos.titulo")}
        descricao={
          <span className="meta truncate text-tinta-suave">
            {config.modeloGateiro} · {config.modeloAssistente}
          </span>
        }
      >
        <Botao tamanho="compacto" onClick={() => useAgenteStore.getState().abrirAssistente()}>
          {t("prefs.agente.linha.modelos.botao")}
        </Botao>
      </LinhaConfig>
      {config.habilitado && (
        <LinhaConfig
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
      <LinhaConfig
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
      <LinhaConfig
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
    </div>
  );
}
