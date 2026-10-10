// Selo "Beta" dos serviços online (conta, IA do Excalisidian, sincronização) enquanto
// `SERVICOS_ONLINE_LIBERADOS` é `false`. Reaproveita o estilo do selo "Sugerido" da lista de
// modelos do agente (`meta` em `cristal`), sem valor visual novo.

import { useTexto } from "../../i18n/useTexto";

export default function SeloBeta() {
  const t = useTexto();
  return <span className="meta shrink-0 text-cristal">{t("beta.selo")}</span>;
}
