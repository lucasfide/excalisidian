// Lógica pura de navegação e busca das abas de `DialogoPreferencias`. Separado do componente
// para poder testar sem testing-library/jsdom (o projeto não tem nenhum dos dois) — só dados e
// funções puras, sem DOM.

import type { TradutorDoApp } from "../../i18n/catalogo";

export type AbaPreferencias = "geral" | "aparencia" | "conta" | "agente";

/** Ordem de exibição na navegação à esquerda — a mesma ordem que Home/End e as setas seguem. */
export const ABAS_PREFERENCIAS: readonly AbaPreferencias[] = [
  "geral",
  "aparencia",
  "conta",
  "agente",
] as const;

const ABA_PADRAO: AbaPreferencias = "geral";

/** Aba com que o diálogo abre. `secaoInicial === "conta"` (o assistente do agente manda o
 * usuário direto pra lá) vence a última aba usada nesta sessão do app; sem isso, reabre onde a
 * última visita parou, e a primeira vez de todas cai em "geral" (o padrão de `ultima`). */
export function abaInicial(
  secaoInicial: "conta" | undefined,
  ultima: AbaPreferencias = ABA_PADRAO,
): AbaPreferencias {
  return secaoInicial === "conta" ? "conta" : ultima;
}

/** Aba destino de uma tecla de navegação do `tablist`, ou `null` se a tecla não navega.
 * Cima/esquerda e baixo/direita andam uma posição com volta ao início/fim da lista; Home/End
 * vão direto para a primeira/última. */
export function abaPorTecla(atual: AbaPreferencias, tecla: string): AbaPreferencias | null {
  const i = ABAS_PREFERENCIAS.indexOf(atual);
  const n = ABAS_PREFERENCIAS.length;
  switch (tecla) {
    case "ArrowDown":
    case "ArrowRight":
      return ABAS_PREFERENCIAS[(i + 1) % n];
    case "ArrowUp":
    case "ArrowLeft":
      return ABAS_PREFERENCIAS[(i - 1 + n) % n];
    case "Home":
      return ABAS_PREFERENCIAS[0];
    case "End":
      return ABAS_PREFERENCIAS[n - 1];
    default:
      return null;
  }
}

// --- Busca nas Configurações -------------------------------------------------------------
//
// Cada linha de configuração (ou seção inteira, no caso de Conta) tem um id estável. A busca
// casa a consulta contra título + descrição + termos extras dessas linhas — não contra valores
// dinâmicos (nome do provedor, nomes de modelo): a lista de entradas é só texto de catálogo,
// resolvido por um `TradutorDoApp`, então é pura e testável sem montar o componente.

/** Id estável de cada linha (ou seção) que a busca das Configurações indexa. `agente.*` varia
 * conforme o agente está configurado/ligado — ver `entradasBusca`. */
export type IdLinhaBusca =
  | "geral.nome"
  | "geral.idioma"
  | "geral.atalhos"
  | "geral.atualizacoes"
  | "aparencia.tema"
  | "aparencia.largura"
  | "conta"
  | "agente.configurar"
  | "agente.agente"
  | "agente.modelos"
  | "agente.conexao"
  | "agente.pasta"
  | "agente.memoria";

// `id` é `string`, não `IdLinhaBusca`, de propósito: `agruparResultadosBusca` é genérico sobre
// qualquer registro de entradas (os testes usam um `FIXTURE` próprio, sem os ids reais) —
// `entradasBusca`, abaixo, é quem garante que o registro de verdade só usa `IdLinhaBusca`.
export interface EntradaBusca {
  readonly id: string;
  readonly aba: AbaPreferencias;
  /** Título, descrição e termos extras já resolvidos no idioma corrente — o que a consulta
   * compara contra. */
  readonly textos: readonly string[];
}

export interface GrupoBusca {
  readonly aba: AbaPreferencias;
  readonly ids: readonly string[];
}

const MARCAS_DIACRITICAS = /[̀-ͯ]/g;

/** NFD + remove diacríticos + minúsculas + apara espaço — a mesma normalização dos dois lados
 * (consulta e texto indexado), pra "agencia" achar "Agência". */
export function normalizarBusca(s: string): string {
  return s.normalize("NFD").replace(MARCAS_DIACRITICAS, "").toLowerCase().trim();
}

/** Cada palavra da consulta precisa aparecer (substring) em algum dos `textos` — não precisa
 * ser o mesmo texto para todas as palavras. Consulta vazia ou só com espaço casa tudo: é o
 * estado "ainda não filtrando", não "não achou nada". */
export function correspondeBusca(consulta: string, textos: readonly string[]): boolean {
  const palavras = normalizarBusca(consulta).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return true;
  const alvo = textos.map(normalizarBusca);
  return palavras.every((palavra) => alvo.some((texto) => texto.includes(palavra)));
}

/** Agrupa as entradas casadas por aba, na ordem de `ABAS_PREFERENCIAS`; uma aba sem nenhuma
 * entrada casada não aparece no resultado (nada de grupo vazio). */
export function agruparResultadosBusca(
  consulta: string,
  entradas: readonly EntradaBusca[],
): GrupoBusca[] {
  const grupos: GrupoBusca[] = [];
  for (const aba of ABAS_PREFERENCIAS) {
    const ids = entradas
      .filter((entrada) => entrada.aba === aba && correspondeBusca(consulta, entrada.textos))
      .map((entrada) => entrada.id);
    if (ids.length > 0) grupos.push({ aba, ids });
  }
  return grupos;
}

/** O registro de entradas indexáveis — uma por linha de configuração, exceto Conta (a seção
 * inteira é uma entrada só) e Agente sem configuração (o bloco "Configurar agente" é uma
 * entrada só). `opts` reflete o estado real do agente: uma entrada que não vai aparecer na tela
 * (ex.: "agente.conexao" com o agente desligado) não pode entrar no registro, senão um grupo
 * apareceria com um id que não renderiza nada. */
export function entradasBusca(
  t: TradutorDoApp,
  opts: { agenteConfigurado: boolean; agenteHabilitado: boolean },
): EntradaBusca[] {
  const entradas: EntradaBusca[] = [
    {
      id: "geral.nome",
      aba: "geral",
      textos: [
        t("prefs.geral.nome.titulo"),
        t("prefs.geral.nome.descricao"),
        t("prefs.busca.termos.nome"),
      ],
    },
    {
      id: "geral.idioma",
      aba: "geral",
      textos: [t("prefs.idioma.rotulo"), t("prefs.idioma.descricao"), t("prefs.busca.termos.idioma")],
    },
    {
      id: "geral.atalhos",
      aba: "geral",
      textos: [
        t("prefs.geral.atalhos.titulo"),
        t("prefs.geral.atalhos.descricao"),
        t("prefs.busca.termos.glossario"),
      ],
    },
    {
      id: "geral.atualizacoes",
      aba: "geral",
      textos: [t("prefs.geral.atualizacoes.titulo"), t("prefs.busca.termos.atualizacoes")],
    },
    {
      id: "aparencia.tema",
      aba: "aparencia",
      textos: [
        t("prefs.aparencia.tema.titulo"),
        t("prefs.aparencia.tema.descricao"),
        t("prefs.busca.termos.tema"),
      ],
    },
    {
      id: "aparencia.largura",
      aba: "aparencia",
      textos: [
        t("prefs.aparencia.largura.titulo"),
        t("prefs.aparencia.largura.descricao"),
        t("prefs.busca.termos.largura"),
      ],
    },
    {
      id: "conta",
      aba: "conta",
      textos: [t("conta.titulo"), t("conta.descricaoDeslogado"), t("prefs.busca.termos.conta")],
    },
  ];

  if (!opts.agenteConfigurado) {
    entradas.push({
      id: "agente.configurar",
      aba: "agente",
      textos: [t("prefs.agente.configurar"), t("prefs.agente.aviso"), t("prefs.busca.termos.agente")],
    });
    return entradas;
  }

  entradas.push({
    id: "agente.agente",
    aba: "agente",
    textos: [t("prefs.agente.linha.agente.titulo"), t("prefs.busca.termos.agente")],
  });
  entradas.push({
    id: "agente.modelos",
    aba: "agente",
    textos: [t("prefs.agente.linha.modelos.titulo"), t("prefs.busca.termos.agente")],
  });
  if (opts.agenteHabilitado) {
    entradas.push({
      id: "agente.conexao",
      aba: "agente",
      textos: [
        t("prefs.agente.linha.conexao.titulo"),
        t("prefs.agente.linha.conexao.descricao"),
        t("prefs.busca.termos.agente"),
      ],
    });
  }
  entradas.push({
    id: "agente.pasta",
    aba: "agente",
    textos: [
      t("prefs.agente.linha.pasta.titulo"),
      t("prefs.agente.linha.pasta.descricao"),
      t("prefs.busca.termos.agente"),
    ],
  });
  entradas.push({
    id: "agente.memoria",
    aba: "agente",
    textos: [
      t("prefs.agente.linha.memoria.titulo"),
      t("prefs.agente.linha.memoria.descricao"),
      t("prefs.busca.termos.agente"),
    ],
  });
  return entradas;
}
