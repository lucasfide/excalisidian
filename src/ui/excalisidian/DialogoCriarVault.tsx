// Diálogo de criar vault (doc 12 §4.3), mesmo padrão de DialogoPreferencias: título, campo(s)
// e rodapé com Cancelar / ação primária. Erros inline sob o campo, pelos códigos do Rust
// (doc 12 §2 / doc 04 §13).

import { useState } from "react";

import { Botao, Campo, Dialog } from "../index";
import { criarVault, escolherPasta } from "../../vault/janelas";
import { chaveDoErroVault } from "../../vault/mensagensErroVault";
import { useTexto } from "../../i18n/useTexto";

interface Props {
  /** Pasta pai padrão: pasta pai do vault atual (sidebar) ou vazia (tela sem vault). */
  localPadrao: string;
  onFechar(): void;
  onCriado(caminho: string): void;
}

export default function DialogoCriarVault({ localPadrao, onFechar, onCriado }: Props) {
  const t = useTexto();
  const [nome, setNome] = useState("");
  const [local, setLocal] = useState(localPadrao);
  const [erroNome, setErroNome] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  async function escolherLocal() {
    const escolhido = await escolherPasta();
    if (escolhido) setLocal(escolhido);
  }

  async function confirmar() {
    setCriando(true);
    setErroNome(null);
    try {
      const caminho = await criarVault(local, nome);
      onCriado(caminho);
    } catch (e) {
      const codigo = e instanceof Error ? e.message : String(e);
      setErroNome(t(chaveDoErroVault(codigo)));
    } finally {
      setCriando(false);
    }
  }

  const desabilitado = nome.trim() === "" || local.trim() === "" || criando;

  return (
    <Dialog
      titulo="Criar vault"
      onFechar={onFechar}
      className="max-w-sm"
      acoes={
        <>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            disabled={desabilitado}
            carregando={criando}
            onClick={() => void confirmar()}
          >
            Criar vault
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Campo
          rotulo="Nome"
          autoFocus
          value={nome}
          erro={erroNome}
          onChange={(e) => {
            setNome(e.target.value);
            setErroNome(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !desabilitado) void confirmar();
          }}
        />
        <div className="flex flex-col gap-1">
          <span className="meta text-tinta-suave">Local</span>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-pequeno text-tinta-media" title={local}>
              {local || "—"}
            </span>
            <Botao tamanho="compacto" onClick={() => void escolherLocal()}>
              Escolher…
            </Botao>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
