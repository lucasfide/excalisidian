// Configurações do app (doc 06, inventário: "Preferências"). Um lugar só, achável por um
// ícone fixo — antes só dava pra trocar tema/largura pela paleta de comandos (Ctrl+P), que o
// usuário relatou como difícil de achar (29/08/2026).

import { useEffect, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";

import { Botao, Dialog, GrupoBotoes, type OpcaoGrupo } from "../index";
import { usePrefsStore, type Tema, type LarguraNota } from "../../estado/prefsStore";
import { verificarAtualizacao } from "../../app/atualizacao";

interface Props {
  onFechar(): void;
}

const OPCOES_TEMA: OpcaoGrupo<Tema>[] = [
  { rotulo: "Sistema", valor: "sistema" },
  { rotulo: "Claro", valor: "claro" },
  { rotulo: "Escuro", valor: "escuro" },
];

const OPCOES_LARGURA: OpcaoGrupo<LarguraNota>[] = [
  { rotulo: "Pequena", valor: "pequena" },
  { rotulo: "Média", valor: "media" },
  { rotulo: "Full", valor: "full" },
];

export default function DialogoPreferencias({ onFechar }: Props) {
  const tema = usePrefsStore((s) => s.tema);
  const larguraNota = usePrefsStore((s) => s.larguraNota);
  const definirTema = usePrefsStore((s) => s.definirTema);
  const definirLarguraNota = usePrefsStore((s) => s.definirLarguraNota);
  const [versao, setVersao] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    void getVersion()
      .then((v) => {
        if (ativo) setVersao(v);
      })
      .catch(() => {
        // Sem versão disponível ainda; a seção de Atualizações mostra vazio.
      });
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <Dialog titulo="Configurações" onFechar={onFechar} className="max-w-sm">
      <div className="flex flex-col gap-4">
        <Secao titulo="Tema">
          <GrupoBotoes
            rotuloGrupo="Tema"
            opcoes={OPCOES_TEMA}
            valor={tema}
            onEscolher={definirTema}
          />
        </Secao>
        <Secao titulo="Largura da nota">
          <GrupoBotoes
            rotuloGrupo="Largura da nota"
            opcoes={OPCOES_LARGURA}
            valor={larguraNota}
            onEscolher={definirLarguraNota}
          />
        </Secao>
        <Secao titulo="Atualizações">
          <div className="flex items-center justify-between gap-2">
            <span className="text-pequeno text-tinta-media">
              {versao ? `Versão ${versao}` : ""}
            </span>
            <Botao
              tamanho="compacto"
              onClick={() => void verificarAtualizacao({ silencioso: false })}
            >
              Verificar atualizações
            </Botao>
          </div>
        </Secao>
      </div>
    </Dialog>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <div className="meta mb-1.5 text-tinta-suave">{titulo}</div>
      {children}
    </div>
  );
}
