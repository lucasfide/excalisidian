// Lógica pura de navegação das abas de `DialogoPreferencias`. Separado do componente para
// poder testar sem testing-library/jsdom (o projeto não tem nenhum dos dois) — só dados e
// funções puras, sem DOM.

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
