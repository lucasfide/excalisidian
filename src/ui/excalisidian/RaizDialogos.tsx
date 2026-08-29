// Renderiza o diálogo pedido pelo `dialogoStore`. Montado uma vez no App; nada além dele
// renderiza `Dialog` diretamente.

import { useEffect, useState } from "react";

import { useDialogoStore } from "../../estado/dialogoStore";
import { Botao, Campo, Dialog } from "../index";

export default function RaizDialogos() {
  const atual = useDialogoStore((s) => s.atual);
  const responder = useDialogoStore((s) => s.responder);

  if (!atual) return null;

  if (atual.tipo === "confirmacao") {
    return (
      <Dialog
        key={atual.id}
        titulo={atual.titulo}
        descricao={atual.descricao}
        onFechar={() => responder(false)}
        acoes={
          <>
            <Botao onClick={() => responder(false)}>Cancelar</Botao>
            <Botao
              variante={atual.destrutivo ? "destrutivo" : "primario"}
              onClick={() => responder(true)}
            >
              {atual.textoConfirmar}
            </Botao>
          </>
        }
      />
    );
  }

  return <DialogoTexto key={atual.id} />;
}

function DialogoTexto() {
  const atual = useDialogoStore((s) => s.atual);
  const responder = useDialogoStore((s) => s.responder);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const pedido = atual?.tipo === "texto" ? atual : null;

  useEffect(() => {
    setValor(pedido?.valorInicial ?? "");
    setErro(null);
  }, [pedido?.id, pedido?.valorInicial]);

  if (!pedido) return null;

  const confirmar = () => {
    const limpo = valor.trim();
    if (limpo === "") {
      setErro("O nome não pode ser vazio.");
      return;
    }
    const motivo = pedido.validar?.(limpo) ?? null;
    if (motivo) {
      setErro(motivo);
      return;
    }
    responder(limpo);
  };

  return (
    <Dialog
      titulo={pedido.titulo}
      descricao={pedido.descricao}
      onFechar={() => responder(null)}
      acoes={
        <>
          <Botao onClick={() => responder(null)}>Cancelar</Botao>
          <Botao variante="primario" onClick={confirmar}>
            {pedido.textoConfirmar}
          </Botao>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          confirmar();
        }}
      >
        <Campo
          rotulo={pedido.rotulo}
          value={valor}
          erro={erro}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setValor(e.target.value);
            if (erro) setErro(null);
          }}
        />
      </form>
    </Dialog>
  );
}
