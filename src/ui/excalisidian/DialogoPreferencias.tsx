// Configurações do app (doc 06, inventário: "Preferências"). Um lugar só, achável por um
// ícone fixo — antes só dava pra trocar tema/largura pela paleta de comandos (Ctrl+P), que o
// usuário relatou como difícil de achar (29/08/2026).

import { useEffect, useState, type ReactNode } from "react";
import { CornerDownLeft } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { toast } from "sonner";

import { Botao, Campo, Dialog, GrupoBotoes, cn, type OpcaoGrupo } from "../index";
import { usePrefsStore, type Tema, type LarguraNota } from "../../estado/prefsStore";
import { useAgenteStore } from "../../estado/agenteStore";
import { useContaStore } from "../../estado/contaStore";
import { confirmar } from "../../estado/dialogoStore";
import { provedorDe } from "../../agente/provedores";
import { verificarAtualizacao } from "../../app/atualizacao";
import { IDIOMAS, type Idioma } from "../../i18n/idioma";
import type { ChaveTexto } from "../../i18n/catalogo";
import { useTexto } from "../../i18n/useTexto";
import DialogoGlossario from "./DialogoGlossario";

interface Props {
  onFechar(): void;
}

const OPCOES_TEMA: OpcaoGrupo<Tema>[] = [
  { rotulo: "Sistema", valor: "sistema" },
  { rotulo: "Claro", valor: "claro" },
  { rotulo: "Escuro", valor: "escuro" },
];

// Record em vez de ternário: um terceiro idioma em `Idioma` (idioma.ts) quebra a compilação
// aqui até alguém escolher a chave certa, em vez de cair num rótulo errado em silêncio.
const ROTULO_POR_IDIOMA: Record<Idioma, ChaveTexto> = {
  "pt-BR": "prefs.idioma.ptBR",
  en: "prefs.idioma.en",
};

const OPCOES_LARGURA: OpcaoGrupo<LarguraNota>[] = [
  { rotulo: "Pequena", valor: "pequena" },
  { rotulo: "Média", valor: "media" },
  { rotulo: "Full", valor: "full" },
];

export default function DialogoPreferencias({ onFechar }: Props) {
  const tema = usePrefsStore((s) => s.tema);
  const idioma = usePrefsStore((s) => s.idioma);
  const larguraNota = usePrefsStore((s) => s.larguraNota);
  const nomeUsuario = usePrefsStore((s) => s.nomeUsuario);
  const definirTema = usePrefsStore((s) => s.definirTema);
  const definirIdioma = usePrefsStore((s) => s.definirIdioma);
  const definirLarguraNota = usePrefsStore((s) => s.definirLarguraNota);
  const definirNomeUsuario = usePrefsStore((s) => s.definirNomeUsuario);
  const t = useTexto();
  const opcoesIdioma: OpcaoGrupo<Idioma>[] = IDIOMAS.map((id) => ({
    rotulo: t(ROTULO_POR_IDIOMA[id]),
    valor: id,
  }));
  const [versao, setVersao] = useState<string | null>(null);
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<string | null>(null);
  const [glossarioAberto, setGlossarioAberto] = useState(false);

  // Estado local do campo (não grava a cada tecla — só no blur/Enter, doc 15 §1.2). Sincroniza
  // quando `nomeUsuario` muda por fora (outra janela emitiu `app://prefs-mudou`, this store
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

  useEffect(() => {
    let ativo = true;
    void getVersion()
      .then((v) => {
        if (ativo) setVersao(v);
      })
      .catch(() => {
        // Sem versão disponível ainda; a seção de Atualizações mostra vazio.
      });
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <>
      <Dialog titulo="Configurações" onFechar={onFechar} className="max-w-sm">
        <div className="flex flex-col gap-4">
          <Secao titulo="Seu nome">
            <div className="flex flex-col gap-1.5">
              <Campo
                rotulo="Nome"
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
              <p className="text-pequeno text-tinta-media">
                Aparece na saudação da tela de início.
              </p>
            </div>
          </Secao>
          <Secao titulo="Tema">
            <GrupoBotoes
              rotuloGrupo="Tema"
              opcoes={OPCOES_TEMA}
              valor={tema}
              onEscolher={definirTema}
            />
          </Secao>
          {/* Segue a forma do bloco "Seu nome", não a do bloco "Tema" acima: tem linha de
           * descrição, e "Seu nome" é o único outro bloco do arquivo com esse formato. */}
          <Secao titulo={t("prefs.idioma.rotulo")}>
            <div className="flex flex-col gap-1.5">
              <GrupoBotoes
                rotuloGrupo={t("prefs.idioma.rotulo")}
                opcoes={opcoesIdioma}
                valor={idioma}
                onEscolher={definirIdioma}
              />
              <p className="text-pequeno text-tinta-media">{t("prefs.idioma.descricao")}</p>
            </div>
          </Secao>
          <Secao titulo="Largura da nota">
            <GrupoBotoes
              rotuloGrupo="Largura da nota"
              opcoes={OPCOES_LARGURA}
              valor={larguraNota}
              onEscolher={definirLarguraNota}
            />
          </Secao>
          <Secao titulo="Atalhos e símbolos">
            <div className="flex flex-col gap-2">
              <p className="text-pequeno text-tinta-media">
                Tudo o que dá pra fazer pelo teclado e os símbolos que formatam o texto.
              </p>
              <Botao
                tamanho="compacto"
                className="self-start"
                onClick={() => setGlossarioAberto(true)}
              >
                Abrir glossário
              </Botao>
            </div>
          </Secao>
          <Secao titulo={t("conta.titulo")}>
            <SecaoConta />
          </Secao>
          <Secao titulo="Agente de IA">
            <SecaoAgente
              testando={testando}
              resultadoTeste={resultadoTeste}
              onTestar={async () => {
                setTestando(true);
                setResultadoTeste(null);
                const erro = await useAgenteStore.getState().testarConexao();
                setResultadoTeste(erro ?? "Conexão funcionando.");
                setTestando(false);
              }}
            />
          </Secao>
          <Secao titulo="Atualizações">
            <div className="flex items-center justify-between gap-2">
              <span className="text-pequeno text-tinta-media">
                {versao ? `Versão ${versao}` : ""}
              </span>
              <Botao
                tamanho="compacto"
                onClick={() => void verificarAtualizacao({ silencioso: false })}
              >
                Verificar atualizações
              </Botao>
            </div>
          </Secao>
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

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <div className="meta mb-1.5 text-tinta-suave">{titulo}</div>
      {children}
    </div>
  );
}

// Conta é opcional (docs 04/09): sem sessão, a seção é só descrição + formulário de
// entrar/criar. Com sessão, vira status + sair. Nada disto aparece fora das preferências.
function SecaoConta() {
  const sessao = useContaStore((s) => s.sessao);
  const ocupado = useContaStore((s) => s.ocupado);
  const erro = useContaStore((s) => s.erro);
  const t = useTexto();
  const [email, setEmail] = useState("");
  // Nunca preenchida de volta: o store não guarda senha, e um erro limpa o campo em vez de
  // repopular com o que falhou.
  const [senha, setSenha] = useState("");

  if (sessao) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-pequeno text-tinta-media">
          {t("conta.conectadoComo", { email: sessao.email })}
        </p>
        <p className="meta text-tinta-suave">
          {t(sessao.plano === "premium" ? "conta.plano.premium" : "conta.plano.gratis")}
        </p>
        <Botao
          tamanho="compacto"
          className="self-start"
          disabled={ocupado}
          onClick={() => void useContaStore.getState().sair()}
        >
          {t("conta.sair")}
        </Botao>
      </div>
    );
  }

  async function tentar(acao: "entrar" | "criar") {
    const ok = await useContaStore.getState()[acao](email, senha);
    if (!ok) setSenha("");
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-pequeno text-tinta-media [text-wrap:pretty]">
        {t("conta.descricaoDeslogado")}
      </p>
      <Campo
        rotulo={t("conta.email")}
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Campo
        rotulo={t("conta.senha")}
        type="password"
        autoComplete="current-password"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
      />
      {erro && <p className="text-pequeno text-bordo">{t(`conta.erro.${erro}`)}</p>}
      <div className="flex flex-wrap gap-2">
        <Botao
          variante="primario"
          tamanho="compacto"
          disabled={ocupado}
          onClick={() => void tentar("entrar")}
        >
          {t("conta.entrar")}
        </Botao>
        <Botao tamanho="compacto" disabled={ocupado} onClick={() => void tentar("criar")}>
          {t("conta.criar")}
        </Botao>
      </div>
    </div>
  );
}

// Doc 11 §6.3. Sem configuração, a seção inteira é o aviso + um botão; nada de importunar.
function SecaoAgente({
  testando,
  resultadoTeste,
  onTestar,
}: {
  testando: boolean;
  resultadoTeste: string | null;
  onTestar(): void;
}) {
  const config = useAgenteStore((s) => s.config);
  if (!config) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-pequeno text-tinta-media [text-wrap:pretty]">
          Opcional. Nada é enviado sem a sua configuração, e o agente só acompanha uma nota
          depois que você aceita o convite.
        </p>
        <Botao
          variante="primario"
          tamanho="compacto"
          className="self-start"
          onClick={() => useAgenteStore.getState().abrirAssistente()}
        >
          Configurar agente
        </Botao>
      </div>
    );
  }
  const provedor = provedorDe(config.provedor);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-pequeno text-tinta-media">
        {config.habilitado ? "Ativo" : "Desligado"} · {provedor.nome}
      </p>
      <p className="meta truncate text-tinta-suave">
        {config.modeloGateiro} · {config.modeloAssistente}
      </p>
      <div className="flex flex-wrap gap-2">
        <Botao
          tamanho="compacto"
          onClick={() => void useAgenteStore.getState().definirHabilitado(!config.habilitado)}
        >
          {config.habilitado ? "Desligar agente" : "Ligar agente"}
        </Botao>
        <Botao
          tamanho="compacto"
          onClick={() => useAgenteStore.getState().abrirAssistente()}
        >
          Reconfigurar
        </Botao>
        {config.habilitado && (
          <Botao tamanho="compacto" carregando={testando} onClick={onTestar}>
            Testar conexão
          </Botao>
        )}
        <Botao
          tamanho="compacto"
          onClick={() => {
            void useAgenteStore.getState().abrirPasta().then((erro) => {
              if (erro) toast(erro);
            });
          }}
        >
          Abrir pasta do agente
        </Botao>
        <Botao
          tamanho="compacto"
          variante="destrutivo"
          onClick={() => {
            void (async () => {
              // Doc 11 §7: texto exato da confirmação de limpeza.
              const apagar = await confirmar({
                titulo: "Limpar memória",
                descricao:
                  "Apagar resumos, fatos, participações e conversas do agente? As notas não são afetadas.",
                textoConfirmar: "Apagar memória",
                destrutivo: true,
              });
              if (apagar) {
                await useAgenteStore.getState().limparMemoria();
                toast("Memória do agente apagada.");
              }
            })();
          }}
        >
          Limpar memória
        </Botao>
      </div>
      {resultadoTeste && (
        <p
          className={cn(
            "text-pequeno",
            resultadoTeste === "Conexão funcionando." ? "text-cristal" : "text-bordo",
          )}
        >
          {resultadoTeste}
        </p>
      )}
    </div>
  );
}
