import type { ReactNode } from "react";
import { PanelRightClose } from "lucide-react";
import BotaoIcone from "../BotaoIcone";
import { useTexto } from "../../i18n/useTexto";

interface CabecalhoPainelLateralProps {
  ativo: "agente" | "tarefas";
  aoMostrarAgente(): void;
  aoMostrarTarefas(): void;
  aoFechar(): void;
  acoes?: ReactNode;
}

const CLASSE_ABA =
  "meta h-full flex-1 border-b-2 focus-visible:-outline-offset-2";
const CLASSE_ABA_ATIVA = `${CLASSE_ABA} border-cristal text-tinta`;
const CLASSE_ABA_INATIVA = `${CLASSE_ABA} border-transparent text-tinta-suave hover:text-tinta`;

export default function CabecalhoPainelLateral({
  ativo, aoMostrarAgente, aoMostrarTarefas, aoFechar, acoes,
}: CabecalhoPainelLateralProps) {
  const t = useTexto();
  return (
    <header
      className="flex shrink-0 items-center border-b border-regua bg-superficie px-1"
      style={{ height: 34 /* --dv-tabs-and-actions-container-height */ }}
    >
      <nav className="flex h-full min-w-0 flex-1" aria-label={t("painelLateral.rotulo")}>
        <button
          type="button"
          aria-current={ativo === "agente" ? "page" : undefined}
          className={ativo === "agente" ? CLASSE_ABA_ATIVA : CLASSE_ABA_INATIVA}
          onClick={aoMostrarAgente}
        >
          {t("painelLateral.agente")}
        </button>
        <button
          type="button"
          aria-current={ativo === "tarefas" ? "page" : undefined}
          className={ativo === "tarefas" ? CLASSE_ABA_ATIVA : CLASSE_ABA_INATIVA}
          onClick={aoMostrarTarefas}
        >
          {t("painelLateral.tarefas")}
        </button>
      </nav>
      {acoes}
      <BotaoIcone Icone={PanelRightClose} titulo={t("painelLateral.colapsar")} onClick={aoFechar} />
    </header>
  );
}
