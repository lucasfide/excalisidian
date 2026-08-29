// Tela de início (doc 06): a aba fixa que recebe o usuário quando não há nota nem desenho
// aberto. Saudação grande (mesma escala `display-1` do logotipo/títulos), atalhos para as
// pastas de primeiro nível do vault, e as três ações de criar — reaproveitando o mesmo
// convite de "Comece algo novo" do EstadoVazio (doc 06: "nunca é só texto centralizado").

import { FilePlus, FolderPlus, SquarePen } from "lucide-react";

import { Botao, EstadoVazio, IconeArquivo } from "../index";
import type { NoArvore } from "../../vault/arvore";

interface Props {
  saudacao: string;
  nome: string;
  pastas: NoArvore[];
  onAbrirPasta(path: string): void;
  onCriarNota(): void;
  onCriarDesenho(): void;
  onCriarPasta(): void;
}

export default function TelaInicio({
  saudacao,
  nome,
  pastas,
  onAbrirPasta,
  onCriarNota,
  onCriarDesenho,
  onCriarPasta,
}: Props) {
  return (
    <div className="flex h-full justify-center overflow-y-auto bg-papel px-8 py-16">
      <div className="flex w-full max-w-2xl flex-col gap-10">
        <h1 className="font-display text-[44px] font-semibold leading-[1.05] tracking-[-0.02em] text-tinta">
          {saudacao}
          {nome && <>, {nome}</>}
        </h1>

        {pastas.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="meta text-tinta-suave">Pastas</span>
            <div className="flex flex-wrap gap-2">
              {pastas.map((p) => (
                <button
                  key={p.path}
                  type="button"
                  onClick={() => onAbrirPasta(p.path)}
                  className="inline-flex max-w-[240px] items-center gap-2 rounded-ficha border border-regua bg-superficie px-3 py-2 text-[13px] text-tinta-media transition-colors duration-[140ms] ease-caderno hover:border-regua-forte hover:bg-lavagem hover:text-tinta"
                >
                  <IconeArquivo tipo="folder" className="shrink-0" />
                  <span className="truncate">{p.nome}</span>
                </button>
              ))}
            </div>
          </div>
        )}

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
      </div>
    </div>
  );
}
