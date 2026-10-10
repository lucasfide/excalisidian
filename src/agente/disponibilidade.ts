// Quais provedores do agente podem ser usados agora. Enquanto os serviços online estão em beta
// (`SERVICOS_ONLINE_LIBERADOS` em servico/base.ts), o provedor que exige conta fica indisponível.
// O valor da chave entra por parâmetro para as duas situações poderem ser testadas.

import type { ConfigAgente } from "./tipos";
import { provedorDe } from "./provedores";
import { SERVICOS_ONLINE_LIBERADOS } from "../servico/base";

export function provedorDisponivel(
  provedor: { exigeConta: boolean },
  liberados: boolean = SERVICOS_ONLINE_LIBERADOS,
): boolean {
  return liberados || !provedor.exigeConta;
}

/** Configuração salva que aponta para um provedor indisponível conta como agente ainda não
 * configurado: devolve `null` e o usuário escolhe outro provedor. */
export function configUsavel(
  config: ConfigAgente | null,
  liberados: boolean = SERVICOS_ONLINE_LIBERADOS,
): ConfigAgente | null {
  if (!config) return null;
  return provedorDisponivel(provedorDe(config.provedor), liberados) ? config : null;
}
