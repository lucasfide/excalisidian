// Tela de início (doc 06): a aba fixa que recebe o usuário quando não há nota nem desenho
// aberto. Ordem pedida pelo usuário (wireframe 29/08/2026): saudação, botões de criar,
// atalhos de pasta, e — ao clicar num atalho — os arquivos e subpastas dela, navegável
// (clicar numa subpasta desce um nível; clicar num arquivo abre em aba).

import { FilePlus, FolderPlus, SquarePen } from "lucide-react";

import { Botao, EstadoVazio, IconeArquivo } from "../index";
import { nomeExibicao, type NoArvore } from "../../vault/arvore";

interface Props {
  saudacao: string;
  nome: string;
  pastas: NoArvore[];
  /** Pasta atualmente navegada dentro da Home, ou null se nenhuma foi clicada ainda. */
  pastaAberta: NoArvore | null;
  onAbrirPasta(path: string): void;
  onFecharPasta(): void;
  onAbrirArquivo(path: string): void;
  onCriarNota(): void;
  onCriarDesenho(): void;
  onCriarPasta(): void;
}

/** Trilha de migalhas a partir do path: ["Projetos", "Projetos/Sub"] -> segmentos clicáveis. */
function migalhas(path: string): { nome: string; path: string }[] {
  const partes = path.split("/");
  return partes.map((nome, i) => ({
    nome,
    path: partes.slice(0, i + 1).join("/"),
  }));
}

export default function TelaInicio({
  saudacao,
  nome,
  pastas,
  pastaAberta,
  onAbrirPasta,
  onFecharPasta,
  onAbrirArquivo,
  onCriarNota,
  onCriarDesenho,
  onCriarPasta,
}: Props) {
  return (
    <div className="flex h-full justify-center overflow-y-auto bg-papel px-8 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <h1 className="font-display text-[44px] font-semibold leading-[1.05] tracking-[-0.02em] text-tinta">
          {saudacao}
          {nome && <>, {nome}</>}
        </h1>

        <EstadoVazio
          titulo="Comece algo novo"
          apoio="Crie uma nota, um desenho, ou organize com uma pasta nova."
        >
          <Botao variante="primario" Icone={FilePlus} onClick={onCriarNota}>
            Nova nota
          </Botao>
          <Botao Icone={SquarePen} onClick={onCriarDesenho}>
            Novo desenho
          </Botao>
          <Botao Icone={FolderPlus} onClick={onCriarPasta}>
            Nova pasta
          </Botao>
        </EstadoVazio>

        {pastas.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="meta text-tinta-suave">Pastas</span>
            <div className="flex flex-wrap gap-2">
              {pastas.map((p) => (
                <button
                  key={p.path}
                  type="button"
                  onClick={() => onAbrirPasta(p.path)}
                  aria-pressed={
                    pastaAberta?.path === p.path ||
                    pastaAberta?.path.startsWith(`${p.path}/`)
                  }
                  className="inline-flex max-w-[240px] items-center gap-2 rounded-ficha border border-regua bg-superficie px-3 py-2 text-[13px] text-tinta-media transition-colors duration-[140ms] ease-caderno hover:border-regua-forte hover:bg-lavagem hover:text-tinta aria-pressed:border-regua-forte aria-pressed:bg-lavagem aria-pressed:text-tinta"
                >
                  <IconeArquivo tipo="folder" className="shrink-0" />
                  <span className="truncate">{p.nome}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {pastaAberta && (
          <div className="rounded-ficha border border-regua bg-superficie">
            <div className="flex items-center justify-between gap-2 border-b border-regua px-3 py-2">
              <div className="meta flex min-w-0 flex-wrap items-center gap-1 text-tinta-suave">
                {migalhas(pastaAberta.path).map((m, i) => (
                  <span key={m.path} className="flex items-center gap-1">
                    {i > 0 && <span aria-hidden>/</span>}
                    <button
                      type="button"
                      onClick={() => onAbrirPasta(m.path)}
                      className="truncate transition-colors duration-[140ms] ease-caderno hover:text-tinta"
                    >
                      {m.nome}
                    </button>
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={onFecharPasta}
                className="meta shrink-0 text-tinta-suave transition-colors duration-[140ms] ease-caderno hover:text-tinta"
              >
                Fechar
              </button>
            </div>

            {pastaAberta.filhos.length === 0 ? (
              <p className="px-3 py-6 text-center text-pequeno text-tinta-suave">
                Pasta vazia.
              </p>
            ) : (
              <ul>
                {pastaAberta.filhos.map((filho) => (
                  <li key={filho.path} className="border-b border-regua last:border-b-0">
                    <button
                      type="button"
                      onClick={() =>
                        filho.tipo === "folder"
                          ? onAbrirPasta(filho.path)
                          : onAbrirArquivo(filho.path)
                      }
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-tinta-media transition-colors duration-[140ms] ease-caderno hover:bg-lavagem hover:text-tinta"
                    >
                      <IconeArquivo tipo={filho.tipo} className="shrink-0" />
                      <span className="truncate" title={filho.nome}>
                        {nomeExibicao(filho)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
