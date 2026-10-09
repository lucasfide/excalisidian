import { equivalenteMensalDoAnual, economiaAnualValor, formatarCreditos } from "../lib/precos-planos";
import type { LinhaComparacao, Moeda, Plano } from "../types/planos";

// Fonte única dos planos. A página /planos/ e a seção de planos da home leem daqui.
// urlAssinatura: o intermediário de pagamento é a Stripe. Os links entram quando os produtos forem criados
// lá; até lá todos são null. Então o ÚNICO lugar a editar é este (um link por plano e período).
export const planos: Plano[] = [
  {
    id: "gratis",
    nome: "Grátis",
    paraQuem: "Para todo mundo.",
    recomendado: false,
    creditosPorMes: null,
    beneficios: [
      { texto: "App completo: notas, diagramas, tarefas, busca, vários vaults e temas" },
      { texto: "Sem conta e sem internet" },
      { texto: "Agente de IA com a sua própria chave" },
      { texto: "Dados só no seu computador" },
    ],
    precos: { BRL: { mensal: 0, anual: 0 }, USD: { mensal: 0, anual: 0 } },
    urlAssinatura: { mensal: null, anual: null },
  },
  {
    id: "marco-aurelio",
    nome: "Marco Aurélio",
    paraQuem: "Para quem escreve todo dia em mais de um computador.",
    recomendado: true,
    creditosPorMes: 3000,
    beneficios: [
      { texto: "Tudo do Grátis" },
      {
        texto: "Sincronização entre computadores, cifrada ponta a ponta",
        detalhe: "5 GB por conta. O servidor não lê o conteúdo.",
      },
      { texto: "IA do Excalisidian, sem chave própria" },
      {
        texto: "3.000 créditos de IA por mês",
        detalhe: "No pior caso de preço, cerca de 120 horas de escrita intensa; no uso normal, mais.",
      },
    ],
    precos: { BRL: { mensal: 35, anual: 249 }, USD: { mensal: 8, anual: 59 } },
    urlAssinatura: { mensal: null, anual: null },
  },
  {
    id: "seneca",
    nome: "Sêneca",
    paraQuem: "Para quem usa a IA o dia todo.",
    recomendado: false,
    creditosPorMes: 10000,
    beneficios: [
      { texto: "Tudo do Marco Aurélio" },
      {
        texto: "10.000 créditos de IA por mês",
        detalhe: "Mais de três vezes os créditos do Marco Aurélio.",
      },
      { texto: "Os mesmos 5 GB de sincronização" },
    ],
    precos: { BRL: { mensal: 99, anual: 779 }, USD: { mensal: 18, anual: 149 } },
    urlAssinatura: { mensal: null, anual: null },
  },
];

const planosPagos = planos.filter(plano => plano.precos.BRL.mensal > 0);

/** Menor preço mensal equivalente (do anual) entre os planos pagos: o "a partir de" da home. */
export function menorPrecoMensalEquivalente(moeda: Moeda): number {
  return Math.min(...planosPagos.map(plano => equivalenteMensalDoAnual(plano.precos[moeda].anual)));
}

/** Maior economia anual, em valor, entre os planos pagos ("economize até ..."). */
export function maiorEconomiaAnual(moeda: Moeda): number {
  return Math.max(...planosPagos.map(plano => economiaAnualValor(plano.precos[moeda].mensal, plano.precos[moeda].anual)));
}

function creditos(id: "marco-aurelio" | "seneca"): string {
  const total = planos.find(plano => plano.id === id)?.creditosPorMes ?? 0;
  return formatarCreditos(total);
}

export const linhasComparacao: LinhaComparacao[] = [
  { id: "app", rotulo: "App completo: notas, diagramas, tarefas, busca, vários vaults e temas", valores: { gratis: "Sim", "marco-aurelio": "Sim", seneca: "Sim" } },
  { id: "sem-conta", rotulo: "Funciona sem conta e sem internet", valores: { gratis: "Sim", "marco-aurelio": "Sim", seneca: "Sim" } },
  { id: "chave", rotulo: "Agente de IA com a sua própria chave", valores: { gratis: "Sim", "marco-aurelio": "Sim", seneca: "Sim" } },
  { id: "sincronizacao", rotulo: "Sincronização entre computadores, cifrada ponta a ponta", valores: { gratis: "Não", "marco-aurelio": "Sim", seneca: "Sim" } },
  { id: "armazenamento", rotulo: "Armazenamento da sincronização", valores: { gratis: "Nenhum", "marco-aurelio": "5 GB", seneca: "5 GB" } },
  { id: "ia", rotulo: "IA do Excalisidian, sem chave própria", valores: { gratis: "Não", "marco-aurelio": "Sim", seneca: "Sim" } },
  { id: "creditos", rotulo: "Créditos de IA por mês", valores: { gratis: "Nenhum", "marco-aurelio": creditos("marco-aurelio"), seneca: creditos("seneca") } },
  { id: "arquivos", rotulo: "Seus arquivos ficam no seu computador", valores: { gratis: "Sim", "marco-aurelio": "Sim", seneca: "Sim" } },
];
