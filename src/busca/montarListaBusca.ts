// Lista navegável da busca unificada (doc 13 §1.3/§1.4): junta "Modificados recentemente"
// (campo vazio) ou "Títulos" + "No conteúdo" + "Criar nota «consulta»" (digitando) numa
// lista só, com cabeçalhos não selecionáveis intercalados. Função pura — sem estado, sem
// debounce, sem I/O — para o componente (PainelBusca.tsx) só ler o resultado e cuidar de
// teclado/scroll/foco, e para o teste cobrir ordem das seções e dedupe sem montar DOM.
//
// `linhas` é o que a UI desenha, em ordem; `itens` é a lista navegável de verdade (só o que
// Enter/↑/↓ tocam). Uma `linha` do tipo "item" aponta pro índice em `itens` — assim ↑/↓
// pulam cabeçalhos sem o componente precisar filtrar `linhas` de novo.

import type { ResultadoTitulo } from "./buscaTitulos";
import type { ResultadoConteudo, TrechoBusca } from "./minisearchIndex";

export type ItemNavegavel =
  | { tipo: "recente"; item: ResultadoTitulo }
  | { tipo: "titulo"; item: ResultadoTitulo }
  | { tipo: "trecho"; resultado: ResultadoConteudo; trecho: TrechoBusca }
  | { tipo: "criar"; consulta: string };

export type LinhaBusca =
  | { tipo: "secao"; texto: string }
  | { tipo: "carregando"; texto: string }
  /** Cabeçalho de arquivo na seção "No conteúdo" (ícone, título, caminho) — nunca
   * selecionável, os trechos abaixo dele é que são. */
  | { tipo: "arquivo"; resultado: ResultadoConteudo }
  | { tipo: "item"; indice: number };

export interface ParametrosListaBusca {
  /** Consulta já com espaços nas pontas cortados; "" conta como vazia. */
  consulta: string;
  /** Seção "Modificados recentemente" — só usada quando `consulta` é vazia. */
  recentes: ResultadoTitulo[];
  /** Seção "Títulos" — já filtrada/ordenada por `buscarTitulos`. */
  titulos: ResultadoTitulo[];
  /** Seção "No conteúdo" — resultado bruto de `buscarConteudo`; esta função descarta os
   * arquivos sem trecho no corpo (doc 13 §1.3: "arquivo que só casa pelo título não repete
   * aqui" — é exatamente o arquivo com `trechos.length === 0`, que só bateu no campo
   * `titulo` do índice MiniSearch). */
  conteudo: ResultadoConteudo[];
  /** Busca de conteúdo em andamento (debounce ainda não resolveu) — mostra "Buscando no
   * conteúdo…" no lugar dos trechos, sem esconder os títulos já prontos. */
  buscandoConteudo: boolean;
  /** Já existe título/nome/alias igual à consulta — some com o item "Criar nota". */
  temTituloExato: boolean;
}

export interface ListaBusca {
  linhas: LinhaBusca[];
  itens: ItemNavegavel[];
}

export function montarListaBusca(p: ParametrosListaBusca): ListaBusca {
  const linhas: LinhaBusca[] = [];
  const itens: ItemNavegavel[] = [];

  function adicionar(item: ItemNavegavel): void {
    itens.push(item);
    linhas.push({ tipo: "item", indice: itens.length - 1 });
  }

  const consulta = p.consulta.trim();

  if (!consulta) {
    // Campo vazio (doc 13 §1.2): só "Modificados recentemente", sem cabeçalho de seção
    // quando não há nada — vault recém-criado, por exemplo.
    if (p.recentes.length > 0) {
      linhas.push({ tipo: "secao", texto: "Modificados recentemente" });
      for (const r of p.recentes) adicionar({ tipo: "recente", item: r });
    }
    return { linhas, itens };
  }

  if (p.titulos.length > 0) {
    linhas.push({ tipo: "secao", texto: "Títulos" });
    for (const t of p.titulos) adicionar({ tipo: "titulo", item: t });
  }

  const arquivosComTrecho = p.conteudo.filter((r) => r.trechos.length > 0);
  if (p.buscandoConteudo || arquivosComTrecho.length > 0) {
    linhas.push({ tipo: "secao", texto: "No conteúdo" });
    if (p.buscandoConteudo) {
      linhas.push({ tipo: "carregando", texto: "Buscando no conteúdo…" });
    } else {
      for (const resultado of arquivosComTrecho) {
        linhas.push({ tipo: "arquivo", resultado });
        for (const trecho of resultado.trechos) {
          adicionar({ tipo: "trecho", resultado, trecho });
        }
      }
    }
  }

  if (!p.temTituloExato) {
    adicionar({ tipo: "criar", consulta });
  }

  return { linhas, itens };
}
