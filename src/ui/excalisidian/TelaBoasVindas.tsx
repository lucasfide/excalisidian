// Tela de boas-vindas (doc 15 §1.1/§2.3, doc 06 "Tela de boas-vindas"): substitui a tela
// `sem-vault` do App.tsx — primeiro uso, retorno (janela nova sem vault, vault que sumiu) e
// erro de abertura são a mesma tela, com pequenas trocas de texto. É esta tela quem cria a
// pasta do vault (`criarVault`) e grava o nome do usuário; abrir o vault nesta janela, criar o
// conteúdo de exemplo e abrir a nota depois são responsabilidade de quem chama (`App.tsx`),
// recebidos aqui só como callbacks.

import { useEffect, useState } from "react";
import { documentDir } from "@tauri-apps/api/path";

import { Botao, Campo } from "../index";
import Logotipo from "./Logotipo";
import { usePrefsStore } from "../../estado/prefsStore";
import { sugerirNomeUsuario } from "../../app/sistemaOperacional";
import { criarVault, escolherPasta } from "../../vault/janelas";
import { nomeDoVault, type VaultRecente } from "../../vault/vaultsRecentes";
import { MENSAGENS_ERRO_VAULT } from "../../vault/mensagensErroVault";

const NOME_VAULT_PADRAO = "Notas";

interface Props {
  erro: string | null;
  recentes: VaultRecente[];
  onAbrirVault(caminho: string, opcoes?: { conteudoInicial?: boolean }): Promise<void>;
  onAbrirPasta(): Promise<void>;
  onAbrirRecente(caminho: string): Promise<void>;
}

/** Separador do caminho final: o que o próprio `local` resolvido usa (doc 15 §2.3), nunca
 * fixo — `documentDir()` no Windows já devolve com `\`, mas não presumimos a plataforma. */
function separadorDe(caminho: string): string {
  return caminho.includes("\\") ? "\\" : "/";
}

export default function TelaBoasVindas({
  erro,
  recentes,
  onAbrirVault,
  onAbrirPasta,
  onAbrirRecente,
}: Props) {
  const nomeUsuario = usePrefsStore((s) => s.nomeUsuario);
  const carregado = usePrefsStore((s) => s.carregado);
  const definirNomeUsuario = usePrefsStore((s) => s.definirNomeUsuario);

  // Campo de nome só aparece se nunca foi informado (doc 15 §1.1) — e nunca no erro, mesmo
  // que o nome ainda esteja por informar (doc 15 §1.1 "Erro de abertura").
  const campoNomeVisivel = carregado && nomeUsuario === null && !erro;
  const [nomeCampo, setNomeCampo] = useState("");
  const [sugestaoPedida, setSugestaoPedida] = useState(false);

  useEffect(() => {
    if (!campoNomeVisivel || sugestaoPedida) return;
    setSugestaoPedida(true);
    void sugerirNomeUsuario().then(setNomeCampo);
  }, [campoNomeVisivel, sugestaoPedida]);

  const [nomeVault, setNomeVault] = useState(NOME_VAULT_PADRAO);
  const [localVault, setLocalVault] = useState("");
  const [erroNomeVault, setErroNomeVault] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    let ativo = true;
    // Falha em ler a pasta Documentos: local fica vazio e o botão primário desabilitado até
    // o usuário escolher pelo diálogo nativo (doc 15 §1.1 "Vault").
    void documentDir()
      .then((dir) => {
        if (ativo) setLocalVault(dir);
      })
      .catch(() => {
        if (ativo) setLocalVault("");
      });
    return () => {
      ativo = false;
    };
  }, []);

  const primeiroUso = recentes.length === 0;
  const titulo = erro
    ? "Não foi possível abrir o vault"
    : primeiroUso
      ? "Vamos começar"
      : "Nenhum vault aberto";
  const tituloSecaoVault = primeiroUso ? "Seu primeiro vault" : "Criar vault";

  const separador = separadorDe(localVault || "\\");
  const caminhoFinal = localVault ? `${localVault}${separador}${nomeVault}` : "";
  const desabilitado = localVault.trim() === "" || nomeVault.trim() === "" || criando;

  // Grava o nome só se o campo estava visível (doc 15 §1.1) — a mesma regra vale pros três
  // caminhos de seguir em frente ("Criar e começar", "Abrir pasta" e um recente).
  function gravarNomeSeVisivel() {
    if (campoNomeVisivel) definirNomeUsuario(nomeCampo);
  }

  async function confirmarCriar() {
    if (desabilitado) return;
    setCriando(true);
    setErroNomeVault(null);
    try {
      const caminho = await criarVault(localVault, nomeVault);
      // Depois de a pasta existir, não antes: gravar o nome faz o campo sumir, e um erro
      // inline ("Já existe uma pasta…") deixaria o usuário na tela sem o campo que preencheu.
      gravarNomeSeVisivel();
      await onAbrirVault(caminho, { conteudoInicial: true });
    } catch (e) {
      const codigo = e instanceof Error ? e.message : String(e);
      setErroNomeVault(MENSAGENS_ERRO_VAULT[codigo] ?? codigo);
    } finally {
      setCriando(false);
    }
  }

  async function escolherLocal() {
    const escolhido = await escolherPasta();
    if (escolhido) setLocalVault(escolhido);
  }

  async function abrirPasta() {
    gravarNomeSeVisivel();
    await onAbrirPasta();
  }

  async function abrirRecente(caminho: string) {
    gravarNomeSeVisivel();
    await onAbrirRecente(caminho);
  }

  return (
    <div className="flex h-screen items-center justify-center bg-papel px-8">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Logotipo altura={32} />

        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[32px] font-semibold leading-[1.10] tracking-[-0.015em] text-tinta">
            {titulo}
          </h1>
          {erro ? (
            <p className="text-corpo text-bordo [text-wrap:pretty]">{erro}</p>
          ) : (
            primeiroUso && (
              <p className="text-corpo text-tinta-media [text-wrap:pretty]">
                Notas em Markdown e desenhos no mesmo lugar, em arquivos que são seus.
              </p>
            )
          )}
        </div>

        {campoNomeVisivel && (
          <div className="flex flex-col gap-1">
            <Campo
              rotulo="Como podemos te chamar?"
              value={nomeCampo}
              onChange={(e) => setNomeCampo(e.target.value)}
              // `Campo` só tem slot de erro abaixo do input, não de ajuda — a linha de ajuda
              // vai solta aqui embaixo, no mesmo container pra ficar colada ao campo.
            />
            <p className="text-pequeno text-tinta-suave">
              Aparece na saudação da tela de início. Dá para mudar nas Configurações.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <h2 className="font-display text-[16px] font-medium leading-[1.40] text-tinta">
            {tituloSecaoVault}
          </h2>
          {primeiroUso && !erro && (
            <p className="text-corpo text-tinta-media [text-wrap:pretty]">
              Um vault é uma pasta comum do seu computador. Suas notas e desenhos ficam nela
              como arquivos .md.
            </p>
          )}

          <Campo
            rotulo="Nome"
            value={nomeVault}
            erro={erroNomeVault}
            onChange={(e) => {
              setNomeVault(e.target.value);
              setErroNomeVault(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !desabilitado) void confirmarCriar();
            }}
          />

          <div className="flex flex-col gap-1">
            <span className="meta text-tinta-suave">Local</span>
            <div className="flex items-center gap-2">
              <span
                className="min-w-0 flex-1 truncate text-pequeno text-tinta-media"
                title={localVault}
              >
                {localVault || "—"}
              </span>
              <Botao tamanho="compacto" onClick={() => void escolherLocal()}>
                Escolher…
              </Botao>
            </div>
          </div>

          {caminhoFinal && <p className="meta text-tinta-suave">{caminhoFinal}</p>}

          <Botao
            variante="primario"
            disabled={desabilitado}
            carregando={criando}
            onClick={() => void confirmarCriar()}
            className="w-full"
          >
            Criar e começar
          </Botao>

          <div className="flex items-center gap-2">
            <span className="text-pequeno text-tinta-media">Já tenho uma pasta com notas</span>
            <Botao variante="fantasma" tamanho="compacto" onClick={() => void abrirPasta()}>
              Abrir pasta
            </Botao>
          </div>
        </div>

        {recentes.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="meta text-tinta-suave">Recentes</span>
            <ul className="flex flex-col divide-y divide-regua border-y border-regua">
              {recentes.map((r) => (
                <li key={r.caminho}>
                  <button
                    type="button"
                    title={r.caminho}
                    onClick={() => void abrirRecente(r.caminho)}
                    className="w-full truncate px-1 py-1.5 text-left text-pequeno text-tinta transition-colors duration-[140ms] ease-caderno hover:bg-lavagem"
                  >
                    {nomeDoVault(r.caminho)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
