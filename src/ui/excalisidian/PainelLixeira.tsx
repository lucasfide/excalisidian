// Painel de lixeira (RF7.2–7.4, doc 06 inventário). Diálogo modal — mesmo padrão de
// DialogoPreferencias.tsx — não uma seção fixa da sidebar (decisão desta rodada, doc 09
// ADR-7: lixeira é uso ocasional, não precisa ficar sempre visível, e não há mecanismo de
// colapsar seção na sidebar em lugar nenhum do app).

import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Botao, BotaoIcone, Dialog } from "../index";
import { confirmar } from "../../estado/dialogoStore";
import {
  listarLixeira,
  restaurar,
  esvaziarLixeira,
  type ItemLixeira,
} from "../../vault/lixeira";

interface Props {
  onFechar(): void;
}

const ROTULO_TIPO: Record<ItemLixeira["kind"], string> = {
  note: "Nota",
  drawing: "Desenho",
  attachment: "Anexo",
  folder: "Pasta",
};

function nomeExibicaoItem(item: ItemLixeira): string {
  return item.trashName.replace(/\.draw\.md$/i, "").replace(/\.md$/i, "");
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function plural(n: number, singular: string, prefixoPlural = "s"): string {
  return n === 1 ? singular : `${singular}${prefixoPlural}`;
}

export default function PainelLixeira({ onFechar }: Props) {
  const [itens, setItens] = useState<ItemLixeira[] | null>(null);

  const carregar = useCallback(() => {
    void listarLixeira().then(setItens);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const aoRestaurar = async (item: ItemLixeira) => {
    const r = await restaurar(item);
    if (!r.ok) {
      toast.error(r.motivo);
      return;
    }
    toast(`«${nomeExibicaoItem(item)}» restaurado.`);
    carregar();
  };

  const aoEsvaziar = async () => {
    if (!itens || itens.length === 0) return;
    const n = itens.length;
    const ok = await confirmar({
      titulo: "Esvaziar lixeira?",
      descricao: `Excluir permanentemente ${n} ${plural(n, "arquivo")}? Isso não pode ser desfeito.`,
      textoConfirmar: "Excluir permanentemente",
      destrutivo: true,
    });
    if (!ok) return;
    const r = await esvaziarLixeira();
    toast(`${r.removidos} ${plural(r.removidos, "arquivo")} ${plural(r.removidos, "excluído")} permanentemente.`);
    carregar();
  };

  return (
    <Dialog
      titulo="Lixeira"
      onFechar={onFechar}
      className="max-w-md"
      acoes={
        itens && itens.length > 0 ? (
          <Botao variante="destrutivo" Icone={Trash2} onClick={() => void aoEsvaziar()}>
            Esvaziar lixeira
          </Botao>
        ) : undefined
      }
    >
      {itens === null ? null : itens.length === 0 ? (
        <p className="text-[13px] text-tinta-media">A lixeira está vazia.</p>
      ) : (
        <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {itens.map((item) => (
            <li
              key={item.trashName}
              className="flex items-center justify-between gap-2 rounded-controle px-2 py-1.5 hover:bg-lavagem"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-tinta">
                  {nomeExibicaoItem(item)}
                </div>
                <div className="meta truncate text-tinta-suave">
                  {ROTULO_TIPO[item.kind]} · {item.originalPath ?? "origem desconhecida"} ·{" "}
                  {formatarData(item.deletedAt)}
                </div>
              </div>
              <BotaoIcone
                Icone={RotateCcw}
                titulo="Restaurar"
                onClick={() => void aoRestaurar(item)}
              />
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
