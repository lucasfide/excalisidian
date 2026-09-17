// Tela de início (doc 06): a aba fixa que recebe o usuário quando não há nota nem desenho
// aberto. A pintura fica restrita a esta tela; criação e navegação preservam os callbacks
// fornecidos pelo painel de integração.

import { FilePlus, FolderPlus, SquarePen } from "lucide-react";

import { Botao, IconeArquivo } from "../index";
import { nomeExibicao, type NoArvore } from "../../vault/arvore";
import AsciiPeaks from "./AsciiPeaks";

import "./tela-inicio.css";

interface Props {
  saudacao: string;
  nome: string;
  pastas: NoArvore[];
  /** Pasta atualmente navegada dentro da Home, ou null se nenhuma foi clicada ainda. */
  pastaAberta: NoArvore | null;
  papelParedeUrl: string;
  papelParedePersonalizado: boolean;
  papelParedeCarregando: boolean;
  /** Fundo "picos em ASCII" (doc 09 ADR-28) — botão "Desabilitar shaders" no rodapé. */
  asciiPeaksHabilitado: boolean;
  onAbrirPasta(path: string): void;
  onFecharPasta(): void;
  onAbrirArquivo(path: string): void;
  onCriarNota(): void;
  onCriarDesenho(): void;
  onCriarPasta(): void;
  onEscolherPapelParede(): void;
  onRestaurarPapelParede(): void;
  onAlternarAsciiPeaks(): void;
}

interface Migalha {
  nome: string;
  path: string;
}

/** Trilha de migalhas a partir do path: ["Projetos", "Projetos/Sub"] -> segmentos clicáveis. */
function migalhas(path: string): Migalha[] {
  if (!path) return [{ nome: "Raiz do vault", path: "" }];
  const partes = path.split("/");
  return [
    { nome: "Raiz do vault", path: "" },
    ...partes.map((nome, indice) => ({
      nome,
      path: partes.slice(0, indice + 1).join("/"),
    })),
  ];
}

export default function TelaInicio({
  saudacao,
  nome,
  pastas,
  pastaAberta,
  papelParedeUrl,
  papelParedePersonalizado,
  papelParedeCarregando,
  asciiPeaksHabilitado,
  onAbrirPasta,
  onFecharPasta,
  onAbrirArquivo,
  onCriarNota,
  onCriarDesenho,
  onCriarPasta,
  onEscolherPapelParede,
  onRestaurarPapelParede,
  onAlternarAsciiPeaks,
}: Props) {
  return (
    <div className="tela-inicio">
      {papelParedeUrl && (
        <img
          className="tela-inicio__imagem"
          src={papelParedeUrl}
          alt=""
          aria-hidden="true"
        />
      )}
      <div className="tela-inicio__vinheta" aria-hidden="true" />
      {asciiPeaksHabilitado && <AsciiPeaks />}

      <div className="tela-inicio__rolagem">
        <div className="tela-inicio__conteudo">
          <header className="tela-inicio__cabecalho">
            <h1 className="tela-inicio__wordmark">
              {saudacao}
              {nome && <>, {nome}</>}
            </h1>
          </header>

          <section
            className="tela-inicio__painel tela-inicio__painel-acoes"
            aria-label="Criar"
          >
            <div className="tela-inicio__acoes">
              <Botao
                variante="primario"
                Icone={FilePlus}
                onClick={onCriarNota}
                className="tela-inicio__acao tela-inicio__acao-principal"
              >
                Nova nota
              </Botao>
              <Botao
                Icone={SquarePen}
                onClick={onCriarDesenho}
                className="tela-inicio__acao"
              >
                Novo desenho
              </Botao>
              <Botao
                Icone={FolderPlus}
                onClick={onCriarPasta}
                className="tela-inicio__acao"
              >
                Nova pasta
              </Botao>
            </div>
          </section>

          {(pastas.length > 0 || pastaAberta) && (
            <section
              className="tela-inicio__painel tela-inicio__painel-arquivos"
              aria-label="Pastas e arquivos"
            >
              {pastas.length > 0 && (
                <div className="tela-inicio__pastas">
                  <h2 className="tela-inicio__rotulo">
                    Pastas
                  </h2>
                  <div className="tela-inicio__atalhos-pastas">
                    {pastas.map((pasta) => (
                      <button
                        key={pasta.path}
                        type="button"
                        onClick={() => onAbrirPasta(pasta.path)}
                        aria-pressed={
                          pastaAberta?.path === pasta.path ||
                          pastaAberta?.path.startsWith(`${pasta.path}/`)
                        }
                        className="tela-inicio__atalho-pasta"
                      >
                        <IconeArquivo tipo="folder" className="shrink-0" />
                        <span>{pasta.nome}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {pastaAberta && (
                <div className="tela-inicio__explorador">
                  <div className="tela-inicio__barra-explorador">
                    <nav className="tela-inicio__migalhas" aria-label="Caminho da pasta">
                      {migalhas(pastaAberta.path).map((migalha, indice) => (
                        <span key={migalha.path} className="tela-inicio__migalha">
                          {indice > 0 && <span aria-hidden="true">/</span>}
                          <button
                            type="button"
                            onClick={() => onAbrirPasta(migalha.path)}
                          >
                            {migalha.nome}
                          </button>
                        </span>
                      ))}
                    </nav>
                    <button
                      type="button"
                      onClick={onFecharPasta}
                      className="tela-inicio__fechar"
                    >
                      Fechar
                    </button>
                  </div>

                  {pastaAberta.filhos.length === 0 ? (
                    <p className="tela-inicio__pasta-vazia">Pasta vazia.</p>
                  ) : (
                    <ul className="tela-inicio__lista-arquivos">
                      {pastaAberta.filhos.map((filho) => (
                        <li key={filho.path}>
                          <button
                            type="button"
                            onClick={() =>
                              filho.tipo === "folder"
                                ? onAbrirPasta(filho.path)
                                : onAbrirArquivo(filho.path)
                            }
                          >
                            <IconeArquivo tipo={filho.tipo} className="shrink-0" />
                            <span title={filho.nome}>{nomeExibicao(filho)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      <div className="tela-inicio__rodape-fundo">
        <button
          type="button"
          className="tela-inicio__acao-fundo"
          onClick={onEscolherPapelParede}
          disabled={papelParedeCarregando}
          aria-busy={papelParedeCarregando || undefined}
        >
          {papelParedeCarregando ? "Carregando…" : "Trocar papel de parede"}
        </button>

        {papelParedePersonalizado && (
          <button
            type="button"
            className="tela-inicio__acao-fundo"
            onClick={onRestaurarPapelParede}
            disabled={papelParedeCarregando}
          >
            Restaurar padrão
          </button>
        )}

        {/* Bullet separando o grupo do papel de parede do toggle do shader (pedido do
            usuário, 16/09/2026) — são preferências independentes, o separador deixa isso
            visualmente claro sem precisar de mais texto. */}
        <span className="tela-inicio__rodape-separador" aria-hidden="true">
          •
        </span>
        <button
          type="button"
          className="tela-inicio__acao-fundo"
          onClick={onAlternarAsciiPeaks}
        >
          {asciiPeaksHabilitado ? "Desabilitar shaders" : "Habilitar shaders"}
        </button>
      </div>
    </div>
  );
}
