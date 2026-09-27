// Configurações do app (doc 06, inventário: "Preferências"). Um lugar só, achável por um
// ícone fixo — antes só dava pra trocar tema/largura pela paleta de comandos (Ctrl+P), que o
// usuário relatou como difícil de achar (29/08/2026).

import { useEffect, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { toast } from "sonner";

import { Botao, Dialog, GrupoBotoes, cn, type OpcaoGrupo } from "../index";
import { usePrefsStore, type Tema, type LarguraNota } from "../../estado/prefsStore";
import { useWallpaperStore } from "../../estado/wallpaperStore";
import { useAgenteStore } from "../../estado/agenteStore";
import { confirmar } from "../../estado/dialogoStore";
import { provedorDe } from "../../agente/provedores";
import { verificarAtualizacao } from "../../app/atualizacao";
import ControlesPapelParede from "./ControlesPapelParede";

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
  const wallpaperAtual = useWallpaperStore((s) => s.wallpaperAtual);
  const wallpaperPausado = useWallpaperStore((s) => s.pausado);
  const wallpaperAnterior = useWallpaperStore((s) => s.anterior);
  const wallpaperProximo = useWallpaperStore((s) => s.proximo);
  const alternarPausaWallpaper = useWallpaperStore((s) => s.alternarPausa);
  const [versao, setVersao] = useState<string | null>(null);
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<string | null>(null);

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
        <Secao titulo="Papel de parede">
          <ControlesPapelParede
            tituloAtivo={wallpaperAtual.titulo}
            pausado={wallpaperPausado}
            onAnterior={wallpaperAnterior}
            onProximo={wallpaperProximo}
            onAlternarPausa={alternarPausaWallpaper}
          />
        </Secao>
        <Secao titulo="Agente de IA">
          <SecaoAgente
            testando={testando}
            resultadoTeste={resultadoTeste}
            onTestar={async () => {
              setTestando(true);
              setResultadoTeste(null);
              const erro = await useAgenteStore.getState().testarConexao();
              setResultadoTeste(erro ?? "Conexão funcionando.");
              setTestando(false);
            }}
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

// Doc 11 §6.3. Sem configuração, a seção inteira é o aviso + um botão; nada de importunar.
function SecaoAgente({
  testando,
  resultadoTeste,
  onTestar,
}: {
  testando: boolean;
  resultadoTeste: string | null;
  onTestar(): void;
}) {
  const config = useAgenteStore((s) => s.config);
  if (!config) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-pequeno text-tinta-media [text-wrap:pretty]">
          Opcional. Nada é enviado sem a sua configuração, e o agente só acompanha uma nota
          depois que você aceita o convite.
        </p>
        <Botao
          variante="primario"
          tamanho="compacto"
          className="self-start"
          onClick={() => useAgenteStore.getState().abrirAssistente()}
        >
          Configurar agente
        </Botao>
      </div>
    );
  }
  const provedor = provedorDe(config.provedor);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-pequeno text-tinta-media">
        {config.habilitado ? "Ativo" : "Desligado"} · {provedor.nome}
      </p>
      <p className="meta truncate text-tinta-suave">
        {config.modeloGateiro} · {config.modeloAssistente}
      </p>
      <div className="flex flex-wrap gap-2">
        <Botao
          tamanho="compacto"
          onClick={() => void useAgenteStore.getState().definirHabilitado(!config.habilitado)}
        >
          {config.habilitado ? "Desligar agente" : "Ligar agente"}
        </Botao>
        <Botao
          tamanho="compacto"
          onClick={() => useAgenteStore.getState().abrirAssistente()}
        >
          Reconfigurar
        </Botao>
        {config.habilitado && (
          <Botao tamanho="compacto" carregando={testando} onClick={onTestar}>
            Testar conexão
          </Botao>
        )}
        <Botao
          tamanho="compacto"
          onClick={() => {
            void useAgenteStore.getState().abrirPasta().then((erro) => {
              if (erro) toast(erro);
            });
          }}
        >
          Abrir pasta do agente
        </Botao>
        <Botao
          tamanho="compacto"
          variante="destrutivo"
          onClick={() => {
            void (async () => {
              // Doc 11 §7: texto exato da confirmação de limpeza.
              const apagar = await confirmar({
                titulo: "Limpar memória",
                descricao:
                  "Apagar resumos, fatos, participações e conversas do agente? As notas não são afetadas.",
                textoConfirmar: "Apagar memória",
                destrutivo: true,
              });
              if (apagar) {
                await useAgenteStore.getState().limparMemoria();
                toast("Memória do agente apagada.");
              }
            })();
          }}
        >
          Limpar memória
        </Botao>
      </div>
      {resultadoTeste && (
        <p
          className={cn(
            "text-pequeno",
            resultadoTeste === "Conexão funcionando." ? "text-musgo" : "text-bordo",
          )}
        >
          {resultadoTeste}
        </p>
      )}
    </div>
  );
}
