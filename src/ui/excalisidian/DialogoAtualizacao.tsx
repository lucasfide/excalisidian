// Diálogo do fluxo de atualização (spec 2026-09-04): oferta, download e erro num componente
// só, montado uma vez no App. Fases e textos vêm do docs/04, seção "Atualizações". Sem barra
// de progresso — não existe componente de barra no docs/06, e a decisão foi não inventar um.

import { Botao, Dialog } from "../index";
import { useAtualizacaoStore } from "../../estado/atualizacaoStore";

const NAO_FECHA = () => {};

export default function DialogoAtualizacao() {
  const fase = useAtualizacaoStore((s) => s.fase);
  const versao = useAtualizacaoStore((s) => s.versao);
  const notas = useAtualizacaoStore((s) => s.notas);
  const progresso = useAtualizacaoStore((s) => s.progresso);
  const mensagemErro = useAtualizacaoStore((s) => s.mensagemErro);
  const aplicar = useAtualizacaoStore((s) => s.aplicar);
  const adiar = useAtualizacaoStore((s) => s.adiar);
  const fechar = useAtualizacaoStore((s) => s.fechar);

  if (fase === "oculto") return null;

  if (fase === "disponivel") {
    return (
      <Dialog
        titulo="Atualização disponível"
        descricao={`A versão ${versao} está pronta para instalar.`}
        onFechar={adiar}
        acoes={
          <>
            <Botao onClick={adiar}>Depois</Botao>
            <Botao variante="primario" onClick={() => void aplicar()}>
              Atualizar agora
            </Botao>
          </>
        }
      >
        {notas && (
          <p className="max-h-40 overflow-y-auto text-pequeno text-tinta-media [text-wrap:pretty]">
            {notas}
          </p>
        )}
      </Dialog>
    );
  }

  if (fase === "baixando") {
    return (
      <Dialog titulo="Baixando atualização…" onFechar={NAO_FECHA}>
        <p className="text-pequeno text-tinta-media">{Math.round(progresso * 100)}%</p>
      </Dialog>
    );
  }

  if (fase === "reiniciar") {
    return (
      <Dialog
        titulo="Atualização baixada"
        descricao="Feche e abra o Excalisidian de novo para concluir."
        onFechar={fechar}
        acoes={
          <Botao variante="primario" onClick={fechar}>
            Fechar
          </Botao>
        }
      />
    );
  }

  return (
    <Dialog
      titulo="Não foi possível atualizar"
      descricao={mensagemErro ?? undefined}
      onFechar={fechar}
      acoes={
        <Botao variante="primario" onClick={fechar}>
          Fechar
        </Botao>
      }
    />
  );
}
