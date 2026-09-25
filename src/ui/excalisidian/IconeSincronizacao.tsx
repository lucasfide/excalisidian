// Ícone de estado da sincronização no rodapé da sidebar, ao lado de Configurações (doc 06
// "Ícone de sincronização no rodapé da sidebar", doc 17 §8, plano 10 Task 5). Só aparece
// quando o vault ATUAL está sincronizado neste computador (`syncStore.raiz !== null` — mesma
// condição de `vaultSincronizado` em `fluxoSecao.ts`/`SecaoSincronizacao.tsx`): sem banner, sem
// aviso recorrente (ADR-31), só este ícone discreto.
//
// Mesmo componente e mesma medida do ícone de Configurações (`BotaoIcone`, `tamanho={32}`,
// doc 06). `title` com o texto do catálogo (`chaveDeStatus`, `sync/fluxoSecao.ts` — já usado
// pela seção Sincronização, não duplicado aqui). Clique abre as Configurações na seção
// Sincronização.

import { CloudCheck, RefreshCw, CloudOff, Pause, AlertTriangle, type LucideIcon } from "lucide-react";

import BotaoIcone from "../BotaoIcone";
import { cn } from "../cn";
import { useSyncStore } from "../../estado/syncStore";
import { useTexto } from "../../i18n/useTexto";
import { chaveDeStatus } from "../../sync/fluxoSecao";
import { iconeDeStatusSync, corDeStatusSync, type NomeIconeSync } from "../../sync/iconeStatus";

const ICONE_POR_NOME: Record<NomeIconeSync, LucideIcon> = {
  "cloud-check": CloudCheck,
  "refresh-cw": RefreshCw,
  "cloud-off": CloudOff,
  pause: Pause,
  "alert-triangle": AlertTriangle,
};

// Tokens do doc 06 ("Cor por estado") — classe Tailwind fixa por token, nunca um valor solto
// (nenhuma cor fora de `globals.css`).
const CLASSE_POR_TOKEN: Record<ReturnType<typeof corDeStatusSync>["token"], string> = {
  "tinta-media": "text-tinta-media",
  ocre: "text-ocre",
  bordo: "text-bordo",
};

interface Props {
  onAbrirConfiguracoes(): void;
}

export default function IconeSincronizacao({ onAbrirConfiguracoes }: Props) {
  const raiz = useSyncStore((s) => s.raiz);
  const status = useSyncStore((s) => s.status);
  const t = useTexto();

  // Doc 06: só quando o vault ATUAL está sincronizado neste computador — mesma condição que
  // `estadoDaSecaoSincronizacao` usa para decidir o estado "sincronizado" da seção.
  if (raiz === null) return null;

  const Icone = ICONE_POR_NOME[iconeDeStatusSync(status)];
  const cor = corDeStatusSync(status);
  const chave = chaveDeStatus(status);
  const titulo = chave ? t(chave) : "";

  return (
    <BotaoIcone
      Icone={Icone}
      titulo={titulo}
      onClick={onAbrirConfiguracoes}
      className={cn(CLASSE_POR_TOKEN[cor.token], cor.opacidade50 && "opacity-50")}
    />
  );
}
