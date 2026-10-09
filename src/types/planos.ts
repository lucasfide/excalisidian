export type Moeda = "BRL" | "USD";
export type Periodo = "mensal" | "anual";
export type IdPlano = "gratis" | "marco-aurelio" | "seneca";

/** Valores inteiros na unidade da moeda (sem centavos): 35 = R$ 35. */
export interface PrecoPlano {
  mensal: number;
  anual: number;
}

export interface BeneficioPlano {
  texto: string;
  detalhe?: string;
}

export interface Plano {
  id: IdPlano;
  nome: string;
  paraQuem: string;
  recomendado: boolean;
  /** null quando o plano não inclui a IA do Excalisidian. */
  creditosPorMes: number | null;
  beneficios: BeneficioPlano[];
  precos: Record<Moeda, PrecoPlano>;
  /** Link de assinatura na Stripe. null até os produtos serem criados lá. */
  urlAssinatura: Record<Periodo, string | null>;
}

export interface LinhaComparacao {
  id: string;
  rotulo: string;
  valores: Record<IdPlano, string>;
}
