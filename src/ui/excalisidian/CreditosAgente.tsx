import { formatarCreditos, formatarRenovacao, restantes } from "../../servico/creditos";
import { useTexto } from "../../i18n/useTexto";
import { usePrefsStore } from "../../estado/prefsStore";
import type { EstadoSaldoCreditosConta } from "../../servico/estadoCreditosConta";

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
    <section className="flex flex-col gap-1.5 rounded-controle border border-regua bg-superficie px-3 py-2 text-tinta">
      {exibirEmail && email && <p className="break-all text-[13px] font-medium">{email}</p>}
      {disponivel ? (
        <p className="text-pequeno text-tinta">
          {t("agente.creditos.total", {
            restantes: formatarCreditos(restantes(saldo), idioma),
            total: formatarCreditos(saldo.total, idioma),
            data: formatarRenovacao(saldo.renovaEm, idioma),
          })}
        </p>
      ) : consultando ? (
        <p className="text-pequeno text-tinta-media" aria-live="polite">
          {t("agente.creditos.consultando")}
        </p>
      ) : null}
    </section>
  );
}
