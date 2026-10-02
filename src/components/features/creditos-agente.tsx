import { formatarCreditos, formatarRenovacao, restantes } from "../../servico/creditos";
import { useTexto } from "../../i18n/useTexto";
import { usePrefsStore } from "../../estado/prefsStore";
import type { EstadoSaldoCreditosConta } from "../../types/creditos-conta";
import "./creditos-agente.css";

export interface CreditosAgenteProps {
  estado: EstadoSaldoCreditosConta["estado"];
  saldo: EstadoSaldoCreditosConta["saldo"];
  email?: string;
  exibirEmail?: boolean;
}

/** Apresenta saldo confiável na configuração e nas preferências do agente. */
export function CreditosAgente({
  estado,
  saldo,
  email,
  exibirEmail = false,
}: CreditosAgenteProps) {
  const t = useTexto();
  const idioma = usePrefsStore((s) => s.idioma);
  const disponivel = estado === "disponivel" && saldo !== null;
  const consultando = estado === "consultando";

  if (!disponivel && !consultando && !(exibirEmail && email)) return null;

  return (
    <section className="creditos-agente border-border bg-card flex flex-col gap-1.5 rounded-controle border px-3 py-2 text-card-foreground">
      {exibirEmail && email && <p className="break-all text-[13px] font-medium">{email}</p>}
      {disponivel ? (
        <p className="text-pequeno text-foreground">
          {t("agente.creditos.total", {
            restantes: formatarCreditos(restantes(saldo), idioma),
            total: formatarCreditos(saldo.total, idioma),
            data: formatarRenovacao(saldo.renovaEm, idioma),
          })}
        </p>
      ) : consultando ? (
        <p className="text-pequeno text-muted-foreground" aria-live="polite">
          {t("agente.creditos.consultando")}
        </p>
      ) : null}
    </section>
  );
}
